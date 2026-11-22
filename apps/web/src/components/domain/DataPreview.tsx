import { AlertTriangle, Search } from 'lucide-react';
import { DataTable, type Column } from '@/components/ui';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/cn';

/** invalid: doğrulanmış kurala göre geçersiz; extreme: incelenecek uç değer; missing: eksik. */
export type CellState = 'invalid' | 'extreme' | 'missing' | undefined;

export interface DataPreviewProps {
  header: string[];
  rows: string[][];
  /** Hücrenin durumu (geçersiz / uç değer / eksik) satır ve sütun dizinine göre belirlenir. */
  cellState: (row: number, col: number) => CellState;
  caption: string;
}

/** Ham veri önizlemesi: geçersiz, uç ve eksik hücreler renk + ikon + metinle işaretlenir (yalnızca renge dayanmaz). */
export function DataPreview({ header, rows, cellState, caption }: DataPreviewProps) {
  const { t } = useI18n();
  const data = rows.map((cells, i) => ({ i, cells }));
  const columns: Column<{ i: number; cells: string[] }>[] = header.map((h, c) => ({
    key: `${h}-${c}`,
    header: h,
    cellClassName: (r) => {
      const s = cellState(r.i, c);
      return s === 'invalid' ? 'bg-danger-bg' : s === 'extreme' ? 'bg-info-bg' : s === 'missing' ? 'bg-warning-bg' : undefined;
    },
    cell: (r) => {
      const s = cellState(r.i, c);
      const v = r.cells[c] ?? '';
      if (s === 'invalid')
        return (
          <span className={cn('inline-flex items-center gap-1 font-semibold whitespace-nowrap text-danger')}>
            {v}
            <AlertTriangle size={12} aria-hidden />
            <span className="sr-only">{t('geçersiz hücre')}</span>
          </span>
        );
      if (s === 'extreme')
        return (
          <span className={cn('inline-flex items-center gap-1 font-semibold whitespace-nowrap text-info')}>
            {v}
            <Search size={12} aria-hidden />
            <span className="sr-only">{t('incelenecek uç değer')}</span>
          </span>
        );
      if (s === 'missing') return <span className="font-semibold whitespace-nowrap text-warning">{t('eksik')}</span>;
      return <span className="whitespace-nowrap">{v}</span>;
    },
  }));
  return <DataTable caption={caption} columns={columns} rows={data} rowKey={(r) => String(r.i)} density="compact" />;
}
