/**
 * Varsayım testleri ve dağılım yardımcıları: Shapiro-Wilk, Levene (Brown-Forsythe), Tukey sınırları,
 * ROC ve PR ölçütleri. Algoritmalar SciPy / R ile aynı yöntemleri izler.
 */
import { gammaQ, lnGamma } from './stats';

/* ---------- Normal dağılım ---------- */

/** Standart normal dağılımın üst kuyruk olasılığı P(Z > z). */
export function normalSurvival(z: number): number {
  const half = 0.5 * gammaQ(0.5, (z * z) / 2);
  return z >= 0 ? half : 1 - half;
}

export function normalCdf(z: number): number {
  return normalSurvival(-z);
}

/** Ters standart normal dağılım (Acklam yaklaşımı + bir Halley düzeltmesi). */
export function normalQuantile(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const plow = 0.02425;
  let x: number;
  if (p < plow) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) / ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  } else if (p <= 1 - plow) {
    const q = p - 0.5;
    const r = q * q;
    x =
      ((((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q) /
      (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) / ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  }
  const e = normalCdf(x) - p;
  const u = e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2);
  return x - u / (1 + (x * u) / 2);
}

/* ---------- F dağılımı (Levene için) ---------- */

function betaContinuedFraction(a: number, b: number, x: number): number {
  const tiny = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 500; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-14) break;
  }
  return h;
}

/** Düzenlenmiş tamamlanmamış beta fonksiyonu I_x(a, b). */
export function incompleteBeta(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2)
    ? (bt * betaContinuedFraction(a, b, x)) / a
    : 1 - (bt * betaContinuedFraction(b, a, 1 - x)) / b;
}

/** F dağılımının üst kuyruk olasılığı. */
export function fSurvival(f: number, d1: number, d2: number): number {
  if (f <= 0) return 1;
  return incompleteBeta(d2 / 2, d1 / 2, d2 / (d2 + d1 * f));
}

/* ---------- Varsayım testleri ---------- */

export interface ShapiroResult {
  W: number;
  p: number;
  n: number;
}

function poly(cc: number[], x: number): number {
  let r = 0;
  for (let i = cc.length - 1; i >= 0; i--) r = r * x + cc[i]!;
  return r;
}

/** Shapiro-Wilk W testi (Royston 1995, AS R94; 3 ≤ n ≤ 5000). */
export function shapiroWilk(values: number[]): ShapiroResult {
  const n = values.length;
  if (n < 3 || n > 5000) throw new RangeError('Shapiro-Wilk için 3 ≤ n ≤ 5000 gerekir');
  const x = [...values].sort((a, b) => a - b);
  const nn2 = Math.floor(n / 2);
  const a = new Array<number>(nn2 + 1).fill(0); // 1 tabanlı
  if (n === 3) {
    a[1] = Math.SQRT1_2;
  } else {
    const an25 = n + 0.25;
    const m = new Array<number>(nn2 + 1).fill(0);
    let summ2 = 0;
    for (let i = 1; i <= nn2; i++) {
      m[i] = normalQuantile((i - 0.375) / an25);
      summ2 += m[i]! ** 2;
    }
    summ2 *= 2;
    const ssumm2 = Math.sqrt(summ2);
    const rsn = 1 / Math.sqrt(n);
    const c1 = [0, 0.221157, -0.147981, -2.07119, 4.434685, -2.706056];
    const c2 = [0, 0.042981, -0.293762, -1.752461, 5.682633, -3.582633];
    const a1 = poly(c1, rsn) - m[1]! / ssumm2;
    let i1: number;
    let fac: number;
    if (n > 5) {
      i1 = 3;
      const a2 = -m[2]! / ssumm2 + poly(c2, rsn);
      fac = Math.sqrt((summ2 - 2 * m[1]! ** 2 - 2 * m[2]! ** 2) / (1 - 2 * a1 ** 2 - 2 * a2 ** 2));
      a[2] = a2;
    } else {
      i1 = 2;
      fac = Math.sqrt((summ2 - 2 * m[1]! ** 2) / (1 - 2 * a1 ** 2));
    }
    a[1] = a1;
    for (let i = i1; i <= nn2; i++) a[i] = -m[i]! / fac;
  }
  // W = (Σ A_i x_(i))² / SS; en küçük gözlemler -a, en büyükler +a ile ağırlıklanır.
  let num = 0;
  for (let i = 1; i <= nn2; i++) num += a[i]! * (x[n - i]! - x[i - 1]!);
  const mean = x.reduce((s, v) => s + v, 0) / n;
  const ss = x.reduce((s, v) => s + (v - mean) ** 2, 0);
  const W = Math.min(1, (num * num) / ss);

  let p: number;
  if (n === 3) {
    p = Math.max(0, (6 / Math.PI) * (Math.asin(Math.sqrt(W)) - Math.asin(Math.sqrt(0.75))));
  } else {
    const y = Math.log(1 - W);
    const lnN = Math.log(n);
    let mu: number;
    let sigma: number;
    let yy = y;
    if (n <= 11) {
      const gamma = -2.273 + 0.459 * n;
      if (y >= gamma) return { W, p: 1e-99, n };
      yy = -Math.log(gamma - y);
      mu = poly([0.544, -0.39978, 0.025054, -6.714e-4], n);
      sigma = Math.exp(poly([1.3822, -0.77857, 0.062767, -0.0020322], n));
    } else {
      mu = poly([-1.5861, -0.31082, -0.083751, 0.0038915], lnN);
      sigma = Math.exp(poly([-0.4803, -0.082676, 0.0030302], lnN));
    }
    p = normalSurvival((yy - mu) / sigma);
  }
  return { W, p, n };
}

export interface LeveneResult {
  F: number;
  df1: number;
  df2: number;
  p: number;
}

export function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** Levene testi, medyan merkezli (Brown-Forsythe); SciPy `stats.levene` varsayılanıyla aynıdır. */
export function levene(groups: number[][]): LeveneResult {
  const k = groups.length;
  const z = groups.map((g) => {
    const m = median(g);
    return g.map((v) => Math.abs(v - m));
  });
  const N = z.reduce((s, g) => s + g.length, 0);
  const zMeans = z.map((g) => g.reduce((s, v) => s + v, 0) / g.length);
  const grand = z.flat().reduce((s, v) => s + v, 0) / N;
  const between = z.reduce((s, g, i) => s + g.length * (zMeans[i]! - grand) ** 2, 0);
  const within = z.reduce((s, g, i) => s + g.reduce((t, v) => t + (v - zMeans[i]!) ** 2, 0), 0);
  const df1 = k - 1;
  const df2 = N - k;
  const F = (df2 / df1) * (between / within);
  return { F, df1, df2, p: fSurvival(F, df1, df2) };
}

/** Her grubu kendi ortalamasından arındırır; normallik, ham veriye değil bu kalıntılara bakılarak sınanır. */
export function groupResiduals(groups: number[][]): number[] {
  return groups.flatMap((g) => {
    const m = g.reduce((s, v) => s + v, 0) / g.length;
    return g.map((v) => v - m);
  });
}

/* ---------- Betimsel istatistikler ---------- */

/** Doğrusal enterpolasyonlu yüzdelik (pandas / NumPy varsayılanı). */
export function quantile(values: number[], q: number): number {
  const s = [...values].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo]! + (s[hi]! - s[lo]!) * (pos - lo);
}

export interface Fences {
  q1: number;
  q3: number;
  iqr: number;
  lower: number;
  upper: number;
}

/** Tukey sınırları: Q1 − 1.5·IQR ve Q3 + 1.5·IQR. */
export function tukeyFences(values: number[], k = 1.5): Fences {
  const q1 = quantile(values, 0.25);
  const q3 = quantile(values, 0.75);
  const iqr = q3 - q1;
  return { q1, q3, iqr, lower: q1 - k * iqr, upper: q3 + k * iqr };
}

export function mean(values: number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/* ---------- Sınıflandırma ölçütleri ---------- */

/** ROC AUC: sıra istatistiği (Mann-Whitney) yöntemi, bağlar ortalama sıra alır. */
export function rocAuc(scores: number[], labels: number[]): number {
  const idx = scores.map((_, i) => i).sort((i, j) => scores[i]! - scores[j]!);
  const ranks = new Array<number>(scores.length);
  for (let i = 0; i < idx.length; ) {
    let j = i;
    while (j + 1 < idx.length && scores[idx[j + 1]!] === scores[idx[i]!]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[idx[k]!] = avg;
    i = j + 1;
  }
  const n1 = labels.reduce((s, l) => s + l, 0);
  const n0 = labels.length - n1;
  const sumPos = labels.reduce((s, l, i) => s + (l === 1 ? ranks[i]! : 0), 0);
  return (sumPos - (n1 * (n1 + 1)) / 2) / (n1 * n0);
}

/** ROC eğrisi noktaları (FPR, TPR), her benzersiz eşikte; çok noktalıysa seyreltilir. */
export function rocCurve(scores: number[], labels: number[], maxPoints = 60) {
  const order = scores.map((_, i) => i).sort((i, j) => scores[j]! - scores[i]!);
  const P = labels.reduce((s, l) => s + l, 0);
  const N = labels.length - P;
  const pts = [{ fpr: 0, tpr: 0 }];
  let tp = 0;
  let fp = 0;
  for (let i = 0; i < order.length; i++) {
    if (labels[order[i]!] === 1) tp++;
    else fp++;
    const last = i === order.length - 1 || scores[order[i + 1]!] !== scores[order[i]!];
    if (last) pts.push({ fpr: fp / N, tpr: tp / P });
  }
  if (pts.length <= maxPoints) return pts;
  const step = (pts.length - 1) / (maxPoints - 1);
  return Array.from({ length: maxPoints }, (_, i) => pts[Math.round(i * step)]!);
}

/** Ortalama kesinlik (scikit-learn'ün PR-AUC tanımı): Σ (R_n − R_{n−1}) · P_n. */
export function averagePrecision(scores: number[], labels: number[]): number {
  const order = scores.map((_, i) => i).sort((i, j) => scores[j]! - scores[i]!);
  const P = labels.reduce((s, l) => s + l, 0);
  let tp = 0;
  let fp = 0;
  let prevRecall = 0;
  let ap = 0;
  for (let i = 0; i < order.length; i++) {
    if (labels[order[i]!] === 1) tp++;
    else fp++;
    const last = i === order.length - 1 || scores[order[i + 1]!] !== scores[order[i]!];
    if (last) {
      const recall = tp / P;
      ap += (recall - prevRecall) * (tp / (tp + fp));
      prevRecall = recall;
    }
  }
  return ap;
}
