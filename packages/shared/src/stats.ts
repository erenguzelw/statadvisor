/**
 * Örnek ekranlardaki sayıların gerçek hesaptan gelmesi için küçük istatistik yardımcıları.
 * Hesaplamalar SciPy'nin `stats.kruskal` sonuçlarıyla aynı yöntemi izler (bağ düzeltmesi dahil).
 */

/** Düzenlenmiş alt tamamlanmamış gama fonksiyonunun üst kuyruğu Q(a, x). */
export function gammaQ(a: number, x: number): number {
  if (x <= 0) return 1;
  const lnGammaA = lnGamma(a);
  if (x < a + 1) {
    // Seri açılımı: P(a, x), sonra 1 - P
    let sum = 1 / a;
    let term = sum;
    for (let n = 1; n < 500; n++) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-14) break;
    }
    return 1 - sum * Math.exp(-x + a * Math.log(x) - lnGammaA);
  }
  // Sürekli kesir (Lentz yöntemi)
  const tiny = 1e-300;
  let b = x + 1 - a;
  let c = 1 / tiny;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-14) break;
  }
  return Math.exp(-x + a * Math.log(x) - lnGammaA) * h;
}

export function lnGamma(z: number): number {
  const g = 7;
  const coef = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  const zz = z - 1;
  let x = coef[0]!;
  for (let i = 1; i < g + 2; i++) x += coef[i]! / (zz + i);
  const t = zz + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (zz + 0.5) * Math.log(t) - t + Math.log(x);
}

/** Ki-kare dağılımının üst kuyruk olasılığı (p değeri). */
export function chiSquareSurvival(x: number, df: number): number {
  return gammaQ(df / 2, x / 2);
}

export interface KruskalResult {
  /** Bağ düzeltmeli H istatistiği. */
  H: number;
  df: number;
  p: number;
  n: number;
  /** ε² = H / (n − 1) (Tomczak ve Tomczak, 2014). */
  epsilonSquared: number;
}

export function kruskalWallis(groups: number[][]): KruskalResult {
  const all = groups.flatMap((g, gi) => g.map((v) => ({ v, gi }))).sort((a, b) => a.v - b.v);
  const n = all.length;
  const ranks = new Array<number>(n);
  let tieTerm = 0;
  for (let i = 0; i < n; ) {
    let j = i;
    while (j + 1 < n && all[j + 1]!.v === all[i]!.v) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[k] = avg;
    const t = j - i + 1;
    tieTerm += t ** 3 - t;
    i = j + 1;
  }
  const rankSums = new Array<number>(groups.length).fill(0);
  all.forEach((o, i) => {
    rankSums[o.gi]! += ranks[i]!;
  });
  const raw = (12 / (n * (n + 1))) * rankSums.reduce((s, r, i) => s + r ** 2 / groups[i]!.length, 0) - 3 * (n + 1);
  const H = raw / (1 - tieTerm / (n ** 3 - n));
  const df = groups.length - 1;
  return { H, df, p: chiSquareSurvival(H, df), n, epsilonSquared: H / (n - 1) };
}

export function skewness(values: number[]): number {
  const n = values.length;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const m2 = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const m3 = values.reduce((s, v) => s + (v - mean) ** 3, 0) / n;
  return m3 / m2 ** 1.5;
}

export function meanSd(values: number[]) {
  const n = values.length;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const sd = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1));
  return { mean, sd };
}

export function histogram(values: number[], binCount: number, start = 0, width = 1) {
  const bins = Array.from({ length: binCount }, (_, i) => ({ x0: start + i * width, x1: start + (i + 1) * width, count: 0 }));
  for (const v of values) {
    const i = Math.min(binCount - 1, Math.max(0, Math.floor((v - start) / width)));
    bins[i]!.count++;
  }
  return bins;
}

/** Etki büyüklüğü için yaygın yorum eşikleri (ε² / η² için Cohen benzeri). */
export function effectLabel(epsilonSquared: number): 'ihmal edilebilir' | 'küçük' | 'orta' | 'geniş' {
  if (epsilonSquared < 0.01) return 'ihmal edilebilir';
  if (epsilonSquared < 0.06) return 'küçük';
  if (epsilonSquared < 0.14) return 'orta';
  return 'geniş';
}

/** p değerini gösterir; apa=true ise baştaki sıfır atılır (.003). */
export function formatP(p: number, apa = false) {
  if (p < 0.001) return apa ? '< .001' : '< 0.001';
  const s = p < 0.1 ? p.toFixed(3) : p.toFixed(2);
  return apa ? s.replace(/^0/, '') : s;
}
