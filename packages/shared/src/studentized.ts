/**
 * Studentize edilmiş aralık (studentized range) dağılımı: Tukey HSD ve Games-Howell post-hoc testlerinin
 * p değerleri ve kritik değerleri. Tanım:
 *
 *   P(Q > q) = ∫₀^∞ f_s(s) · P(R_k > q·s) ds,   s = √(χ²_ν / ν)
 *   P(R_k > w) = k ∫ φ(z) [Φ(z)^(k−1) − (Φ(z) − Φ(z − w))^(k−1)] dz
 *
 * İç integral doğrudan üst kuyruk olarak yazılır (1 − CDF farkı alınmaz), bu yüzden çok küçük p değerlerinde de
 * göreli duyarlılık korunur. Her iki integral uyarlamalı Gauss–Kronrod (G7/K15) ile alınır. SciPy'nin
 * `stats.studentized_range` sonuçlarıyla karşılaştırılarak doğrulanır.
 */
import { lnGamma } from './stats.ts';

/* ---------- Uyarlamalı Gauss–Kronrod (QUADPACK G7/K15) ---------- */

const XGK = [
  0.9914553711208126, 0.9491079123427585, 0.8648644233597691, 0.7415311855993945,
  0.5860872354676911, 0.4058451513773972, 0.20778495500789848, 0,
];
const WGK = [
  0.022935322010529224, 0.06309209262997856, 0.10479001032225019, 0.14065325971552592,
  0.1690047266392679, 0.19035057806478542, 0.20443294007529889, 0.20948214108472782,
];
/** 7 noktalı Gauss ağırlıkları (XGK[1], XGK[3], XGK[5], XGK[7] düğümlerinde). */
const WG = [0.1294849661688697, 0.27970539148927664, 0.3818300505051189, 0.4179591836734694];

interface Segment {
  a: number;
  b: number;
  value: number;
  error: number;
}

const fv = new Float64Array(15);

/** Tek parça K15 tahmini; hata QUADPACK qk15 ile aynı biçimde ölçeklenir (yakınsamış parçada |K−G| aşırı kötümserdir). */
function kronrod(f: (x: number) => number, a: number, b: number): Segment {
  const c = (a + b) / 2;
  const h = (b - a) / 2;
  const fc = f(c);
  fv[7] = fc;
  let k = fc * WGK[7]!;
  let g = fc * WG[3]!;
  let resabs = Math.abs(k);
  for (let j = 0; j < 7; j++) {
    const dx = h * XGK[j]!;
    const f1 = f(c - dx);
    const f2 = f(c + dx);
    fv[j] = f1;
    fv[14 - j] = f2;
    k += WGK[j]! * (f1 + f2);
    resabs += WGK[j]! * (Math.abs(f1) + Math.abs(f2));
    if (j % 2 === 1) g += WG[(j - 1) / 2]! * (f1 + f2);
  }
  const mid = k / 2;
  let resasc = WGK[7]! * Math.abs(fc - mid);
  for (let j = 0; j < 7; j++) resasc += WGK[j]! * (Math.abs(fv[j]! - mid) + Math.abs(fv[14 - j]! - mid));
  const H = Math.abs(h);
  let error = Math.abs((k - g) * h);
  resasc *= H;
  resabs *= H;
  if (resasc !== 0 && error !== 0) error = resasc * Math.min(1, (200 * error / resasc) ** 1.5);
  if (resabs > Number.MIN_VALUE / (50 * Number.EPSILON)) error = Math.max(50 * Number.EPSILON * resabs, error);
  return { a, b, value: k * h, error };
}

/**
 * ∫ₐᵇ f; aralık önce `panels` eşit parçaya bölünür, sonra toplam hata tahmini max(abs, rel·|sonuç|) altına
 * inene dek en büyük hatalı parça ikiye bölünür.
 */
export function integrate(f: (x: number) => number, a: number, b: number, rel = 1e-12, abs = 0, panels = 1, maxSegments = 400): number {
  const segs: Segment[] = [];
  for (let i = 0; i < panels; i++) segs.push(kronrod(f, a + ((b - a) * i) / panels, i === panels - 1 ? b : a + ((b - a) * (i + 1)) / panels));
  for (;;) {
    let value = 0;
    let error = 0;
    let worst = 0;
    for (let i = 0; i < segs.length; i++) {
      value += segs[i]!.value;
      error += segs[i]!.error;
      if (segs[i]!.error > segs[worst]!.error) worst = i;
    }
    if (error <= Math.max(abs, rel * Math.abs(value)) || segs.length >= maxSegments) return value;
    const s = segs[worst]!;
    const m = (s.a + s.b) / 2;
    if (m <= s.a || m >= s.b) return value; // daha fazla bölünemez
    segs.splice(worst, 1, kronrod(f, s.a, m), kronrod(f, m, s.b));
  }
}

/* ---------- Hızlı ve duyarlı normal kuyruk ---------- */

// İç içe integraller normal dağılımı yüz binlerce kez çağırır; bu yüzden erfcx(x) = e^{x²}·erfc(x) parça parça
// Chebyshev açılımıyla (modül yüklenirken, yavaş ama duyarlı bir hesaptan) kurulur. Göreli hata ~10⁻¹⁴.
const SQRT_PI = Math.sqrt(Math.PI);

/** Duyarlı erfcx: küçük x'te pozitif terimli seri, büyük x'te Laplace sürekli kesri (Lentz). */
function erfcxSlow(x: number): number {
  if (x < 1.5) {
    let term = x;
    let sum = x;
    for (let n = 1; n < 200; n++) {
      term *= (2 * x * x) / (2 * n + 1);
      sum += term;
      if (term < sum * 1e-17) break;
    }
    return Math.exp(x * x) - (2 / SQRT_PI) * sum;
  }
  const tiny = 1e-300;
  let f = x;
  let C = f;
  let D = 0;
  for (let n = 1; n < 20000; n++) {
    const a = n / 2;
    D = x + a * D;
    if (Math.abs(D) < tiny) D = tiny;
    D = 1 / D;
    C = x + a / C;
    if (Math.abs(C) < tiny) C = tiny;
    const delta = C * D;
    f *= delta;
    if (Math.abs(delta - 1) < 1e-17) break;
  }
  return 1 / (SQRT_PI * f);
}

const CHEB_EDGES = [0, 0.5, 1, 2, 4, 8, 16];
const CHEB_N = 22;
const CHEB = CHEB_EDGES.slice(0, -1).map((lo, i) => {
  const hi = CHEB_EDGES[i + 1]!;
  const fv = Array.from({ length: CHEB_N }, (_, j) => erfcxSlow(lo + ((Math.cos((Math.PI * (j + 0.5)) / CHEB_N) + 1) * (hi - lo)) / 2));
  const c = Array.from({ length: CHEB_N }, (_, k) => (2 / CHEB_N) * fv.reduce((s, f, j) => s + f * Math.cos((Math.PI * k * (j + 0.5)) / CHEB_N), 0));
  return { lo, hi, c };
});

function erfcx(x: number): number {
  if (x >= 16) return erfcxSlow(x); // sürekli kesir burada birkaç adımda yakınsar
  let i = 0;
  while (x > CHEB[i]!.hi) i++;
  const { lo, hi, c } = CHEB[i]!;
  const u = (2 * x - lo - hi) / (hi - lo);
  let b0 = 0;
  let b1 = 0;
  for (let k = CHEB_N - 1; k >= 1; k--) {
    const next = 2 * u * b0 - b1 + c[k]!;
    b1 = b0;
    b0 = next;
  }
  return u * b0 - b1 + c[0]! / 2;
}

/** Alt kuyruk Φ(−|z|) = erfc(|z|/√2)/2; e^{−x²} çarpanı x² yuvarlama hatasından kaçınmak için iki parçada alınır. */
function tail(z: number): number {
  const x = Math.abs(z) / Math.SQRT2;
  if (x > 27.3) return 0;
  const xs = Math.trunc(x * 16) / 16;
  return 0.5 * Math.exp(-xs * xs) * Math.exp(-(x - xs) * (x + xs)) * erfcx(x);
}

/** Φ(z) (standart normal dağılım fonksiyonu). */
export function normalCdfFast(z: number): number {
  return z <= 0 ? tail(z) : 1 - tail(z);
}

/* ---------- Aralık dağılımı (bilinen varyans) ---------- */

const INV_SQRT_2PI = 1 / Math.sqrt(2 * Math.PI);
const phi = (z: number) => INV_SQRT_2PI * Math.exp(-0.5 * z * z);

/** k bağımsız standart normal değişkenin aralığının üst kuyruğu P(R > w). */
export function rangeSurvival(w: number, k: number): number {
  if (!(w > 0)) return 1;
  if (w === Infinity) return 0;
  const m = k - 1;
  const f = (z: number) => {
    // a = Φ(z); log a, z > 0 iken log1p ile (a 1'e yakın)
    const t = tail(z);
    const a = z <= 0 ? t : 1 - t;
    if (a <= 0) return 0;
    const logA = z <= 0 ? Math.log(t) : Math.log1p(-t);
    const b = normalCdfFast(z - w); // = P(Z < z − w)
    const frac = Math.min(1, b / a);
    // a^m − (a − b)^m = a^m · (1 − (1 − b/a)^m), kayıpsız biçimde
    const diff = frac >= 1 ? 1 : -Math.expm1(m * Math.log1p(-frac));
    return phi(z) * Math.exp(m * logA) * diff;
  };
  // İntegrand z ≈ w/2 çevresinde yoğunlaşır: z < w iken φ(z)·Φ(z − w) ≲ e^{−(z² + (w−z)²)/2}, z > w iken φ(z) ≤ φ(w).
  // Bu yüzden [w/2 − 10, w/2 + 10] dışındaki katkı, integralin kendisine göre e⁻⁵⁰ düzeyinden küçüktür.
  const v = k * integrate(f, w / 2 - 10, w / 2 + 10, 1e-12, 0, 10);
  return Math.min(1, Math.max(0, v));
}

/**
 * Dış integral P(R > w)'yi yüzlerce kez ister. Bu yüzden k başına bir kez log P(R > w), w ∈ [0, 40] aralığında
 * parça parça Chebyshev açılımıyla tablolanır (göreli hata ~10⁻¹²; kurulum ~25 ms). w > 40 için doğrudan hesaplanır.
 */
const RANGE_EDGES = [0, 1, 2, 4, 7, 11, 16, 23, 31, 40];
const RANGE_N = 24;
const rangeTables = new Map<number, { lo: number; hi: number; c: number[] }[]>();

function rangeTable(k: number) {
  let t = rangeTables.get(k);
  if (!t) {
    t = RANGE_EDGES.slice(0, -1).map((lo, i) => {
      const hi = RANGE_EDGES[i + 1]!;
      const fv = Array.from({ length: RANGE_N }, (_, j) => Math.log(rangeSurvival(lo + ((Math.cos((Math.PI * (j + 0.5)) / RANGE_N) + 1) * (hi - lo)) / 2, k)));
      const c = Array.from({ length: RANGE_N }, (_, m) => (2 / RANGE_N) * fv.reduce((acc, f, j) => acc + f * Math.cos((Math.PI * m * (j + 0.5)) / RANGE_N), 0));
      return { lo, hi, c };
    });
    rangeTables.set(k, t);
    if (rangeTables.size > 40) rangeTables.delete(rangeTables.keys().next().value!);
  }
  return t;
}

/** P(R > w) tablodan; tablo dışında doğrudan. */
function rangeSurvivalFast(w: number, k: number): number {
  if (!(w > 0)) return 1;
  if (w >= 40) return rangeSurvival(w, k);
  const t = rangeTable(k);
  let i = 0;
  while (w > t[i]!.hi) i++;
  const { lo, hi, c } = t[i]!;
  const u = (2 * w - lo - hi) / (hi - lo);
  let b0 = 0;
  let b1 = 0;
  for (let m = RANGE_N - 1; m >= 1; m--) {
    const next = 2 * u * b0 - b1 + c[m]!;
    b1 = b0;
    b0 = next;
  }
  return Math.min(1, Math.exp(u * b0 - b1 + c[0]! / 2));
}

/* ---------- Studentize edilmiş aralık ---------- */

/** P(Q > q) — k grup, ν serbestlik derecesi (ν = Infinity: bilinen varyans). */
export function studentizedRangeSurvival(q: number, k: number, df: number): number {
  if (!(q > 0)) return 1;
  if (q === Infinity) return 0;
  if (!(k >= 2)) throw new Error('Grup sayısı en az 2 olmalı.');
  if (!(df > 0)) return NaN;
  if (df === Infinity || df > 1e7) return rangeSurvivalFast(q, k);
  // t = ln s üzerinden: log yoğunluk h(t) = c + ν t − ν e^{2t} / 2 (tepe t = 0'da)
  const nu = df;
  const c = (nu / 2) * Math.log(nu) - lnGamma(nu / 2) - (nu / 2 - 1) * Math.LN2;
  const h = (t: number) => nu * t - (nu * Math.exp(2 * t)) / 2;
  const h0 = h(0);
  const CUT = 75; // e^-75 ≈ 3·10⁻³³: bu sınırların dışındaki katkı ihmal edilir
  let lo = -0.01;
  while (h(lo) > h0 - CUT) lo *= 2;
  let hi = 0.01;
  while (h(hi) > h0 - CUT) hi *= 2;
  const g = (t: number) => {
    const dens = Math.exp(c + h(t));
    return dens === 0 ? 0 : dens * rangeSurvivalFast(q * Math.exp(t), k);
  };
  const v = integrate(g, lo, hi, 1e-11, 0, 8);
  return Math.min(1, Math.max(0, v));
}

/** P(Q ≤ q). */
export function studentizedRangeCdf(q: number, k: number, df: number): number {
  return 1 - studentizedRangeSurvival(q, k, df);
}

/**
 * Üst kuyruk olasılığı p olan q (ör. p = 0,05 → %95 kritik değer). Kökü önce aralığa alır, sonra
 * Illinois (değiştirilmiş regula falsi) yöntemiyle log ölçeğinde bulur.
 */
export function studentizedRangeQuantile(p: number, k: number, df: number): number {
  if (!(p > 0 && p < 1)) return p <= 0 ? Infinity : 0;
  const F = (q: number) => Math.log(studentizedRangeSurvival(q, k, df)) - Math.log(p);
  let a = 0.5;
  let fa = F(a);
  while (fa < 0 && a > 1e-6) {
    a /= 2;
    fa = F(a);
  }
  let b = 4;
  let fb = F(b);
  while (fb > 0 && b < 1e4) {
    a = b;
    fa = fb;
    b *= 2;
    fb = F(b);
  }
  let side = 0;
  for (let i = 0; i < 200; i++) {
    const c = (a * fb - b * fa) / (fb - fa);
    const fc = F(c);
    if (Math.abs(b - a) < 1e-13 * Math.abs(c) || fc === 0) return c;
    if (fc * fb > 0) {
      b = c;
      fb = fc;
      if (side === -1) fa /= 2;
      side = -1;
    } else {
      a = c;
      fa = fc;
      if (side === 1) fb /= 2;
      side = 1;
    }
  }
  return (a + b) / 2;
}
