/**
 * StatAdvisor domain tipleri.
 * Sunucu aşamasında packages/shared altına taşınacak; arayüz yalnızca bu tiplere bağımlıdır.
 */

export type Expertise = 'novice' | 'expert';

/** Uzmanlık seviyesine göre iki farklı anlatım. */
export interface Narrated {
  novice: string;
  expert: string;
}

export interface Dataset {
  id: string;
  fileName: string;
  rows: number;
  columns: number;
}

export interface WizardStep {
  id: string;
  question: string;
  answer: string;
}

export interface DecisionPath {
  /** Kararı belirleyen seçimler, ör. "Amaç: Karşılaştırma". */
  conditions: string[];
  plannedTest: string;
  finalTest: string;
  /** Plan neden değişti; değişmediyse undefined. */
  rerouteReason?: string;
}

export interface AssumptionTest {
  id: string;
  name: string;
  p: number;
  alpha: number;
  passed: boolean;
  verdict: string;
}

export interface HistogramBin {
  x0: number;
  x1: number;
  count: number;
}

export interface DistributionSample {
  bins: HistogramBin[];
  mean: number;
  sd: number;
  skewness: number;
  n: number;
}

export interface Interpretation {
  id: string;
  /** Kanıt olarak gösterilen sayısal çıktı, ör. "p = 0.003". */
  metric: string;
  threshold?: string;
  verdict?: string;
  headline: string;
  /** Sonuç istatistiksel olarak anlamlı mı; sonuç çipinin tonunu belirler. */
  significant?: boolean;
  body: Narrated;
  recommendation?: { label: string; text: string; link?: string };
}

export interface RocPoint {
  fpr: number;
  tpr: number;
}

export interface Model {
  id: string;
  name: string;
  family: string;
  summary: string;
  speed: number;
  interpretability: number;
  accuracy: number;
  f1: number;
  rocAuc: number;
  recommended?: boolean;
  roc: RocPoint[];
  detailAction: string;
}

export type FlagCategory = 'Tip I hata riski' | 'Sınıf dengesizliği' | 'Genellenebilirlik';

export interface RedFlag {
  id: string;
  category: FlagCategory;
  title: string;
  description: string;
  solution: string;
  actionLabel: string;
  resolvedLabel: string;
}

export interface QualitySummary {
  score: number;
  grade: string;
  projectedScore: number;
  observations: number;
  variables: number;
  dataPoints: number;
  outliers: number;
  outlierRate: number;
  outlierColumns: string[];
  missing: number;
  missingRate: number;
  missingColumn: string;
  missingPattern: string;
}

export interface RawRow {
  id: string;
  group: 'A' | 'B' | 'C';
  age: number;
  bloodPressure: number;
  income: number | null;
  biomarker: number;
  /** Aykırı olarak işaretlenen sütun. */
  outlierIn?: 'bloodPressure' | 'biomarker';
  outlierNote?: string;
}

export interface ImputationMethod {
  id: 'median' | 'knn';
  label: string;
  hint: string;
}

export interface BoxStats {
  group: string;
  n: number;
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  outliers: number[];
}

export interface CodeSnippet {
  id: string;
  label: string;
  filename: string;
  runtime: string;
  language: 'python' | 'r';
  code: string;
  output: string[];
  duration?: string;
}

export interface ReportFormat {
  id: 'pdf' | 'docx' | 'html';
  title: string;
  description: string;
  fileName: string;
  size: string;
  pages?: number;
}

export interface AnalysisSummary {
  dataset: Dataset;
  wizard: WizardStep[];
  decision: DecisionPath;
  assumptions: AssumptionTest[];
  distribution: DistributionSample;
  result: Interpretation;
  testStatistic: { name: string; value: number; df: number; p: number; effect: string; effectValue: number; n: number };
}

export interface ReportSection {
  id: string;
  label: string;
  page: number;
}
