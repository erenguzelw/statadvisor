/**
 * StatAdvisor domain tipleri.
 * Sunucu aşamasında packages/shared altına taşınacak; arayüz yalnızca bu tiplere bağımlıdır.
 */
import type { AssumptionInput, WizardAnswers } from './decision.ts';

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

export interface DecisionPath {
  /** Kararı belirleyen seçimler, ör. "Amaç: Karşılaştırma". */
  conditions: string[];
  plannedTest: string;
  finalTest: string;
  /** Plan neden değişti; değişmediyse undefined. */
  rerouteReason?: string;
  /** Yöntemsel uyarılar (ön test sınırlamaları, bağımsızlık, örneklem büyüklüğü). */
  warnings: string[];
}

export interface AssumptionTest {
  id: string;
  name: string;
  /** Testin neye uygulandığı, ör. "grup içi kalıntılar, n = 45". */
  subject: string;
  /** Test istatistiği, ör. "W = 0.919". */
  statistic: string;
  p: number;
  alpha: number;
  passed: boolean;
  verdict: string;
  /** "Bu ne demek?" açıklaması; seviyeye göre iki anlatım. */
  explain: Narrated;
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

export interface GroupDescriptive {
  group: string;
  n: number;
  median: number;
  mean: number;
  sd: number;
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

export interface ModelMetrics {
  /** Test seti doğruluğu (0–1). */
  accuracy: number;
  trainAccuracy: number;
  /** Azınlık (pozitif) sınıf için, 0.5 eşiğinde. */
  precision: number;
  recall: number;
  f1: number;
  rocAuc: number;
  /** Ortalama kesinlik (PR-AUC). */
  prAuc: number;
}

export interface Model {
  id: string;
  name: string;
  family: string;
  summary: string;
  /** 1–5 niteliksel değerlendirme; ölçüm değildir. */
  speedRating: number;
  interpretabilityRating: number;
  metrics: ModelMetrics;
  roc: RocPoint[];
  recommended?: boolean;
  detailAction: string;
}

export interface ModelDataFacts {
  rows: number;
  positives: number;
  features: number;
  testRows: number;
  testPositives: number;
  /** Test setinde, hep çoğunluk sınıfını tahmin eden modelin doğruluğu (0–1). */
  baselineAccuracy: number;
  /** PR-AUC için rastgele sıralamanın beklenen değeri (pozitif oranı). */
  prevalence: number;
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

export interface OutlierColumn {
  column: 'bloodPressure' | 'biomarker';
  label: string;
  count: number;
  lower: number;
  upper: number;
}

export interface QualitySummary {
  observations: number;
  variables: number;
  /** Sayısal hücre sayısı (satır × sayısal sütun). */
  cells: number;
  outliers: number;
  outlierColumns: OutlierColumn[];
  missing: number;
  missingRate: number;
  missingColumn: string;
  /** Temiz hücre oranı (%): 1 − (aykırı + eksik) / hücre. */
  integrityBefore: number;
  integrityAfter: number;
  removedRows: number;
  cleanedRows: number;
  removedRate: number;
  shapiroBefore: { W: number; p: number };
  shapiroAfter: { W: number; p: number };
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
  /** Tukey bıyıkları: sınırlar içindeki en uç gözlemler. */
  whiskerLow: number;
  q1: number;
  median: number;
  q3: number;
  whiskerHigh: number;
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
}

export interface ReportFormat {
  id: 'html' | 'print' | 'word';
  title: string;
  description: string;
  fileName: string;
}

export interface AnalysisSummary {
  dataset: Dataset;
  /** Sihirbazın varsayılan yanıtları ve hangilerinin veriden çıkarıldığı. */
  defaultAnswers: WizardAnswers;
  inferred: (keyof WizardAnswers)[];
  decision: DecisionPath;
  assumptions: AssumptionTest[];
  assumptionInput: AssumptionInput;
  distribution: DistributionSample;
  descriptives: GroupDescriptive[];
  result: Interpretation;
  testStatistic: { name: string; value: number; df: number; p: number; effect: string; effectValue: number; n: number };
}

export interface ReportSection {
  id: string;
  label: string;
}
