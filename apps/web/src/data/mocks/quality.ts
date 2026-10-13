import type { BoxStats, HistogramBin, ImputationMethod, QualitySummary, RawRow } from '../types';

export const qualitySummary: QualitySummary = {
  score: 88,
  grade: 'B',
  projectedScore: 99,
  observations: 1420,
  variables: 8,
  dataPoints: 11360,
  outliers: 14,
  outlierRate: 0.99,
  outlierColumns: ['Tansiyon', 'Yaş'],
  missing: 60,
  missingRate: 4.2,
  missingColumn: 'gelir_duzeyi',
  missingPattern: 'MCAR (tamamen rastlantısal)',
};

export const rawRows: RawRow[] = [
  { id: '#001', group: 'A', age: 42, bloodPressure: 122.4, income: 38500, biomarker: 4.12 },
  { id: '#002', group: 'B', age: 39, bloodPressure: 248.0, income: 44200, biomarker: 3.88, outlierIn: 'bloodPressure', outlierNote: 'IQR > 3.0' },
  { id: '#003', group: 'A', age: 58, bloodPressure: 134.1, income: 51000, biomarker: 5.04 },
  { id: '#004', group: 'C', age: 47, bloodPressure: 118.0, income: null, biomarker: 4.45 },
  { id: '#005', group: 'B', age: 51, bloodPressure: 129.5, income: 62800, biomarker: 3.9 },
  { id: '#006', group: 'C', age: 64, bloodPressure: 142.2, income: 29100, biomarker: 18.9, outlierIn: 'biomarker', outlierNote: 'Uç değer' },
  { id: '#007', group: 'A', age: 33, bloodPressure: 115.8, income: null, biomarker: 4.01 },
];

export const imputationMethods: ImputationMethod[] = [
  { id: 'median', label: 'Medyan ile doldurma', hint: 'Hızlı' },
  { id: 'knn', label: 'KNN imputasyon (k=5)', hint: 'Hassas' },
];

export const groupBoxes: BoxStats[] = [
  { group: 'Grup A', n: 472, min: 104, q1: 116, median: 123, q3: 131, max: 142, outliers: [] },
  { group: 'Grup B', n: 480, min: 108, q1: 121, median: 129, q3: 137, max: 150, outliers: [248] },
  { group: 'Grup C', n: 468, min: 112, q1: 125, median: 133, q3: 141, max: 155, outliers: [] },
];

/** Temizleme sonrası yaklaşık normal dağılım. */
export const cleanedBins: HistogramBin[] = [3, 7, 14, 24, 34, 40, 33, 22, 13, 6, 3].map((count, i) => ({
  x0: i,
  x1: i + 1,
  count,
}));

export const cleanedStats = { shapiroP: 0.082, skewness: 0.14, validRows: 1406 };
