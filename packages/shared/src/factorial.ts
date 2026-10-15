/**
 * Çok faktörlü (faktöriyel) varyans analizi: sabit etkili, bağımsız gruplu, Tip III kareler toplamı (SPSS "Genel Doğrusal Model"
 * ve SAS Tip III varsayılanı). Faktörler sapma (toplamı sıfır) kodlamasıyla kodlanır; her terimin kareler toplamı, o terimin
 * sütunları modelden çıkarılınca artan hata kareler toplamıdır. En küçük kareler çözümü rank-duyarlıdır: boş hücreler olsa bile
 * (kestirilebilir serbestlik derecesiyle) çalışır.
 */
import { AnalysisError } from './analysis.ts';
import { fSurvival, shapiroWilk } from './assumptions.ts';
import { studentizedRangeQuantile, studentizedRangeSurvival } from './studentized.ts';

export interface FactorInput {
  name: string;
  values: (string | number | null)[];
}

export interface FactorialOptions {
  alpha?: number;
  /** Kareler toplamı türü. auto: boş hücre yoksa Tip III, varsa Tip II (Tip III boş hücrede tanımsızdır). */
  ssType?: 'II' | 'III' | 'auto';
}

export interface AnovaTerm {
  /** Ör. "Cinsiyet" ya da "Cinsiyet × Bölüm". */
  name: string;
  factors: string[];
  ss: number;
  df: number;
  ms: number;
  F: number;
  p: number;
  partialEta2: number;
}

export interface CellStat {
  levels: string[];
  n: number;
  mean: number;
  sd: number;
}

export interface MarginalStat {
  factor: string;
  level: string;
  n: number;
  mean: number;
  sd: number;
}

export interface PostHocRow {
  a: string;
  b: string;
  diff: number;
  se: number;
  p: number;
  ciLow: number;
  ciHigh: number;
}

/** Anlamlı ve 3+ düzeyli bir ana etki için Tukey HSD (modelin hata kareler ortalaması ve sd'siyle). */
export interface FactorPostHoc {
  factor: string;
  pairs: PostHocRow[];
}

/** Anlamlı bir iki yönlü etkileşimin basit etkileri: bir faktörün etkisi, diğer faktörün her düzeyinde (modelin hata terimiyle). */
export interface SimpleEffect {
  term: string;
  factor: string;
  at: { factor: string; level: string };
  n: number;
  ss: number;
  df: number;
  F: number;
  p: number;
  /** Aynı (terim, faktör) ailesindeki düzey sayısına göre Bonferroni düzeltmeli p. */
  pAdj: number;
}

export interface FactorialResult {
  dependent: string;
  factors: string[];
  levels: Record<string, string[]>;
  n: number;
  dropped: number;
  alpha: number;
  /** Kullanılan kareler toplamı türü. */
  ssType: 'II' | 'III';
  /** Tip III istendi ama boş hücre nedeniyle Tip II kullanıldı. */
  ssTypeSwitched: boolean;
  /** Düzeltilmiş model (sabit hariç tüm terimler). */
  model: { ss: number; df: number; ms: number; F: number; p: number };
  intercept: { ss: number; df: number; ms: number; F: number; p: number };
  terms: AnovaTerm[];
  error: { ss: number; df: number; ms: number };
  total: { ssCorrected: number; ssUncorrected: number; dfCorrected: number };
  r2: number;
  adjR2: number;
  cells: CellStat[];
  marginals: MarginalStat[];
  emptyCells: number;
  totalCells: number;
  minCellN: number;
  maxCellN: number;
  balanced: boolean;
  /** Levene (ortalama merkezli) hücreler arası varyans homojenliği. */
  levene: { F: number; df1: number; df2: number; p: number } | null;
  /** Model kalıntılarının Shapiro-Wilk sonucu (3 ≤ n ≤ 5000). */
  residualNormality: { W: number; p: number; n: number } | null;
  /** Anlamlı ve 3+ düzeyli ana etkiler için ikili karşılaştırmalar. */
  postHoc: FactorPostHoc[];
  /** Anlamlı iki yönlü etkileşimler için basit etkiler (diğer faktörler üzerinden gözlenen ortalamalarla). */
  simpleEffects: SimpleEffect[];
  residuals: number[];
}

const collator = new Intl.Collator('tr', { numeric: true });

/** Sapma kodlu sütunlar: L düzey için L−1 sütun (son düzey −1). */
function effectColumns(codes: number[], levels: number): number[][] {
  return Array.from({ length: levels - 1 }, (_, j) => codes.map((c) => (c === j ? 1 : c === levels - 1 ? -1 : 0)));
}

/** Sütunlara en küçük kareler izdüşümü (değiştirilmiş Gram-Schmidt, çift ortogonalleştirme); rank ve kalıntı döndürür. */
function project(cols: number[][], y: number[]): { rank: number; sse: number; resid: number[] } {
  const n = y.length;
  const basis: Float64Array[] = [];
  for (const c of cols) {
    const v = Float64Array.from(c);
    const norm0 = Math.hypot(...c);
    if (!(norm0 > 0)) continue;
    for (let pass = 0; pass < 2; pass++) {
      for (const q of basis) {
        let dot = 0;
        for (let i = 0; i < n; i++) dot += v[i]! * q[i]!;
        for (let i = 0; i < n; i++) v[i]! -= dot * q[i]!;
      }
    }
    let norm = 0;
    for (let i = 0; i < n; i++) norm += v[i]! * v[i]!;
    norm = Math.sqrt(norm);
    if (norm <= 1e-9 * norm0) continue;
    for (let i = 0; i < n; i++) v[i]! /= norm;
    basis.push(v);
  }
  const resid = Float64Array.from(y);
  for (const q of basis) {
    let dot = 0;
    for (let i = 0; i < n; i++) dot += resid[i]! * q[i]!;
    for (let i = 0; i < n; i++) resid[i]! -= dot * q[i]!;
  }
  let sse = 0;
  for (let i = 0; i < n; i++) sse += resid[i]! * resid[i]!;
  return { rank: basis.length, sse, resid: Array.from(resid) };
}

const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
const sd = (v: number[]) => {
  if (v.length < 2) return NaN;
  const m = mean(v);
  return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1));
};

export function fitFactorialAnova(dependent: string, y: (number | null)[], factors: FactorInput[], opts: FactorialOptions = {}): FactorialResult {
  const alpha = opts.alpha ?? 0.05;
  if (factors.length < 1) throw new AnalysisError('En az bir faktör seçin.');
  if (factors.length > 4) throw new AnalysisError('En fazla 4 faktör desteklenir.');
  const used: number[] = [];
  y.forEach((v, i) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return;
    if (factors.every((f) => f.values[i] !== null && f.values[i] !== undefined && f.values[i] !== '')) used.push(i);
  });
  const n = used.length;
  if (n < 4) throw new AnalysisError('Analiz için yeterli tam gözlem yok.');
  const yv = used.map((i) => y[i] as number);
  const levels: Record<string, string[]> = {};
  const codes: number[][] = [];
  for (const f of factors) {
    const lv = [...new Set(used.map((i) => String(f.values[i])))].sort(collator.compare);
    if (lv.length < 2) throw new AnalysisError(`“${f.name}” faktöründe (eksikler çıkarıldıktan sonra) yalnızca bir düzey kaldı.`);
    if (lv.length > 20) throw new AnalysisError(`“${f.name}” faktörü ${lv.length} düzey içeriyor; en fazla 20 düzey desteklenir.`);
    levels[f.name] = lv;
    const idx = new Map(lv.map((l, k) => [l, k]));
    codes.push(used.map((i) => idx.get(String(f.values[i]))!));
  }
  const names = factors.map((f) => f.name);
  const k = factors.length;

  // terimler: boş olmayan faktör alt kümeleri, önce ana etkiler sonra etkileşimler
  const subsets: number[][] = [];
  for (let mask = 1; mask < 1 << k; mask++) subsets.push(names.map((_, j) => j).filter((j) => mask & (1 << j)));
  subsets.sort((a, b) => a.length - b.length || a.join() .localeCompare(b.join()));
  const main = codes.map((c, j) => effectColumns(c, levels[names[j]!]!.length));
  const termCols = subsets.map((s) => {
    let cols: number[][] = [new Array<number>(n).fill(1)];
    for (const j of s) cols = main[j]!.flatMap((m) => cols.map((c) => c.map((v, i) => v * m[i]!)));
    return cols;
  });
  const intercept = [new Array<number>(n).fill(1)];
  const all = [intercept, ...termCols];
  const full = project(all.flat(), yv);
  const dfe = n - full.rank;
  if (dfe <= 0) throw new AnalysisError('Hata serbestlik derecesi sıfır: her hücrede tek gözlem var ya da model doyurulmuş. Hücre başına en az iki gözlem gerekir.');
  const mse = full.sse / dfe;
  const filled = new Set(codes[0]!.map((_, r) => codes.map((c) => c[r]).join(','))).size;
  const totalCellCount = names.reduce((p, f) => p * levels[f]!.length, 1);
  const wanted = opts.ssType ?? 'auto';
  const ssType: 'II' | 'III' = wanted === 'II' ? 'II' : filled < totalCellCount ? 'II' : 'III';
  const ssTypeSwitched = wanted !== 'II' && ssType === 'II';
  const test = (without: number) => {
    // Tip III: tüm diğer terimler modelde. Tip II: T'yi (kesin) kapsayan terimler modelde değil.
    const inModel = (j: number) => {
      if (j === 0 || j === without || ssType === 'III' || without === 0) return true;
      const t = subsets[without - 1]!;
      const sj = subsets[j - 1]!;
      return !(sj.length > t.length && t.every((x) => sj.includes(x)));
    };
    const idx = all.map((_, j) => j).filter(inModel);
    const base = ssType === 'III' || without === 0 ? full : project(idx.flatMap((j) => all[j]!), yv);
    const red = project(idx.filter((j) => j !== without).flatMap((j) => all[j]!), yv);
    const ss = Math.max(0, red.sse - base.sse);
    const df = base.rank - red.rank;
    const ms = df > 0 ? ss / df : NaN;
    const F = ms / mse;
    return { ss, df, ms, F, p: df > 0 && Number.isFinite(F) ? fSurvival(F, df, dfe) : NaN };
  };
  const icpt = test(0);
  const terms: AnovaTerm[] = subsets.map((s, i) => {
    const t = test(i + 1);
    return { name: s.map((j) => names[j]!).join(' × '), factors: s.map((j) => names[j]!), ss: t.ss, df: t.df, ms: t.ms, F: t.F, p: t.p, partialEta2: t.ss / (t.ss + full.sse) };
  });
  const ybar = mean(yv);
  const ssCorr = yv.reduce((s, v) => s + (v - ybar) ** 2, 0);
  const ssUnc = yv.reduce((s, v) => s + v * v, 0);
  const mdf = full.rank - 1;
  const mss = Math.max(0, ssCorr - full.sse);
  const mF = mss / mdf / mse;

  // hücre ve marjinal istatistikleri
  const cellMap = new Map<string, number[]>();
  const cellLevels = new Map<string, string[]>();
  used.forEach((_, r) => {
    const lv = codes.map((c, j) => levels[names[j]!]![c[r]!]!);
    const key = lv.join('\u0001');
    (cellMap.get(key) ?? cellMap.set(key, []).get(key)!).push(yv[r]!);
    cellLevels.set(key, lv);
  });
  const cells: CellStat[] = [...cellMap].map(([key, v]) => ({ levels: cellLevels.get(key)!, n: v.length, mean: mean(v), sd: sd(v) }));
  const levelOrder = (lv: string[]) => lv.map((l, j) => levels[names[j]!]!.indexOf(l));
  cells.sort((a, b) => {
    const x = levelOrder(a.levels);
    const y2 = levelOrder(b.levels);
    for (let j = 0; j < x.length; j++) if (x[j] !== y2[j]) return x[j]! - y2[j]!;
    return 0;
  });
  const marginals: MarginalStat[] = names.flatMap((f, j) =>
    levels[f]!.map((l, li) => {
      const v = yv.filter((_, r) => codes[j]![r] === li);
      return { factor: f, level: l, n: v.length, mean: mean(v), sd: sd(v) };
    }),
  );
  const totalCells = names.reduce((p, f) => p * levels[f]!.length, 1);
  const ns = cells.map((c) => c.n);

  // Levene (ortalama merkezli): |y − hücre ortalaması| üzerinde tek yönlü ANOVA
  let levene: FactorialResult['levene'] = null;
  if (cells.length >= 2 && n > cells.length) {
    const cellMean = new Map([...cellMap].map(([key, v]) => [key, mean(v)]));
    const z = used.map((_, r) => Math.abs(yv[r]! - cellMean.get(codes.map((c, j) => levels[names[j]!]![c[r]!]!).join('\u0001'))!));
    const zbar = mean(z);
    let ssb = 0;
    let ssw = 0;
    for (const [key, v] of cellMap) {
      const zs = v.map((x) => Math.abs(x - cellMean.get(key)!));
      const zm = mean(zs);
      ssb += zs.length * (zm - zbar) ** 2;
      ssw += zs.reduce((s, q) => s + (q - zm) ** 2, 0);
    }
    const df1 = cells.length - 1;
    const df2 = n - cells.length;
    const F = ssb / df1 / (ssw / df2);
    levene = { F, df1, df2, p: Number.isFinite(F) ? fSurvival(F, df1, df2) : NaN };
  }
  let residualNormality: FactorialResult['residualNormality'] = null;
  if (n >= 3 && n <= 5000 && Math.sqrt(full.sse) > 0) {
    const sw = shapiroWilk(full.resid);
    residualNormality = { W: sw.W, p: sw.p, n };
  }
  // post-hoc: anlamlı, 3+ düzeyli ana etkiler (Tukey HSD / Tukey-Kramer, model MSE)
  const postHoc: FactorPostHoc[] = [];
  names.forEach((f) => {
    const term = terms.find((t) => t.factors.length === 1 && t.factors[0] === f);
    const lv = levels[f]!;
    if (!term || !(term.p < alpha) || lv.length < 3) return;
    const ms = marginals.filter((m) => m.factor === f);
    const crit = studentizedRangeQuantile(alpha, lv.length, dfe);
    const pairs: PostHocRow[] = [];
    for (let a = 0; a < lv.length; a++) {
      for (let b = a + 1; b < lv.length; b++) {
        const diff = ms[a]!.mean - ms[b]!.mean;
        const se = Math.sqrt((mse / 2) * (1 / ms[a]!.n + 1 / ms[b]!.n));
        pairs.push({ a: lv[a]!, b: lv[b]!, diff, se, p: studentizedRangeSurvival(Math.abs(diff) / se, lv.length, dfe), ciLow: diff - crit * se, ciHigh: diff + crit * se });
      }
    }
    postHoc.push({ factor: f, pairs });
  });
  // basit etkiler: anlamlı iki yönlü etkileşimler
  const simpleEffects: SimpleEffect[] = [];
  for (const t of terms) {
    if (t.factors.length !== 2 || !(t.p < alpha)) continue;
    for (const [fx, fy] of [[t.factors[0]!, t.factors[1]!], [t.factors[1]!, t.factors[0]!]] as const) {
      const jx = names.indexOf(fx);
      const jy = names.indexOf(fy);
      const Lx = levels[fx]!.length;
      const Ly = levels[fy]!.length;
      const raw: Omit<SimpleEffect, 'pAdj'>[] = [];
      for (let ly = 0; ly < Ly; ly++) {
        const rowsIn = yv.map((_, r) => r).filter((r) => codes[jy]![r] === ly);
        if (!rowsIn.length) continue;
        const slice = mean(rowsIn.map((r) => yv[r]!));
        let ss = 0;
        let present = 0;
        for (let lx = 0; lx < Lx; lx++) {
          const v = rowsIn.filter((r) => codes[jx]![r] === lx).map((r) => yv[r]!);
          if (!v.length) continue;
          present++;
          ss += v.length * (mean(v) - slice) ** 2;
        }
        const df = present - 1;
        if (df < 1) continue;
        const F = ss / df / mse;
        raw.push({ term: t.name, factor: fx, at: { factor: fy, level: levels[fy]![ly]! }, n: rowsIn.length, ss, df, F, p: fSurvival(F, df, dfe) });
      }
      for (const e of raw) simpleEffects.push({ ...e, pAdj: Math.min(1, e.p * raw.length) });
    }
  }
  return {
    dependent,
    factors: names,
    levels,
    n,
    dropped: y.length - n,
    alpha,
    ssType,
    ssTypeSwitched,
    model: { ss: mss, df: mdf, ms: mss / mdf, F: mF, p: fSurvival(mF, mdf, dfe) },
    intercept: icpt,
    terms,
    error: { ss: full.sse, df: dfe, ms: mse },
    total: { ssCorrected: ssCorr, ssUncorrected: ssUnc, dfCorrected: n - 1 },
    r2: 1 - full.sse / ssCorr,
    adjR2: 1 - (full.sse / dfe) / (ssCorr / (n - 1)),
    cells,
    marginals,
    emptyCells: totalCells - cells.length,
    totalCells,
    minCellN: Math.min(...ns),
    maxCellN: Math.max(...ns),
    balanced: Math.min(...ns) === Math.max(...ns) && cells.length === totalCells,
    levene,
    residualNormality,
    postHoc,
    simpleEffects,
    residuals: full.resid,
  };
}
