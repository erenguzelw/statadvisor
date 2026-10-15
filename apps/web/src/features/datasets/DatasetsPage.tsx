import { useRef, useState, type DragEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Database, FileUp, FlaskConical, GitBranch, Trash2, Upload } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { QueryView } from '@/components/layout/PageStatus';
import { Button, DataTable, Panel, SectionHeader, StatusChip, StatusLine, Tag, type Column } from '@/components/ui';
import { useActiveDataset, useApp } from '@/context/AppContext';
import type { ColumnInfo, DatasetInfo } from '@/data/api';
import { useDataset, useDatasets, useDeleteAllDatasets, useDeleteDataset, useLoadSample, useSamples, useUploadDataset } from '@/data/hooks';
import { cn } from '@/lib/cn';
import { columnTypeLabel } from '@/lib/variables';
import { ScaleBuilder } from './ScaleBuilder';
import { ScreenPanel } from './ScreenPanel';

const nf = new Intl.NumberFormat('tr-TR');
const kb = (b: number) => (b < 1024 * 1024 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);
const typeTone = { continuous: 'primary', ordinal: 'tertiary', categorical: 'secondary' } as const;

function Dropzone({ onFile, busy }: { onFile: (f: File) => void; busy: boolean }) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  };
  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={drop}
      className={cn(
        'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-panel border-2 border-dashed px-6 py-10 text-center transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary',
        over ? 'border-secondary bg-secondary/10' : 'border-line-strong bg-surface-lowest hover:border-primary',
        busy && 'pointer-events-none opacity-60',
      )}
    >
      <FileUp size={32} className="text-primary" aria-hidden />
      <span className="text-body-lg font-semibold text-fg">Excel, SPSS (.sav) ya da CSV dosyanızı buraya bırakın ya da seçin</span>
      <span className="max-w-prose text-caption text-fg-subtle">
        .xlsx, .sav, .csv, .tsv veya .txt; en fazla 50 MB. Excel’de ilk çalışma sayfası okunur; SPSS’te değer etiketleri (ör. 1 → Kadın) ve eksik değerler çözülür. Ayraç (virgül, noktalı virgül, sekme) ve ondalık virgül
        otomatik algılanır. Dosya bu bilgisayardan çıkmaz.
      </span>
      <input
        ref={input}
        type="file"
        accept=".xlsx,.sav,.csv,.tsv,.txt,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
    </label>
  );
}

const colColumns: Column<ColumnInfo>[] = [
  { key: 'name', header: 'Sütun', cell: (c) => <span className="font-mono text-data text-fg">{c.name}</span> },
  { key: 'type', header: 'Tür', cell: (c) => <Tag tone={typeTone[c.type]}>{columnTypeLabel[c.type]}{c.likelyId ? ' · kimlik' : ''}</Tag> },
  { key: 'unique', header: 'Farklı değer', numeric: true, align: 'right', cell: (c) => nf.format(c.unique) },
  { key: 'missing', header: 'Eksik', numeric: true, align: 'right', cell: (c) => (c.missing ? <span className="text-warning">{nf.format(c.missing)}</span> : '0') },
  { key: 'examples', header: 'Örnekler', cell: (c) => <span className="text-caption text-fg-muted">{c.examples.join(', ')}</span> },
  { key: 'warn', header: 'Not', cell: (c) => (c.warnings.length ? <span className="text-caption text-warning">{c.warnings.join(' ')}</span> : '') },
];

export function DatasetsPage() {
  const navigate = useNavigate();
  const { setDatasetId } = useApp();
  const { dataset: active } = useActiveDataset();
  const list = useDatasets();
  const samples = useSamples();
  const upload = useUploadDataset();
  const loadSample = useLoadSample();
  const remove = useDeleteDataset();
  const removeAll = useDeleteAllDatasets();
  const [confirmAll, setConfirmAll] = useState(false);
  const detail = useDataset(active?.id ?? null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('');

  const done = (d: DatasetInfo) => {
    setDatasetId(d.id);
    const excel = d.convertedFrom === 'xlsx' ? ' Excel dosyası CSV’ye dönüştürüldü; Python kodu bu CSV’yi okur.' : d.convertedFrom === 'sav' ? ' SPSS dosyası CSV’ye dönüştürüldü; Python kodu bu CSV’yi okur.' : '';
    setStatus(
      (d.duplicate ? `“${d.name}” zaten yüklüydü; etkin veri seti yapıldı.` : `“${d.name}” yüklendi (${nf.format(d.rows)} satır, ${d.columns.length} sütun).`) + excel,
    );
  };
  const error = upload.error ?? loadSample.error ?? remove.error ?? removeAll.error;

  const dsColumns: Column<DatasetInfo>[] = [
    {
      key: 'name',
      header: 'Veri seti',
      cell: (d) => (
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-fg">{d.name}</span>
          {d.parentId && (
            <StatusChip status="info">
              <GitBranch size={12} aria-hidden />
              {d.operations?.scales ? 'ölçekli sürüm' : d.operations?.screening ? 'taranmış sürüm' : 'temizlenmiş sürüm'}
            </StatusChip>
          )}
          {d.id === active?.id && <StatusChip status="success">etkin</StatusChip>}
        </span>
      ),
    },
    { key: 'size', header: 'Boyut', numeric: true, align: 'right', cell: (d) => kb(d.size) },
    { key: 'rows', header: 'Satır × sütun', numeric: true, align: 'right', cell: (d) => `${nf.format(d.rows)} × ${d.columns.length}` },
    { key: 'date', header: 'Yüklenme', cell: (d) => new Date(d.createdAt).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) },
    {
      key: 'actions',
      header: <span className="sr-only">Eylemler</span>,
      align: 'right',
      cell: (d) =>
        confirm === d.id ? (
          <span className="inline-flex items-center gap-2">
            <span className="text-caption text-fg-muted">Silinsin mi?</span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                remove.mutate(d.id);
                setConfirm(null);
                if (d.id === active?.id) setDatasetId(null);
              }}
            >
              Evet, sil
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>
              Vazgeç
            </Button>
          </span>
        ) : (
          <span className="inline-flex gap-2">
            <Button size="sm" variant={d.id === active?.id ? 'tonal' : 'secondary'} icon={d.id === active?.id ? Check : undefined} disabled={d.id === active?.id} onClick={() => setDatasetId(d.id)} aria-label={`${d.name} veri setini seç`}>
              {d.id === active?.id ? 'Seçili' : 'Seç'}
            </Button>
            <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setConfirm(d.id)} aria-label={`${d.name} veri setini sil`}>
              Sil
            </Button>
          </span>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        features={['Veri']}
        context="Yerel çalışma"
        title="Veri Setleri"
        description="Excel ya da CSV dosyanızı yükleyin ya da örnek bir veri setiyle başlayın. Veriler bu bilgisayarda kalır; hiçbir yere gönderilmez."
        actions={
          active && (
            <Button variant="primary" onClick={() => navigate('/karar-sihirbazi')}>
              Analize başla
            </Button>
          )
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <Panel className="lg:col-span-7">
          <SectionHeader icon={Upload} title="Veri yükle" description="Bir sütun başlığı satırı ve en az iki veri satırı gerekir." />
          <Dropzone busy={upload.isPending} onFile={(f) => upload.mutate(f, { onSuccess: done })} />
          <div className="mt-3 min-h-6" aria-live="polite">
            {upload.isPending && <StatusLine status="info">Yükleniyor ve okunuyor…</StatusLine>}
            {error && <StatusLine status="danger">{error.message}</StatusLine>}
            {!upload.isPending && !error && status && <StatusLine status="success">{status}</StatusLine>}
          </div>
        </Panel>

        <Panel className="lg:col-span-5">
          <SectionHeader icon={FlaskConical} title="Örnek veri setleri" description="Aynı yoldan yüklenir; deneme için kullanın." />
          <QueryView query={samples}>
            {(items) => (
              <ul className="flex flex-col gap-3">
                {items.map((s) => (
                  <li key={s.kind} className="flex items-start justify-between gap-3 rounded-card border border-line/30 bg-surface-lowest p-3">
                    <div className="min-w-0">
                      <p className="text-body font-semibold text-fg">{s.title}</p>
                      <p className="text-caption text-fg-muted">{s.description}</p>
                    </div>
                    <Button size="sm" variant="tonal" disabled={loadSample.isPending} onClick={() => loadSample.mutate(s.kind, { onSuccess: done })} aria-label={`${s.title} örnek veri setini yükle`}>
                      Yükle
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </QueryView>
        </Panel>
      </div>

      <Panel className="mt-6">
        <SectionHeader
          icon={Database}
          title="Yüklenen veri setleri"
          actions={
            (list.data?.length ?? 0) > 0 &&
            (confirmAll ? (
              <span className="inline-flex flex-wrap items-center justify-end gap-2" role="group" aria-label="Tümünü silme onayı">
                <span className="text-caption text-fg-muted">Tüm veri setleri ve bağlı kayıtlı analizler silinsin mi?</span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    removeAll.mutate(undefined, {
                      onSuccess: () => {
                        setDatasetId(null);
                        setStatus('Tüm veri setleri ve bağlı analizler silindi.');
                        setConfirmAll(false);
                      },
                    })
                  }
                >
                  Evet, tümünü sil
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmAll(false)}>
                  Vazgeç
                </Button>
              </span>
            ) : (
              <Button size="sm" variant="secondary" icon={Trash2} onClick={() => setConfirmAll(true)}>
                Tümünü sil
              </Button>
            ))
          }
        />
        <QueryView query={list}>
          {(items) =>
            items.length === 0 ? (
              <p className="rounded-card border border-dashed border-line-strong p-6 text-center text-body text-fg-muted">
                Henüz veri seti yok. Yukarıdan bir CSV dosyası yükleyin ya da bir örnek veri seti seçin.
              </p>
            ) : (
              <DataTable caption="Yüklenen veri setleri" columns={dsColumns} rows={items} rowKey={(d) => d.id} />
            )
          }
        </QueryView>
      </Panel>

      {active && <ScreenPanel datasetId={active.id} columns={active.columns} />}
      {active && <ScaleBuilder datasetId={active.id} columns={active.columns} />}

      {active && (
        <Panel className="mt-6">
          <SectionHeader
            title={`Etkin veri seti: ${active.name}`}
            description={`${nf.format(active.rows)} satır, ${active.columns.length} sütun. Türler otomatik çıkarıldı; analiz sayfalarında sütun seçerken kullanılır.`}
          />
          {active.operations && (
            <div className="mb-4 rounded-card border border-line/30 bg-surface-lowest p-3">
              <p className="mb-1 flex items-center gap-2 text-caption font-semibold text-fg-muted">
                <GitBranch size={14} aria-hidden /> Uygulanan işlemler
              </p>
              <ul className="list-disc pl-5 text-caption text-fg-muted">
                {active.operations.log.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </div>
          )}
          <DataTable caption="Sütunlar" columns={colColumns} rows={active.columns} rowKey={(c) => c.name} density="compact" />
          <QueryView query={detail}>
            {(d) => (
              <div className="mt-6">
                <h3 className="mb-2 text-body font-semibold text-fg">İlk {Math.min(20, d.preview.length - 1)} satır</h3>
                <DataTable
                  caption="Veri önizlemesi"
                  columns={d.preview[0]!.map((h, i): Column<{ i: number; cells: string[] }> => ({ key: `${h}-${i}`, header: h, cell: (r) => <span className="whitespace-nowrap">{r.cells[i] ?? ''}</span> }))}
                  rows={d.preview.slice(1).map((cells, i) => ({ i, cells }))}
                  rowKey={(r) => String(r.i)}
                  density="compact"
                />
              </div>
            )}
          </QueryView>
        </Panel>
      )}
    </>
  );
}
