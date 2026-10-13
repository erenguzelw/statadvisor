import { defaultAnswers, recommendTest, type WizardAnswers } from './decision.ts';

const base = { n: 90, minGroupN: 30 };
const ok = { normalP: 0.4, varianceP: 0.5, ...base };
const nonNormal = { normalP: 0.001, varianceP: 0.5, ...base };
const unequal = { normalP: 0.4, varianceP: 0.01, ...base };
const answers = (o: Partial<WizardAnswers>): WizardAnswers => ({ ...defaultAnswers, design: 'independent', ...o });

describe('recommendTest', () => {
  it('3+ bağımsız grup, normal: Welch ANOVA önerir (klasik ANOVA planlanan test olarak kalır)', () => {
    const r = recommendTest(answers({}), ok);
    expect(r.plannedTest).toBe('Tek Yönlü ANOVA');
    expect(r.finalTest).toBe('Welch ANOVA');
    expect(r.supportedByExample).toBe(true);
  });

  it('3+ bağımsız grup, normal değil: Kruskal-Wallis ve stokastik üstünlük uyarısı', () => {
    const r = recommendTest(answers({}), nonNormal);
    expect(r.finalTest).toBe('Kruskal-Wallis H testi');
    expect(r.rerouteReason).toBe('Normallik varsayımı sağlanmadı');
    expect(r.warnings.join(' ')).toContain('Dağılım şekilleri benzerse');
  });

  it('Kruskal-Wallis ve yayılımlar eşit değilken medyan yorumuna izin vermez', () => {
    const r = recommendTest(answers({}), { ...nonNormal, varianceP: 0.01 });
    expect(r.warnings.join(' ')).toContain('medyan karşılaştırması olarak yorumlanamaz');
  });

  it('normal ama varyanslar eşit değilken Games-Howell uyarısı verir', () => {
    const r = recommendTest(answers({}), unequal);
    expect(r.finalTest).toBe('Welch ANOVA');
    expect(r.warnings.join(' ')).toContain('Games-Howell');
  });

  it('2 grup', () => {
    expect(recommendTest(answers({ groups: '2' }), ok).finalTest).toBe('Welch t-testi');
    expect(recommendTest(answers({ groups: '2' }), nonNormal).finalTest).toBe('Mann-Whitney U testi');
  });

  it('eşleşmiş tasarım ve sıralı hedef doğru testlere gider, örnek analize uymaz', () => {
    expect(recommendTest(answers({ design: 'paired', groups: '2' }), nonNormal).finalTest).toBe('Wilcoxon işaretli sıra testi');
    expect(recommendTest(answers({ design: 'paired' }), nonNormal).finalTest).toBe('Friedman testi');
    expect(recommendTest(answers({ design: 'paired' }), ok).supportedByExample).toBe(false);
    expect(recommendTest(answers({ target: 'ordinal' }), ok).finalTest).toBe('Kruskal-Wallis H testi');
    expect(recommendTest(answers({ target: 'categorical' }), ok).finalTest).toBe('Ki-kare homojenlik testi');
  });

  it('ilişki ve tahmin amaçlarını yönlendirir', () => {
    expect(recommendTest(answers({ goal: 'relate' }), nonNormal).finalTest).toBe('Spearman sıra korelasyonu');
    expect(recommendTest(answers({ goal: 'relate' }), ok).finalTest).toBe('Pearson korelasyonu');
    const p = recommendTest(answers({ goal: 'predict' }), ok);
    expect(p.finalTest).toContain('modeli karşılaştırması');
    expect(p.supportedByExample).toBe(false);
  });

  it('bağımsızlık bilinmiyorsa uyarır; küçük ve büyük n için uyarı ekler', () => {
    const r = recommendTest(answers({ design: 'unknown' }), { ...ok, n: 45, minGroupN: 15 });
    const text = r.warnings.join(' ');
    expect(text).toContain('bağımsızlığı doğrulanmadı');
    expect(text).toContain('yalnızca 15 gözlem');
    expect(recommendTest(answers({}), { ...ok, n: 1420, minGroupN: 468 }).warnings.join(' ')).toContain('önemsiz sapmalara bile duyarlıdır');
  });

  it('her karşılaştırma önerisinde ön test uyarısı bulunur ve aynı girdi aynı çıktıyı verir', () => {
    const r1 = recommendTest(answers({}), ok);
    expect(r1.warnings.at(-1)).toContain('Tip I hata');
    expect(recommendTest(answers({}), ok)).toEqual(r1);
  });
});
