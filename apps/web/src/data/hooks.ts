/**
 * Veri katmanı. Sayfalar sunucuya yalnızca bu kancalarla erişir.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CleanRule, ItemStat } from '@statadvisor/shared';
import { getModelReport } from './mocks/models';
import {
  api,
  ApiClientError,
  type AnalysisBody,
  type AnalysisResponse,
  type CodeResponse,
  type ColumnType,
  type DatasetDetail,
  type DatasetInfo,
  type FactorialBody,
  type FactorialResponse,
  type LevelsResponse,
  type LogisticBody,
  type ModelRunBody,
  type ModelRunJob,
  type LogisticResponse,
  type QualityResponse,
  type RegressionBody,
  type RegressionResponse,
  type ReportKind,
  type ReportListItem,
  type SavedReportItem,
  type SavedReportView,
  type SampleInfo,
  type SavedAnalysisListItem,
} from './api';
import { comparisonSnippet } from './mocks/pipeline';

export const keys = {
  datasets: ['datasets'] as const,
  dataset: (id: string | null) => ['dataset', id] as const,
  samples: ['samples'] as const,
  preview: (body: AnalysisBody | null) => ['preview', body] as const,
  analysis: (id: string | null) => ['analysis', id] as const,
  analyses: (datasetId: string | null) => ['analyses', datasetId] as const,
  code: (id: string | null) => ['code', id] as const,
  quality: (id: string | null, params: unknown) => ['quality', id, params] as const,
  cleaningCode: (id: string | null, params: unknown) => ['cleaning-code', id, params] as const,
  models: ['models'] as const,
};

/** 4xx hataları yeniden denemenin anlamı yoktur. */
export const shouldRetry = (count: number, err: Error) => !(err instanceof ApiClientError && err.status >= 400 && err.status < 500) && count < 1;

export function useDatasets() {
  return useQuery({ queryKey: keys.datasets, queryFn: () => api.get<{ datasets: DatasetInfo[] }>('/api/datasets').then((r) => r.datasets) });
}

export function useDataset(id: string | null) {
  return useQuery({ queryKey: keys.dataset(id), queryFn: () => api.get<DatasetDetail>(`/api/datasets/${id}`), enabled: Boolean(id) });
}

export function useSamples() {
  return useQuery({ queryKey: keys.samples, queryFn: () => api.get<{ samples: SampleInfo[] }>('/api/samples').then((r) => r.samples) });
}

function useInvalidateDatasets() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: keys.datasets });
}

export function useUploadDataset() {
  const invalidate = useInvalidateDatasets();
  return useMutation({ mutationFn: (file: File) => api.upload(file), onSuccess: invalidate });
}

export function useLoadSample() {
  const invalidate = useInvalidateDatasets();
  return useMutation({ mutationFn: (kind: string) => api.post<DatasetInfo>(`/api/samples/${kind}`), onSuccess: invalidate });
}

export function useDeleteDataset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/api/datasets/${id}`),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useDeleteAllDatasets() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.del('/api/datasets'),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export interface CleanBody {
  rules: CleanRule[];
  impute: 'none' | 'median' | 'knn';
  /** Grup başına satır kaybını denetlemek için seçili grup sütunu. */
  groupColumn?: string;
  /** %10 üzeri satır kaybında gerekçe ve açık onay. */
  acknowledgement?: { reason: string };
}

export interface ProfileEntry {
  type?: ColumnType | null;
  typeConfirmed?: boolean | null;
  validRange?: { min: number; max: number } | null;
  validCategories?: string[] | null;
}

/** Sütun türü düzeltmesi ve doğrulanmış geçerli değerler; tüm profil birlikte gönderilir. */
export function useUpdateProfile(datasetId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (columns: Record<string, ProfileEntry>) => api.put<DatasetInfo>(`/api/datasets/${datasetId}/profile`, { columns }),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useCleanDataset(datasetId: string | null) {
  const invalidate = useInvalidateDatasets();
  return useMutation({ mutationFn: (body: CleanBody) => api.post<DatasetInfo>(`/api/datasets/${datasetId}/clean`, body), onSuccess: invalidate });
}

export interface ScaleRequest {
  name: string;
  items: string[];
  reverse: string[];
  method: 'mean' | 'sum';
  min: number;
  max: number;
  minValidShare: number;
}

export interface ScaleResultInfo {
  name: string;
  alpha: number | null;
  nAlpha: number;
  itemStats: ItemStat[];
  nValid: number;
  mean: number | null;
  skewness: number | null;
  kurtosis: number | null;
  shapiroW: number | null;
  shapiroP: number | null;
  notes: string[];
}

export function useCreateScales(datasetId: string) {
  const invalidate = useInvalidateDatasets();
  return useMutation({
    mutationFn: (scales: ScaleRequest[]) => api.post<DatasetInfo & { scaleResults: ScaleResultInfo[] }>(`/api/datasets/${datasetId}/scales`, { scales }),
    onSuccess: invalidate,
  });
}

export interface ScreenRequest {
  items: string[];
  straightLine: boolean;
  mahalanobis: boolean;
}

export interface ScreenResultInfo {
  items: number;
  complete: number;
  straightLiners: number[];
  mahalanobis: { row: number; d2: number; p: number }[];
  critical: number | null;
  maxD2: number | null;
  flagged: number[];
  notes: string[];
}

export function useScreen(datasetId: string) {
  return useMutation({ mutationFn: (body: ScreenRequest) => api.post<ScreenResultInfo>(`/api/datasets/${datasetId}/screen`, body) });
}

export function useApplyScreen(datasetId: string) {
  const invalidate = useInvalidateDatasets();
  return useMutation({ mutationFn: (body: ScreenRequest) => api.post<DatasetInfo>(`/api/datasets/${datasetId}/screen/apply`, body), onSuccess: invalidate });
}

export function useScreenCode(datasetId: string) {
  return useMutation({ mutationFn: ({ body, lang = 'python' }: { body: ScreenRequest; lang?: CodeLang }) => api.post<CodeResponse>(`/api/datasets/${datasetId}/screen-code${lang === 'r' ? '?lang=r' : ''}`, body) });
}

export function useScalesCode(datasetId: string) {
  return useMutation({ mutationFn: ({ scales, lang = 'python' }: { scales: ScaleRequest[]; lang?: CodeLang }) => api.post<CodeResponse>(`/api/datasets/${datasetId}/scales-code${lang === 'r' ? '?lang=r' : ''}`, { scales }) });
}

/** Kaydetmeden önizleme: istek tamamsa çalışır, aynı istek için önbellekten döner. */
export function useAnalysisPreview(body: AnalysisBody | null) {
  return useQuery({
    queryKey: keys.preview(body),
    queryFn: () => api.post<AnalysisResponse>('/api/analyses?save=false', body),
    enabled: body !== null,
    retry: shouldRetry,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}

export function useSaveAnalysis() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AnalysisBody) => api.post<AnalysisResponse>('/api/analyses', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['analyses'] });
      void qc.invalidateQueries({ queryKey: ['reports'] });
    },
  });
}

export function useSavedAnalysis(id: string | null) {
  return useQuery({
    queryKey: keys.analysis(id),
    queryFn: () => api.get<AnalysisResponse & { request: AnalysisBody }>(`/api/analyses/${id}`),
    enabled: Boolean(id),
    retry: shouldRetry,
  });
}

export function useAnalyses(datasetId: string | null) {
  return useQuery({
    queryKey: keys.analyses(datasetId),
    queryFn: () => api.get<{ analyses: SavedAnalysisListItem[] }>(`/api/analyses?datasetId=${datasetId}`).then((r) => r.analyses),
    enabled: Boolean(datasetId),
  });
}

export type CodeLang = 'python' | 'r';

export function useAnalysisCode(id: string | null, lang: CodeLang = 'python') {
  return useQuery({ queryKey: [...keys.code(id), lang] as const, queryFn: () => api.get<CodeResponse>(`/api/analyses/${id}/code${lang === 'r' ? '?lang=r' : ''}`), enabled: Boolean(id), retry: shouldRetry });
}

export interface QualityParams {
  value?: string;
  group?: string;
  rules: CleanRule[];
}

function qs(params: Record<string, string | undefined>) {
  const e = Object.entries(params).filter(([, v]) => v !== undefined && v !== '') as [string, string][];
  return e.length ? `?${new URLSearchParams(e).toString()}` : '';
}

export function useQuality(datasetId: string | null, p: QualityParams) {
  return useQuery({
    queryKey: keys.quality(datasetId, p),
    queryFn: () => api.get<QualityResponse>(`/api/datasets/${datasetId}/quality${qs({ value: p.value, group: p.group, rulesJson: JSON.stringify(p.rules) })}`),
    enabled: Boolean(datasetId),
    retry: shouldRetry,
    placeholderData: keepPreviousData,
  });
}

/** Bir sütunun gözlenen değerleri ve sayıları (geçerli kategori seçimi için). */
export function useLevels(datasetId: string | null, column: string | null) {
  return useQuery({
    queryKey: ['levels', datasetId, column] as const,
    queryFn: () => api.get<LevelsResponse>(`/api/datasets/${datasetId}/levels${qs({ column: column ?? undefined })}`),
    enabled: Boolean(datasetId && column),
    retry: shouldRetry,
  });
}

/** Doğrusal regresyon: gövde geçerliyse modeli kurar (sunucuda hesaplanır, kaydedilmez). */
export function useRegression(datasetId: string | null, body: RegressionBody | null) {
  return useQuery({
    queryKey: ['regression', datasetId, body] as const,
    queryFn: () => api.post<RegressionResponse>(`/api/datasets/${datasetId}/regression`, body),
    enabled: Boolean(datasetId && body),
    retry: shouldRetry,
    placeholderData: keepPreviousData,
  });
}

/** Faktöriyel ANOVA: gövde geçerliyse modeli kurar (sunucuda hesaplanır, kaydedilmez). */
export function useFactorial(datasetId: string | null, body: FactorialBody | null) {
  return useQuery({
    queryKey: ['factorial', datasetId, body] as const,
    queryFn: () => api.post<FactorialResponse>(`/api/datasets/${datasetId}/factorial`, body),
    enabled: Boolean(datasetId && body),
    retry: shouldRetry,
    placeholderData: keepPreviousData,
  });
}

/** İkili lojistik regresyon: gövde geçerliyse modeli kurar (sunucuda hesaplanır, kaydedilmez). */
export function useLogistic(datasetId: string | null, body: LogisticBody | null) {
  return useQuery({
    queryKey: ['logistic', datasetId, body] as const,
    queryFn: () => api.post<LogisticResponse>(`/api/datasets/${datasetId}/logistic`, body),
    enabled: Boolean(datasetId && body),
    retry: shouldRetry,
    placeholderData: keepPreviousData,
  });
}

/** Model karşılaştırma işini başlatır (202); ilerleme için useModelRun kullanılır. */
export function useStartModelRun(datasetId: string | null) {
  return useMutation({ mutationFn: (body: ModelRunBody) => api.post<ModelRunJob>(`/api/datasets/${datasetId}/model-runs`, body) });
}

/** İşin durumunu, çalıştığı sürece her 800 ms'de bir yoklar. */
export function useModelRun(jobId: string | null) {
  return useQuery({
    queryKey: ['model-run', jobId] as const,
    queryFn: () => api.get<ModelRunJob>(`/api/model-runs/${jobId}`),
    enabled: Boolean(jobId),
    retry: shouldRetry,
    refetchInterval: (q) => (q.state.data?.status === 'running' ? 800 : false),
  });
}

export function useModelRunCode(jobId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['model-run-code', jobId] as const,
    queryFn: () => api.get<CodeResponse>(`/api/model-runs/${jobId}/code`),
    enabled: Boolean(jobId) && enabled,
    retry: shouldRetry,
    staleTime: Infinity,
  });
}

/** Rapor merkezi: testler ve kaydedilmiş regresyon/lojistik/model raporları tek listede (yeniden eskiye). */
export function useReports(datasetId: string | null) {
  return useQuery({
    queryKey: ['reports', datasetId] as const,
    queryFn: () => api.get<{ reports: ReportListItem[] }>(`/api/reports?datasetId=${datasetId}`).then((r) => r.reports),
    enabled: Boolean(datasetId),
  });
}

export function useSavedReport(id: string | null) {
  return useQuery({ queryKey: ['report', id] as const, queryFn: () => api.get<SavedReportView>(`/api/reports/${id}`), enabled: Boolean(id), retry: shouldRetry });
}

export function useSavedReportCode(id: string | null, enabled: boolean, lang: CodeLang = 'python') {
  return useQuery({ queryKey: ['report-code', id, lang] as const, queryFn: () => api.get<CodeResponse>(`/api/reports/${id}/code${lang === 'r' ? '?lang=r' : ''}`), enabled: Boolean(id) && enabled, retry: shouldRetry, staleTime: Infinity });
}

/** Sonucu rapor merkezine kaydeder (regresyon, lojistik regresyon ya da model karşılaştırma uç noktası). */
export function useSaveToReports() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ url, body }: { url: string; body?: unknown }) => api.post<SavedReportItem>(url, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reports'] }),
  });
}

export function useDeleteReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, kind }: { id: string; kind: ReportKind }) => api.del(kind === 'test' ? `/api/analyses/${id}` : `/api/reports/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['reports'] });
      void qc.invalidateQueries({ queryKey: ['analyses'] });
    },
  });
}

export function useCleaningCode(datasetId: string | null, p: { rules: CleanRule[]; impute: string; lang?: CodeLang }) {
  return useQuery({
    queryKey: keys.cleaningCode(datasetId, p),
    queryFn: () => api.get<CodeResponse>(`/api/datasets/${datasetId}/cleaning-code${qs({ rulesJson: JSON.stringify(p.rules), impute: p.impute, ...(p.lang === 'r' ? { lang: 'r' } : {}) })}`),
    enabled: Boolean(datasetId),
    retry: shouldRetry,
    placeholderData: keepPreviousData,
  });
}

export function useCapabilities() {
  return useQuery({ queryKey: ['capabilities'], queryFn: () => api.get<{ pdf: boolean; docx: boolean; html: boolean }>('/api/capabilities'), staleTime: Infinity });
}

/** Model karşılaştırma: tarayıcıda eğitilen modeller (sentetik, tohumlu veri). */
export function useModelComparison() {
  return useQuery({
    queryKey: keys.models,
    queryFn: () => new Promise<ReturnType<typeof getModelReport> & { pipeline: typeof comparisonSnippet }>((resolve, reject) => setTimeout(() => {
      try {
        resolve({ ...getModelReport(), pipeline: comparisonSnippet });
      } catch (e) {
        reject(e);
      }
    }, import.meta.env.MODE === 'test' ? 0 : 60)),
    staleTime: Infinity,
  });
}
