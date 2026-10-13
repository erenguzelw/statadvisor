/**
 * Veri katmanı. Sayfalar sunucuya yalnızca bu kancalarla erişir.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getModelReport } from './mocks/models';
import {
  api,
  ApiClientError,
  type AnalysisBody,
  type AnalysisResponse,
  type CodeResponse,
  type DatasetDetail,
  type DatasetInfo,
  type QualityResponse,
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

export interface CleanBody {
  outlierColumns: string[];
  impute: 'none' | 'median' | 'knn';
}

export function useCleanDataset(datasetId: string | null) {
  const invalidate = useInvalidateDatasets();
  return useMutation({ mutationFn: (body: CleanBody) => api.post<DatasetInfo>(`/api/datasets/${datasetId}/clean`, body), onSuccess: invalidate });
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['analyses'] }),
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

export function useAnalysisCode(id: string | null) {
  return useQuery({ queryKey: keys.code(id), queryFn: () => api.get<CodeResponse>(`/api/analyses/${id}/code`), enabled: Boolean(id), retry: shouldRetry });
}

export interface QualityParams {
  value?: string;
  group?: string;
  clean?: string[];
}

function qs(params: Record<string, string | undefined>) {
  const e = Object.entries(params).filter(([, v]) => v !== undefined && v !== '') as [string, string][];
  return e.length ? `?${new URLSearchParams(e).toString()}` : '';
}

export function useQuality(datasetId: string | null, p: QualityParams) {
  return useQuery({
    queryKey: keys.quality(datasetId, p),
    queryFn: () => api.get<QualityResponse>(`/api/datasets/${datasetId}/quality${qs({ value: p.value, group: p.group, clean: p.clean?.join(',') })}`),
    enabled: Boolean(datasetId),
    retry: shouldRetry,
    placeholderData: keepPreviousData,
  });
}

export function useCleaningCode(datasetId: string | null, p: { clean: string[]; impute: string }) {
  return useQuery({
    queryKey: keys.cleaningCode(datasetId, p),
    queryFn: () => api.get<CodeResponse>(`/api/datasets/${datasetId}/cleaning-code${qs({ clean: p.clean.join(','), impute: p.impute })}`),
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
