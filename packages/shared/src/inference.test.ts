import { mulberry32, gaussian } from './ml.ts';
import {
  defaultAnswers,
  interpretOutcome,
  recommendTest,
  runTest,
  type Design,
  type Goal,
  type GroupCount,
  type Target,
  type TestInput,
  type WizardAnswers,
} from './index.ts';

const rng = mulberry32(5);
const col = (n: number, mu: number, s = 1) => Array.from({ length: n }, () => Math.round((mu + s * gaussian(rng)) * 10) / 10);

/** Yanıtlara uygun biçimde sentetik girdi üretir. */
function inputFor(a: WizardAnswers): TestInput {
  const k = a.groups === '2' ? 2 : 3;
  const names = Array.from({ length: k }, (_, i) => `G${i + 1}`);
  if (a.goal === 'relate') {
    if (a.target === 'categorical') return { kind: 'table', rowNames: ['a', 'b'], colNames: ['x', 'y', 'z'], table: [[12, 18, 9], [20, 11, 15]] };
    const x = col(40, 0);
    return { kind: 'xy', xName: 'x', yName: 'y', x, y: x.map((v) => v * 0.5 + gaussian(rng)) };
  }
  if (a.target === 'categorical') return { kind: 'table', rowNames: names, colNames: ['evet', 'hayır'], table: names.map((_, i) => [10 + i * 3, 20 - i * 2]) };
  if (a.design === 'paired') return { kind: 'paired', names, conditions: names.map((_, i) => col(25, i)) };
  return { kind: 'groups', names, groups: names.map((_, i) => col(20 + i, i * 0.8)) };
}

describe('karar motoru ↔ çalıştırıcı', () => {
  const goals: Goal[] = ['compare', 'relate'];
  const groups: GroupCount[] = ['2', '3+'];
  const designs: Design[] = ['independent', 'paired', 'unknown'];
  const targets: Target[] = ['continuous', 'ordinal', 'categorical'];
  const scenarios = [
    { name: 'normal ve eşit varyans', normalP: 0.5, varianceP: 0.5 },
    { name: 'normal, eşit olmayan varyans', normalP: 0.5, varianceP: 0.001 },
    { name: 'normal değil', normalP: 0.001, varianceP: 0.5 },
  ];

  it('önerilen her test gerçekten çalışır ve yorumlanır', () => {
    const seen = new Set<string>();
    for (const goal of goals)
      for (const g of groups)
        for (const design of designs)
          for (const target of targets)
            for (const sc of scenarios) {
              const answers: WizardAnswers = { goal, groups: g, design, target };
              const rec = recommendTest(answers, { normalP: sc.normalP, varianceP: sc.varianceP, n: 60, minGroupN: 20 });
              const outcome = runTest(rec.finalTest, inputFor(answers));
              const text = interpretOutcome(outcome);
              seen.add(outcome.test);
              expect(Number.isFinite(outcome.p), `${rec.finalTest}: p`).toBe(true);
              expect(outcome.p).toBeGreaterThanOrEqual(0);
              expect(outcome.p).toBeLessThanOrEqual(1);
              expect(text.headline.length).toBeGreaterThan(10);
              expect(text.body.novice).not.toMatch(/NaN|undefined/);
              expect(text.body.expert).not.toMatch(/NaN|undefined/);
            }
    // Motorun önerebildiği testlerin tamamı en az bir kez çalıştırıldı
    for (const t of [
      'Welch t-testi', 'Mann-Whitney U testi', 'Welch ANOVA', 'Kruskal-Wallis H testi', 'Eşleştirilmiş t-testi',
      'Wilcoxon işaretli sıra testi', 'Tekrarlı ölçümler ANOVA', 'Friedman testi', 'Pearson korelasyonu',
      'Spearman sıra korelasyonu', 'Ki-kare homojenlik testi', 'Ki-kare bağımsızlık testi',
    ]) {
      expect(seen.has(t) || seen.has('Fisher kesin testi'), `${t} hiç çalıştırılmadı`).toBe(true);
    }
  });

  it('desteklenmeyen test adı ya da uyumsuz girdi açık bir hata verir', () => {
    expect(() => runTest('Bilinmeyen test', inputFor(defaultAnswers))).toThrow(/Desteklenmeyen test/);
    expect(() => runTest('Friedman testi', { kind: 'groups', names: ['a', 'b'], groups: [[1, 2, 3], [2, 3, 4]] })).toThrow(/paired/);
    expect(() => runTest('Welch t-testi', { kind: 'groups', names: ['a', 'b', 'c'], groups: [[1, 2], [2, 3], [3, 4]] })).toThrow(/2 grup/);
  });
});

describe('runTest sonuçları', () => {
  it('Kruskal-Wallis anlamlıysa Dunn post-hoc ekler; anlamsızsa eklemez', () => {
    const big = runTest('Kruskal-Wallis H testi', {
      kind: 'groups',
      names: ['A', 'B', 'C'],
      groups: [[1, 2, 3, 2, 1, 3], [10, 11, 12, 11, 10, 12], [20, 21, 22, 21, 20, 22]],
    });
    expect(big.significant).toBe(true);
    expect(big.postHoc?.method).toContain('Dunn');
    expect(big.postHoc?.pairs).toHaveLength(3);
    const none = runTest('Kruskal-Wallis H testi', { kind: 'groups', names: ['A', 'B', 'C'], groups: [[1, 5, 9, 3], [2, 6, 8, 4], [3, 4, 7, 5]] });
    expect(none.significant).toBe(false);
    expect(none.postHoc).toBeUndefined();
  });

  it('2×2 tabloda beklenen sayı küçükse Fisher kesin testine geçer ve bunu belirtir', () => {
    const r = runTest('Ki-kare bağımsızlık testi', { kind: 'table', rowNames: ['a', 'b'], colNames: ['x', 'y'], table: [[3, 1], [1, 4]] });
    expect(r.test).toBe('Fisher kesin testi');
    expect(r.notes.join(' ')).toContain('Fisher');
  });

  it('yorum metni p değerini yanlış yorumlamaz ve nedensellik ima etmez', () => {
    const o = runTest('Welch t-testi', { kind: 'groups', names: ['A', 'B'], groups: [col(30, 0), col(30, 1.2)] });
    const t = interpretOutcome(o);
    expect(t.body.novice).toContain('ihtimali');
    expect(t.body.novice).not.toMatch(/tesadüf olma olasılığı/);
    expect(t.body.novice).toContain('nedenini göstermez');
    expect(t.body.expert).toContain(o.statisticText);
  });
});
