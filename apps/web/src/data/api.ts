import type { AnalysisResult, AnalysisSpec, CleanRule, DatasetQuality, GeneratedCode, RegressionNarrative, RegressionResult, RegressionSpec } from '@statadvisor/shared';

/** Sunucuya gönderilen analiz isteği. */
export type AnalysisBody = AnalysisSpec & { datasetId: string };

/** Sunucudan gelen, kullanıcıya gösterilebilir hata. */
export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const NETWORK_MESSAGE = 'Sunucuya ulaşılamıyor. Uygulamayı kökten `npm run dev` ile başlattığınızdan emin olun (arayüz ve sunucu birlikte çalışır).';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiClientError(0, 'network', NETWORK_MESSAGE);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    // Vekil sunucu API'ye bağlanamadığında HTML/boş yanıt döner.
    throw new ApiClientError(res.status, res.status >= 500 ? 'network' : 'bad_response', res.status >= 500 ? NETWORK_MESSAGE : 'Sunucudan beklenmeyen bir yanıt geldi.');
  }
  if (!res.ok) {
    const e = (data as { error?: { code?: string; message?: string } } | undefined)?.error;
    throw new ApiClientError(res.status, e?.code ?? 'error', e?.message ?? `İstek başarısız oldu (${res.status}).`);
  }
  return data as T;
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, json('POST', body ?? {})),
  put: <T>(path: string, body?: unknown) => request<T>(path, json('PUT', body ?? {})),
  del: (path: string) => request<void>(path, { method: 'DELETE' }),
  upload: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<DatasetInfo>('/api/datasets', { method: 'POST', body: form });
  },
};

export type ColumnType = 'continuous' | 'ordinal' | 'categorical';

export interface ColumnInfo {
  name: string;
  type: ColumnType;
  numeric: boolean;
  unique: number;
  missing: number;
  examples: string[];
  likelyId: boolean;
  prefixCoded?: boolean;
  rankLabels?: string[] | null;
  warnings: string[];
  /** Dosyadan çıkarılan tür; `type` kullanıcının düzeltmesini de içerir. */
  inferredType?: ColumnType;
  typeOverridden?: boolean;
  /** Kullanıcı sütun türünü kaydederek onayladı; onaylanmadıysa tür yalnızca dosyadan çıkarılmıştır. */
  typeConfirmed?: boolean;
  /** Ölçek toplam/ortalama puanı (tek bir madde değil). */
  score?: boolean;
  /** Kullanıcının doğruladığı geçerlilik kuralları. */
  profile?: { validRange: { min: number; max: number } | null; validCategories: string[] | null };
  /** Ölçek tanımından gelen beklenen aralık (kullanıcının ölçeği tanımlarken girdiği min/maks). */
  scaleRange?: { min: number; max: number } | null;
}

export interface OperationLoss {
  level: 'none' | 'review' | 'confirm';
  worstRate: number;
  worstScope: string;
  reviewThreshold: number;
  confirmThreshold: number;
  groups: { group: string; n: number; removed: number; rate: number }[] | null;
}

export interface DatasetOperations {
  kind?: string;
  rules?: CleanRule[];
  outlierColumns?: string[];
  impute?: 'none' | 'median' | 'knn';
  groupColumn?: string | null;
  removedRows?: number;
  removedRate?: number;
  setMissingCells?: number;
  imputedCells?: number;
  scales?: unknown;
  screening?: unknown;
  loss?: OperationLoss;
  acknowledgement?: { reason: string } | null;
  /** Bu sürümden önceki işlemler (en eskiden en yeniye). */
  history?: { dataset: string; createdAt: string; operations: Omit<DatasetOperations, 'history'> }[];
  log: string[];
}

export interface DatasetInfo {
  id: string;
  name: string;
  size: number;
  rows: number;
  columns: ColumnInfo[];
  createdAt: string;
  parentId: string | null;
  operations: DatasetOperations | null;
  duplicate?: boolean;
  /** Yükleme sırasında CSV'ye dönüştürülen özgün biçim. */
  convertedFrom?: 'xlsx';
}

export interface DatasetDetail extends DatasetInfo {
  delimiter: string;
  /** Başlık dahil ilk 21 satırın ham metni. */
  preview: string[][];
}

export interface SampleInfo {
  kind: string;
  title: string;
  description: string;
  fileName: string;
}

export interface EngineInfo {
  app: string;
  node: string;
  engine: string;
  engineName: string;
  ruleSet: string;
  referenceSuite: { scipy: string; cases: number };
}

export interface AnalysisResponse {
  /** Kaydedilmemiş önizlemede null. */
  id: string | null;
  datasetId: string;
  createdAt: string;
  inputHash: string;
  engine: EngineInfo;
  result: AnalysisResult;
}

export interface SavedAnalysisListItem {
  id: string;
  datasetId: string;
  createdAt: string;
  test: string;
  p: number | null;
  significant: boolean;
  inputHash: string;
  request: AnalysisBody;
}

export type CodeResponse = GeneratedCode;
export interface LevelsResponse {
  column: string;
  total: number;
  truncated: boolean;
  levels: { value: string; count: number }[];
}

/** Regresyon isteği: seçilen sütunlar ve (isteğe bağlı) referans düzeyler. */
export interface RegressionBody {
  dependent: string;
  numeric: string[];
  categorical: string[];
  alpha: number;
  reference?: Record<string, string>;
}

export interface RegressionResponse {
  datasetId: string;
  datasetName: string;
  spec: RegressionSpec;
  result: Omit<RegressionResult, 'fitted' | 'residuals' | 'cooks' | 'leverage' | 'usedRows'>;
  narrative: RegressionNarrative;
  model: [string, string][];
  coefficients: { header: string[]; rows: string[][] };
  /** Kalıntı grafiği için (eşit aralıklı seçilmiş) noktalar. */
  plot: { fitted: number[]; residuals: number[]; step: number };
  code: GeneratedCode;
}

export type QualityResponse = DatasetQuality;
