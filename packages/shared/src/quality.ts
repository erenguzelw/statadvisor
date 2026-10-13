/**
 * Veri kalitesi: eksik değerler, Tukey aykırı sınırları, grup bazlı kutu grafikleri ve temizlik öncesi/sonrası
 * normallik. Her sayı sütunlardan hesaplanır.
 */
import { shapiroSubsample } from './analysis.ts';
import { mean, median, shapiroWilk, tukeyFences } from './assumptions.ts';
import { histogram, skewness } from './stats.ts';
import type { BoxStats, HistogramBin } from './types.ts';

export interface QualityColumn {
  name: string;
  numeric: boolean;
  values: (number | string | null)[];
  /** Kimlik benzeri sütunlar aykırı değer taramasına girmez. */
  skip?: boolean;
}

export interface ColumnQuality {
  name: string;
  numeric: boolean;
  /** Dolu gözlem sayısı. */
  n: number;
  missing: number;
  missingRate: number;
  /** Yalnızca sayısal sütunlarda. */
  outliers: number;
  lower?: number;
  upper?: number;
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

export interface DatasetQuality {
  rows: number;
  variables: number;
  cells: number;
  columns: ColumnQuality[];
  /** Temizlenecek sütunlar (varsayılan: kimlik olmayan tüm sayısal sütunlar). */
  cleanColumns: string[];
  outlierCells: number;
  missingCells: number;
  /** Temiz hücre oranı (%): 1 − (aykırı + eksik) / hücre. */
  integrityBefore: number;
  integrityAfter: number;
  removedRows: number;
  cleanedRows: number;
  removedRate: number;
  focus?: QualityFocus;
}

export interface QualityOptions {
  valueColumn?: string;
  groupColumn?: string;
  cleanColumns?: string[];
  k?: number;
}

const collator = new Intl.Collator('tr', { numeric: true });
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

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
  const lo = Math.min(...values);
  const hi = Math.max(...values);
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
      whiskerLow: Math.min(...(inside.length ? inside : v)),
      q1: f.q1,
      median: median(v),
      q3: f.q3,
      whiskerHigh: Math.max(...(inside.length ? inside : v)),
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

export function analyzeQuality(columns: QualityColumn[], opts: QualityOptions = {}): DatasetQuality {
  const rows = columns[0]?.values.length ?? 0;
  const k = opts.k ?? 1.5;
  const info: ColumnQuality[] = [];
  const flagged = new Map<string, boolean[]>();

  for (const c of columns) {
    const filled = c.values.filter((v) => v !== null && v !== undefined);
    const missing = c.values.length - filled.length;
    const q: ColumnQuality = { name: c.name, numeric: c.numeric, n: filled.length, missing, missingRate: rows ? (missing / rows) * 100 : 0, outliers: 0, skipped: Boolean(c.skip) || !c.numeric };
    if (c.numeric && !c.skip) {
      const nums = filled.filter(isNum);
      if (nums.length >= 4) {
        const f = tukeyFences(nums, k);
        q.lower = f.lower;
        q.upper = f.upper;
        const flags = c.values.map((v) => isNum(v) && (v < f.lower || v > f.upper));
        q.outliers = flags.filter(Boolean).length;
        flagged.set(c.name, flags);
      }
    }
    info.push(q);
  }

  const numericNames = info.filter((c) => !c.skipped).map((c) => c.name);
  const cleanColumns = (opts.cleanColumns ?? numericNames).filter((n) => flagged.has(n));
  const removed = new Array<boolean>(rows).fill(false);
  for (const name of cleanColumns) flagged.get(name)!.forEach((f, i) => f && (removed[i] = true));
  const removedRows = removed.filter(Boolean).length;

  const outlierCells = cleanColumns.reduce((s, n) => s + info.find((c) => c.name === n)!.outliers, 0);
  const missingCells = info.reduce((s, c) => s + c.missing, 0);
  const cells = rows * columns.length;

  let focus: QualityFocus | undefined;
  const vcol = columns.find((c) => c.name === opts.valueColumn && c.numeric);
  const gcol = columns.find((c) => c.name === opts.groupColumn);
  if (vcol && gcol) {
    const all: { v: number; g: string; i: number }[] = [];
    for (let i = 0; i < rows; i++) {
      const v = vcol.values[i];
      const g = gcol.values[i];
      if (isNum(v) && g !== null && g !== undefined) all.push({ v, g: String(g), i });
    }
    const kept = all.filter((r) => !removed[r.i]);
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
    cells,
    columns: info,
    cleanColumns,
    outlierCells,
    missingCells,
    integrityBefore: cells ? (1 - (outlierCells + missingCells) / cells) * 100 : 100,
    integrityAfter: 100,
    removedRows,
    cleanedRows: rows - removedRows,
    removedRate: rows ? (removedRows / rows) * 100 : 0,
    focus,
  };
}
