/**
 * Karar motoru kabul seti: her satır bir araştırma senaryosu ve beklenen test seçimidir.
 * Kural değişikliği bu tabloyu bozuyorsa, değişiklik bilinçli olmalı ve tablo birlikte güncellenmelidir.
 */
import { recommendTest, type AssumptionInput, type WizardAnswers } from './decision.ts';

type Cond = 'N+V+' | 'N+V-' | 'N-V+' | 'N-V-';
const assume = (c: Cond, extra: Partial<AssumptionInput> = {}): AssumptionInput => ({
  normalP: c.startsWith('N+') ? 0.4 : 0.001,
  varianceP: c.endsWith('V+') ? 0.5 : 0.01,
  n: 90,
  minGroupN: 30,
  ...extra,
});

// [senaryo, amaç, grup, tasarım, hedef, koşul, beklenen nihai test, beklenen planlanan test]
type Row = [string, WizardAnswers['goal'], WizardAnswers['groups'], WizardAnswers['design'], WizardAnswers['target'], Cond, string, string];

const rows: Row[] = [
  // Bağımsız 2 grup, sürekli
  ['İki ilacın kan basıncına etkisi, normal, eşit varyans', 'compare', '2', 'independent', 'continuous', 'N+V+', 'Welch t-testi', 'Bağımsız örneklem t-testi'],
  ['Kadın/erkek maaş, normal, farklı varyans', 'compare', '2', 'independent', 'continuous', 'N+V-', 'Welch t-testi', 'Bağımsız örneklem t-testi'],
  ['Hastane yatış süresi, çarpık, eşit yayılım', 'compare', '2', 'independent', 'continuous', 'N-V+', 'Mann-Whitney U testi', 'Bağımsız örneklem t-testi'],
  ['Gelir, çarpık, farklı yayılım', 'compare', '2', 'independent', 'continuous', 'N-V-', 'Mann-Whitney U testi', 'Bağımsız örneklem t-testi'],
  ['Bağımsızlığı bilinmeyen iki sınıf, normal', 'compare', '2', 'unknown', 'continuous', 'N+V+', 'Welch t-testi', 'Bağımsız örneklem t-testi'],
  ['Bağımsızlığı bilinmeyen iki sınıf, normal değil', 'compare', '2', 'unknown', 'continuous', 'N-V+', 'Mann-Whitney U testi', 'Bağımsız örneklem t-testi'],
  ['Bağımsızlığı bilinmeyen, farklı varyans', 'compare', '2', 'unknown', 'continuous', 'N+V-', 'Welch t-testi', 'Bağımsız örneklem t-testi'],
  ['Bağımsızlığı bilinmeyen, çarpık ve farklı yayılım', 'compare', '2', 'unknown', 'continuous', 'N-V-', 'Mann-Whitney U testi', 'Bağımsız örneklem t-testi'],
  // Bağımsız 3+ grup, sürekli
  ['Üç öğretim yöntemi, sınav puanı, normal', 'compare', '3+', 'independent', 'continuous', 'N+V+', 'Welch ANOVA', 'Tek Yönlü ANOVA'],
  ['Dört bölge, satış, farklı varyans', 'compare', '3+', 'independent', 'continuous', 'N+V-', 'Welch ANOVA', 'Tek Yönlü ANOVA'],
  ['Üç diyet, kilo kaybı, çarpık', 'compare', '3+', 'independent', 'continuous', 'N-V+', 'Kruskal-Wallis H testi', 'Tek Yönlü ANOVA'],
  ['Üç tedavi, iyileşme süresi, çarpık ve farklı yayılım', 'compare', '3+', 'independent', 'continuous', 'N-V-', 'Kruskal-Wallis H testi', 'Tek Yönlü ANOVA'],
  ['Bağımsızlığı bilinmeyen 3 şube, normal', 'compare', '3+', 'unknown', 'continuous', 'N+V+', 'Welch ANOVA', 'Tek Yönlü ANOVA'],
  ['Bağımsızlığı bilinmeyen 3 şube, farklı varyans', 'compare', '3+', 'unknown', 'continuous', 'N+V-', 'Welch ANOVA', 'Tek Yönlü ANOVA'],
  ['Bağımsızlığı bilinmeyen 3 şube, çarpık', 'compare', '3+', 'unknown', 'continuous', 'N-V+', 'Kruskal-Wallis H testi', 'Tek Yönlü ANOVA'],
  ['Bağımsızlığı bilinmeyen 3 şube, çarpık ve farklı yayılım', 'compare', '3+', 'unknown', 'continuous', 'N-V-', 'Kruskal-Wallis H testi', 'Tek Yönlü ANOVA'],
  // Eşleşmiş, sürekli
  ['Eğitim öncesi/sonrası puan, farklar normal', 'compare', '2', 'paired', 'continuous', 'N+V+', 'Eşleştirilmiş t-testi', 'Eşleştirilmiş t-testi'],
  ['Öncesi/sonrası, varyans farklı (eşleşmişte önemsiz)', 'compare', '2', 'paired', 'continuous', 'N+V-', 'Eşleştirilmiş t-testi', 'Eşleştirilmiş t-testi'],
  ['Öncesi/sonrası, farklar çarpık', 'compare', '2', 'paired', 'continuous', 'N-V+', 'Wilcoxon işaretli sıra testi', 'Eşleştirilmiş t-testi'],
  ['Öncesi/sonrası, farklar çarpık, yayılım farklı', 'compare', '2', 'paired', 'continuous', 'N-V-', 'Wilcoxon işaretli sıra testi', 'Eşleştirilmiş t-testi'],
  ['Üç zaman noktası, kalıntılar normal', 'compare', '3+', 'paired', 'continuous', 'N+V+', 'Tekrarlı ölçümler ANOVA', 'Tekrarlı ölçümler ANOVA'],
  ['Üç zaman noktası, varyans farklı', 'compare', '3+', 'paired', 'continuous', 'N+V-', 'Tekrarlı ölçümler ANOVA', 'Tekrarlı ölçümler ANOVA'],
  ['Üç zaman noktası, kalıntılar çarpık', 'compare', '3+', 'paired', 'continuous', 'N-V+', 'Friedman testi', 'Tekrarlı ölçümler ANOVA'],
  ['Dört koşul, çarpık ve farklı yayılım', 'compare', '3+', 'paired', 'continuous', 'N-V-', 'Friedman testi', 'Tekrarlı ölçümler ANOVA'],
  // Sıralı hedef: varsayımlardan bağımsız
  ['İki grup, memnuniyet 1–5', 'compare', '2', 'independent', 'ordinal', 'N+V+', 'Mann-Whitney U testi', 'Mann-Whitney U testi'],
  ['İki grup, Likert, normal dışı', 'compare', '2', 'independent', 'ordinal', 'N-V-', 'Mann-Whitney U testi', 'Mann-Whitney U testi'],
  ['Üç grup, ağrı skoru 0–10', 'compare', '3+', 'independent', 'ordinal', 'N+V+', 'Kruskal-Wallis H testi', 'Kruskal-Wallis H testi'],
  ['Üç grup, Likert, farklı yayılım', 'compare', '3+', 'independent', 'ordinal', 'N-V-', 'Kruskal-Wallis H testi', 'Kruskal-Wallis H testi'],
  ['Bağımsızlığı bilinmeyen 2 grup, sıralı', 'compare', '2', 'unknown', 'ordinal', 'N+V+', 'Mann-Whitney U testi', 'Mann-Whitney U testi'],
  ['Bağımsızlığı bilinmeyen 3 grup, sıralı', 'compare', '3+', 'unknown', 'ordinal', 'N+V+', 'Kruskal-Wallis H testi', 'Kruskal-Wallis H testi'],
  ['Öncesi/sonrası memnuniyet 1–5', 'compare', '2', 'paired', 'ordinal', 'N+V+', 'Wilcoxon işaretli sıra testi', 'Wilcoxon işaretli sıra testi'],
  ['Öncesi/sonrası Likert, normal dışı', 'compare', '2', 'paired', 'ordinal', 'N-V+', 'Wilcoxon işaretli sıra testi', 'Wilcoxon işaretli sıra testi'],
  ['Üç ölçüm, ağrı skoru', 'compare', '3+', 'paired', 'ordinal', 'N+V+', 'Friedman testi', 'Friedman testi'],
  ['Üç ölçüm, Likert, çarpık', 'compare', '3+', 'paired', 'ordinal', 'N-V-', 'Friedman testi', 'Friedman testi'],
  // Kategorik hedef
  ['İki grup, iyileşti/iyileşmedi', 'compare', '2', 'independent', 'categorical', 'N+V+', 'Ki-kare homojenlik testi', 'Ki-kare homojenlik testi'],
  ['Üç grup, evet/hayır', 'compare', '3+', 'independent', 'categorical', 'N+V+', 'Ki-kare homojenlik testi', 'Ki-kare homojenlik testi'],
  ['Bağımsızlığı bilinmeyen 2 grup, kategorik', 'compare', '2', 'unknown', 'categorical', 'N-V-', 'Ki-kare homojenlik testi', 'Ki-kare homojenlik testi'],
  ['Bağımsızlığı bilinmeyen 3 grup, kategorik', 'compare', '3+', 'unknown', 'categorical', 'N+V+', 'Ki-kare homojenlik testi', 'Ki-kare homojenlik testi'],
  ['Kategorik hedef, varsayım değerleri önemsiz', 'compare', '2', 'independent', 'categorical', 'N-V-', 'Ki-kare homojenlik testi', 'Ki-kare homojenlik testi'],
  ['Üç grup kategorik, varsayım değerleri önemsiz', 'compare', '3+', 'independent', 'categorical', 'N-V+', 'Ki-kare homojenlik testi', 'Ki-kare homojenlik testi'],
  // İlişki
  ['Boy ile kilo, ikisi de normal', 'relate', '2', 'independent', 'continuous', 'N+V+', 'Pearson korelasyonu', 'Pearson korelasyonu'],
  ['Boy ile kilo, varyans önemsiz', 'relate', '2', 'independent', 'continuous', 'N+V-', 'Pearson korelasyonu', 'Pearson korelasyonu'],
  ['Gelir ile harcama, çarpık', 'relate', '2', 'independent', 'continuous', 'N-V+', 'Spearman sıra korelasyonu', 'Pearson korelasyonu'],
  ['Gelir ile harcama, çarpık, 3+ seçili', 'relate', '3+', 'unknown', 'continuous', 'N-V-', 'Spearman sıra korelasyonu', 'Pearson korelasyonu'],
  ['Eğitim düzeyi ile memnuniyet', 'relate', '2', 'independent', 'ordinal', 'N+V+', 'Spearman sıra korelasyonu', 'Spearman sıra korelasyonu'],
  ['Sıralı ilişki, normal dışı', 'relate', '2', 'independent', 'ordinal', 'N-V-', 'Spearman sıra korelasyonu', 'Spearman sıra korelasyonu'],
  ['Sigara ile hastalık', 'relate', '2', 'independent', 'categorical', 'N+V+', 'Ki-kare bağımsızlık testi', 'Ki-kare bağımsızlık testi'],
  ['Cinsiyet ile tercih, 3+ seçili', 'relate', '3+', 'unknown', 'categorical', 'N-V-', 'Ki-kare bağımsızlık testi', 'Ki-kare bağımsızlık testi'],
  // Tahmin
  ['Müşteri kaybı tahmini', 'predict', '2', 'independent', 'categorical', 'N+V+', 'Sınıflandırma / regresyon modeli karşılaştırması', 'Sınıflandırma / regresyon modeli karşılaştırması'],
  ['Satış tahmini', 'predict', '3+', 'unknown', 'continuous', 'N-V-', 'Sınıflandırma / regresyon modeli karşılaştırması', 'Sınıflandırma / regresyon modeli karşılaştırması'],
];

describe('karar motoru kabul seti', () => {
  it.each(rows)('%s', (_name, goal, groups, design, target, cond, final, planned) => {
    const r = recommendTest({ goal, groups, design, target }, assume(cond));
    expect(r.finalTest).toBe(final);
    expect(r.plannedTest).toBe(planned);
    expect(r.rerouteReason === undefined).toBe(final === planned);
  });

  it('kabul setinde en az 50 senaryo var', () => {
    expect(rows.length).toBeGreaterThanOrEqual(50);
  });

  it('her hipotez testi önerisinde en az bir alternatif yöntem bulunur', () => {
    for (const [, goal, groups, design, target, cond] of rows) {
      if (goal === 'predict') continue;
      const r = recommendTest({ goal, groups, design, target }, assume(cond));
      expect(r.alternatives.length, r.finalTest).toBeGreaterThan(0);
    }
  });
});

describe('sınırda normallik', () => {
  const ans: WizardAnswers = { goal: 'compare', groups: '3+', design: 'independent', target: 'continuous' };

  it.each([
    [0.03, true, 'Welch ANOVA'],
    [0.049, true, 'Welch ANOVA'],
    [0.06, true, 'Kruskal-Wallis H testi'],
    [0.09, true, 'Kruskal-Wallis H testi'],
    [0.2, false, ''],
    [0.001, false, ''],
  ])('Shapiro p = %s → sınırda: %s', (p, border, other) => {
    const r = recommendTest(ans, { ...assume('N+V+'), normalP: p });
    expect(r.borderline).toBe(border);
    if (border) expect(r.warnings[0]).toContain(other);
  });

  it('çarpıklık-basıklık ölçütünde sınırın ±%20’si sınırdadır', () => {
    const base = { ...assume('N+V+'), normality: 'skewkurt-1.5' as const };
    expect(recommendTest(ans, { ...base, maxShape: 1.4 }).borderline).toBe(true);
    expect(recommendTest(ans, { ...base, maxShape: 1.7 }).borderline).toBe(true);
    expect(recommendTest(ans, { ...base, maxShape: 0.5 }).borderline).toBe(false);
    expect(recommendTest(ans, { ...base, normality: 'skewkurt-2', maxShape: 2.3 }).borderline).toBe(true);
  });

  it('sıralı ve kategorik hedeflerde sınırda uyarısı verilmez', () => {
    expect(recommendTest({ ...ans, target: 'ordinal' }, { ...assume('N+V+'), normalP: 0.04 }).borderline).toBe(false);
  });
});

describe('koşul rozetleri', () => {
  it('ölçülen normallik doğrulandı, tasarım beyan, bilinmeyen bağımsızlık bilinmiyor', () => {
    const r = recommendTest({ goal: 'compare', groups: '2', design: 'unknown', target: 'continuous' }, assume('N+V+'));
    const s = Object.fromEntries(r.checks.map((c) => [c.label, c.status]));
    expect(s).toEqual({ Bağımsızlık: 'unknown', 'Ölçek türü': 'declared', Normallik: 'verified', 'Varyans eşitliği': 'verified' });
  });

  it('veri ölçülmediyse normallik ve varyans bilinmiyor olur', () => {
    const r = recommendTest({ goal: 'compare', groups: '2', design: 'independent', target: 'continuous' }, { ...assume('N+V+'), measured: false });
    const s = Object.fromEntries(r.checks.map((c) => [c.label, c.status]));
    expect(s).toEqual({ Bağımsızlık: 'declared', 'Ölçek türü': 'declared', Normallik: 'unknown', 'Varyans eşitliği': 'unknown' });
  });

  it('eşleşmiş tasarımda varyans eşitliği rozeti yoktur', () => {
    const r = recommendTest({ goal: 'compare', groups: '2', design: 'paired', target: 'continuous' }, assume('N+V+'));
    expect(r.checks.map((c) => c.label)).toEqual(['Eşleşmiş tasarım', 'Ölçek türü', 'Normallik']);
  });
});
