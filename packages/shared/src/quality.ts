/**
 * Veri kalitesi: eksik değerler, geçersiz hücreler ve incelenecek uç değerler. Her sayı sütunlardan hesaplanır.
 *
 * Tasarım ilkeleri:
 * - Tukey sınırı (Tukey, 1977; Hoaglin, Iglewicz ve Tukey, 1986) yalnızca bir “işaretleme” kuralıdır ve yalnızca
 *   sürekli ölçümlere uygulanır. Sıralı anket maddelerinde ve kategorik kodlarda uygulanmaz; sınır dışı olması veri
 *   hatası olduğu anlamına gelmez.
 * - “Geçersiz hücre” yalnızca kullanıcının doğruladığı aralığa/kategorilere göre belirlenir; gözlenen en küçük ve
 *   en büyük değerden sınır üretilmez.
 * - Hiçbir hücre/satır kendiliğinden silinmez: eylemler (eksik işaretle, satırı sil) kullanıcı kurallarıyla seçilir.
 */
import { AnalysisError, shapiroSubsample } from './analysis.ts';
import { mean, median, shapiroWilk, tukeyFences } from './assumptions.ts';
import { extent } from './extent.ts';
import { histogram, skewness } from './stats.ts';
import { analyzeMissingness, type MissingnessReport } from './missingness.ts';
import type { BoxStats, HistogramBin } from './types.ts';

export type ColumnKind = 'continuous' | 'ordinal' | 'categorical';

export interface ValidRange {
  min: number;
  max: number;
}

export interface QualityColumn {
  name: string;
  numeric: boolean;
  values: (number | string | null)[];
  /** Kimlik benzeri sütunlar taramaya girmez. */
  skip?: boolean;
  /** Etkin tür (kullanıcı düzeltmesi dahil). Verilmezse sayısal sütun “sürekli”, diğerleri “kategorik” sayılır. */
  kind?: ColumnKind;
  /** Ölçek toplam/ortalama puanı (tek bir anket maddesi değil). */
  score?: boolean;
  /** Kullanıcının doğruladığı geçerli aralık (sayısal sütunlar). */
  validRange?: ValidRange;
  /** Kullanıcının doğruladığı geçerli kategoriler (kategorik sütunlar). */
  validCategories?: string[];
}

export type IssueKind = 'invalid' | 'extreme';
export type CleanAction = 'setMissing' | 'removeRow';

export interface CleanRule {
  column: string;
  issue: IssueKind;
  action: CleanAction;
}

/**
 * Satır kaybı için ürünün koruyucu tasarım eşikleri (%). Bunlar bilimsel eşikler değildir: kayıp arttıkça kullanıcıdan
 * daha fazla inceleme istemek için seçilmiş uyarı basamaklarıdır.
 */
export const ROW_LOSS_REVIEW = 5;
export const ROW_LOSS_CONFIRM = 10;

export type ValidityStatus = 'range' | 'categories' | 'unconfirmed';

export interface ColumnQuality {
  name: string;
  numeric: boolean;
  kind: ColumnKind;
  score: boolean;
  /** Dolu gözlem sayısı. */
  n: number;
  missing: number;
  missingRate: number;
  /** Kullanıcının doğruladığı kurala göre geçersiz hücre sayısı (kural doğrulanmadıysa 0). */
  invalid: number;
  validity: ValidityStatus;
  validRange?: ValidRange;
  validCategoryCount?: number;
  /** Gözlenen aralık: yalnızca bilgi; geçerlilik kuralı değildir. */
  observedMin?: number;
  observedMax?: number;
  /** Tukey sınırı dışındaki, incelenecek uç değer sayısı (yalnızca sürekli ölçümler). */
  extremes: number;
  lower?: number;
  upper?: number;
  tukeyApplied: boolean;
  skipped: boolean;
}

export interface QualityFocus {
  valueColumn: string;
  groupColumn: string;
  boxesBefore: BoxStats[];
  boxesAfter: BoxStats[];
  histBefore: { bins: HistogramBin[]; mean: number; sd: number };
  histAfter: { bins: HistogramBin[]; mean: number; sd: number };
  shapiroBefore: { W: number; p: number; n: number } | null;
  shapiroAfter: { W: number; p: number; n: number } | null;
  skewBefore: number;
  skewAfter: number;
}

export interface RuleEffect extends CleanRule {
  /** Kuralın işaretlediği hücre sayısı (bir hücre en çok bir satırdadır). */
  cells: number;
}

export interface GroupLoss {
  group: string;
  n: number;
  removed: number;
  rate: number;
}

export type LossLevel = 'none' | 'review' | 'confirm';

export interface CleanPlanSummary {
  rules: CleanRule[];
  /** Benzersiz silinecek satır: birden fazla sütunda işaretli satır bir kez sayılır. */
  removedRows: number;
  cleanedRows: number;
  removedRate: number;
  setMissingCells: number;
  byRule: RuleEffect[];
  groupLoss?: GroupLoss[];
  level: LossLevel;
  /** Seviyeyi belirleyen en yüksek kayıp oranı ve nerede olduğu. */
  worstRate: number;
  worstScope: string;
  reviewThreshold: number;
  confirmThreshold: number;
}

export interface DatasetQuality {
  rows: number;
  variables: number;
  cells: number;
  columns: ColumnQuality[];
  /** Taranan sütunlardaki toplamlar; üç sayı birbirinden bağımsızdır. */
  invalidCells: number;
  extremeCells: number;
  missingCells: number;
  plan: CleanPlanSummary;
  /** Eksik olma durumunun diğer sütunlarla ilişkisi (MCAR kanıtı değil). */
  missingness: MissingnessReport;
  focus?: QualityFocus;
}

export interface QualityOptions {
  valueColumn?: string;
  groupColumn?: string;
  rules?: CleanRule[];
  k?: number;
  /** Önceden hesaplanmış eksiklik tanılaması (kurallardan bağımsızdır; sunucu önbelleğe alır). */
  missingness?: MissingnessReport;
}

const collator = new Intl.Collator('tr', { numeric: true });
export const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export const kindOf = (c: QualityColumn): ColumnKind => c.kind ?? (c.numeric ? 'continuous' : 'categorical');

const KIND_LABEL: Record<ColumnKind, string> = { continuous: 'sürekli', ordinal: 'sıralı', categorical: 'kategorik' };

export interface ColumnScan {
  kind: ColumnKind;
  invalid: boolean[];
  extreme: boolean[];
  validity: ValidityStatus;
  lower?: number;
  upper?: number;
  tukeyApplied: boolean;
}

/**
 * Bir sütunu tarar. Geçersiz hücreler yalnızca kullanıcı kuralıyla belirlenir. Tukey sınırı yalnızca sürekli ölçümlerde
 * ve geçersiz sayılan hücreler dışarıda bırakılarak hesaplanır (geçersiz bir kod sınırları bozmasın).
 */
export function scanColumn(c: QualityColumn, k = 1.5): ColumnScan {
  const kind = kindOf(c);
  const n = c.values.length;
  const invalid = new Array<boolean>(n).fill(false);
  let validity: ValidityStatus = 'unconfirmed';
  if (kind !== 'categorical' && c.numeric && c.validRange) {
    validity = 'range';
    const { min, max } = c.validRange;
    c.values.forEach((v, i) => {
      invalid[i] = isNum(v) && (v < min || v > max);
    });
  } else if (kind === 'categorical' && c.validCategories && c.validCategories.length > 0) {
    validity = 'categories';
    if (c.numeric) {
      const set = new Set(c.validCategories.map(Number));
      c.values.forEach((v, i) => {
        invalid[i] = isNum(v) && !set.has(v);
      });
    } else {
      const set = new Set(c.validCategories);
      c.values.forEach((v, i) => {
        invalid[i] = v !== null && v !== undefined && !set.has(String(v));
      });
    }
  }
  const extreme = new Array<boolean>(n).fill(false);
  let lower: number | undefined;
  let upper: number | undefined;
  let tukeyApplied = false;
  if (kind === 'continuous' && c.numeric && !c.skip) {
    const nums = c.values.filter((v, i): v is number => isNum(v) && !invalid[i]);
    if (nums.length >= 4) {
      const f = tukeyFences(nums, k);
      lower = f.lower;
      upper = f.upper;
      tukeyApplied = true;
      c.values.forEach((v, i) => {
        extreme[i] = isNum(v) && !invalid[i] && (v < f.lower || v > f.upper);
      });
    }
  }
  return { kind, invalid, extreme, validity, lower, upper, tukeyApplied };
}

/** Kural listesini doğrular; hatalı kuralda kullanıcıya gösterilebilir bir hata fırlatır. */
export function validateRules(columns: QualityColumn[], rules: CleanRule[]): void {
  const seen = new Set<string>();
  for (const r of rules) {
    const c = columns.find((x) => x.name === r.column);
    if (!c) throw new AnalysisError(`“${r.column}” adlı sütun bulunamadı.`);
    const key = `${r.column}\u0000${r.issue}`;
    if (seen.has(key)) throw new AnalysisError(`“${r.column}” için aynı sorun türüne birden fazla kural verildi.`);
    seen.add(key);
    if (c.skip) throw new AnalysisError(`“${r.column}” kimlik sütunu gibi görünüyor; taranmaz ve temizlenmez.`);
    const kind = kindOf(c);
    if (r.issue === 'extreme' && kind !== 'continuous') {
      throw new AnalysisError(`“${r.column}” ${KIND_LABEL[kind]} bir sütun; Tukey sınırı yalnızca sürekli ölçümlere uygulanır. Sütunun türü yanlışsa Sütun türleri bölümünden düzeltin.`);
    }
    if (r.issue === 'invalid' && scanColumn(c).validity === 'unconfirmed') {
      throw new AnalysisError(`“${r.column}” için geçerli ${kind === 'categorical' ? 'kategoriler' : 'aralık'} doğrulanmadı; geçersiz hücre kuralı uygulanamaz.`);
    }
  }
}

export interface RulePlan {
  scans: Map<string, ColumnScan>;
  /** Silinecek satırlar. */
  remove: boolean[];
  /** Sütun başına eksik işaretlenecek hücreler. */
  setMissing: Map<string, boolean[]>;
  byRule: RuleEffect[];
  removedRows: number;
  setMissingCells: number;
}

/** Kuralları özgün veri üzerinde değerlendirir (hiçbir kural diğerinin sonucunu etkilemez). */
export function planRules(columns: QualityColumn[], rules: CleanRule[], k = 1.5): RulePlan {
  validateRules(columns, rules);
  const rows = columns[0]?.values.length ?? 0;
  const scans = new Map<string, ColumnScan>();
  for (const c of columns) scans.set(c.name, scanColumn(c, k));
  const remove = new Array<boolean>(rows).fill(false);
  const setMissing = new Map<string, boolean[]>();
  const byRule: RuleEffect[] = [];
  for (const r of rules) {
    const s = scans.get(r.column)!;
    const flags = r.issue === 'invalid' ? s.invalid : s.extreme;
    byRule.push({ ...r, cells: flags.filter(Boolean).length });
    if (r.action === 'removeRow') flags.forEach((f, i) => f && (remove[i] = true));
    else {
      const m = setMissing.get(r.column) ?? new Array<boolean>(rows).fill(false);
      flags.forEach((f, i) => f && (m[i] = true));
      setMissing.set(r.column, m);
    }
  }
  const setMissingCells = [...setMissing.values()].reduce((s, m) => s + m.filter(Boolean).length, 0);
  return { scans, remove, setMissing, byRule, removedRows: remove.filter(Boolean).length, setMissingCells };
}

/** Toplam ve (grup seçildiyse) grup başına satır kaybına göre uyarı seviyesi. */
export function lossLevel(total: number, groups: GroupLoss[] | undefined): { level: LossLevel; worstRate: number; worstScope: string } {
  let worstRate = total;
  let worstScope = 'tüm veri';
  for (const g of groups ?? []) {
    if (g.rate > worstRate) {
      worstRate = g.rate;
      worstScope = `“${g.group}” grubu`;
    }
  }
  const level: LossLevel = worstRate > ROW_LOSS_CONFIRM ? 'confirm' : worstRate > ROW_LOSS_REVIEW ? 'review' : 'none';
  return { level, worstRate, worstScope };
}

/** Grup sütununa göre kayıp: grup eksikse “(grup eksik)” olarak ayrı sayılır. */
export function groupLossOf(groupValues: (number | string | null)[], remove: boolean[]): GroupLoss[] {
  const map = new Map<string, { n: number; removed: number }>();
  groupValues.forEach((g, i) => {
    const key = g === null || g === undefined ? '(grup eksik)' : String(g);
    const e = map.get(key) ?? { n: 0, removed: 0 };
    e.n++;
    if (remove[i]) e.removed++;
    map.set(key, e);
  });
  return [...map.entries()]
    .sort((a, b) => collator.compare(a[0], b[0]))
    .map(([group, e]) => ({ group, n: e.n, removed: e.removed, rate: e.n ? (e.removed / e.n) * 100 : 0 }));
}

function sd(values: number[], m: number) {
  return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, values.length - 1));
}

function residualsByGroup(rows: { v: number; g: string }[]): number[] {
  const sums = new Map<string, { s: number; n: number }>();
  for (const r of rows) {
    const e = sums.get(r.g) ?? { s: 0, n: 0 };
    e.s += r.v;
    e.n++;
    sums.set(r.g, e);
  }
  return rows.map((r) => r.v - sums.get(r.g)!.s / sums.get(r.g)!.n);
}

function makeHist(values: number[]) {
  if (values.length === 0) return { bins: [], mean: 0, sd: 0 };
  const { lo, hi } = extent(values);
  const count = Math.max(8, Math.min(40, Math.round(Math.sqrt(values.length))));
  const width = (hi - lo) / count || 1;
  const m = mean(values);
  return { bins: histogram(values, count, lo, width), mean: m, sd: sd(values, m) };
}

function boxes(rows: { v: number; g: string }[]): BoxStats[] {
  const levels = [...new Set(rows.map((r) => r.g))].sort(collator.compare);
  return levels.map((g) => {
    const v = rows.filter((r) => r.g === g).map((r) => r.v);
    const f = tukeyFences(v);
    const inside = v.filter((x) => x >= f.lower && x <= f.upper);
    return {
      group: g,
      n: v.length,
      whiskerLow: extent(inside.length ? inside : v).lo,
      q1: f.q1,
      median: median(v),
      q3: f.q3,
      whiskerHigh: extent(inside.length ? inside : v).hi,
      outliers: v.filter((x) => x < f.lower || x > f.upper).sort((a, b) => a - b),
    };
  });
}

function safeShapiro(values: number[]) {
  if (values.length < 3) return null;
  const sample = shapiroSubsample(values, []);
  const r = shapiroWilk(sample);
  return { W: r.W, p: r.p, n: r.n };
}

/** Eksiklik tanılaması: etkin sütun türlerine göre (kategorik sütunlar ki-kare ile). */
export function missingnessOf(columns: QualityColumn[]): MissingnessReport {
  return analyzeMissingness(columns.map((c) => ({ name: c.name, numeric: c.numeric, categorical: kindOf(c) === 'categorical', values: c.values, skip: c.skip })));
}

export function analyzeQuality(columns: QualityColumn[], opts: QualityOptions = {}): DatasetQuality {
  const rows = columns[0]?.values.length ?? 0;
  const rules = opts.rules ?? [];
  const plan = planRules(columns, rules, opts.k ?? 1.5);

  const info: ColumnQuality[] = columns.map((c) => {
    const s = plan.scans.get(c.name)!;
    const filled = c.values.filter((v) => v !== null && v !== undefined);
    const missing = c.values.length - filled.length;
    const nums = c.numeric ? filled.filter(isNum) : [];
    const range = nums.length ? extent(nums) : undefined;
    return {
      name: c.name,
      numeric: c.numeric,
      kind: s.kind,
      score: Boolean(c.score),
      n: filled.length,
      missing,
      missingRate: rows ? (missing / rows) * 100 : 0,
      invalid: s.invalid.filter(Boolean).length,
      validity: s.validity,
      validRange: s.validity === 'range' ? c.validRange : undefined,
      validCategoryCount: s.validity === 'categories' ? c.validCategories?.length : undefined,
      observedMin: range?.lo,
      observedMax: range?.hi,
      extremes: s.extreme.filter(Boolean).length,
      lower: s.lower,
      upper: s.upper,
      tukeyApplied: s.tukeyApplied,
      skipped: Boolean(c.skip),
    };
  });

  const gcol = columns.find((c) => c.name === opts.groupColumn);
  const groupLoss = gcol ? groupLossOf(gcol.values, plan.remove) : undefined;
  const totalRate = rows ? (plan.removedRows / rows) * 100 : 0;
  const lvl = lossLevel(totalRate, groupLoss);

  let focus: QualityFocus | undefined;
  const vcol = columns.find((c) => c.name === opts.valueColumn && c.numeric);
  if (vcol && gcol) {
    const vMissing = plan.setMissing.get(vcol.name);
    const all: { v: number; g: string; i: number }[] = [];
    for (let i = 0; i < rows; i++) {
      const v = vcol.values[i];
      const g = gcol.values[i];
      if (isNum(v) && g !== null && g !== undefined) all.push({ v, g: String(g), i });
    }
    const kept = all.filter((r) => !plan.remove[r.i] && !vMissing?.[r.i]);
    const resB = residualsByGroup(all);
    const resA = residualsByGroup(kept);
    focus = {
      valueColumn: vcol.name,
      groupColumn: gcol.name,
      boxesBefore: boxes(all),
      boxesAfter: boxes(kept),
      histBefore: makeHist(resB),
      histAfter: makeHist(resA),
      shapiroBefore: safeShapiro(resB),
      shapiroAfter: safeShapiro(resA),
      skewBefore: resB.length > 2 ? skewness(resB) : 0,
      skewAfter: resA.length > 2 ? skewness(resA) : 0,
    };
  }

  return {
    rows,
    variables: columns.length,
    cells: rows * columns.length,
    columns: info,
    invalidCells: info.reduce((s, c) => s + c.invalid, 0),
    extremeCells: info.reduce((s, c) => s + c.extremes, 0),
    missingCells: info.reduce((s, c) => s + c.missing, 0),
    plan: {
      rules,
      removedRows: plan.removedRows,
      cleanedRows: rows - plan.removedRows,
      removedRate: totalRate,
      setMissingCells: plan.setMissingCells,
      byRule: plan.byRule,
      groupLoss,
      level: lvl.level,
      worstRate: lvl.worstRate,
      worstScope: lvl.worstScope,
      reviewThreshold: ROW_LOSS_REVIEW,
      confirmThreshold: ROW_LOSS_CONFIRM,
    },
    missingness: opts.missingness ?? missingnessOf(columns),
    focus,
  };
}
