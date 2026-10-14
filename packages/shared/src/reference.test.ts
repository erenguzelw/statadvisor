import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  adjustPValues,
  anovaOneWay,
  anovaRepeated,
  averagePrecision,
  chiSquareContingency,
  chiSquareSurvival,
  dunnTest,
  fisherExact,
  friedmanTest,
  fitLinearRegression,
  fitLogisticRegression,
  fSurvival,
  kruskalWallis,
  levene,
  mannWhitneyU,
  normalQuantile,
  normalSurvival,
  pairwiseWelch,
  pearson,
  quantile,
  rocAuc,
  shapiroWilk,
  spearman,
  tQuantile,
  tSurvival,
  tTestIndependent,
  tTestPaired,
  tTwoSidedP,
  tukeyFences,
  welchAnova,
  wilcoxonSignedRank,
  ENGINE,
  type AdjustMethod,
} from './index.ts';

/**
 * SciPy / statsmodels / scikit-learn / scikit-posthocs ile üretilmiş referans vakalarla karşılaştırma.
 * Referansları yenilemek için: tools/reference/.venv/Scripts/python.exe tools/reference/generate.py
 */
type Value = number | number[];
interface Case {
  test: string;
  // Girdi şekli teste göre değişir; her çalıştırıcı kendi alanlarını okur.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: Record<string, any>;
  expected: Record<string, Value>;
}
const fixture = JSON.parse(readFileSync(fileURLToPath(new URL('../fixtures/reference.json', import.meta.url)), 'utf8')) as {
  meta: Record<string, string | number>;
  cases: Case[];
};

/** Beklenen değere göre göreli, çok küçük değerlerde mutlak tolerans. */
function close(actual: number, expected: number, rel: number, abs: number) {
  return Math.abs(actual - expected) <= abs + rel * Math.abs(expected);
}

type Runner = (input: Case['input']) => Record<string, Value>;
interface Spec {
  run: Runner;
  /** Alan başına [göreli, mutlak] tolerans; belirtilmeyen alanlar için varsayılan kullanılır. */
  tol?: Record<string, [number, number]>;
}

const tight: [number, number] = [1e-10, 1e-12];
const tTestFields = (r: ReturnType<typeof tTestPaired>) => ({
  t: r.t,
  df: r.df,
  p: r.p,
  ciLow: r.ci[0],
  ciHigh: r.ci[1],
  meanDiff: r.meanDiff,
  d: r.cohenD,
  g: r.hedgesG,
});

const specs: Record<string, Spec> = {
  chi2_sf: { run: (i) => ({ p: chiSquareSurvival(i.x, i.df) }), tol: { p: [1e-11, 1e-14] } },
  f_sf: { run: (i) => ({ p: fSurvival(i.x, i.d1, i.d2) }), tol: { p: [1e-11, 1e-14] } },
  norm_sf: { run: (i) => ({ p: normalSurvival(i.z) }), tol: { p: [1e-11, 1e-14] } },
  norm_ppf: { run: (i) => ({ z: normalQuantile(i.p) }), tol: { z: [1e-11, 1e-12] } },
  t_sf: { run: (i) => ({ p: tSurvival(i.t, i.df), p2: tTwoSidedP(i.t, i.df) }), tol: { p: [1e-10, 1e-14], p2: [1e-10, 1e-14] } },
  t_ppf: { run: (i) => ({ t: tQuantile(i.p, i.df) }), tol: { t: [1e-10, 1e-12] } },
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

  t_ind: { run: (i) => tTestFields(tTestIndependent(i.x, i.y, { equalVar: i.equalVar })) },
  t_paired: { run: (i) => tTestFields(tTestPaired(i.x, i.y)) },
  anova: { run: (i) => { const r = anovaOneWay(i.groups); return { F: r.F, p: r.p, eta2: r.etaSquared }; } },
  welch_anova: { run: (i) => { const r = welchAnova(i.groups); return { F: r.F, p: r.p, df1: r.df1, df2: r.df2, eta2: r.etaSquared }; } },
  anova_rm: {
    run: (i) => { const r = anovaRepeated(i.conditions); return { F: r.F, df1: r.df1, df2: r.df2, p: r.p, partialEta2: r.partialEtaSquared }; },
  },
  mannwhitney: { run: (i) => { const r = mannWhitneyU(i.x, i.y, i.method); return { U: r.U, p: r.p, rankBiserial: r.rankBiserial }; } },
  wilcoxon: { run: (i) => { const r = wilcoxonSignedRank(i.x, i.y, i.method); return { W: r.W, p: r.p, rankBiserial: r.rankBiserial }; } },
  friedman: { run: (i) => { const r = friedmanTest(i.conditions); return { chi2: r.chi2, p: r.p, kendallW: r.kendallW }; } },
  pearson: { run: (i) => { const r = pearson(i.x, i.y); return { r: r.r, p: r.p, ciLow: r.ci[0], ciHigh: r.ci[1] }; } },
  spearman: { run: (i) => { const r = spearman(i.x, i.y); return { r: r.r, p: r.p, ciLow: r.ci[0], ciHigh: r.ci[1] }; } },
  chi2_table: {
    run: (i) => { const r = chiSquareContingency(i.table); return { chi2: r.chi2, df: r.df, p: r.p, cramersV: r.cramersV, lowShare: r.lowExpectedShare }; },
  },
  fisher: { run: (i) => { const r = fisherExact(i.table); return { p: r.p, ...(Number.isFinite(r.oddsRatio) ? { oddsRatio: r.oddsRatio } : {}) }; }, tol: { p: [1e-9, 1e-12] } },
  adjust: { run: (i) => ({ adj: adjustPValues(i.p, i.method as AdjustMethod) }) },
  dunn: {
    run: (i) => { const r = dunnTest(i.groups); return { p: r.map((x) => x.p), pAdj: r.map((x) => x.pAdj) }; },
    tol: { p: [1e-9, 1e-12], pAdj: [1e-9, 1e-12] },
  },
  pairwise_welch: {
    run: (i) => { const r = pairwiseWelch(i.groups); return { p: r.map((x) => x.p), pAdj: r.map((x) => x.pAdj) }; },
    tol: { p: [1e-9, 1e-12], pAdj: [1e-9, 1e-12] },
  },
};

const olsTol: [number, number] = [1e-7, 1e-9];
specs.ols = {
  run: (i) => {
    const r = fitLinearRegression(i.y, i.predictors);
    const c = r.coefficients;
    return {
      b: c.map((x) => x.b), se: c.map((x) => x.se), t: c.map((x) => x.t), p: c.map((x) => x.p),
      ciLow: c.map((x) => x.ciLow), ciHigh: c.map((x) => x.ciHigh),
      beta: c.slice(1).map((x) => x.beta!), vif: c.slice(1).map((x) => x.vif!),
      n: r.n, r2: r.r2, adjR2: r.adjR2, F: r.F, pF: r.pF, sigma: r.sigma, logLik: r.logLik, aic: r.aic, bic: r.bic,
      dw: r.diagnostics.durbinWatson, bpLm: r.diagnostics.breuschPagan.lm, bpP: r.diagnostics.breuschPagan.p,
      cooks: r.cooks, hat: r.leverage,
      shapiroW: r.diagnostics.shapiro!.W, shapiroP: r.diagnostics.shapiro!.p,
    };
  },
  tol: Object.fromEntries(
    ['b', 'se', 't', 'p', 'ciLow', 'ciHigh', 'beta', 'vif', 'n', 'r2', 'adjR2', 'F', 'pF', 'sigma', 'logLik', 'aic', 'bic', 'dw', 'bpLm', 'bpP', 'cooks', 'hat'].map((k) => [k, olsTol]),
  ) as Record<string, [number, number]>,
};
specs.ols!.tol!.shapiroW = [1e-9, 1e-11];
specs.ols!.tol!.shapiroP = [1e-7, 1e-10];

specs.logit = {
  run: (i) => {
    const r = fitLogisticRegression(i.y, i.predictors);
    const c = r.coefficients;
    return {
      b: c.map((x) => x.b), se: c.map((x) => x.se), z: c.map((x) => x.z), p: c.map((x) => x.p),
      ciLow: c.map((x) => x.ciLow), ciHigh: c.map((x) => x.ciHigh), vif: c.slice(1).map((x) => x.vif!),
      n: r.n, logLik: r.logLik, logLikNull: r.logLikNull, lrChi2: r.lrChi2, lrP: r.lrP, mcFadden: r.mcFadden,
      coxSnell: r.coxSnell, nagelkerke: r.nagelkerke, aic: r.aic, bic: r.bic, auc: r.auc,
      hlChi2: r.hosmerLemeshow!.chi2, hlP: r.hosmerLemeshow!.p,
      tp: r.classification.tp, fp: r.classification.fp, tn: r.classification.tn, fn: r.classification.fn,
      probs: r.probs,
    };
  },
  tol: Object.fromEntries(
    ['b', 'se', 'z', 'p', 'ciLow', 'ciHigh', 'vif', 'n', 'logLik', 'logLikNull', 'lrChi2', 'lrP', 'mcFadden', 'coxSnell', 'nagelkerke', 'aic', 'bic', 'auc', 'hlChi2', 'hlP', 'tp', 'fp', 'tn', 'fn', 'probs'].map((k) => [k, olsTol]),
  ) as Record<string, [number, number]>,
};

export { specs, close, fixture };
export type { Case };

describe('motor kimliği', () => {
  it('ENGINE.referenceSuite, referans dosyasıyla uyumludur', () => {
    expect(ENGINE.referenceSuite.cases).toBe(fixture.cases.length);
    expect(ENGINE.referenceSuite.scipy).toBe(fixture.meta.scipy);
  });
});

describe(`referans vakalar (SciPy ${fixture.meta.scipy}, scikit-learn ${fixture.meta.sklearn})`, () => {
  const byTest: Record<string, Case[]> = {};
  for (const c of fixture.cases) (byTest[c.test] ??= []).push(c);

  // ml_cv vakaları ayrı dosyada (ml-cv.test.ts) sınanır: modele göre farklı eşleşme beklentisi vardır
  const SEPARATE = new Set(['ml_cv']);
  for (const [name, list] of Object.entries(byTest)) {
    if (SEPARATE.has(name)) continue;
    const spec = specs[name];
    it(`${name}: ${list.length} vaka`, () => {
      expect(spec, `"${name}" için çalıştırıcı tanımlı değil`).toBeDefined();
      const failures: string[] = [];
      for (const [idx, c] of list.entries()) {
        const got = spec!.run(c.input);
        for (const [field, exp] of Object.entries(c.expected)) {
          const [rel, abs] = spec!.tol?.[field] ?? tight;
          const actual = got[field];
          const pairs: [number, number][] = Array.isArray(exp)
            ? exp.map((e, k) => [(actual as number[])[k] ?? NaN, e])
            : [[actual as number, exp]];
          for (const [a, e] of pairs) {
            if (!close(a, e, rel, abs)) failures.push(`#${idx} ${field}: beklenen ${e}, bulunan ${a}`);
          }
        }
      }
      expect(failures.slice(0, 6)).toEqual([]);
    });
  }
});
