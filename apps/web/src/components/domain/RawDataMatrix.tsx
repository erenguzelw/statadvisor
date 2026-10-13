import { AlertTriangle } from 'lucide-react';
import type { RawRow } from '@/data/types';
import { DataTable, StatusChip, type Column } from '@/components/ui';

const nf = new Intl.NumberFormat('tr-TR');

function rowStatus(row: RawRow) {
  if (row.outlierIn) return <StatusChip status="danger">Aykırı</StatusChip>;
  if (row.income === null) return <StatusChip status="warning">Eksik</StatusChip>;
  return <StatusChip status="success">Temiz</StatusChip>;
}

function OutlierValue({ value, note }: { value: number; note?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-semibold whitespace-nowrap text-danger">
      {value.toFixed(value < 50 ? 2 : 1)}
      <AlertTriangle size={13} aria-hidden />
      <span className="sr-only">aykırı değer,</span>
      <span className="text-caption font-normal">{note}</span>
    </span>
  );
}

const outlierCell = 'bg-danger-bg';

export function RawDataMatrix({ rows }: { rows: RawRow[] }) {
  const columns: Column<RawRow>[] = [
    { key: 'id', header: 'ID', numeric: true, cell: (r) => <span className="text-fg-subtle">{r.id}</span> },
    { key: 'group', header: 'Grup', cell: (r) => <span className="whitespace-nowrap">Grup {r.group}</span> },
    { key: 'age', header: 'Yaş', numeric: true, align: 'right', cell: (r) => r.age },
    {
      key: 'bp',
      header: 'Kan basıncı (mmHg)',
      numeric: true,
      align: 'right',
      cellClassName: (r) => (r.outlierIn === 'bloodPressure' ? outlierCell : undefined),
      cell: (r) => (r.outlierIn === 'bloodPressure' ? <OutlierValue value={r.bloodPressure} note={r.outlierNote} /> : r.bloodPressure.toFixed(1)),
    },
    {
      key: 'income',
      header: 'Gelir düzeyi (TL)',
      numeric: true,
      align: 'right',
      cellClassName: (r) => (r.income === null ? 'bg-warning-bg' : undefined),
      cell: (r) =>
        r.income === null ? <span className="font-semibold text-warning">NaN · eksik</span> : nf.format(r.income),
    },
    {
      key: 'bio',
      header: 'Biyobelirteç X',
      numeric: true,
      align: 'right',
      cellClassName: (r) => (r.outlierIn === 'biomarker' ? outlierCell : undefined),
      cell: (r) => (r.outlierIn === 'biomarker' ? <OutlierValue value={r.biomarker} note={r.outlierNote} /> : r.biomarker.toFixed(2)),
    },
    { key: 'status', header: 'Durum', cell: rowStatus },
  ];
  return <DataTable caption="Ham veri matrisi, ilk 7 gözlem" columns={columns} rows={rows} rowKey={(r) => r.id} density="compact" />;
}
