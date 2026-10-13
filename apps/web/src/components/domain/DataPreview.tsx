import { AlertTriangle } from 'lucide-react';
import { DataTable, type Column } from '@/components/ui';
import { cn } from '@/lib/cn';

export type CellState = 'outlier' | 'missing' | undefined;

export interface DataPreviewProps {
  header: string[];
  rows: string[][];
  /** Hücrenin durumu (aykırı / eksik) satır ve sütun dizinine göre belirlenir. */
  cellState: (row: number, col: number) => CellState;
  caption: string;
}

/** Ham veri önizlemesi: aykırı ve eksik hücreler renk + ikon + metinle işaretlenir. */
export function DataPreview({ header, rows, cellState, caption }: DataPreviewProps) {
  const data = rows.map((cells, i) => ({ i, cells }));
  const columns: Column<{ i: number; cells: string[] }>[] = header.map((h, c) => ({
    key: `${h}-${c}`,
    header: h,
    cellClassName: (r) => (cellState(r.i, c) === 'outlier' ? 'bg-danger-bg' : cellState(r.i, c) === 'missing' ? 'bg-warning-bg' : undefined),
    cell: (r) => {
      const s = cellState(r.i, c);
      const v = r.cells[c] ?? '';
      if (s === 'outlier')
        return (
          <span className={cn('inline-flex items-center gap-1 font-semibold whitespace-nowrap text-danger')}>
            {v}
            <AlertTriangle size={12} aria-hidden />
            <span className="sr-only">aykırı değer</span>
          </span>
        );
      if (s === 'missing') return <span className="font-semibold whitespace-nowrap text-warning">eksik</span>;
      return <span className="whitespace-nowrap">{v}</span>;
    },
  }));
  return <DataTable caption={caption} columns={columns} rows={data} rowKey={(r) => String(r.i)} density="compact" />;
}
