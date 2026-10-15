/**
 * Ek hipotez testleri: Kendall tau-b, işaret testi, McNemar ve Cochran Q. SciPy (kendalltau, binomtest) ve
 * statsmodels (mcnemar, cochrans_q) ile aynı sonuçları verir; üretilen Python kodu bu kütüphaneleri kullanır.
 */
import { normalSurvival } from './assumptions.ts';
import { chiSquareSurvival, lnGamma } from './stats.ts';

/* ---------- Kendall tau-b ---------- */

export interface KendallResult {
  tau: number;
  p: number;
  n: number;
  method: 'exact' | 'asymptotic';
  concordant: number;
  discordant: number;
}

const tieGroups = (v: number[]): number[] => {
  const s = [...v].sort((a, b) => a - b);
  const out: number[] = [];
  let run = 1;
  for (let i = 1; i <= s.length; i++) {
    if (i < s.length && s[i] === s[i - 1]) run++;
    else {
      if (run > 1) out.push(run);
      run = 1;
    }
  }
  return out;
};

/** n elemanlı permütasyonlarda ters çevrilme (uyumsuz çift) sayısının dağılımı: P(D = k), k = 0…n(n−1)/2. */
function inversionDistribution(n: number): number[] {
  let p = [1];
  for (let m = 2; m <= n; m++) {
    const next = new Array<number>(p.length + m - 1).fill(0);
    for (let k = 0; k < p.length; k++) for (let j = 0; j < m; j++) next[k + j]! += p[k]! / m;
    p = next;
  }
  return p;
}

/** Kendall tau-b (bağ düzeltmeli). p: bağ yoksa ve n ≤ 33 ise kesin, aksi halde bağ düzeltmeli normal yaklaşım (SciPy method="auto"). */
export function kendallTau(x: number[], y: number[]): KendallResult {
  const n = x.length;
  if (n !== y.length || n < 3) throw new Error('Kendall tau için en az 3 eşleşmiş gözlem gerekir.');
  if (n > 10000) throw new Error('Kendall tau en çok 10 000 gözlemle hesaplanır (işlem süresi gözlem sayısının karesiyle büyür).');
  let con = 0;
  let dis = 0;
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      const s = Math.sign(x[i]! - x[j]!) * Math.sign(y[i]! - y[j]!);
      if (s > 0) con++;
      else if (s < 0) dis++;
    }
  }
  const tot = (n * (n - 1)) / 2;
  const tx = tieGroups(x);
  const ty = tieGroups(y);
  const xtie = tx.reduce((s, t) => s + (t * (t - 1)) / 2, 0);
  const ytie = ty.reduce((s, t) => s + (t * (t - 1)) / 2, 0);
  const denom = Math.sqrt((tot - xtie) * (tot - ytie));
  if (!(denom > 0)) throw new Error('Kendall tau için değişkenlerden birinin tüm değerleri aynı olamaz.');
  const S = con - dis;
  const tau = Math.max(-1, Math.min(1, S / denom));
  const noTies = xtie === 0 && ytie === 0;
  if (noTies && (n <= 33 || Math.min(dis, tot - dis) <= 1)) {
    const c = Math.min(dis, tot - dis);
    const dist = n <= 33 ? inversionDistribution(n) : null;
    let cdf = 0;
    if (dist) for (let k = 0; k <= c; k++) cdf += dist[k]!;
    else cdf = (c === 0 ? 1 : n) / factorialApprox(n); // P(D = 0) = 1/n!, P(D = 1) = (n − 1)/n!
    return { tau, p: Math.min(1, 2 * cdf), n, method: 'exact', concordant: con, discordant: dis };
  }
  const v0 = n * (n - 1) * (2 * n + 5);
  const vt = tx.reduce((s, t) => s + t * (t - 1) * (2 * t + 5), 0);
  const vu = ty.reduce((s, t) => s + t * (t - 1) * (2 * t + 5), 0);
  const v1 = tx.reduce((s, t) => s + t * (t - 1), 0) * ty.reduce((s, t) => s + t * (t - 1), 0);
  const v2 = tx.reduce((s, t) => s + t * (t - 1) * (t - 2), 0) * ty.reduce((s, t) => s + t * (t - 1) * (t - 2), 0);
  const variance = (v0 - vt - vu) / 18 + v1 / (2 * n * (n - 1)) + v2 / (9 * n * (n - 1) * (n - 2));
  const z = S / Math.sqrt(variance);
  return { tau, p: Math.min(1, 2 * normalSurvival(Math.abs(z))), n, method: 'asymptotic', concordant: con, discordant: dis };
}

const factorialApprox = (n: number) => Math.exp(lnGamma(n + 1));

/* ---------- İşaret testi ---------- */

/** Binom(n, 0.5) için P(X ≤ k). */
function binomHalfCdf(k: number, n: number): number {
  const lnHalfN = n * Math.log(0.5);
  let s = 0;
  for (let i = 0; i <= k; i++) s += Math.exp(lnGamma(n + 1) - lnGamma(i + 1) - lnGamma(n - i + 1) + lnHalfN);
  return Math.min(1, s);
}

export interface SignTestResult {
  nPlus: number;
  nMinus: number;
  /** Sıfır olmayan fark sayısı. */
  n: number;
  zeros: number;
  p: number;
}

/** İşaret testi: sıfır olmayan farkların işaretleri, H0: P(+) = 0,5 (iki yönlü kesin iki terimli test). */
export function signTest(x: number[], y: number[]): SignTestResult {
  let nPlus = 0;
  let nMinus = 0;
  for (let i = 0; i < x.length; i++) {
    const d = x[i]! - y[i]!;
    if (d > 0) nPlus++;
    else if (d < 0) nMinus++;
  }
  const n = nPlus + nMinus;
  if (n < 1) throw new Error('İşaret testi için en az bir sıfırdan farklı fark gerekir.');
  return { nPlus, nMinus, n, zeros: x.length - n, p: Math.min(1, 2 * binomHalfCdf(Math.min(nPlus, nMinus), n)) };
}

/* ---------- McNemar ---------- */

export interface McNemarResult {
  /** Çaprazlar: b = (koşul 1: 0, koşul 2: 1), c = (koşul 1: 1, koşul 2: 0). */
  a: number;
  b: number;
  c: number;
  d: number;
  method: 'exact' | 'chi2';
  /** exact: min(b, c); chi2: sürekliklik düzeltmeli χ². */
  statistic: number;
  p: number;
  n: number;
}

/** McNemar testi (0/1 kodlu iki eşleşmiş koşul). b + c < 25 ise kesin iki terimli test, değilse sürekliklik düzeltmeli χ² (df = 1). */
export function mcnemar(x: number[], y: number[]): McNemarResult {
  let a = 0;
  let b = 0;
  let c = 0;
  let d = 0;
  for (let i = 0; i < x.length; i++) {
    if (x[i] === 0 && y[i] === 0) a++;
    else if (x[i] === 0 && y[i] === 1) b++;
    else if (x[i] === 1 && y[i] === 0) c++;
    else d++;
  }
  const disc = b + c;
  const n = x.length;
  if (disc === 0) return { a, b, c, d, method: 'exact', statistic: 0, p: 1, n };
  if (disc < 25) return { a, b, c, d, method: 'exact', statistic: Math.min(b, c), p: Math.min(1, 2 * binomHalfCdf(Math.min(b, c), disc)), n };
  const chi2 = (Math.abs(b - c) - 1) ** 2 / disc;
  return { a, b, c, d, method: 'chi2', statistic: chi2, p: chiSquareSurvival(chi2, 1), n };
}

/* ---------- Cochran Q ---------- */

export interface CochranQResult {
  Q: number;
  df: number;
  p: number;
  n: number;
  /** Kendall W benzeri etki büyüklüğü: Q / (n (k − 1)). */
  effect: number;
  /** Koşul başına başarı (1) oranı. */
  proportions: number[];
}

/** Cochran Q testi: k ≥ 3 eşleşmiş 0/1 koşul. */
export function cochranQ(conditions: number[][]): CochranQResult {
  const k = conditions.length;
  const n = conditions[0]!.length;
  const col = conditions.map((c) => c.reduce((s, v) => s + v, 0));
  const row = Array.from({ length: n }, (_, i) => conditions.reduce((s, c) => s + c[i]!, 0));
  const T = col.reduce((s, v) => s + v, 0);
  const num = (k - 1) * (k * col.reduce((s, v) => s + v * v, 0) - T * T);
  const den = k * T - row.reduce((s, v) => s + v * v, 0);
  const proportions = col.map((c) => c / n);
  if (den === 0) return { Q: 0, df: k - 1, p: 1, n, effect: 0, proportions };
  const Q = num / den;
  return { Q, df: k - 1, p: chiSquareSurvival(Q, k - 1), n, effect: Q / (n * (k - 1)), proportions };
}
