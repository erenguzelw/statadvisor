import { useRef, useState, type DragEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Database, FileUp, FlaskConical, GitBranch, Trash2, Upload } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { QueryView } from '@/components/layout/PageStatus';
import { Button, DataTable, Panel, SectionHeader, StatusChip, StatusLine, Tag, type Column } from '@/components/ui';
import { useActiveDataset, useApp } from '@/context/AppContext';
import type { ColumnInfo, DatasetInfo } from '@/data/api';
import { useDataset, useDatasets, useDeleteAllDatasets, useDeleteDataset, useLoadSample, useSamples, useUploadDataset } from '@/data/hooks';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/cn';
import { columnTypeLabel } from '@/lib/variables';
import { ScaleBuilder } from './ScaleBuilder';
import { ScreenPanel } from './ScreenPanel';

const kb = (b: number) => (b < 1024 * 1024 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);
const typeTone = { continuous: 'primary', ordinal: 'tertiary', categorical: 'secondary' } as const;

function Dropzone({ onFile, busy }: { onFile: (f: File) => void; busy: boolean }) {
  const { t } = useI18n();
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
      <span className="text-body-lg font-semibold text-fg">{t('Excel, SPSS (.sav) ya da CSV dosyanızı buraya bırakın ya da seçin')}</span>
      <span className="max-w-prose text-caption text-fg-subtle">
        {t('.xlsx, .sav, .csv, .tsv veya .txt; en fazla 50 MB. Excel’de ilk çalışma sayfası okunur; SPSS’te değer etiketleri (ör. 1 → Kadın) ve eksik değerler çözülür. Ayraç (virgül, noktalı virgül, sekme) ve ondalık virgül otomatik algılanır. Dosya bu bilgisayardan çıkmaz.')}
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

export function DatasetsPage() {
  const { t, locale } = useI18n();
  const nf = new Intl.NumberFormat(locale);
  const colColumns: Column<ColumnInfo>[] = [
    { key: 'name', header: t('Sütun'), cell: (c) => <span className="font-mono text-data text-fg">{c.name}</span> },
    { key: 'type', header: t('Tür'), cell: (c) => <Tag tone={typeTone[c.type]}>{t(columnTypeLabel[c.type])}{c.likelyId ? ` · ${t('kimlik')}` : ''}</Tag> },
    { key: 'unique', header: t('Farklı değer'), numeric: true, align: 'right', cell: (c) => nf.format(c.unique) },
    { key: 'missing', header: t('Eksik'), numeric: true, align: 'right', cell: (c) => (c.missing ? <span className="text-warning">{nf.format(c.missing)}</span> : '0') },
    { key: 'examples', header: t('Örnekler'), cell: (c) => <span className="text-caption text-fg-muted">{c.examples.join(', ')}</span> },
    { key: 'warn', header: t('Not'), cell: (c) => (c.warnings.length ? <span className="text-caption text-warning">{c.warnings.map((w) => t(w)).join(' ')}</span> : '') },
  ];
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
    const excel = d.convertedFrom === 'xlsx' ? ` ${t('Excel dosyası CSV’ye dönüştürüldü; Python ve R kodu bu CSV’yi okur.')}` : d.convertedFrom === 'sav' ? ` ${t('SPSS dosyası CSV’ye dönüştürüldü; Python ve R kodu bu CSV’yi okur.')}` : '';
    setStatus(
      (d.duplicate ? t('“{name}” zaten yüklüydü; etkin veri seti yapıldı.', { name: d.name }) : t('“{name}” yüklendi ({rows} satır, {cols} sütun).', { name: d.name, rows: nf.format(d.rows), cols: d.columns.length })) + excel,
    );
  };
  const error = upload.error ?? loadSample.error ?? remove.error ?? removeAll.error;

  const dsColumns: Column<DatasetInfo>[] = [
    {
      key: 'name',
      header: t('Veri seti'),
      cell: (d) => (
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-fg">{t(d.name)}</span>
          {d.parentId && (
            <StatusChip status="info">
              <GitBranch size={12} aria-hidden />
              {d.operations?.scales ? t('ölçekli sürüm') : d.operations?.screening ? t('taranmış sürüm') : t('temizlenmiş sürüm')}
            </StatusChip>
          )}
          {d.id === active?.id && <StatusChip status="success">{t('etkin')}</StatusChip>}
        </span>
      ),
    },
    { key: 'size', header: t('Boyut'), numeric: true, align: 'right', cell: (d) => kb(d.size) },
    { key: 'rows', header: t('Satır × sütun'), numeric: true, align: 'right', cell: (d) => `${nf.format(d.rows)} × ${d.columns.length}` },
    { key: 'date', header: t('Yüklenme'), cell: (d) => new Date(d.createdAt).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' }) },
    {
      key: 'actions',
      header: <span className="sr-only">{t('Eylemler')}</span>,
      align: 'right',
      cell: (d) =>
        confirm === d.id ? (
          <span className="inline-flex items-center gap-2">
            <span className="text-caption text-fg-muted">{t('Silinsin mi?')}</span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                remove.mutate(d.id);
                setConfirm(null);
                if (d.id === active?.id) setDatasetId(null);
              }}
            >
              {t('Evet, sil')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>
              {t('Vazgeç')}
            </Button>
          </span>
        ) : (
          <span className="inline-flex gap-2">
            <Button size="sm" variant={d.id === active?.id ? 'tonal' : 'secondary'} icon={d.id === active?.id ? Check : undefined} disabled={d.id === active?.id} onClick={() => setDatasetId(d.id)} aria-label={t('{name} veri setini seç', { name: d.name })}>
              {d.id === active?.id ? t('Seçili') : t('Seç')}
            </Button>
            <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setConfirm(d.id)} aria-label={t('{name} veri setini sil', { name: d.name })}>
              {t('Sil')}
            </Button>
          </span>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        features={['Veri']}
        context={t('Yerel çalışma')}
        title={t('Veri Setleri')}
        description={t('Excel ya da CSV dosyanızı yükleyin ya da örnek bir veri setiyle başlayın. Veriler bu bilgisayarda kalır; hiçbir yere gönderilmez.')}
        actions={
          active && (
            <Button variant="primary" onClick={() => navigate('/karar-sihirbazi')}>
              {t('Analize başla')}
            </Button>
          )
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <Panel className="lg:col-span-7">
          <SectionHeader icon={Upload} title={t('Veri yükle')} description={t('Bir sütun başlığı satırı ve en az iki veri satırı gerekir.')} />
          <Dropzone busy={upload.isPending} onFile={(f) => upload.mutate(f, { onSuccess: done })} />
          <div className="mt-3 min-h-6" aria-live="polite">
            {upload.isPending && <StatusLine status="info">{t('Yükleniyor ve okunuyor…')}</StatusLine>}
            {error && <StatusLine status="danger">{t(error.message)}</StatusLine>}
            {!upload.isPending && !error && status && <StatusLine status="success">{status}</StatusLine>}
          </div>
        </Panel>

        <Panel className="lg:col-span-5">
          <SectionHeader icon={FlaskConical} title={t('Örnek veri setleri')} description={t('Aynı yoldan yüklenir; deneme için kullanın.')} />
          <QueryView query={samples}>
            {(items) => (
              <ul className="flex flex-col gap-3">
                {items.map((s) => (
                  <li key={s.kind} className="flex items-start justify-between gap-3 rounded-card border border-line/30 bg-surface-lowest p-3">
                    <div className="min-w-0">
                      <p className="text-body font-semibold text-fg">{t(s.title)}</p>
                      <p className="text-caption text-fg-muted">{t(s.description)}</p>
                    </div>
                    <Button size="sm" variant="tonal" disabled={loadSample.isPending} onClick={() => loadSample.mutate(s.kind, { onSuccess: done })} aria-label={t('{name} örnek veri setini yükle', { name: t(s.title) })}>
                      {t('Yükle')}
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
          title={t('Yüklenen veri setleri')}
          actions={
            (list.data?.length ?? 0) > 0 &&
            (confirmAll ? (
              <span className="inline-flex flex-wrap items-center justify-end gap-2" role="group" aria-label={t('Tümünü silme onayı')}>
                <span className="text-caption text-fg-muted">{t('Tüm veri setleri ve bağlı kayıtlı analizler silinsin mi?')}</span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    removeAll.mutate(undefined, {
                      onSuccess: () => {
                        setDatasetId(null);
                        setStatus(t('Tüm veri setleri ve bağlı analizler silindi.'));
                        setConfirmAll(false);
                      },
                    })
                  }
                >
                  {t('Evet, tümünü sil')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmAll(false)}>
                  {t('Vazgeç')}
                </Button>
              </span>
            ) : (
              <Button size="sm" variant="secondary" icon={Trash2} onClick={() => setConfirmAll(true)}>
                {t('Tümünü sil')}
              </Button>
            ))
          }
        />
        <QueryView query={list}>
          {(items) =>
            items.length === 0 ? (
              <p className="rounded-card border border-dashed border-line-strong p-6 text-center text-body text-fg-muted">
                {t('Henüz veri seti yok. Yukarıdan bir CSV dosyası yükleyin ya da bir örnek veri seti seçin.')}
              </p>
            ) : (
              <DataTable caption={t('Yüklenen veri setleri')} columns={dsColumns} rows={items} rowKey={(d) => d.id} />
            )
          }
        </QueryView>
      </Panel>

      {active && <ScreenPanel datasetId={active.id} columns={active.columns} />}
      {active && <ScaleBuilder datasetId={active.id} columns={active.columns} />}

      {active && (
        <Panel className="mt-6">
          <SectionHeader
            title={t('Etkin veri seti: {name}', { name: t(active.name) })}
            description={t('{rows} satır, {cols} sütun. Türler otomatik çıkarıldı; analiz sayfalarında sütun seçerken kullanılır.', { rows: nf.format(active.rows), cols: active.columns.length })}
          />
          {active.operations && (
            <div className="mb-4 rounded-card border border-line/30 bg-surface-lowest p-3">
              <p className="mb-1 flex items-center gap-2 text-caption font-semibold text-fg-muted">
                <GitBranch size={14} aria-hidden /> {t('Uygulanan işlemler')}
              </p>
              <ul className="list-disc pl-5 text-caption text-fg-muted">
                {active.operations.log.map((l) => (
                  <li key={l}>{t(l)}</li>
                ))}
              </ul>
            </div>
          )}
          <DataTable caption={t('Sütunlar')} columns={colColumns} rows={active.columns} rowKey={(c) => c.name} density="compact" />
          <QueryView query={detail}>
            {(d) => (
              <div className="mt-6">
                <h3 className="mb-2 text-body font-semibold text-fg">{t('İlk {n} satır', { n: Math.min(20, d.preview.length - 1) })}</h3>
                <DataTable
                  caption={t('Veri önizlemesi')}
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
