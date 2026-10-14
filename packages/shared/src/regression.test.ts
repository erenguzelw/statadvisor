import { describe, expect, it } from 'vitest';
import { AnalysisError } from './analysis.ts';
import { fitLinearRegression } from './regression.ts';

const x = Array.from({ length: 30 }, (_, i) => i + 1);
const noise = x.map((_, i) => ((i * 37) % 11) - 5);

describe('fitLinearRegression', () => {
  it('bilinen doğruyu bulur: y = 2 + 3x', () => {
    const y = x.map((v) => 2 + 3 * v);
    const r = fitLinearRegression(y, [{ name: 'x', kind: 'numeric', values: x }]);
    expect(r.coefficients[0]!.b).toBeCloseTo(2, 8);
    expect(r.coefficients[1]!.b).toBeCloseTo(3, 8);
    expect(r.r2).toBeCloseTo(1, 10);
  });

  it('eksik değerli satırları çıkarır ve sayar', () => {
    const y: (number | null)[] = x.map((v, i) => 1 + 2 * v + noise[i]!);
    y[3] = null;
    const xs: (number | null)[] = [...x];
    xs[7] = null;
    const r = fitLinearRegression(y, [{ name: 'x', kind: 'numeric', values: xs }]);
    expect(r.n).toBe(28);
    expect(r.droppedRows).toBe(2);
    expect(r.usedRows).not.toContain(3);
    expect(r.usedRows).not.toContain(7);
  });

  it('kategorik yordayıcıyı kukla kodlar; referans ilk düzeydir', () => {
    const g = x.map((_, i) => ['a', 'b', 'c'][i % 3]!);
    const y = x.map((v, i) => 1 + 0.5 * v + (g[i] === 'b' ? 4 : g[i] === 'c' ? -2 : 0) + noise[i]! * 0.1);
    const r = fitLinearRegression(y, [
      { name: 'x', kind: 'numeric', values: x },
      { name: 'g', kind: 'categorical', values: g },
    ]);
    expect(r.coefficients.map((c) => c.term)).toEqual(['Sabit', 'x', 'g[b]', 'g[c]']);
    expect(r.coefficients[2]!.b).toBeCloseTo(4, 0);
    expect(r.coefficients[3]!.b).toBeCloseTo(-2, 0);
  });

  it('tam doğrusal bağımlılıkta anlaşılır hata verir', () => {
    const y = x.map((v, i) => v + noise[i]!);
    expect(() =>
      fitLinearRegression(y, [
        { name: 'x', kind: 'numeric', values: x },
        { name: 'x2', kind: 'numeric', values: x.map((v) => 2 * v) },
      ]),
    ).toThrow(AnalysisError);
  });

  it('gözlem sayısı parametre sayısından azsa hata verir', () => {
    expect(() => fitLinearRegression([1, 2], [{ name: 'x', kind: 'numeric', values: [1, 2] }])).toThrow(/Gözlem sayısı/);
  });
});
