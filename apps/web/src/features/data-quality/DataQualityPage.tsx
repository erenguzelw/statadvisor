import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, BarChart3, Database, Download, Filter, GitFork, HelpCircle, ShieldCheck, Sparkles, Table2, TriangleAlert, Wrench } from 'lucide-react';
import { formatP, type DatasetQuality } from '@statadvisor/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { QueryView } from '@/components/layout/PageStatus';
import {
  Button,
  Callout,
  CheckboxGroup,
  CodeBlock,
  DataTable,
  MetricTile,
  Panel,
  RadioCardGroup,
  SectionHeader,
  SegmentedControl,
  Select,
  StatusChip,
  StatusLine,
  Tag,
  type Column,
} from '@/components/ui';
import { BoxPlotGroup, HistogramWithNormal } from '@/components/charts';
import { DataPreview } from '@/components/domain';
import { useActiveDataset, useApp } from '@/context/AppContext';
import type { ColumnInfo, DatasetInfo } from '@/data/api';
import { useCleanDataset, useCleaningCode, useDataset, useQuality } from '@/data/hooks';
import { columnTypeLabel, groupColumns, numericColumns } from '@/lib/variables';

const nf = new Intl.NumberFormat('tr-TR');
const fmt1 = (x: number) => x.toFixed(1);
const MISSING = new Set(['', 'na', 'n/a', 'nan', 'null', 'none', '-', '?', '#n/a']);
const KNN_MAX = 5000;

export function DataQualityPage() {
  const { dataset, loading, error } = useActiveDataset();
  const [created, setCreated] = useState<DatasetInfo | null>(null);
  if (loading) return <p className="text-fg-muted">Yükleniyor…</p>;
  if (error) return <StatusLine status="danger">{error.message}</StatusLine>;
  if (!dataset) {
    return (
      <>
        <PageHeader features={['Özellik 08']} title="Veri Kalitesi, Aykırı ve Eksik Değerler" description="Sorunlu hücreleri bulun ve düzeltilmiş bir veri sürümü oluşturun." />
        <Callout tone="info" icon={Database} title="Önce bir veri seti seçin" actions={<Link className="rounded-control bg-primary-strong px-4 py-2 font-semibold text-on-primary-strong" to="/veri">Veri setlerine git</Link>}>
          Kalite analizi için bir CSV dosyası yükleyin ya da örnek bir veri setiyle başlayın.
        </Callout>
      </>
    );
  }
  // Temizlenmiş sürüm etkin olunca sayfa yeniden kurulur; başarı bilgisi bu üst bileşende tutulur.
  return <Quality key={dataset.id} dataset={dataset} created={created} onCreated={setCreated} />;
}

type ColRow = DatasetQuality['columns'][number] & { info?: ColumnInfo };

function Quality({ dataset, created, onCreated }: { dataset: DatasetInfo; created: DatasetInfo | null; onCreated: (d: DatasetInfo) => void }) {
  const navigate = useNavigate();
  const { setDatasetId } = useApp();
  const cols = dataset.columns;
  const nums = numericColumns(cols);
  const groups = groupColumns(cols);
  const [value, setValue] = useState<string | undefined>(() => (nums.find((c) => c.type === 'continuous') ?? nums[0])?.name);
  const [group, setGroup] = useState<string | undefined>(() => groups.find((c) => !c.numeric && c.name !== value)?.name ?? groups.find((c) => c.name !== value)?.name);
  const [cleanSel, setCleanSel] = useState<string[] | null>(null);
  const [impute, setImpute] = useState<'none' | 'median' | 'knn'>('median');
  const [view, setView] = useState<'before' | 'after'>('before');

  const cleanList = cleanSel ?? nums.map((c) => c.name);
  const quality = useQuality(dataset.id, { value, group, clean: cleanList });
  const code = useCleaningCode(dataset.id, { clean: cleanList, impute });
  const detail = useDataset(dataset.id);
  const clean = useCleanDataset(dataset.id);
  const knnOk = dataset.rows <= KNN_MAX;

  const create = () =>
    clean.mutate(
      { outlierColumns: cleanList, impute },
      {
        onSuccess: (d) => {
          onCreated(d);
          setDatasetId(d.id);
        },
      },
    );

  return (
    <>
      <PageHeader
        features={['Özellik 08']}
        context={<span className="font-mono">{dataset.name}</span>}
        title="Veri Kalitesi, Aykırı ve Eksik Değerler"
        description="Sorunlu hücreler Tukey sınırlarıyla işaretlenir; düzeltmeler uygulanmadan önce sonuçları nasıl etkileyeceği gösterilir. Ham veri değişmez: temizleme yeni bir veri sürümü üretir."
        actions={
          <Button variant="primary" icon={Sparkles} disabled={clean.isPending || (cleanList.length === 0 && impute === 'none')} onClick={create}>
            {clean.isPending ? 'Oluşturuluyor…' : 'Temizlenmiş sürümü oluştur'}
          </Button>
        }
      />
      {clean.error && <StatusLine status="danger" className="mb-4">{clean.error.message}</StatusLine>}
      {created && (
        <Callout
          tone="success"
          icon={ShieldCheck}
          title={created.duplicate ? 'Bu temizlenmiş sürüm zaten vardı' : 'Temizlenmiş sürüm oluşturuldu ve etkin veri seti yapıldı'}
          actions={
            <Button variant="primary" iconEnd={ArrowRight} onClick={() => navigate('/karar-sihirbazi')}>
              Hipotez testine geç
            </Button>
          }
          className="mb-6"
        >
          <span className="font-semibold">{created.name}</span>: {nf.format(created.rows)} satır.
          {created.operations && <span className="mt-1 block text-body text-fg-muted">{created.operations.log.join(' ')}</span>}
        </Callout>
      )}

      <Panel className="mb-6">
        <SectionHeader title="İncelenecek sütunlar" level={3} description="Kutu grafiği ve normallik önizlemesi seçilen sütun ve grup üzerinden hesaplanır." />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select label="Sonuç sütunu (sayısal)" value={value} onChange={setValue} options={nums.map((c) => ({ value: c.name, label: `${c.name} · ${columnTypeLabel[c.type]}` }))} />
          <Select label="Grup sütunu" value={group} onChange={setGroup} options={groups.filter((c) => c.name !== value).map((c) => ({ value: c.name, label: `${c.name} · ${columnTypeLabel[c.type]}` }))} />
        </div>
      </Panel>

      <QueryView query={quality}>
        {(q) => {
          const after = view === 'after';
          const flagged = (after ? 0 : q.outlierCells) + (after && impute !== 'none' ? 0 : q.missingCells);
          const integrity = after && impute !== 'none' ? q.integrityAfter : (1 - flagged / Math.max(1, q.cells)) * 100;
          const f = q.focus;
          const shapiro = f ? (after ? f.shapiroAfter : f.shapiroBefore) : null;
          const hist = f ? (after ? f.histAfter : f.histBefore) : null;
          const skew = f ? (after ? f.skewAfter : f.skewBefore) : 0;

          const colRows: ColRow[] = q.columns.map((c) => ({ ...c, info: cols.find((x) => x.name === c.name) }));
          const colColumns: Column<ColRow>[] = [
            { key: 'name', header: 'Sütun', cell: (c) => <span className="font-mono text-data text-fg">{c.name}</span> },
            { key: 'type', header: 'Tür', cell: (c) => (c.info ? columnTypeLabel[c.info.type] : '') },
            { key: 'missing', header: 'Eksik', numeric: true, align: 'right', cell: (c) => (c.missing ? `${nf.format(c.missing)} (%${c.missingRate.toFixed(1)})` : '0') },
            { key: 'out', header: 'Aykırı', numeric: true, align: 'right', cell: (c) => (c.skipped ? '–' : nf.format(c.outliers)) },
            { key: 'bounds', header: 'Tukey sınırları', numeric: true, align: 'right', cell: (c) => (c.lower === undefined ? '–' : `${c.lower.toFixed(1)} – ${c.upper!.toFixed(1)}`) },
          ];

          const fences = new Map(q.columns.filter((c) => c.lower !== undefined).map((c) => [c.name, c]));
          const pv = detail.data;
          const delimiter = pv?.delimiter ?? ',';
          const state = (r: number, c: number) => {
            const tok = (pv?.preview[r + 1]?.[c] ?? '').trim();
            if (MISSING.has(tok.toLowerCase())) return 'missing' as const;
            const fe = fences.get(pv?.preview[0]?.[c] ?? '');
            if (!fe || !q.cleanColumns.includes(fe.name)) return undefined;
            const n = Number(delimiter !== ',' && /^-?\d+,\d+$/.test(tok) ? tok.replace(',', '.') : tok);
            return Number.isFinite(n) && (n < fe.lower! || n > fe.upper!) ? ('outlier' as const) : undefined;
          };

          return (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-caption text-fg-subtle">Aşağıdaki sayılar {nf.format(q.rows)} satırlık veriden hesaplanır.</p>
                <SegmentedControl
                  label="Görünüm"
                  value={view}
                  onChange={setView}
                  options={[
                    { value: 'before', label: 'Öncesi' },
                    { value: 'after', label: 'Sonrası (önizleme)' },
                  ]}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <MetricTile label="Temiz hücre oranı" value={`%${fmt1(integrity)}`} tone="secondary" icon={ShieldCheck}>
                  1 − (aykırı + eksik hücre) / toplam hücre{after ? ' (öngörü)' : ''}
                </MetricTile>
                <MetricTile label="Toplam gözlem" value={nf.format(q.rows)} unit="satır" icon={Database}>
                  {q.variables} değişken, {nf.format(q.cells)} hücre
                </MetricTile>
                <MetricTile
                  label="Aykırı hücre (Tukey 1.5×IQR)"
                  value={after ? 0 : q.outlierCells}
                  tone={after || q.outlierCells === 0 ? 'secondary' : 'danger'}
                  icon={TriangleAlert}
                  badge={!after && q.outlierCells > 0 && <Tag tone="danger">%{((q.outlierCells / Math.max(1, q.cells)) * 100).toFixed(2)} hücre</Tag>}
                >
                  {after ? `${q.removedRows} satır çıkarılır.` : `${q.cleanColumns.length} sütunda tarandı.`}
                </MetricTile>
                <MetricTile
                  label="Eksik değerler"
                  value={after && impute !== 'none' ? 0 : q.missingCells}
                  tone={after && impute !== 'none' ? 'secondary' : q.missingCells ? 'tertiary' : 'secondary'}
                  icon={HelpCircle}
                >
                  {after && impute !== 'none' ? 'Seçilen yöntemle doldurulur.' : 'Eksiklik mekanizması test edilmedi (MCAR doğrulanmadı).'}
                </MetricTile>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
                <Panel tone="danger">
                  <SectionHeader
                    icon={Filter}
                    title="Aykırı değerler"
                    description="Aykırı satırlar çıkarılacak sütunlar"
                    level={3}
                    actions={<StatusChip status={q.outlierCells ? 'danger' : 'success'}>{q.outlierCells ? 'Önemli risk' : 'Temiz'}</StatusChip>}
                  />
                  <p className="mb-3 text-body text-fg-muted">
                    Tukey sınırlarının (Q1 − 1.5·IQR, Q3 + 1.5·IQR) dışındaki gözlemler işaretlenir.{' '}
                    <strong className="text-fg">Silmeden önce klinik olarak geçerli olup olmadığını kontrol edin:</strong> gerçek ama uç değerleri silmek sonucu yanıltabilir.
                  </p>
                  <CheckboxGroup
                    legend="Temizlenecek sütunlar"
                    options={nums.map((c) => ({ value: c.name, label: c.name, hint: `${q.columns.find((x) => x.name === c.name)?.outliers ?? 0} aykırı` }))}
                    values={cleanList}
                    onChange={setCleanSel}
                  />
                  <StatusLine status="warning" className="mt-4 text-caption">
                    {q.removedRows} satır çıkarılacak (%{q.removedRate.toFixed(1)}); {nf.format(q.cleanedRows)} satır kalır.
                  </StatusLine>
                </Panel>

                <Panel tone="warning">
                  <SectionHeader icon={Wrench} title="Eksik veri doldurma" description={`${nf.format(q.missingCells)} eksik hücre`} level={3} />
                  <p className="mb-3 text-body text-fg-muted">
                    Eksikliğin nedeni bilinmiyor: gelir gibi değişkenlerde eksiklik çoğu zaman değerin kendisine bağlıdır ve bu, doldurmayı yanlı kılar.{' '}
                    <strong className="text-fg">KNN</strong> sütunlar arası ilişkileri korur; <strong className="text-fg">medyan/mod</strong> hızlıdır ama varyansı küçültür.
                  </p>
                  <RadioCardGroup
                    legend="Doldurma yöntemi"
                    hideLegend
                    options={[
                      { value: 'none', title: 'Doldurma', hint: 'Eksikler kalır' },
                      { value: 'median', title: 'Medyan / mod', hint: 'Hızlı' },
                      { value: 'knn', title: 'KNN (k=5)', hint: knnOk ? 'Hassas' : `≤ ${nf.format(KNN_MAX)} satır` },
                    ]}
                    value={impute}
                    onChange={(v) => setImpute(v === 'knn' && !knnOk ? 'median' : (v as typeof impute))}
                  />
                  {!knnOk && <StatusLine status="info" className="mt-3 text-caption">KNN en fazla {nf.format(KNN_MAX)} satırda desteklenir; bu veri setinde medyan/mod kullanılır.</StatusLine>}
                </Panel>
              </div>

              {f && shapiro && (
                <Callout tone="warning" icon={GitFork} title="Dallanan yol uyarısı" className="mt-6">
                  “{f.valueColumn}” kalıntılarında Shapiro-Wilk p değeri, aykırılar varken{' '}
                  <span className="font-mono">{f.shapiroBefore ? formatP(f.shapiroBefore.p) : '–'}</span>, çıkarıldıktan sonra{' '}
                  <span className="font-mono">{f.shapiroAfter ? formatP(f.shapiroAfter.p) : '–'}</span>. Temizlik, test seçimini değiştirebilir; yaptığınız temizliği ve nedenini
                  raporunuzda belirtin.
                </Callout>
              )}

              <Panel className="mt-6">
                <SectionHeader icon={Table2} title="Sütun özeti" level={3} />
                <DataTable caption="Sütun özeti" columns={colColumns} rows={colRows} rowKey={(c) => c.name} density="compact" />
              </Panel>

              <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
                <Panel className="min-w-0 lg:col-span-7">
                  <SectionHeader icon={Table2} title="Ham veri (önizleme)" level={3} actions={<Tag>İlk 20 satır</Tag>} />
                  {pv ? (
                    <DataPreview caption="Ham veri önizlemesi" header={pv.preview[0]!} rows={pv.preview.slice(1)} cellState={state} />
                  ) : (
                    <p className="text-fg-muted">Yükleniyor…</p>
                  )}
                </Panel>
                {f && hist && (
                  <Panel className="lg:col-span-5">
                    <SectionHeader icon={BarChart3} title="Dağılım ve kutu grafikleri" description={`${f.valueColumn}, gruplara göre (${f.groupColumn})`} level={3} actions={<Tag tone="primary">{after ? 'Sonrası' : 'Öncesi'}</Tag>} />
                    <div className="rounded-card bg-surface-lowest p-3">
                      <p className="mb-1 text-caption text-fg-subtle">Bıyıklar grup içi Tukey sınırlarıdır; sınır dışı gözlemler tek tek gösterilir.</p>
                      <BoxPlotGroup
                        boxes={after ? f.boxesAfter : f.boxesBefore}
                        summary={`${f.valueColumn} değerinin ${f.groupColumn} gruplarına göre kutu grafiği, ${after ? 'aykırılar çıkarıldıktan sonra' : 'ham veri'}.`}
                      />
                    </div>
                    <div className="mt-4 rounded-card bg-surface-lowest p-3">
                      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-caption text-fg-subtle">Grup ortalamasından sapma</p>
                        {shapiro && (
                          <p className="font-mono text-caption text-secondary">
                            Shapiro-Wilk W = {shapiro.W.toFixed(3)}, p {formatP(shapiro.p).startsWith('<') ? formatP(shapiro.p) : `= ${formatP(shapiro.p)}`}
                          </p>
                        )}
                      </div>
                      <HistogramWithNormal
                        bins={hist.bins}
                        normal={{ mean: hist.mean, sd: hist.sd }}
                        barTone="secondary"
                        compact
                        summary={`${f.valueColumn} kalıntılarının histogramı, çarpıklık ${skew.toFixed(2)}.`}
                        className="p-0!"
                      />
                      <p className="mt-2 text-caption text-fg-muted">
                        Çarpıklık <span className="font-mono">{skew.toFixed(2)}</span>.{' '}
                        {shapiro ? (shapiro.p >= 0.05 ? 'Normallikten sapma saptanmadı.' : 'Normallik varsayımı reddedildi.') : ''}
                      </p>
                    </div>
                  </Panel>
                )}
              </div>
            </>
          );
        }}
      </QueryView>

      <QueryView query={code}>
        {(c) => (
          <Panel className="mt-6">
            <SectionHeader
              title="Temizleme kodu (Python)"
              level={3}
              description="Bu betik, uygulamanın oluşturduğu temizlenmiş sürümle aynı veriyi üretir (otomatik testle doğrulanır)."
              actions={
                <a
                  className="inline-flex h-8 items-center gap-1.5 rounded-control bg-surface-highest px-3 text-caption text-fg hover:bg-surface-bright"
                  href={`/api/datasets/${dataset.id}/download`}
                  download
                >
                  <Download size={14} aria-hidden />
                  Veri dosyasını indir
                </a>
              }
            />
            <CodeBlock code={c.code} filename={c.filename} runtime={`Gerekli paketler: ${c.requirements.join(', ')}`} maxHeight="24rem" />
          </Panel>
        )}
      </QueryView>
    </>
  );
}
