import { describe, expect, it } from 'vitest';
import { fitFactorialAnova } from './factorial.ts';

/** Referans: statsmodels ols("y ~ C(a, Sum) * C(b, Sum)") + anova_lm(typ=3). */
const DATA = 'a1,b1,80;a1,b1,55;a1,b1,60;a1,b2,40;a1,b2,50;a1,b2,55;a1,b3,60;a1,b3,80;a1,b3,75;a2,b1,65;a2,b1,35;a2,b1,40;a2,b2,30;a2,b2,25;a2,b2,29;a2,b3,50;a2,b3,35;a2,b3,42;'.split(';').filter(Boolean).map((l) => l.split(','));

describe('fitFactorialAnova', () => {
  it('2×3 faktöriyel Tip III sonuçları statsmodels ile eşleşir', () => {
    const r = fitFactorialAnova('y', DATA.map((d) => Number(d[2])), [
      { name: 'a', values: DATA.map((d) => d[0]!) },
      { name: 'b', values: DATA.map((d) => d[1]!) },
    ]);
    expect(r.ssType).toBe('III');
    expect(r.n).toBe(18);
    expect(r.error.df).toBe(12);
    const t = Object.fromEntries(r.terms.map((x) => [x.name, x]));
    expect(t['a']!.ss).toBeCloseTo(2312, 3);
    expect(t['a']!.F).toBeCloseTo(20.9126, 3);
    expect(t['a']!.p).toBeCloseTo(0.0006, 4);
    expect(t['b']!.ss).toBeCloseTo(1336.3333, 3);
    expect(t['b']!.df).toBe(2);
    expect(t['a × b']!.ss).toBeCloseTo(103, 3);
    expect(t['a × b']!.p).toBeCloseTo(0.6385, 4);
    expect(r.error.ss).toBeCloseTo(1326.6667, 3);
  });

  it('Tukey HSD ve basit etkiler scipy ile eşleşir', () => {
    const fac = [
      { name: 'a', values: DATA.map((d) => d[0]!) },
      { name: 'b', values: DATA.map((d) => d[1]!) },
    ];
    const y = DATA.map((d) => Number(d[2]));
    const all = fitFactorialAnova('y', y, fac, { alpha: 1 });
    const pairs = all.postHoc.find((x) => x.factor === 'b')!.pairs;
    expect(pairs[0]!.p).toBeCloseTo(0.0325, 4);
    expect(pairs[1]!.p).toBeCloseTo(0.9799, 4);
    expect(pairs[2]!.p).toBeCloseTo(0.0231, 4);
    const se = all.postHoc[0]!.pairs[0]!.se;
    expect(se).toBeCloseTo(Math.sqrt((1326.6667 / 12 / 2) * (2 / 6)), 3);
    const simple = all.simpleEffects.filter((x) => x.factor === 'a');
    expect(simple.map((x) => x.F.toFixed(3))).toEqual(['4.560', '5.610', '11.674']);
    expect(simple[2]!.p).toBeCloseTo(0.0051, 4);
    // %95 kritik değer: q(0.05; 3, 12) = 3.7729
    const ci = fitFactorialAnova('y', y, fac).postHoc[0]!.pairs[0]!;
    expect((ci.ciHigh - ci.diff) / ci.se).toBeCloseTo(3.7729, 3);
  });

  it('boş hücre varsa Tip II kullanır ve serbestlik derecelerini korur', () => {
    // a=x,b=q hücresi boş
    const rows: [string, string, number][] = [['x', 'p', 1], ['x', 'p', 2], ['y', 'p', 3], ['y', 'p', 5], ['y', 'q', 6], ['y', 'q', 8], ['x', 'r', 2], ['x', 'r', 4], ['y', 'r', 7], ['y', 'r', 9]];
    const r = fitFactorialAnova('y', rows.map((x) => x[2]), [
      { name: 'a', values: rows.map((x) => x[0]) },
      { name: 'b', values: rows.map((x) => x[1]) },
    ]);
    expect(r.emptyCells).toBe(1);
    expect(r.ssType).toBe('II');
    expect(r.ssTypeSwitched).toBe(true);
    expect(r.terms.find((x) => x.name === 'a')!.df).toBe(1);
  });

  it('eksik değerleri atar, tek gözlemli hücrelerde hata verir', () => {
    expect(() => fitFactorialAnova('y', [1, 2, 3, 4], [{ name: 'a', values: ['u', 'u', 'v', 'v'] }, { name: 'b', values: ['p', 'q', 'p', 'q'] }])).toThrow(/Hata serbestlik/);
    const r = fitFactorialAnova('y', [1, 2, null, 4, 5, 7, 8, 9], [{ name: 'a', values: ['u', 'u', 'u', 'u', 'v', 'v', 'v', 'v'] }]);
    expect(r.n).toBe(7);
    expect(r.dropped).toBe(1);
  });
});
