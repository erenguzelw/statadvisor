import type { ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import type { UseQueryResult } from '@tanstack/react-query';
import { Button } from '@/components/ui';
import { useT } from '@/i18n';

function Skeleton() {
  const t = useT();
  return (
    <div aria-busy="true" aria-label={t('Analiz yükleniyor')} className="flex flex-col gap-6">
      <div className="h-24 max-w-2xl animate-pulse rounded-panel bg-surface" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="h-96 animate-pulse rounded-panel bg-surface lg:col-span-5" />
        <div className="h-96 animate-pulse rounded-panel bg-surface lg:col-span-7" />
      </div>
    </div>
  );
}

/** Sorgu durumuna göre iskelet, hata ya da içerik gösterir. */
export function QueryView<T>({ query, children }: { query: UseQueryResult<T>; children: (data: T) => ReactNode }) {
  const t = useT();
  if (query.isPending) return <Skeleton />;
  if (query.isError)
    return (
      <div role="alert" className="flex flex-col items-start gap-4 rounded-panel border border-danger/30 bg-danger-bg p-6">
        <p className="flex items-center gap-2 text-heading font-semibold text-danger">
          <AlertTriangle size={20} aria-hidden />
          {t('Analiz verisi yüklenemedi')}
        </p>
        <p className="text-body text-fg-muted">{query.error.message}. {t('Veri setinin erişilebilir olduğunu kontrol edip tekrar deneyin.')}</p>
        <Button icon={RefreshCw} onClick={() => query.refetch()}>
          {t('Tekrar dene')}
        </Button>
      </div>
    );
  return <>{children(query.data)}</>;
}
