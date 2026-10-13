import type { AnalysisResult, AnalysisSpec, DatasetQuality, GeneratedCode } from '@statadvisor/shared';

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
  warnings: string[];
}

export interface DatasetOperations {
  outlierColumns: string[];
  impute: 'none' | 'median' | 'knn';
  removedRows: number;
  imputedCells: number;
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
export type QualityResponse = DatasetQuality;
