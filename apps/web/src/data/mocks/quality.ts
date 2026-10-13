import { mean, median, shapiroWilk, tukeyFences } from '@/lib/assumptions';
import { gaussian, mulberry32 } from '@/lib/ml';
import { histogram } from '@/lib/stats';
import type { BoxStats, HistogramBin, ImputationMethod, QualitySummary, RawRow } from '../types';

export const imputationMethods: ImputationMethod[] = [
  { id: 'median', label: 'Medyan ile doldurma', hint: 'Hızlı' },
  { id: 'knn', label: 'KNN imputasyon (k=5)', hint: 'Hassas' },
];

const GROUPS = [
  { id: 'A' as const, n: 472, shift: 0 },
  { id: 'B' as const, n: 480, shift: 4 },
  { id: 'C' as const, n: 468, shift: 8 },
];
const MISSING_COUNT = 60;
const VARIABLES = 6; // id, grup, yaş, kan basıncı, gelir, biyobelirteç

export interface QualityReport {
  summary: QualitySummary;
  rows: RawRow[];
  boxes: BoxStats[];
  boxesCleaned: BoxStats[];
  histBefore: { bins: HistogramBin[]; mean: number; sd: number };
  histAfter: { bins: HistogramBin[]; mean: number; sd: number };
  skewBefore: number;
  skewAfter: number;
}

interface Row extends RawRow {
  removed: boolean;
}

function build(): QualityReport {
  const rng = mulberry32(2026);
  const raw: Omit<RawRow, 'id'>[] = [];
  for (const g of GROUPS) {
    for (let i = 0; i < g.n; i++) {
      raw.push({
        group: g.id,
        age: Math.max(18, Math.min(90, Math.round(50 + 12 * gaussian(rng)))),
        bloodPressure: Math.round((124 + g.shift + 12 * gaussian(rng)) * 10) / 10,
        income: Math.round(Math.exp(10.5 + 0.45 * gaussian(rng)) / 100) * 100,
        biomarker: Math.round(Math.exp(1.35 + 0.25 * gaussian(rng)) * 100) / 100,
      });
    }
  }
  // Gruplar karışık sırada görünsün (Fisher-Yates, tohumlu).
  for (let i = raw.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [raw[i], raw[j]] = [raw[j]!, raw[i]!];
  }
  // Örnek sorunlar: belirli satırlara bilinçli olarak yerleştirilir ve bu yalnızca bu demo veri setine aittir.
  raw[1]!.bloodPressure = 248;
  raw[5]!.biomarker = 18.9;
  for (let k = 0; k < 8; k++) raw[40 + k * 150]!.bloodPressure = 205 + k * 7;
  for (let k = 0; k < 3; k++) raw[90 + k * 400]!.biomarker = 12 + k * 1.5;
  const missingIdx = new Set<number>([3, 6]);
  while (missingIdx.size < MISSING_COUNT) missingIdx.add(Math.floor(rng() * raw.length));
  const rows: Row[] = raw.map((r, i) => ({
    ...r,
    id: `#${String(i + 1).padStart(3, '0')}`,
    income: missingIdx.has(i) ? null : r.income,
    removed: false,
  }));

  const bp = rows.map((r) => r.bloodPressure);
  const bio = rows.map((r) => r.biomarker);
  const bpF = tukeyFences(bp);
  const bioF = tukeyFences(bio);
  const bpOut = (v: number) => v < bpF.lower || v > bpF.upper;
  const bioOut = (v: number) => v < bioF.lower || v > bioF.upper;
  const bpCount = bp.filter(bpOut).length;
  const bioCount = bio.filter(bioOut).length;

  for (const r of rows) {
    if (bpOut(r.bloodPressure)) {
      r.outlierIn = 'bloodPressure';
      r.outlierNote = `Sınır dışı (> ${bpF.upper.toFixed(0)})`;
    } else if (bioOut(r.biomarker)) {
      r.outlierIn = 'biomarker';
      r.outlierNote = `Sınır dışı (> ${bioF.upper.toFixed(1)})`;
    }
    r.removed = bpOut(r.bloodPressure) || bioOut(r.biomarker);
  }
  const cleaned = rows.filter((r) => !r.removed);

  const residuals = (rs: Row[]) =>
    rs.flatMap((r) => {
      const m = mean(rs.filter((x) => x.group === r.group).map((x) => x.bloodPressure));
      return [r.bloodPressure - m];
    });
  const resBefore = residuals(rows);
  const resAfter = residuals(cleaned);
  const sw = (v: number[]) => {
    const { W, p } = shapiroWilk(v);
    return { W, p };
  };

  const cells = rows.length * VARIABLES;
  const flaggedCells = bpCount + bioCount + MISSING_COUNT;
  const mkHist = (res: number[]) => {
    const lo = Math.floor(Math.min(...res) / 5) * 5;
    const hi = Math.ceil(Math.max(...res) / 5) * 5;
    const m = mean(res);
    const sd = Math.sqrt(res.reduce((s, v) => s + (v - m) ** 2, 0) / (res.length - 1));
    return { bins: histogram(res, Math.max(1, (hi - lo) / 5), lo, 5), mean: m, sd };
  };
  const skew = (v: number[]) => {
    const m = mean(v);
    const m2 = v.reduce((s, x) => s + (x - m) ** 2, 0) / v.length;
    return v.reduce((s, x) => s + (x - m) ** 3, 0) / v.length / m2 ** 1.5;
  };

  const boxFor = (rs: Row[]): BoxStats[] =>
    GROUPS.map((g) => {
      const v = rs.filter((r) => r.group === g.id).map((r) => r.bloodPressure);
      const f = tukeyFences(v);
      const inside = v.filter((x) => x >= f.lower && x <= f.upper);
      return {
        group: `Grup ${g.id}`,
        n: v.length,
        whiskerLow: Math.min(...inside),
        q1: f.q1,
        median: median(v),
        q3: f.q3,
        whiskerHigh: Math.max(...inside),
        outliers: v.filter((x) => x < f.lower || x > f.upper).sort((a, b) => a - b),
      };
    });

  const summary: QualitySummary = {
    observations: rows.length,
    variables: VARIABLES,
    cells,
    outliers: bpCount + bioCount,
    outlierColumns: [
      { column: 'bloodPressure', label: 'Kan basıncı', count: bpCount, lower: bpF.lower, upper: bpF.upper },
      { column: 'biomarker', label: 'Biyobelirteç X', count: bioCount, lower: bioF.lower, upper: bioF.upper },
    ],
    missing: MISSING_COUNT,
    missingRate: (MISSING_COUNT / rows.length) * 100,
    missingColumn: 'gelir_duzeyi',
    integrityBefore: (1 - flaggedCells / cells) * 100,
    integrityAfter: 100,
    removedRows: rows.length - cleaned.length,
    cleanedRows: cleaned.length,
    removedRate: ((rows.length - cleaned.length) / rows.length) * 100,
    shapiroBefore: sw(resBefore),
    shapiroAfter: sw(resAfter),
  };

  return {
    summary,
    // Önizleme: ilk 7 gözlem
    rows: rows.slice(0, 7).map((r) => ({ id: r.id, group: r.group, age: r.age, bloodPressure: r.bloodPressure, income: r.income, biomarker: r.biomarker, outlierIn: r.outlierIn, outlierNote: r.outlierNote })),
    boxes: boxFor(rows),
    boxesCleaned: boxFor(cleaned),
    histBefore: mkHist(resBefore),
    histAfter: mkHist(resAfter),
    skewBefore: skew(resBefore),
    skewAfter: skew(resAfter),
  };
}

let cached: QualityReport | undefined;
export function getQualityReport(): QualityReport {
  return (cached ??= build());
}
