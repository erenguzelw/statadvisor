/**
 * Veri katmanı. Sayfalar veriye yalnızca bu hook'lar üzerinden erişir.
 * Sunucu aşamasında `fetcher` gerçek API çağrılarıyla değiştirilecek; sayfalar değişmeyecek.
 */
import { useQuery } from '@tanstack/react-query';
import { analysis, datasets } from './mocks/analysis';
import { getModelReport } from './mocks/models';
import { getQualityReport, imputationMethods } from './mocks/quality';
import {
  apaSummary,
  citation,
  cleaningSnippet,
  comparisonSnippet,
  imputationCode,
  reportFormats,
  reportSections,
  requirements,
  snippets,
} from './mocks/code';

const LATENCY_MS = import.meta.env.MODE === 'test' ? 0 : 120;

function mock<T>(compute: () => T): Promise<T> {
  return new Promise((resolve, reject) =>
    setTimeout(() => {
      try {
        resolve(compute());
      } catch (e) {
        reject(e);
      }
    }, LATENCY_MS),
  );
}

export const queryKeys = {
  datasets: ['datasets'] as const,
  analysis: (datasetId: string) => ['analysis', datasetId] as const,
  models: (datasetId: string) => ['models', datasetId] as const,
  quality: (datasetId: string) => ['quality', datasetId] as const,
  codeReport: (datasetId: string) => ['code-report', datasetId] as const,
};

export function useDatasets() {
  return useQuery({ queryKey: queryKeys.datasets, queryFn: () => mock(() => datasets) });
}

export function useAnalysis(datasetId: string) {
  return useQuery({ queryKey: queryKeys.analysis(datasetId), queryFn: () => mock(() => analysis) });
}

/** Modeller bu çağrıda (ilk kullanımda) gerçekten eğitilir; sonuç bellekte tutulur. */
export function useModelComparison(datasetId: string) {
  return useQuery({
    queryKey: queryKeys.models(datasetId),
    queryFn: () => mock(() => ({ ...getModelReport(), pipeline: comparisonSnippet })),
  });
}

export function useDataQuality(datasetId: string) {
  return useQuery({
    queryKey: queryKeys.quality(datasetId),
    queryFn: () => mock(() => ({ ...getQualityReport(), imputationMethods, cleaningSnippet, imputationCode })),
  });
}

export function useCodeReport(datasetId: string) {
  return useQuery({
    queryKey: queryKeys.codeReport(datasetId),
    queryFn: () => mock(() => ({ snippets, reportFormats, apaSummary, citation, reportSections, requirements, analysis })),
  });
}
