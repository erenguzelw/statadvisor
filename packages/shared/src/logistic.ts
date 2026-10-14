/**
 * İkili lojistik regresyon (en çok olabilirlik, IRLS / Newton–Raphson).
 *
 * Katsayı testleri Wald z testidir ve güven aralıkları normal dağılıma dayanır (statsmodels Logit ile aynı).
 * Olasılık oranı (OR) = exp(b). Hosmer–Lemeshow: yordanan olasılığa göre sıralanan gözlemler, boyutları en çok bir
 * farkla eşit (numpy `array_split`) g gruba bölünür; χ² df = g − 2. Gruplama kuralı bir kabuldür; bağlar sırayla bölünür.
 */
import { AnalysisError } from './analysis.ts';
import { normalQuantile, normalSurvival, rocAuc, rocCurve } from './assumptions.ts';
import { buildDesign, computeVifs, olsCore, type CategoryInfo, type RegressionOptions, type RegressionPredictor } from './regression.ts';
import { chiSquareSurvival } from './stats.ts';

export interface LogitCoefficient {
  term: string;
  predictor: string | null;
  level?: string;
  b: number;
  se: number;
  z: number;
  p: number;
  ciLow: number;
  ciHigh: number;
  /** Olasılık oranı ve güven aralığı (exp ile); sabit terimde “taban oran” anlamına gelir. */
  or: number;
  orLow: number;
  orHigh: number;
  vif?: number;
}

export interface ClassificationTable {
  threshold: number;
  tp: number;
  fp: number;
  tn: number;
  fn: number;
  accuracy: number;
  sensitivity: number;
  specificity: number;
  precision: number;
  /** Her gözlemi çoğunluk sınıfına atayan modelin doğruluğu (karşılaştırma tabanı). */
  baseline: number;
}

export interface HosmerLemeshowGroup {
  n: number;
  observed: number;
  expected: number;
}

export interface HosmerLemeshow {
  chi2: number;
  df: number;
  p: number;
  groups: HosmerLemeshowGroup[];
}

export type Separation = 'none' | 'possible' | 'complete';

export interface LogisticResult {
  n: number;
  /** Sabit terim dahil parametre sayısı. */
  k: number;
  events: number;
  nonEvents: number;
  /** Olay sayısı / yordayıcı terim sayısı (az olan sınıf esas alınır). */
  epv: number;
  eventLevel: string;
  referenceLevel: string;
  coefficients: LogitCoefficient[];
  logLik: number;
  logLikNull: number;
  lrChi2: number;
  lrDf: number;
  lrP: number;
  mcFadden: number;
  coxSnell: number;
  nagelkerke: number;
  aic: number;
  bic: number;
  converged: boolean;
  iterations: number;
  separation: Separation;
  classification: ClassificationTable;
  auc: number;
  roc: { fpr: number; tpr: number }[];
  hosmerLemeshow: HosmerLemeshow | null;
  maxVif: number;
  categories: CategoryInfo[];
  droppedRows: number;
  usedRows: number[];
  /** Gözlem başına yordanan olasılık (usedRows ile aynı sırada). */
  probs: number[];
  alpha: number;
}

export interface LogisticOptions extends RegressionOptions {
  /** Sınıflandırma eşiği (varsayılan 0,5). */
  threshold?: number;
  /** Hosmer–Lemeshow grup sayısı (varsayılan 10). */
  groups?: number;
}

const sigmoid = (x: number) => (x >= 0 ? 1 / (1 + Math.exp(-x)) : Math.exp(x) / (1 + Math.exp(x)));

/** Hosmer–Lemeshow: olasılığa göre sıralı, boyutları en çok bir farkla eşit g grup. */
export function hosmerLemeshow(y: number[], p: number[], g = 10): HosmerLemeshow | null {
  const n = y.length;
  const gg = Math.min(g, new Set(p.map((v) => v.toFixed(12))).size);
  if (gg < 3) return null;
  const order = p.map((_, i) => i).sort((a, b) => p[a]! - p[b]! || a - b);
  const base = Math.floor(n / gg);
  const extra = n % gg;
  const groups: HosmerLemeshowGroup[] = [];
  let start = 0;
  for (let j = 0; j < gg; j++) {
    const size = base + (j < extra ? 1 : 0);
    const idx = order.slice(start, start + size);
    start += size;
    groups.push({ n: size, observed: idx.reduce((s, i) => s + y[i]!, 0), expected: idx.reduce((s, i) => s + p[i]!, 0) });
  }
  let chi2 = 0;
  for (const gr of groups) {
    const pbar = gr.expected / gr.n;
    const denom = gr.n * pbar * (1 - pbar);
    if (!(denom > 0)) return null;
    chi2 += (gr.observed - gr.expected) ** 2 / denom;
  }
  const df = gg - 2;
  return { chi2, df, p: chiSquareSurvival(chi2, df), groups };
}

export function classificationTable(y: number[], p: number[], threshold = 0.5): ClassificationTable {
  let tp = 0, fp = 0, tn = 0, fn = 0;
  y.forEach((yi, i) => {
    const pred = p[i]! >= threshold ? 1 : 0;
    if (pred === 1 && yi === 1) tp++;
    else if (pred === 1) fp++;
    else if (yi === 1) fn++;
    else tn++;
  });
  const n = y.length;
  const events = tp + fn;
  return {
    threshold,
    tp,
    fp,
    tn,
    fn,
    accuracy: (tp + tn) / n,
    sensitivity: events ? tp / events : NaN,
    specificity: n - events ? tn / (n - events) : NaN,
    precision: tp + fp ? tp / (tp + fp) : NaN,
    baseline: Math.max(events, n - events) / n,
  };
}

/**
 * Bağımlı değişkeni ikili (0/1) çevirir. Sayısal 0/1 sütunlarda olay = 1; diğer durumlarda olay düzeyi verilir
 * (ya da sıralı iki düzeyin ikincisi olay sayılır).
 */
export function binaryOutcome(values: (number | string | null)[], eventLevel?: string): { y: (number | null)[]; event: string; reference: string } {
  const levels = [...new Set(values.filter((v) => v !== null && v !== undefined).map(String))].sort(new Intl.Collator('tr', { numeric: true }).compare);
  if (levels.length !== 2) throw new AnalysisError(`Bağımlı değişken tam olarak iki düzey içermeli (bulunan: ${levels.length}). Lojistik regresyon ikili sonuç ister.`);
  const event = eventLevel ?? levels[1]!;
  if (!levels.includes(event)) throw new AnalysisError(`Olay düzeyi “${event}” bağımlı değişkende yok (düzeyler: ${levels.join(', ')}).`);
  const reference = levels.find((l) => l !== event)!;
  return { y: values.map((v) => (v === null || v === undefined ? null : String(v) === event ? 1 : 0)), event, reference };
}

export function fitLogisticRegression(
  outcome: (number | string | null)[],
  predictors: RegressionPredictor[],
  opts: LogisticOptions & { eventLevel?: string } = {},
): LogisticResult {
  const alpha = opts.alpha ?? 0.05;
  if (predictors.length === 0) throw new AnalysisError('En az bir yordayıcı seçin.');
  const bin = binaryOutcome(outcome, opts.eventLevel);
  const design = buildDesign(bin.y, predictors, opts);
  const n = design.y.length;
  const cols = design.columns;
  const k = cols.length;
  const events = design.y.reduce((s, v) => s + v, 0);
  const nonEvents = n - events;
  if (events === 0 || nonEvents === 0) throw new AnalysisError('Eksik değerli satırlar çıkarıldıktan sonra bağımlı değişkenin yalnızca bir düzeyi kaldı; model kurulamaz.');
  if (n <= k) throw new AnalysisError(`Gözlem sayısı (${n}) parametre sayısından (${k}) fazla olmalı; model uydurulamaz.`);
  const X = design.used.map((_, r) => cols.map((c) => c.values[r]!));
  const y = design.y;

  // IRLS: her adımda ağırlıklı en küçük kareler (Newton–Raphson ile aynı güncelleme)
  let beta = new Array<number>(k).fill(0);
  beta[0] = Math.log(events / nonEvents);
  let converged = false;
  let iterations = 0;
  let cov: number[][] | undefined;
  let prevLl = -Infinity;
  const logLikOf = (b: number[]) => {
    let ll = 0;
    for (let i = 0; i < n; i++) {
      const eta = X[i]!.reduce((s, v, j) => s + v * b[j]!, 0);
      ll += y[i]! === 1 ? -Math.log1p(Math.exp(-eta)) : -Math.log1p(Math.exp(eta));
    }
    return ll;
  };
  for (; iterations < 100; ) {
    iterations++;
    const eta = X.map((r) => r.reduce((s, v, j) => s + v * beta[j]!, 0));
    const mu = eta.map(sigmoid);
    const w = mu.map((m) => Math.max(m * (1 - m), 1e-10));
    const z = eta.map((e, i) => e + (y[i]! - mu[i]!) / w[i]!);
    const Xw = X.map((r, i) => r.map((v) => v * Math.sqrt(w[i]!)));
    const zw = z.map((v, i) => v * Math.sqrt(w[i]!));
    const fit = olsCore(Xw, zw);
    if (!('beta' in fit) || !fit.beta) {
      throw new AnalysisError('Yordayıcılar arasında tam doğrusal bağımlılık var ya da bir sütun sabit; model uydurulamadı. Birbirinin kopyası olan veya başka sütunların toplamı olan değişkenleri çıkarın.');
    }
    const next = fit.beta;
    cov = fit.xtxInv;
    const delta = Math.max(...next.map((b, j) => Math.abs(b - beta[j]!)));
    beta = next;
    const ll = logLikOf(beta);
    if (delta < 1e-10 || Math.abs(ll - prevLl) < 1e-13) {
      converged = true;
      break;
    }
    prevLl = ll;
    if (Math.max(...beta.map(Math.abs)) > 60) break; // ayrışma: katsayılar sonsuza gidiyor
  }
  const logLik = logLikOf(beta);
  const probs = X.map((r) => sigmoid(r.reduce((s, v, j) => s + v * beta[j]!, 0)));
  const logLikNull = events * Math.log(events / n) + nonEvents * Math.log(nonEvents / n);
  const lrChi2 = Math.max(0, 2 * (logLik - logLikNull));
  const lrDf = k - 1;
  const coxSnell = 1 - Math.exp((2 * (logLikNull - logLik)) / n);
  const maxCs = 1 - Math.exp((2 * logLikNull) / n);

  // Ayrışma tespiti: her gözlem doğru tarafta kalıyorsa (η işareti = sınıf) β ile ayrışan bir doğrultu vardır; bu durumda
  // sonlu bir en çok olabilirlik çözümü yoktur. Yakınsamama ya da çok büyük katsayı/SH ise “olası (yarı) ayrışma” denir.
  const allCorrect = probs.every((p, i) => (y[i] === 1 ? p > 0.5 : p < 0.5));
  const bigSe = cov ? Math.max(...beta.map((_, j) => Math.sqrt(cov![j]![j]!))) : Infinity;
  const separation: Separation = allCorrect ? 'complete' : !converged || Math.max(...beta.map(Math.abs)) > 30 || bigSe > 1e3 ? 'possible' : 'none';

  const zCrit = normalQuantile(1 - alpha / 2);
  const vifs = computeVifs(cols);
  const coefficients: LogitCoefficient[] = cols.map((c, j) => {
    const se = Math.sqrt(cov![j]![j]!);
    const zv = beta[j]! / se;
    const lo = beta[j]! - zCrit * se;
    const hi = beta[j]! + zCrit * se;
    return {
      term: c.term,
      predictor: c.predictor,
      ...(c.level !== undefined ? { level: c.level } : {}),
      b: beta[j]!,
      se,
      z: zv,
      p: 2 * normalSurvival(Math.abs(zv)),
      ciLow: lo,
      ciHigh: hi,
      or: Math.exp(beta[j]!),
      orLow: Math.exp(lo),
      orHigh: Math.exp(hi),
      ...(j > 0 ? { vif: vifs[j - 1] } : {}),
    };
  });
  const threshold = opts.threshold ?? 0.5;
  return {
    n,
    k,
    events,
    nonEvents,
    epv: Math.min(events, nonEvents) / Math.max(1, k - 1),
    eventLevel: bin.event,
    referenceLevel: bin.reference,
    coefficients,
    logLik,
    logLikNull,
    lrChi2,
    lrDf,
    lrP: chiSquareSurvival(lrChi2, lrDf),
    mcFadden: 1 - logLik / logLikNull,
    coxSnell,
    nagelkerke: coxSnell / maxCs,
    aic: -2 * logLik + 2 * k,
    bic: -2 * logLik + Math.log(n) * k,
    converged,
    iterations,
    separation,
    classification: classificationTable(y, probs, threshold),
    auc: rocAuc(probs, y),
    roc: rocCurve(probs, y, 80),
    hosmerLemeshow: hosmerLemeshow(y, probs, opts.groups ?? 10),
    maxVif: vifs.length ? Math.max(...vifs) : 1,
    categories: design.categories,
    droppedRows: design.dropped,
    usedRows: design.used,
    probs,
    alpha,
  };
}
