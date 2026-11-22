import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Database, FileCode2, Info, Languages, ListChecks, OctagonAlert, Sigma, Table2, TriangleAlert } from 'lucide-react';
import { formatP } from '@statadvisor/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { Callout, CheckboxGroup, CopyButton, DataTable, MetricTile, Panel, SectionHeader, Select, StatusLine, Tag, type Column } from '@/components/ui';
import { useActiveDataset } from '@/context/AppContext';
import type { ColumnInfo, DatasetInfo, RegressionBody, RegressionResponse } from '@/data/api';
import { useRegression } from '@/data/hooks';
import { useDebounced } from '@/lib/useDebounced';
import { columnTypeLabel } from '@/lib/variables';
import { DualCodeBlock, n2, nf, NoteList, ReferenceSelect, ReportActions, SaveToReports } from './shared';
import { useI18n } from '@/i18n';

/** Bağımlı değişken adayı: sayısal, kimlik olmayan, kategori kodu olarak işaretlenmemiş sütunlar. */
const dependentCandidates = (cols: ColumnInfo[]) => cols.filter((c) => c.numeric && c.type !== 'categorical' && !c.likelyId);
/** Kategorik yordayıcı adayı: 2–12 farklı değer içeren, kimlik olmayan sütunlar. */
const categoricalCandidates = (cols: ColumnInfo[]) => cols.filter((c) => !c.likelyId && c.unique >= 2 && c.unique <= 12);

function EmptyDataset() {
  const { t } = useI18n();
  return (
    <>
      <PageHeader title={t('Doğrusal Regresyon')} description={t('Sayısal bir sonucu bir ya da birkaç değişkenle açıklayan en küçük kareler modeli.')} />
      <Callout tone="info" icon={Database} title={t('Önce bir veri seti seçin')} actions={<Link className="rounded-control bg-primary-strong px-4 py-2 font-semibold text-on-primary-strong" to="/veri">{t('Veri setlerine git')}</Link>}>
        {t('Analiz için bir CSV dosyası yükleyin ya da örnek bir veri setiyle başlayın.')}</Callout>
    </>
  );
}

export function RegressionPage() {
  const { t } = useI18n();
  const { dataset, loading, error } = useActiveDataset();
  if (loading) return <p className="text-fg-muted">{t('Yükleniyor…')}</p>;
  if (error) return <StatusLine status="danger">{t(error.message)}</StatusLine>;
  if (!dataset) return <EmptyDataset />;
  // Veri seti değişince seçimler sıfırlanır.
  return <Regression key={dataset.id} dataset={dataset} />;
}

/** Kalıntı–yordanan değer grafiği: desen (huni, eğri) varsa doğrusallık/varyans varsayımı şüphelidir. */
function ResidualPlot({ fitted, residuals }: { fitted: number[]; residuals: number[] }) {
  const { t } = useI18n();
  const W = 560;
  const H = 280;
  const m = { l: 52, r: 14, t: 12, b: 36 };
  if (fitted.length === 0) return null;
  const fx = [Math.min(...fitted), Math.max(...fitted)];
  const rmax = Math.max(...residuals.map((r) => Math.abs(r))) || 1;
  const x = (v: number) => m.l + ((v - fx[0]!) / (fx[1]! - fx[0]! || 1)) * (W - m.l - m.r);
  const y = (v: number) => m.t + (1 - (v + rmax) / (2 * rmax)) * (H - m.t - m.b);
  const ticks = [-rmax, 0, rmax];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('Kalıntılar ile yordanan değerlerin dağılım grafiği ({length} nokta). Noktalar sıfır çizgisi çevresinde belirgin bir desen oluşturmuyorsa varsayımlar makul görünür.', { length: fitted.length })} className="w-full max-w-2xl">
      <rect x={m.l} y={m.t} width={W - m.l - m.r} height={H - m.t - m.b} fill="none" stroke="var(--color-line)" strokeOpacity={0.4} />
      {ticks.map((t) => (
        <g key={t}>
          <line x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--color-tertiary)' : 'var(--color-line)'} strokeOpacity={t === 0 ? 0.9 : 0.25} strokeDasharray={t === 0 ? '5 4' : undefined} />
          <text x={m.l - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--color-fg-subtle)">{n2(t, 1)}</text>
        </g>
      ))}
      {fitted.map((f, i) => (
        <circle key={i} cx={x(f)} cy={y(residuals[i]!)} r={2.6} fill="var(--color-primary-strong)" fillOpacity={0.55} />
      ))}
      <text x={(m.l + W - m.r) / 2} y={H - 6} textAnchor="middle" fontSize={11} fill="var(--color-fg-subtle)">{t('Yordanan değer')}</text>
      <text transform={`translate(12 ${H / 2}) rotate(-90)`} textAnchor="middle" fontSize={11} fill="var(--color-fg-subtle)">{t('Kalıntı')}</text>
    </svg>
  );
}

type CoefRow = string[];

function Results({ data, body, datasetId }: { data: RegressionResponse; body: RegressionBody; datasetId: string }) {
  const { t } = useI18n();
  const r = data.result;
  const cols: Column<CoefRow>[] = data.coefficients.header.map((h, i) => ({
    key: h,
    header: h,
    numeric: i > 0,
    align: i > 0 ? 'right' : 'left',
    cell: (row) => (i === 0 ? <span className="font-medium text-fg">{row[i]}</span> : row[i]),
    cellClassName: (row) => (i === 5 && row[i] !== undefined && (row[i] === '< .001' || Number(row[i]) < r.alpha) ? 'font-semibold text-secondary' : i === 8 && Number(row[i]) >= 5 ? 'font-semibold text-tertiary' : undefined),
  }));

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile label={t('R² (açıklanan varyans)')} value={n2(r.r2, 3).replace(/^0/, '')} tone={r.pF < r.alpha ? 'secondary' : 'default'} icon={Sigma}>
          {t('Düzeltilmiş R² =')}{' '}{n2(r.adjR2, 3).replace(/^0/, '')}
        </MetricTile>
        <MetricTile label={t('Model F({dfModel}, {dfResid})', { dfModel: r.dfModel, dfResid: r.dfResid })} value={n2(r.F, 2)} icon={Activity} tone={r.pF < r.alpha ? 'secondary' : 'default'}>
          p {formatP(r.pF, true).startsWith('<') ? formatP(r.pF, true) : `= ${formatP(r.pF, true)}`} · {r.pF < r.alpha ? t('model anlamlı') : t('model anlamlı değil')}
        </MetricTile>
        <MetricTile label={t('Gözlem sayısı')} value={nf.format(r.n)} unit={t('satır')} icon={Table2} tone={r.droppedRows ? 'tertiary' : 'default'}>
          {r.droppedRows ? t('{v1} satır eksik değer nedeniyle çıkarıldı', { v1: nf.format(r.droppedRows) }) : t('Eksik değer nedeniyle satır çıkarılmadı')}
        </MetricTile>
        <MetricTile label={t('Kalıntı standart hatası')} value={n2(r.sigma, 3)} icon={ListChecks}>
          {r.k} {t('parametre, sd =')}{' '}{r.dfResid}
        </MetricTile>
      </div>

      <Panel>
        <SectionHeader icon={Table2} title={t('Katsayılar')} level={3} description={t('b: bir birimlik artışta ortalama değişim (diğerleri sabitken). β: standartlaştırılmış katsayı. VIF: yordayıcılar arası doğrusal bağımlılık.')} />
        <DataTable caption={t('Regresyon katsayıları')} columns={cols} rows={data.coefficients.rows} rowKey={(row) => row[0]!} density="compact" />
      </Panel>

      <Panel>
        <SectionHeader icon={TriangleAlert} title={t('Tanılar ve uyarılar')} level={3} description={t('Eşikler (VIF 5/10, Cook 4/n, Durbin–Watson 1,5–2,5) başparmak kurallarıdır, kesin bilimsel sınır değildir.')} />
        <NoteList notes={data.narrative.notes} />
        <div className="mt-5 grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div>
            <h3 className="mb-2 text-body-lg font-semibold text-fg">{t('Kalıntı – yordanan değer grafiği')}</h3>
            <ResidualPlot fitted={data.plot.fitted} residuals={data.plot.residuals} />
            {data.plot.step > 1 && <p className="mt-1 text-caption text-fg-subtle">{nf.format(r.n)} {t('gözlemden eşit aralıklı')}{' '}{nf.format(data.plot.fitted.length)} {t('nokta gösteriliyor.')}</p>}
          </div>
          <table className="h-fit w-full text-body">
            <caption className="sr-only">{t('Model özeti ve tanı ölçütleri')}</caption>
            <tbody>
              {data.model.map(([k, v]) => (
                <tr key={k} className="border-b border-line/20 last:border-0">
                  <th scope="row" className="py-1.5 pr-4 text-left font-normal text-fg-muted">{k}</th>
                  <td className="py-1.5 text-right font-mono text-data text-fg">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel>
        <SectionHeader icon={Languages} title={t('Nasıl okunur')} level={3} />
        <ul className="flex list-disc flex-col gap-2 pl-5 text-body text-fg">
          {data.narrative.interpretation.map((line, i) => (
            <li key={i}>{t(line)}</li>
          ))}
        </ul>
        <div className="mt-4 rounded-card border border-line/30 bg-surface-lowest p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-body-lg font-semibold text-fg">{t('APA 7 stilinde özet')}</h3>
            <CopyButton text={t(data.narrative.apaSummary)} />
          </div>
          <p className="text-body text-fg">{t(data.narrative.apaSummary)}</p>
        </div>
      </Panel>

      <Panel>
        <SectionHeader icon={FileCode2} title={t('Python / R kodu ve rapor')} level={3} description={t('Betik (Python ya da R), ekrandaki sayıları yeniden üretir (otomatik testle doğrulanır). Veri dosyasını betikle aynı klasöre koyun.')} />
        <SaveToReports url={`/api/datasets/${datasetId}/regression/save`} body={body} resetKey={`${datasetId}:${JSON.stringify(body)}`} />
        <ReportActions url={`/api/datasets/${datasetId}/regression/report`} body={body} fileBase="regresyon-raporu" />
        <DualCodeBlock python={data.code} r={data.codeR} />
      </Panel>
    </>
  );
}

function Regression({ dataset }: { dataset: DatasetInfo }) {
  const { t } = useI18n();
  const cols = dataset.columns;
  const deps = dependentCandidates(cols);
  const [dependent, setDependent] = useState<string | undefined>(() => deps.find((c) => c.type === 'continuous')?.name ?? deps[0]?.name);
  const [numeric, setNumeric] = useState<string[]>([]);
  const [categorical, setCategorical] = useState<string[]>([]);
  const [alpha, setAlpha] = useState('0.05');
  const [reference, setReference] = useState<Record<string, string>>({});

  const numOptions = deps.filter((c) => c.name !== dependent);
  const catOptions = categoricalCandidates(cols).filter((c) => c.name !== dependent && !numeric.includes(c.name));
  const body = useMemo<RegressionBody | null>(() => {
    if (!dependent || numeric.length + categorical.length === 0) return null;
    const ref = Object.fromEntries(Object.entries(reference).filter(([k]) => categorical.includes(k)));
    return { dependent, numeric, categorical, alpha: Number(alpha), ...(Object.keys(ref).length ? { reference: ref } : {}) };
  }, [dependent, numeric, categorical, alpha, reference]);
  const settled = useDebounced(body, 400);
  const q = useRegression(dataset.id, settled);
  const stale = body !== settled || q.isFetching;

  const onDependent = (name: string) => {
    setDependent(name);
    setNumeric((v) => v.filter((x) => x !== name));
    setCategorical((v) => v.filter((x) => x !== name));
  };
  const onNumeric = (v: string[]) => {
    setNumeric(v);
    setCategorical((c) => c.filter((x) => !v.includes(x)));
  };

  return (
    <>
      <PageHeader
        context={<span className="font-mono">{dataset.name}</span>}
        title={t('Doğrusal Regresyon')}
        description={t('Sayısal bir sonucu (bağımlı değişken) bir ya da birkaç yordayıcıyla açıklayan en küçük kareler modeli. Katsayılar, güven aralıkları, tanılar, APA özeti ve Python kodu birlikte gelir.')}
      />

      <Panel>
        <SectionHeader icon={Sigma} title={t('Model kurulumu')} level={3} description={t('Seçimleri değiştirdikçe model otomatik yeniden kurulur. Kategorik yordayıcılar kukla değişkenlere çevrilir; eksik değerli satırlar çıkarılır.')} />
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select label={t('Bağımlı değişken (sayısal sonuç)')} value={dependent} onChange={onDependent} options={deps.map((c) => ({ value: c.name, label: `${c.name} · ${columnTypeLabel[c.type]}` }))} />
            <Select label={t('Güven düzeyi')} value={alpha} onChange={setAlpha} options={[{ value: '0.05', label: '%95 (α = 0,05)' }, { value: '0.01', label: '%99 (α = 0,01)' }, { value: '0.1', label: '%90 (α = 0,10)' }]} />
          </div>
          <CheckboxGroup
            legend={t('Sayısal yordayıcılar')}
            options={numOptions.map((c) => ({ value: c.name, label: c.name, hint: columnTypeLabel[c.type] }))}
            values={numeric}
            onChange={onNumeric}
            hint={t('Sıralı (ör. 1–5) maddeler de sayısal olarak girilebilir; bu, aralıkların eşit olduğunu varsayar.')}
          />
          <CheckboxGroup
            legend={t('Kategorik yordayıcılar (kukla kodlanır)')}
            options={catOptions.map((c) => ({ value: c.name, label: c.name, hint: t('{unique} düzey', { unique: c.unique }) }))}
            values={categorical}
            onChange={setCategorical}
            hint={t('2–12 farklı değer içeren sütunlar. Sayısal kodlu kategoriler (1 = Kadın, 2 = Erkek) buradan eklenmelidir.')}
          />
          {categorical.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {categorical.map((c) => (
                <ReferenceSelect key={c} datasetId={dataset.id} column={c} value={reference[c]} onChange={(v) => setReference((r) => { const n = { ...r }; if (v === undefined) delete n[c]; else n[c] = v; return n; })} />
              ))}
            </div>
          )}
        </div>
      </Panel>

      {!body && (
        <Callout tone="info" icon={Info} title={t('Yordayıcı seçin')}>
          {t('Modeli kurmak için en az bir sayısal ya da kategorik yordayıcı seçin.')}</Callout>
      )}
      {q.isError && body && (
        <Callout tone="danger" icon={OctagonAlert} title={t('Model kurulamadı')}>
          {t(q.error.message)}
        </Callout>
      )}
      {q.data && body && (
        <div className={stale ? 'flex flex-col gap-6 opacity-60 transition-opacity' : 'flex flex-col gap-6'} aria-busy={stale}>
          <div className="flex flex-wrap items-center gap-2">
            <Tag tone="primary">{q.data.spec.numeric.length + q.data.spec.categorical.length} {t('yordayıcı')}</Tag>
            <Tag>{q.data.result.k - 1} {t('model terimi')}</Tag>
            {stale && <span className="text-caption text-fg-subtle">{t('Güncelleniyor…')}</span>}
          </div>
          <Results data={q.data} body={settled ?? body} datasetId={dataset.id} />
        </div>
      )}
    </>
  );
}
