import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface Column<Row> {
  key: string;
  header: ReactNode;
  cell: (row: Row) => ReactNode;
  align?: 'left' | 'right' | 'center';
  /** Hücreye ek sınıf (ör. aykırı değer vurgusu). */
  cellClassName?: (row: Row) => string | undefined;
  /** Mono + tabular sayı. */
  numeric?: boolean;
  width?: string;
}

export interface DataTableProps<Row> {
  caption: string;
  hideCaption?: boolean;
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  isRowHighlighted?: (row: Row) => boolean;
  density?: 'compact' | 'comfortable';
  className?: string;
}

const alignClass = { left: 'text-left', right: 'text-right', center: 'text-center' };

export function DataTable<Row>({
  caption,
  hideCaption = true,
  columns,
  rows,
  rowKey,
  isRowHighlighted,
  density = 'comfortable',
  className,
}: DataTableProps<Row>) {
  const pad = density === 'compact' ? 'px-3 py-2' : 'px-4 py-3';
  return (
    <div
      role="region"
      aria-label={caption}
      tabIndex={0}
      className={cn('relative overflow-x-auto rounded-card border border-line/30', className)}
    >
      <table className="w-full border-collapse text-body">
        <caption className={cn('text-left text-caption text-fg-subtle', hideCaption && 'sr-only')}>{caption}</caption>
        <thead className="bg-surface-lowest">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                style={c.width ? { width: c.width } : undefined}
                className={cn(pad, 'text-caption font-medium whitespace-nowrap text-fg-subtle', alignClass[c.align ?? 'left'])}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const highlighted = isRowHighlighted?.(row);
            return (
              <tr
                key={rowKey(row)}
                aria-selected={highlighted || undefined}
                className={cn(
                  'border-t border-line/20 even:bg-[#162032]',
                  highlighted && 'bg-primary-strong/10! outline outline-1 -outline-offset-1 outline-primary-strong/40',
                )}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      pad,
                      'align-middle',
                      alignClass[c.align ?? 'left'],
                      c.numeric && 'font-mono text-data tabular',
                      c.cellClassName?.(row),
                    )}
                  >
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
