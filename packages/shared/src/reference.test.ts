import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { averagePrecision, chiSquareSurvival, fSurvival, kruskalWallis, levene, normalQuantile, normalSurvival, quantile, rocAuc, shapiroWilk, tukeyFences } from './index.ts';

/**
 * SciPy / scikit-learn ile üretilmiş referans vakalarla karşılaştırma.
 * Referansları yenilemek için: tools/reference/.venv/Scripts/python.exe tools/reference/generate.py
 */
interface Case {
  test: string;
  input: Record<string, any>;
  expected: Record<string, number>;
}
const fixture = JSON.parse(readFileSync(fileURLToPath(new URL('../fixtures/reference.json', import.meta.url)), 'utf8')) as {
  meta: Record<string, string | number>;
  cases: Case[];
};

/** Beklenen değere göre göreli, çok küçük değerlerde mutlak tolerans. */
function close(actual: number, expected: number, rel: number, abs: number) {
  return Math.abs(actual - expected) <= abs + rel * Math.abs(expected);
}

type Runner = (input: Case['input']) => Record<string, number>;
interface Spec {
  run: Runner;
  /** Alan başına [göreli, mutlak] tolerans. */
  tol: Record<string, [number, number]>;
}

const specs: Record<string, Spec> = {
  chi2_sf: { run: (i) => ({ p: chiSquareSurvival(i.x, i.df) }), tol: { p: [1e-11, 1e-14] } },
  f_sf: { run: (i) => ({ p: fSurvival(i.x, i.d1, i.d2) }), tol: { p: [1e-11, 1e-14] } },
  norm_sf: { run: (i) => ({ p: normalSurvival(i.z) }), tol: { p: [1e-11, 1e-14] } },
  norm_ppf: { run: (i) => ({ z: normalQuantile(i.p) }), tol: { z: [1e-11, 1e-12] } },
  shapiro: { run: (i) => { const r = shapiroWilk(i.data); return { W: r.W, p: r.p }; }, tol: { W: [1e-10, 1e-12], p: [1e-8, 1e-10] } },
  levene: { run: (i) => { const r = levene(i.groups); return { F: r.F, p: r.p }; }, tol: { F: [1e-11, 1e-12], p: [1e-10, 1e-12] } },
  kruskal: {
    run: (i) => { const r = kruskalWallis(i.groups); return { H: r.H, p: r.p, epsilon2: r.epsilonSquared }; },
    tol: { H: [1e-11, 1e-12], p: [1e-10, 1e-12], epsilon2: [1e-11, 1e-12] },
  },
  quantile: { run: (i) => ({ value: quantile(i.data, i.q) }), tol: { value: [1e-12, 1e-12] } },
  tukey: {
    run: (i) => { const f = tukeyFences(i.data); return { q1: f.q1, q3: f.q3, lower: f.lower, upper: f.upper }; },
    tol: { q1: [1e-12, 1e-12], q3: [1e-12, 1e-12], lower: [1e-12, 1e-12], upper: [1e-12, 1e-12] },
  },
  roc_auc: { run: (i) => ({ auc: rocAuc(i.scores, i.labels) }), tol: { auc: [1e-12, 1e-12] } },
  average_precision: { run: (i) => ({ ap: averagePrecision(i.scores, i.labels) }), tol: { ap: [1e-12, 1e-12] } },
};

export { specs, close, fixture };
export type { Case };

describe(`referans vakalar (SciPy ${fixture.meta.scipy}, scikit-learn ${fixture.meta.sklearn})`, () => {
  const byTest: Record<string, Case[]> = {};
  for (const c of fixture.cases) (byTest[c.test] ??= []).push(c);

  for (const [name, list] of Object.entries(byTest)) {
    const spec = specs[name];
    it(`${name}: ${list.length} vaka`, () => {
      expect(spec, `"${name}" için çalıştırıcı tanımlı değil`).toBeDefined();
      const failures: string[] = [];
      for (const [idx, c] of list.entries()) {
        const got = spec!.run(c.input);
        for (const [field, exp] of Object.entries(c.expected)) {
          const [rel, abs] = spec!.tol[field] ?? [1e-9, 1e-12];
          const actual = got[field]!;
          if (!close(actual, exp, rel, abs)) failures.push(`#${idx} ${field}: beklenen ${exp}, bulunan ${actual}`);
        }
      }
      expect(failures.slice(0, 5)).toEqual([]);
    });
  }
});
