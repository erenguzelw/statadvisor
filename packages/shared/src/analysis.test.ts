import { analyze, AnalysisError, type AnalysisRequest } from './analysis.ts';
import { gaussian, mulberry32 } from './ml.ts';

const A = [2.6, 4.3, 3.2, 2.3, 3, 5.6, 6.1, 3.4, 4.5, 2.1, 2.9, 4.2, 2.4, 4.3, 5.3];
const B = [4.3, 4.4, 4.6, 3.1, 5.8, 6.4, 3.1, 5.9, 7.7, 3.2, 6, 2.5, 5.2, 3.6, 3.3];
const C = [4.7, 6.2, 4, 5.4, 13.2, 11.4, 8.3, 7.3, 7.4, 4.4, 4.9, 5.4, 3.6, 7.4, 3.5];

const long = (groups: Record<string, number[]>) => ({
  value: { name: 'biyobelirtec', values: Object.values(groups).flat() as (number | null)[] },
  group: { name: 'grup', values: Object.entries(groups).flatMap(([k, v]) => v.map(() => k)) as (string | null)[] },
});

const rng = mulberry32(3);
const normal = (n: number, mu: number, s = 1) => Array.from({ length: n }, () => mu + s * gaussian(rng));

describe('analyze: bağımsız gruplar', () => {
  it('örnek veride varsayımları hesaplar ve Kruskal-Wallis önerir (gerçek referans değerler)', () => {
    const r = analyze({ goal: 'compare', design: 'independent', target: 'continuous', datasetName: 'örnek', ...long({ A, B, C }) });
    expect(r.decision.finalTest).toBe('Kruskal-Wallis H testi');
    expect(r.decision.plannedTest).toBe('Tek Yönlü ANOVA');
    const shapiro = r.assumptions.find((a) => a.name === 'Shapiro-Wilk')!;
    expect(shapiro.p).toBeCloseTo(0.003776, 5);
    expect(r.assumptions.find((a) => a.name === 'Levene')!.p).toBeCloseTo(0.1307, 4);
    expect(r.outcome.statistic.value).toBeCloseTo(11.696014, 5);
    expect(r.outcome.p).toBeCloseTo(0.0028856, 6);
    expect(r.outcome.effect.value).toBeCloseTo(11.696014 / 44, 6);
    expect(r.distribution?.n).toBe(45);
    expect(r.descriptives.map((d) => d.group)).toEqual(['A', 'B', 'C']);
    expect(r.apaSummary).toContain('Kruskal-Wallis H testi');
    expect(r.references.some((x) => x.startsWith('Kruskal'))).toBe(true);
    expect(r.references.some((x) => x.startsWith('Royston'))).toBe(true);
  });

  it('normal veride Welch ANOVA önerir ve anlamlıysa post-hoc ekler', () => {
    const r = analyze({ goal: 'compare', design: 'independent', target: 'continuous', ...long({ x: normal(40, 0), y: normal(40, 2), z: normal(40, 4) }) });
    expect(r.decision.finalTest).toBe('Welch ANOVA');
    expect(r.outcome.significant).toBe(true);
    expect(r.outcome.postHoc?.pairs).toHaveLength(3);
  });

  it('eksik değerleri atar ve bunu not eder', () => {
    const req = long({ A, B });
    req.value.values[0] = null;
    req.group.values[3] = null;
    const r = analyze({ goal: 'compare', design: 'independent', target: 'continuous', ...req });
    expect(r.notes.join(' ')).toContain('2 satır');
    expect(r.outcome.n).toBe(A.length + B.length - 2);
  });

  it('geçersiz isteklerde anlaşılır hata verir', () => {
    const base: AnalysisRequest = { goal: 'compare', design: 'independent', target: 'continuous' };
    expect(() => analyze({ ...base, goal: 'predict' })).toThrow(AnalysisError);
    expect(() => analyze(base)).toThrow(/sonuç sütunu ve bir grup sütunu/);
    expect(() => analyze({ ...base, ...long({ A }) })).toThrow(/en az 2 farklı değer/);
    expect(() => analyze({ ...base, ...long({ A, B: [1] }) })).toThrow(/2’den az gözlem/);
    expect(() => analyze({ ...base, alpha: 2, ...long({ A, B }) })).toThrow(/α/);
    const many = Object.fromEntries(Array.from({ length: 14 }, (_, i) => [`g${i}`, [1, 2, 3]]));
    expect(() => analyze({ ...base, ...long(many) })).toThrow(/grup sütunu gibi görünmüyor/);
  });
});

describe('analyze: diğer tasarımlar', () => {
  it('eşleşmiş iki koşul: farklar üzerinde normallik ve eşleştirilmiş t', () => {
    const before = normal(30, 10, 2);
    const after = before.map((v) => v + 1.5 + gaussian(rng) * 0.5);
    const r = analyze({
      goal: 'compare',
      design: 'paired',
      target: 'continuous',
      conditions: [
        { name: 'önce', values: before },
        { name: 'sonra', values: after },
      ],
    });
    expect(r.decision.finalTest).toBe('Eşleştirilmiş t-testi');
    expect(r.assumptions[0]!.subject).toContain('eşleşmiş farklar');
    expect(r.outcome.significant).toBe(true);
  });

  it('eşleşmiş üç koşul normal değilse Friedman', () => {
    const base = Array.from({ length: 30 }, (_, i) => Math.exp((i % 7) / 2));
    const conds = [0, 1, 2].map((k) => ({ name: `t${k}`, values: base.map((v) => v * (1 + k * 0.4) * Math.exp(gaussian(rng) * 0.6)) }));
    const r = analyze({ goal: 'compare', design: 'paired', target: 'continuous', conditions: conds });
    expect(['Friedman testi', 'Tekrarlı ölçümler ANOVA']).toContain(r.decision.finalTest);
  });

  it('ilişki: normal veride Pearson, çarpıkta Spearman', () => {
    const x = normal(60, 0);
    const y = x.map((v) => v * 0.7 + gaussian(rng) * 0.5);
    const p = analyze({ goal: 'relate', design: 'independent', target: 'continuous', x: { name: 'x', values: x }, y: { name: 'y', values: y } });
    expect(p.decision.finalTest).toBe('Pearson korelasyonu');
    expect(p.assumptions).toHaveLength(2);
    expect(p.outcome.direction).toBe('pozitif');
    const sk = analyze({ goal: 'relate', design: 'independent', target: 'continuous', x: { name: 'x', values: x.map(Math.exp) }, y: { name: 'y', values: y.map(Math.exp) } });
    expect(sk.decision.finalTest).toBe('Spearman sıra korelasyonu');
  });

  it('kategorik karşılaştırma ve ilişki çapraz tablo üretir', () => {
    const rows = ['a', 'a', 'a', 'b', 'b', 'b', 'a', 'b', 'a', 'b', 'a', 'a', 'b', 'b', 'a', 'b', 'b', 'a', 'a', 'b'];
    const cols = ['e', 'h', 'e', 'h', 'h', 'e', 'e', 'h', 'e', 'h', 'e', 'e', 'h', 'h', 'e', 'h', 'e', 'e', 'e', 'h'];
    const r = analyze({ goal: 'compare', design: 'independent', target: 'categorical', rowVar: { name: 'grup', values: rows }, colVar: { name: 'sonuç', values: cols } });
    expect(['Ki-kare homojenlik testi', 'Fisher kesin testi']).toContain(r.decision.finalTest);
    expect(r.outcome.n).toBe(20);
    const rel = analyze({ goal: 'relate', design: 'independent', target: 'categorical', rowVar: { name: 'a', values: rows }, colVar: { name: 'b', values: cols } });
    expect(rel.outcome.kind).toBe('table');
  });

  it('5000’den fazla gözlemde Shapiro-Wilk için belirleyici alt örnek kullanır ve not eder', () => {
    const n = 6000;
    const big = long({ a: normal(n / 2, 0), b: normal(n / 2, 0.3) });
    const r = analyze({ goal: 'compare', design: 'independent', target: 'continuous', ...big });
    expect(r.notes.join(' ')).toContain('5000');
    expect(r.assumptions[0]!.subject).toContain('n = 5000');
    const again = analyze({ goal: 'compare', design: 'independent', target: 'continuous', ...big });
    expect(again.assumptions[0]!.p).toBe(r.assumptions[0]!.p);
  });
});
