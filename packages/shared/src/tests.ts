/**
 * Hipotez testleri. Her fonksiyon SciPy / statsmodels'in aynı adlı testiyle birebir karşılaştırılır
 * (bkz. reference.test.ts ve tools/reference/generate_extra.py).
 */
import { fSurvival, incompleteBeta, mean, normalQuantile, normalSurvival } from './assumptions.ts';
import { chiSquareSurvival, lnGamma } from './stats.ts';

/* ---------- Ortak yardımcılar ---------- */

export const sum = (v: number[]) => v.reduce((s, x) => s + x, 0);
/** Örneklem varyansı (n − 1 paydalı). */
export function variance(v: number[]) {
  const m = mean(v);
  return v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1);
}
export const sd = (v: number[]) => Math.sqrt(variance(v));

/** Ortalama sıralar ve bağ grupları (her bağ grubunun büyüklüğü). */
export function rankData(values: number[]): { ranks: number[]; ties: number[] } {
  const idx = values.map((_, i) => i).sort((a, b) => values[a]! - values[b]!);
  const ranks = new Array<number>(values.length);
  const ties: number[] = [];
  for (let i = 0; i < idx.length; ) {
    let j = i;
    while (j + 1 < idx.length && values[idx[j + 1]!] === values[idx[i]!]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[idx[k]!] = avg;
    if (j > i) ties.push(j - i + 1);
    i = j + 1;
  }
  return { ranks, ties };
}

/** Σ (t³ − t) bağ düzeltme toplamı. */
const tieSum = (ties: number[]) => ties.reduce((s, t) => s + t ** 3 - t, 0);

/* ---------- t dağılımı ---------- */

/** İki yönlü P(|T| ≥ |t|). */
export function tTwoSidedP(t: number, df: number): number {
  return incompleteBeta(df / 2, 0.5, df / (df + t * t));
}

export function tSurvival(t: number, df: number): number {
  const half = 0.5 * tTwoSidedP(t, df);
  return t >= 0 ? half : 1 - half;
}

/** t dağılımının ters birikimli dağılımı (ikiye bölme yöntemi). */
export function tQuantile(p: number, df: number): number {
  if (p === 0.5) return 0;
  const q = Math.min(p, 1 - p);
  let lo = 0;
  let hi = 1;
  while (tSurvival(hi, df) > q) hi *= 2;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (tSurvival(mid, df) > q) lo = mid;
    else hi = mid;
  }
  const t = (lo + hi) / 2;
  return p < 0.5 ? -t : t;
}

/* ---------- t-testleri ---------- */

export interface TTestResult {
  t: number;
  df: number;
  p: number;
  meanDiff: number;
  ci: [number, number];
  cohenD: number;
  hedgesG: number;
  n1: number;
  n2: number;
}

function tResult(meanDiff: number, se: number, df: number, d: number, g: number, n1: number, n2: number, conf: number): TTestResult {
  const t = meanDiff / se;
  const crit = tQuantile(1 - (1 - conf) / 2, df);
  return { t, df, p: tTwoSidedP(t, df), meanDiff, ci: [meanDiff - crit * se, meanDiff + crit * se], cohenD: d, hedgesG: g, n1, n2 };
}

/** Bağımsız örneklem t-testi; equalVar=false Welch'tir. Etki büyüklüğü birleşik standart sapmayla hesaplanır. */
export function tTestIndependent(x: number[], y: number[], opts: { equalVar: boolean; conf?: number }): TTestResult {
  const n1 = x.length;
  const n2 = y.length;
  const v1 = variance(x);
  const v2 = variance(y);
  const diff = mean(x) - mean(y);
  const pooledVar = ((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2);
  const d = diff / Math.sqrt(pooledVar);
  const g = d * (1 - 3 / (4 * (n1 + n2) - 9));
  let se: number;
  let df: number;
  if (opts.equalVar) {
    se = Math.sqrt(pooledVar * (1 / n1 + 1 / n2));
    df = n1 + n2 - 2;
  } else {
    const a = v1 / n1;
    const b = v2 / n2;
    se = Math.sqrt(a + b);
    df = (a + b) ** 2 / (a ** 2 / (n1 - 1) + b ** 2 / (n2 - 1));
  }
  return tResult(diff, se, df, d, g, n1, n2, opts.conf ?? 0.95);
}

/** Eşleştirilmiş t-testi (x − y farkları üzerinde). Etki büyüklüğü d_z = ortalama fark / fark SS. */
export function tTestPaired(x: number[], y: number[], conf = 0.95): TTestResult {
  const diffs = x.map((v, i) => v - y[i]!);
  const n = diffs.length;
  const m = mean(diffs);
  const s = sd(diffs);
  const dz = m / s;
  return tResult(m, s / Math.sqrt(n), n - 1, dz, dz * (1 - 3 / (4 * (n - 1) - 1)), n, n, conf);
}

/* ---------- ANOVA ---------- */

export interface AnovaResult {
  F: number;
  df1: number;
  df2: number;
  p: number;
  /** η² = SS_between / SS_total (Welch ANOVA için tanımsızdır, NaN). */
  etaSquared: number;
}

export function anovaOneWay(groups: number[][]): AnovaResult {
  const all = groups.flat();
  const N = all.length;
  const k = groups.length;
  const grand = mean(all);
  const ssb = groups.reduce((s, g) => s + g.length * (mean(g) - grand) ** 2, 0);
  const ssw = groups.reduce((s, g) => s + g.reduce((t, v) => t + (v - mean(g)) ** 2, 0), 0);
  const df1 = k - 1;
  const df2 = N - k;
  const F = ssb / df1 / (ssw / df2);
  return { F, df1, df2, p: fSurvival(F, df1, df2), etaSquared: ssb / (ssb + ssw) };
}

/** Welch ANOVA (eşit olmayan varyanslar için). */
export function welchAnova(groups: number[][]): AnovaResult {
  const k = groups.length;
  const n = groups.map((g) => g.length);
  const m = groups.map(mean);
  const w = groups.map((g, i) => n[i]! / variance(g));
  const W = sum(w);
  const weighted = sum(w.map((wi, i) => wi * m[i]!)) / W;
  const A = sum(w.map((wi, i) => wi * (m[i]! - weighted) ** 2)) / (k - 1);
  const lambda = sum(w.map((wi, i) => (1 - wi / W) ** 2 / (n[i]! - 1)));
  const B = 1 + ((2 * (k - 2)) / (k * k - 1)) * lambda;
  const F = A / B;
  const df1 = k - 1;
  const df2 = (k * k - 1) / (3 * lambda);
  const all = groups.flat();
  const grand = mean(all);
  const ssb = groups.reduce((s, g) => s + g.length * (mean(g) - grand) ** 2, 0);
  const sst = all.reduce((s, v) => s + (v - grand) ** 2, 0);
  return { F, df1, df2, p: fSurvival(F, df1, df2), etaSquared: ssb / sst };
}

export interface RepeatedAnovaResult {
  F: number;
  df1: number;
  df2: number;
  p: number;
  /** Kısmi η² = SS_koşul / (SS_koşul + SS_hata). */
  partialEtaSquared: number;
}

/** Tekrarlı ölçümler ANOVA (küresellik varsayılır; Greenhouse-Geisser düzeltmesi uygulanmaz). */
export function anovaRepeated(conditions: number[][]): RepeatedAnovaResult {
  const k = conditions.length;
  const n = conditions[0]!.length;
  const grand = mean(conditions.flat());
  const condMeans = conditions.map(mean);
  const subjMeans = Array.from({ length: n }, (_, i) => mean(conditions.map((c) => c[i]!)));
  const ssCond = n * condMeans.reduce((s, m) => s + (m - grand) ** 2, 0);
  const ssSubj = k * subjMeans.reduce((s, m) => s + (m - grand) ** 2, 0);
  const ssTotal = conditions.flat().reduce((s, v) => s + (v - grand) ** 2, 0);
  const ssErr = ssTotal - ssCond - ssSubj;
  const df1 = k - 1;
  const df2 = (k - 1) * (n - 1);
  const F = ssCond / df1 / (ssErr / df2);
  return { F, df1, df2, p: fSurvival(F, df1, df2), partialEtaSquared: ssCond / (ssCond + ssErr) };
}

/* ---------- Sıra tabanlı testler ---------- */

export interface MannWhitneyResult {
  /** İlk örnek için U. */
  U: number;
  p: number;
  /** Rank-biserial korelasyon: 2·U/(n1·n2) − 1. */
  rankBiserial: number;
  method: 'exact' | 'asymptotic';
  n1: number;
  n2: number;
}

/** U istatistiğinin tam dağılımı (bağsız veri): P(U = u), u = 0..n1·n2. */
function mannWhitneyDistribution(n1: number, n2: number): number[] {
  // P_{i,j}(u) = i/(i+j) · P_{i−1,j}(u − j) + j/(i+j) · P_{i,j−1}(u)
  let prev: number[][] = Array.from({ length: n2 + 1 }, () => [1]);
  for (let i = 1; i <= n1; i++) {
    const cur: number[][] = [[1]];
    for (let j = 1; j <= n2; j++) {
      const size = i * j + 1;
      const arr = new Array<number>(size).fill(0);
      const a = prev[j]!; // P_{i-1,j}
      const b = cur[j - 1]!; // P_{i,j-1}
      for (let u = 0; u < size; u++) {
        const fromA = u - j >= 0 && u - j < a.length ? a[u - j]! : 0;
        const fromB = u < b.length ? b[u]! : 0;
        arr[u] = (i / (i + j)) * fromA + (j / (i + j)) * fromB;
      }
      cur.push(arr);
    }
    prev = cur;
  }
  return prev[n2]!;
}

export function mannWhitneyU(x: number[], y: number[], method: 'auto' | 'exact' | 'asymptotic' = 'auto'): MannWhitneyResult {
  const n1 = x.length;
  const n2 = y.length;
  const { ranks, ties } = rankData([...x, ...y]);
  const r1 = sum(ranks.slice(0, n1));
  const U1 = r1 - (n1 * (n1 + 1)) / 2;
  const U2 = n1 * n2 - U1;
  const hasTies = ties.length > 0;
  const useExact = method === 'exact' || (method === 'auto' && n1 <= 8 && n2 <= 8 && !hasTies);
  const rankBiserial = (2 * U1) / (n1 * n2) - 1;
  if (useExact && !hasTies) {
    const dist = mannWhitneyDistribution(n1, n2);
    const Umax = Math.max(U1, U2);
    let tail = 0;
    for (let u = Math.ceil(Umax - 1e-9); u < dist.length; u++) tail += dist[u]!;
    return { U: U1, p: Math.min(1, 2 * tail), rankBiserial, method: 'exact', n1, n2 };
  }
  const n = n1 + n2;
  const mu = (n1 * n2) / 2;
  const s = Math.sqrt(((n1 * n2) / 12) * (n + 1 - tieSum(ties) / (n * (n - 1))));
  const z = (Math.max(U1, U2) - mu - 0.5) / s;
  return { U: U1, p: Math.min(1, 2 * normalSurvival(z)), rankBiserial, method: 'asymptotic', n1, n2 };
}

export interface WilcoxonResult {
  /** İki yönlü: min(W+, W−). */
  W: number;
  p: number;
  /** Eşleşmiş rank-biserial: (W+ − W−) / (W+ + W−). */
  rankBiserial: number;
  n: number;
  method: 'exact' | 'approx';
}

/** Wilcoxon işaretli sıra testi, sıfır farkları atar ("wilcox" yöntemi), sürekliklik düzeltmesi yok. */
export function wilcoxonSignedRank(x: number[], y: number[] | null, method: 'auto' | 'exact' | 'approx' = 'auto'): WilcoxonResult {
  const diffs = y ? x.map((v, i) => v - y[i]!) : x;
  const hadZeros = diffs.some((d) => d === 0);
  const d = diffs.filter((v) => v !== 0);
  const n = d.length;
  const { ranks, ties } = rankData(d.map(Math.abs));
  const wPlus = sum(ranks.filter((_, i) => d[i]! > 0));
  const wMinus = sum(ranks.filter((_, i) => d[i]! < 0));
  const W = Math.min(wPlus, wMinus);
  const rankBiserial = (wPlus - wMinus) / (wPlus + wMinus);
  const exact = method === 'exact' || (method === 'auto' && n <= 50 && !hadZeros && ties.length === 0);
  if (exact && ties.length === 0) {
    // Rakamların altküme toplamlarının dağılımı
    const max = (n * (n + 1)) / 2;
    let counts = new Array<number>(max + 1).fill(0);
    counts[0] = 1;
    for (let r = 1; r <= n; r++) {
      const next = counts.slice();
      for (let s = r; s <= max; s++) next[s]! += counts[s - r]!;
      counts = next;
    }
    const total = 2 ** n;
    let cum = 0;
    for (let s = 0; s <= Math.round(W); s++) cum += counts[s]!;
    return { W, p: Math.min(1, (2 * cum) / total), rankBiserial, n, method: 'exact' };
  }
  const mn = (n * (n + 1)) / 4;
  const se = Math.sqrt((n * (n + 1) * (2 * n + 1)) / 24 - tieSum(ties) / 48);
  const z = (wPlus - mn) / se;
  return { W, p: Math.min(1, 2 * normalSurvival(Math.abs(z))), rankBiserial, n, method: 'approx' };
}

export interface FriedmanResult {
  chi2: number;
  df: number;
  p: number;
  /** Kendall W = χ² / (n·(k − 1)). */
  kendallW: number;
  n: number;
}

/** Friedman testi; conditions[j][i] = i. denekte j. koşulun değeri. Bağ düzeltmesi dahildir. */
export function friedmanTest(conditions: number[][]): FriedmanResult {
  const k = conditions.length;
  const n = conditions[0]!.length;
  const rankSums = new Array<number>(k).fill(0);
  let tieTotal = 0;
  for (let i = 0; i < n; i++) {
    const row = conditions.map((c) => c[i]!);
    const { ranks, ties } = rankData(row);
    ranks.forEach((r, j) => (rankSums[j]! += r));
    tieTotal += tieSum(ties);
  }
  const raw = (12 / (n * k * (k + 1))) * sum(rankSums.map((r) => r * r)) - 3 * n * (k + 1);
  const chi2 = raw / (1 - tieTotal / (n * k * (k * k - 1)));
  const df = k - 1;
  return { chi2, df, p: chiSquareSurvival(chi2, df), kendallW: chi2 / (n * (k - 1)), n };
}

/* ---------- Korelasyon ---------- */

export interface CorrelationResult {
  r: number;
  p: number;
  n: number;
  /** Pearson için Fisher z güven aralığı; Spearman için de aynı yaklaşım kullanılır. */
  ci: [number, number];
}

function pearsonRaw(x: number[], y: number[]) {
  const mx = mean(x);
  const my = mean(y);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < x.length; i++) {
    sxy += (x[i]! - mx) * (y[i]! - my);
    sxx += (x[i]! - mx) ** 2;
    syy += (y[i]! - my) ** 2;
  }
  return sxy / Math.sqrt(sxx * syy);
}

function correlationResult(r: number, n: number, conf: number): CorrelationResult {
  const rr = Math.max(-1, Math.min(1, r));
  const t = rr * Math.sqrt((n - 2) / (1 - rr * rr));
  const p = Math.abs(rr) === 1 ? 0 : tTwoSidedP(t, n - 2);
  const z = Math.atanh(rr);
  const crit = normalQuantile(1 - (1 - conf) / 2);
  const se = 1 / Math.sqrt(n - 3);
  return { r: rr, p, n, ci: [Math.tanh(z - crit * se), Math.tanh(z + crit * se)] };
}

export function pearson(x: number[], y: number[], conf = 0.95): CorrelationResult {
  return correlationResult(pearsonRaw(x, y), x.length, conf);
}

export function spearman(x: number[], y: number[], conf = 0.95): CorrelationResult {
  return correlationResult(pearsonRaw(rankData(x).ranks, rankData(y).ranks), x.length, conf);
}

/* ---------- Kategorik veri ---------- */

export interface ChiSquareResult {
  chi2: number;
  df: number;
  p: number;
  /** Cramér V (düzeltmesiz χ² üzerinden). */
  cramersV: number;
  expected: number[][];
  /** Beklenen sayısı 5'ten küçük hücrelerin oranı. */
  lowExpectedShare: number;
}

/** Bağımsızlık / homojenlik için ki-kare. 2×2 tablolarda Yates sürekliklik düzeltmesi uygulanır (SciPy ile aynı). */
export function chiSquareContingency(table: number[][], correction = true): ChiSquareResult {
  const rows = table.length;
  const cols = table[0]!.length;
  const rowSums = table.map(sum);
  const colSums = Array.from({ length: cols }, (_, j) => sum(table.map((r) => r[j]!)));
  const n = sum(rowSums);
  const expected = table.map((_, i) => colSums.map((c) => (rowSums[i]! * c) / n));
  const df = (rows - 1) * (cols - 1);
  let chi2 = 0;
  let chi2Raw = 0;
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const o = table[i]![j]!;
      const e = expected[i]![j]!;
      chi2Raw += (o - e) ** 2 / e;
      let adj = o;
      if (correction && df === 1) adj = o + Math.sign(e - o) * Math.min(0.5, Math.abs(e - o));
      chi2 += (adj - e) ** 2 / e;
    }
  }
  const cells = rows * cols;
  const low = expected.flat().filter((e) => e < 5).length;
  return {
    chi2,
    df,
    p: chiSquareSurvival(chi2, df),
    cramersV: Math.sqrt(chi2Raw / (n * Math.min(rows - 1, cols - 1))),
    expected,
    lowExpectedShare: low / cells,
  };
}

const lnFactorial = (n: number) => lnGamma(n + 1);

export interface FisherResult {
  /** Örnek odds oranı (a·d)/(b·c). */
  oddsRatio: number;
  p: number;
}

/** Fisher kesin testi (2×2, iki yönlü); SciPy ile aynı kural: olasılığı ≤ gözlenen olan tüm tablolar. */
export function fisherExact(table: [[number, number], [number, number]]): FisherResult {
  const [[a, b], [c, d]] = table;
  const n = a + b + c + d;
  const row1 = a + b;
  const col1 = a + c;
  const lnPmf = (x: number) =>
    lnFactorial(row1) + lnFactorial(n - row1) + lnFactorial(col1) + lnFactorial(n - col1) - lnFactorial(n) - lnFactorial(x) - lnFactorial(row1 - x) - lnFactorial(col1 - x) - lnFactorial(n - row1 - col1 + x);
  const lo = Math.max(0, row1 + col1 - n);
  const hi = Math.min(row1, col1);
  const pObs = Math.exp(lnPmf(a));
  let p = 0;
  for (let x = lo; x <= hi; x++) {
    const px = Math.exp(lnPmf(x));
    if (px <= pObs * (1 + 1e-7)) p += px;
  }
  const oddsRatio = b * c === 0 ? (a * d === 0 ? NaN : Infinity) : (a * d) / (b * c);
  return { oddsRatio, p: Math.min(1, p) };
}

/* ---------- Çoklu karşılaştırma ve post-hoc ---------- */

export type AdjustMethod = 'holm' | 'bonferroni' | 'fdr_bh';

/** statsmodels `multipletests` ile aynı düzeltilmiş p değerleri. */
export function adjustPValues(p: number[], method: AdjustMethod): number[] {
  const m = p.length;
  const order = p.map((_, i) => i).sort((a, b) => p[a]! - p[b]!);
  const adj = new Array<number>(m);
  if (method === 'bonferroni') return p.map((v) => Math.min(1, v * m));
  if (method === 'holm') {
    let run = 0;
    order.forEach((idx, rank) => {
      run = Math.max(run, (m - rank) * p[idx]!);
      adj[idx] = Math.min(1, run);
    });
    return adj;
  }
  let run = 1;
  for (let rank = m - 1; rank >= 0; rank--) {
    const idx = order[rank]!;
    run = Math.min(run, (p[idx]! * m) / (rank + 1));
    adj[idx] = Math.min(1, run);
  }
  return adj;
}

export interface PairResult {
  a: number;
  b: number;
  /** Test istatistiği (Dunn için z, Welch için t, Wilcoxon için W). */
  statistic: number;
  p: number;
  pAdj: number;
}

/** Dunn post-hoc testi (Kruskal-Wallis sonrası); bağ düzeltmeli, p değerleri Holm ile düzeltilir. */
export function dunnTest(groups: number[][], method: AdjustMethod = 'holm'): PairResult[] {
  const all = groups.flat();
  const N = all.length;
  const { ranks, ties } = rankData(all);
  const meanRanks: number[] = [];
  let offset = 0;
  for (const g of groups) {
    meanRanks.push(mean(ranks.slice(offset, offset + g.length)));
    offset += g.length;
  }
  const s2 = (N * (N + 1)) / 12 - tieSum(ties) / (12 * (N - 1));
  const pairs: PairResult[] = [];
  for (let a = 0; a < groups.length; a++) {
    for (let b = a + 1; b < groups.length; b++) {
      const z = (meanRanks[a]! - meanRanks[b]!) / Math.sqrt(s2 * (1 / groups[a]!.length + 1 / groups[b]!.length));
      pairs.push({ a, b, statistic: z, p: 2 * normalSurvival(Math.abs(z)), pAdj: 0 });
    }
  }
  const adj = adjustPValues(pairs.map((p) => p.p), method);
  return pairs.map((p, i) => ({ ...p, pAdj: adj[i]! }));
}

/** İkili Welch t-testleri (eşit olmayan varyanslarda post-hoc); p değerleri düzeltilir. */
export function pairwiseWelch(groups: number[][], method: AdjustMethod = 'holm'): PairResult[] {
  const pairs: PairResult[] = [];
  for (let a = 0; a < groups.length; a++) {
    for (let b = a + 1; b < groups.length; b++) {
      const r = tTestIndependent(groups[a]!, groups[b]!, { equalVar: false });
      pairs.push({ a, b, statistic: r.t, p: r.p, pAdj: 0 });
    }
  }
  const adj = adjustPValues(pairs.map((p) => p.p), method);
  return pairs.map((p, i) => ({ ...p, pAdj: adj[i]! }));
}

/** Eşleşmiş koşullar için ikili karşılaştırma: paired t ya da Wilcoxon; p değerleri düzeltilir. */
export function pairwisePaired(conditions: number[][], kind: 't' | 'wilcoxon', method: AdjustMethod = 'holm'): PairResult[] {
  const pairs: PairResult[] = [];
  for (let a = 0; a < conditions.length; a++) {
    for (let b = a + 1; b < conditions.length; b++) {
      if (kind === 't') {
        const r = tTestPaired(conditions[a]!, conditions[b]!);
        pairs.push({ a, b, statistic: r.t, p: r.p, pAdj: 0 });
      } else {
        const r = wilcoxonSignedRank(conditions[a]!, conditions[b]!);
        pairs.push({ a, b, statistic: r.W, p: r.p, pAdj: 0 });
      }
    }
  }
  const adj = adjustPValues(pairs.map((p) => p.p), method);
  return pairs.map((p, i) => ({ ...p, pAdj: adj[i]! }));
}
