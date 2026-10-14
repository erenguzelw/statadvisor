/**
 * Doğrusal regresyon (en küçük kareler, EKK).
 *
 * Çözüm Householder QR ile yapılır (normal denklemlerden daha kararlıdır). Kategorik yordayıcılar kukla kodlanır;
 * referans düzey, düzeylerin sıralı listesindeki ilkidir (statsmodels/patsy `C()` ile aynı). Eksik değeri olan
 * satırlar tümüyle çıkarılır (tam gözlemli satırlar). Tanılar statsmodels ile aynı tanımları kullanır:
 * VIF, Breusch–Pagan (Koenker, LM), Durbin–Watson, Cook uzaklığı ve kaldıraç.
 */
import { AnalysisError, shapiroSubsample } from './analysis.ts';
import { fSurvival, shapiroWilk } from './assumptions.ts';
import { chiSquareSurvival } from './stats.ts';
import { tQuantile, tTwoSidedP } from './tests.ts';

export interface RegressionPredictor {
  name: string;
  /** Sayısal sütunlar olduğu gibi, kategorik sütunlar kukla kodlanır. */
  kind: 'numeric' | 'categorical';
  values: (number | string | null)[];
}

export interface RegressionOptions {
  /** Güven düzeyi alfası (varsayılan 0,05). */
  alpha?: number;
  /** Kategorik yordayıcı başına referans düzey (verilmezse sıralı listedeki ilk düzey). */
  reference?: Record<string, string>;
}

export interface Coefficient {
  term: string;
  /** Yordayıcı sütunun adı (sabit terim için null). */
  predictor: string | null;
  /** Kategorik yordayıcıda bu kuklanın düzeyi. */
  level?: string;
  b: number;
  se: number;
  t: number;
  p: number;
  ciLow: number;
  ciHigh: number;
  /** Standartlaştırılmış β = b·sd(x)/sd(y); sabit terimde yok. */
  beta?: number;
  /** Varyans şişirme çarpanı; sabit terimde yok. */
  vif?: number;
}

export interface RegressionDiagnostics {
  /** Kalıntıların normalliği (Shapiro–Wilk). */
  shapiro: { W: number; p: number; n: number } | null;
  /** Breusch–Pagan (Koenker): kalıntı kareleri yordayıcılara bağlı mı? */
  breuschPagan: { lm: number; p: number; df: number };
  /** Durbin–Watson (2 civarı = ardışık ilişki yok). */
  durbinWatson: number;
  cooks: { max: number; maxIndex: number; threshold: number; flagged: number[] };
  /** Kaldıraç > 2p/n olan gözlemler. */
  leverage: { max: number; threshold: number; flagged: number[] };
  maxVif: number;
  /** Tüm kalıntılar için gözlem numarası (özgün veri satırı) bilgisi. */
  notes: string[];
}

export interface CategoryInfo {
  name: string;
  /** Sıralı düzey listesi (referans dahil). */
  levels: string[];
  reference: string;
}

export interface RegressionResult {
  n: number;
  /** Sabit terim dahil parametre sayısı. */
  k: number;
  dfModel: number;
  dfResid: number;
  r2: number;
  adjR2: number;
  F: number;
  pF: number;
  /** Kalıntı standart hatası. */
  sigma: number;
  logLik: number;
  aic: number;
  bic: number;
  coefficients: Coefficient[];
  diagnostics: RegressionDiagnostics;
  /** Kategorik yordayıcıların düzeyleri ve referans düzey. */
  categories: CategoryInfo[];
  /** Çıkarılan (eksik değerli) satır sayısı. */
  droppedRows: number;
  /** Özgün veri satır indeksleri (tam gözlemli satırlar). */
  usedRows: number[];
  fitted: number[];
  residuals: number[];
  /** Gözlem başına Cook uzaklığı ve kaldıraç (usedRows ile aynı sırada). */
  cooks: number[];
  leverage: number[];
  alpha: number;
}

const collator = new Intl.Collator('tr', { numeric: true });

function mean(v: number[]) {
  return v.reduce((s, x) => s + x, 0) / v.length;
}
function sdOf(v: number[]) {
  const m = mean(v);
  return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1));
}

interface Qr {
  /** Üst üçgen R (p×p). */
  R: number[][];
  /** Qᵀy'nin ilk p elemanı. */
  qty: number[];
  rank: number;
}

/** Householder QR; X (n×p) ve y üzerinde çalışır, kopya kullanır. */
function qrDecompose(X: number[][], y: number[]): Qr {
  const n = X.length;
  const p = X[0]!.length;
  const A = X.map((r) => [...r]);
  const b = [...y];
  let maxDiag = 0;
  for (let j = 0; j < p; j++) {
    let norm = 0;
    for (let i = j; i < n; i++) norm += A[i]![j]! ** 2;
    norm = Math.sqrt(norm);
    if (norm === 0) continue;
    const alpha = A[j]![j]! > 0 ? -norm : norm;
    const v = new Array<number>(n - j);
    for (let i = j; i < n; i++) v[i - j] = A[i]![j]!;
    v[0]! -= alpha;
    const vnorm2 = v.reduce((s, x) => s + x * x, 0);
    if (vnorm2 > 0) {
      for (let c = j; c < p; c++) {
        let dot = 0;
        for (let i = j; i < n; i++) dot += v[i - j]! * A[i]![c]!;
        const f = (2 * dot) / vnorm2;
        for (let i = j; i < n; i++) A[i]![c]! -= f * v[i - j]!;
      }
      let dot = 0;
      for (let i = j; i < n; i++) dot += v[i - j]! * b[i]!;
      const f = (2 * dot) / vnorm2;
      for (let i = j; i < n; i++) b[i]! -= f * v[i - j]!;
    }
    maxDiag = Math.max(maxDiag, Math.abs(A[j]![j]!));
  }
  const R = Array.from({ length: p }, (_, i) => Array.from({ length: p }, (_, j) => (j >= i ? A[i]![j]! : 0)));
  const tol = Math.max(n, p) * Number.EPSILON * maxDiag * 10;
  let rank = 0;
  for (let j = 0; j < p; j++) if (Math.abs(R[j]![j]!) > tol) rank++;
  return { R, qty: b.slice(0, p), rank };
}

/** Üst üçgen matrisin tersi. */
function invUpper(R: number[][]): number[][] {
  const p = R.length;
  const inv = Array.from({ length: p }, () => new Array<number>(p).fill(0));
  for (let j = 0; j < p; j++) {
    inv[j]![j] = 1 / R[j]![j]!;
    for (let i = j - 1; i >= 0; i--) {
      let s = 0;
      for (let k = i + 1; k <= j; k++) s += R[i]![k]! * inv[k]![j]!;
      inv[i]![j] = -s / R[i]![i]!;
    }
  }
  return inv;
}

/** y'yi X'e EKK ile uydurur; R², kalıntılar ve (XᵀX)⁻¹ döndürür. */
export function olsCore(X: number[][], y: number[]) {
  const n = X.length;
  const p = X[0]!.length;
  const { R, qty, rank } = qrDecompose(X, y);
  if (rank < p) return { rank, p } as { rank: number; p: number };
  const Rinv = invUpper(R);
  const beta = Rinv.map((row) => row.reduce((s, v, j) => s + v * qty[j]!, 0));
  const fitted = X.map((r) => r.reduce((s, v, j) => s + v * beta[j]!, 0));
  const resid = y.map((v, i) => v - fitted[i]!);
  // (XᵀX)⁻¹ = R⁻¹ R⁻ᵀ
  const xtxInv = Array.from({ length: p }, (_, i) => Array.from({ length: p }, (_, j) => {
    let s = 0;
    for (let k = Math.max(i, j); k < p; k++) s += Rinv[i]![k]! * Rinv[j]![k]!;
    return s;
  }));
  // kaldıraç: h_i = ‖x_i R⁻¹‖²
  const hat = X.map((row) => {
    let s = 0;
    for (let j = 0; j < p; j++) {
      let z = 0;
      for (let k = 0; k <= j; k++) z += row[k]! * Rinv[k]![j]!;
      s += z * z;
    }
    return s;
  });
  void n;
  return { rank, p, beta, fitted, resid, xtxInv, hat };
}

export interface DesignColumn {
  term: string;
  predictor: string | null;
  level?: string;
  values: number[];
}

/** Tam gözlemli satırlardan tasarım matrisini kurar. */
export function buildDesign(y: (number | null)[], predictors: RegressionPredictor[], opts: RegressionOptions = {}) {
  const total = y.length;
  const used: number[] = [];
  for (let i = 0; i < total; i++) {
    const yi = y[i];
    if (typeof yi !== 'number' || !Number.isFinite(yi)) continue;
    let ok = true;
    for (const p of predictors) {
      const v = p.values[i];
      if (v === null || v === undefined || (p.kind === 'numeric' && !(typeof v === 'number' && Number.isFinite(v)))) {
        ok = false;
        break;
      }
    }
    if (ok) used.push(i);
  }
  const columns: DesignColumn[] = [{ term: 'Sabit', predictor: null, values: used.map(() => 1) }];
  const categories: CategoryInfo[] = [];
  for (const p of predictors) {
    if (p.kind === 'numeric') {
      columns.push({ term: p.name, predictor: p.name, values: used.map((i) => p.values[i] as number) });
    } else {
      const levels = [...new Set(used.map((i) => String(p.values[i])))].sort(collator.compare);
      if (levels.length < 2) throw new AnalysisError(`“${p.name}” sütununda (eksik değerler çıkarıldıktan sonra) yalnızca bir düzey kaldı; kukla kodlanamaz.`);
      const ref = opts.reference?.[p.name] ?? levels[0]!;
      if (!levels.includes(ref)) throw new AnalysisError(`“${p.name}” için referans düzey “${ref}” veride yok.`);
      categories.push({ name: p.name, levels, reference: ref });
      for (const lv of levels) {
        if (lv === ref) continue;
        columns.push({ term: `${p.name}[${lv}]`, predictor: p.name, level: lv, values: used.map((i) => (String(p.values[i]) === lv ? 1 : 0)) });
      }
    }
  }
  const yv = used.map((i) => y[i] as number);
  return { used, columns, y: yv, dropped: total - used.length, categories };
}

/**
 * Varyans şişirme çarpanı: her yordayıcı terim için, sabit terim dahil diğer terimlere göre R²; VIF = 1/(1−R²).
 * Yalnızca tasarım matrisine bağlıdır (bağımlı değişkene değil). Sonuç, sabit terim hariç terim sırasındadır.
 */
export function computeVifs(cols: DesignColumn[]): number[] {
  const rows = cols[0]?.values.length ?? 0;
  const vifs: number[] = [];
  for (let j = 1; j < cols.length; j++) {
    const others = cols.map((_, c) => c).filter((c) => c !== j);
    const Xo = Array.from({ length: rows }, (_, r) => others.map((c) => cols[c]!.values[r]!));
    const target = cols[j]!.values;
    const f2 = olsCore(Xo, target);
    if (!('resid' in f2) || !f2.resid) {
      vifs.push(Infinity);
      continue;
    }
    const tm = mean(target);
    const sstj = target.reduce((s, v) => s + (v - tm) ** 2, 0);
    const ssej = f2.resid.reduce((s, e) => s + e * e, 0);
    vifs.push(sstj === 0 ? Infinity : 1 / (ssej / sstj));
  }
  return vifs;
}

export function fitLinearRegression(y: (number | null)[], predictors: RegressionPredictor[], opts: RegressionOptions = {}): RegressionResult {
  const alpha = opts.alpha ?? 0.05;
  if (predictors.length === 0) throw new AnalysisError('En az bir yordayıcı seçin.');
  const design = buildDesign(y, predictors, opts);
  const n = design.y.length;
  const cols = design.columns;
  const k = cols.length;
  if (n <= k) throw new AnalysisError(`Gözlem sayısı (${n}) parametre sayısından (${k}) fazla olmalı; model uydurulamaz.`);
  const X = design.used.map((_, r) => cols.map((c) => c.values[r]!));
  const fit = olsCore(X, design.y);
  if (!('beta' in fit) || !fit.beta) {
    throw new AnalysisError('Yordayıcılar arasında tam doğrusal bağımlılık var (mükemmel çoklu doğrusallık) ya da bir sütun sabit; model uydurulamadı. Birbirinin kopyası olan ya da başka sütunların toplamı olan değişkenleri çıkarın.');
  }
  const { beta, fitted, resid, xtxInv, hat } = fit;
  const dfResid = n - k;
  const dfModel = k - 1;
  const ym = mean(design.y);
  const sst = design.y.reduce((s, v) => s + (v - ym) ** 2, 0);
  const sse = resid.reduce((s, e) => s + e * e, 0);
  if (sst === 0) throw new AnalysisError('Bağımlı değişken sabit; regresyon anlamsız.');
  const ssr = sst - sse;
  const r2 = 1 - sse / sst;
  const adjR2 = 1 - ((1 - r2) * (n - 1)) / dfResid;
  const s2 = sse / dfResid;
  const sigma = Math.sqrt(s2);
  const F = dfModel > 0 ? ssr / dfModel / s2 : NaN;
  const pF = dfModel > 0 ? fSurvival(F, dfModel, dfResid) : NaN;
  const logLik = (-n / 2) * (Math.log(2 * Math.PI) + Math.log(sse / n) + 1);
  const aic = -2 * logLik + 2 * k;
  const bic = -2 * logLik + Math.log(n) * k;
  const tCrit = tQuantile(1 - alpha / 2, dfResid);

  const sdY = sdOf(design.y);

  const vifs = computeVifs(cols);

  const coefficients: Coefficient[] = cols.map((c, j) => {
    const se = Math.sqrt(s2 * xtxInv[j]![j]!);
    const t = beta[j]! / se;
    const out: Coefficient = {
      term: c.term,
      predictor: c.predictor,
      ...(c.level !== undefined ? { level: c.level } : {}),
      b: beta[j]!,
      se,
      t,
      p: tTwoSidedP(t, dfResid),
      ciLow: beta[j]! - tCrit * se,
      ciHigh: beta[j]! + tCrit * se,
    };
    if (j > 0) {
      out.beta = (beta[j]! * sdOf(c.values)) / sdY;
      out.vif = vifs[j - 1];
    }
    return out;
  });

  // Tanılar
  const notes: string[] = [];
  const sh = n >= 3 ? shapiroWilk(shapiroSubsample(resid, notes)) : null;
  // Breusch–Pagan (Koenker): e² ~ X; LM = n·R²
  const e2 = resid.map((e) => e * e);
  const aux = olsCore(X, e2);
  let bp = { lm: NaN, p: NaN, df: dfModel };
  if ('resid' in aux && aux.resid) {
    const m2 = mean(e2);
    const sst2 = e2.reduce((s, v) => s + (v - m2) ** 2, 0);
    const sse2 = aux.resid.reduce((s, e) => s + e * e, 0);
    const r2aux = sst2 === 0 ? 0 : 1 - sse2 / sst2;
    const lm = n * r2aux;
    bp = { lm, p: dfModel > 0 ? chiSquareSurvival(lm, dfModel) : NaN, df: dfModel };
  }
  let dwNum = 0;
  for (let i = 1; i < n; i++) dwNum += (resid[i]! - resid[i - 1]!) ** 2;
  const durbinWatson = dwNum / sse;
  // Cook: D_i = e_i² h_i / (k s² (1−h_i)²)
  const cook = resid.map((e, i) => (e * e * hat[i]!) / (k * s2 * (1 - hat[i]!) ** 2));
  const cookThreshold = 4 / n;
  let cookMax = -1;
  let cookIdx = 0;
  cook.forEach((v, i) => {
    if (v > cookMax) {
      cookMax = v;
      cookIdx = i;
    }
  });
  const levThreshold = (2 * k) / n;
  let levMax = 0;
  hat.forEach((h) => (levMax = Math.max(levMax, h)));
  const maxVif = vifs.length ? Math.max(...vifs) : 1;

  return {
    n,
    k,
    dfModel,
    dfResid,
    r2,
    adjR2,
    F,
    pF,
    sigma,
    logLik,
    aic,
    bic,
    coefficients,
    diagnostics: {
      shapiro: sh ? { W: sh.W, p: sh.p, n: sh.n } : null,
      breuschPagan: bp,
      durbinWatson,
      cooks: { max: cookMax, maxIndex: design.used[cookIdx]!, threshold: cookThreshold, flagged: cook.map((v, i) => (v > cookThreshold ? design.used[i]! : -1)).filter((i) => i >= 0) },
      leverage: { max: levMax, threshold: levThreshold, flagged: hat.map((h, i) => (h > levThreshold ? design.used[i]! : -1)).filter((i) => i >= 0) },
      maxVif,
      notes,
    },
    categories: design.categories,
    droppedRows: design.dropped,
    usedRows: design.used,
    fitted,
    residuals: resid,
    cooks: cook,
    leverage: hat,
    alpha,
  };
}
