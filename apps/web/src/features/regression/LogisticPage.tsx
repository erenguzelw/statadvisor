import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Database, FileCode2, Info, Languages, ListChecks, OctagonAlert, Sigma, Table2, Target, TriangleAlert } from 'lucide-react';
import { formatP } from '@statadvisor/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { Callout, CheckboxGroup, CodeBlock, CopyButton, DataTable, MetricTile, Panel, SectionHeader, Select, StatusLine, Tag, type Column } from '@/components/ui';
import { RocCurve } from '@/components/charts';
import { useActiveDataset } from '@/context/AppContext';
import type { ColumnInfo, DatasetInfo, LogisticBody, LogisticResponse } from '@/data/api';
import { useLevels, useLogistic } from '@/data/hooks';
import { useDebounced } from '@/lib/useDebounced';
import { columnTypeLabel } from '@/lib/variables';
import { n2, nf, NoteList, ReferenceSelect, ReportActions, SaveToReports } from './shared';

const collator = new Intl.Collator('tr', { numeric: true });
/** Bağımlı değişken adayı: tam olarak iki farklı değeri olan, kimlik olmayan sütunlar. */
const outcomeCandidates = (cols: ColumnInfo[]) => cols.filter((c) => c.unique === 2 && !c.likelyId);
const numericCandidates = (cols: ColumnInfo[]) => cols.filter((c) => c.numeric && c.type !== 'categorical' && !c.likelyId);
const categoricalCandidates = (cols: ColumnInfo[]) => cols.filter((c) => !c.likelyId && c.unique >= 2 && c.unique <= 12);
const dropZero = (x: number, d = 3) => n2(x, d).replace(/^0/, '');

function EmptyDataset() {
  return (
    <>
      <PageHeader title="Lojistik Regresyon" description="İkili bir sonucun (evet/hayır, 0/1) olasılığını yordayıcılarla açıklayan model." />
      <Callout tone="info" icon={Database} title="Önce bir veri seti seçin" actions={<Link className="rounded-control bg-primary-strong px-4 py-2 font-semibold text-on-primary-strong" to="/veri">Veri setlerine git</Link>}>
        Analiz için bir CSV dosyası yükleyin ya da örnek bir veri setiyle başlayın.
      </Callout>
    </>
  );
}

export function LogisticPage() {
  const { dataset, loading, error } = useActiveDataset();
  if (loading) return <p className="text-fg-muted">Yükleniyor…</p>;
  if (error) return <StatusLine status="danger">{error.message}</StatusLine>;
  if (!dataset) return <EmptyDataset />;
  return <Logistic key={dataset.id} dataset={dataset} />;
}

/** Olay düzeyi seçimi: düzeyler sunucudan gelir; varsayılan, sıralı iki düzeyin ikincisidir. */
function EventSelect({ datasetId, column, value, onChange }: { datasetId: string; column: string; value: string | undefined; onChange: (v: string | undefined) => void }) {
  const q = useLevels(datasetId, column);
  const levels = (q.data?.levels ?? []).map((l) => l.value).sort(collator.compare);
  const def = levels[1];
  return (
    <Select
      label="Olay düzeyi (1 olarak kodlanır)"
      value={value ?? def}
      onChange={(v) => onChange(v === def ? undefined : v)}
      options={levels.map((v) => ({ value: v, label: `${v} · ${nf.format(q.data?.levels.find((l) => l.value === v)?.count ?? 0)} gözlem` }))}
      hint={levels.length === 2 ? `Modelin yordadığı olasılık “${value ?? def}” sonucunun olasılığıdır; diğer düzey (“${levels.find((l) => l !== (value ?? def))}”) referanstır.` : undefined}
    />
  );
}

type Row = string[];

function Results({ data, body, datasetId }: { data: LogisticResponse; body: LogisticBody; datasetId: string }) {
  const r = data.result;
  const sepBad = r.separation !== 'none' || !r.converged;
  const cols: Column<Row>[] = data.coefficients.header.map((h, i) => ({
    key: h,
    header: h,
    numeric: i > 0,
    align: i > 0 ? 'right' : 'left',
    cell: (row) => (i === 0 ? <span className="font-medium text-fg">{row[i]}</span> : row[i]),
    cellClassName: (row) => (i === 4 && (row[i] === '< .001' || Number(row[i]) < r.alpha) ? 'font-semibold text-secondary' : i === 8 && Number(row[i]) >= 5 ? 'font-semibold text-tertiary' : undefined),
  }));
  const tableCols = (t: { header: string[] }): Column<Row>[] => t.header.map((h, i) => ({ key: `${h}${i}`, header: h, numeric: i > 0, align: i > 0 ? 'right' : 'left', cell: (row) => (i === 0 ? <span className="font-medium text-fg">{row[i]}</span> : row[i]) }));
  const c = r.classification;

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile label="Nagelkerke R²" value={dropZero(r.nagelkerke)} tone={r.lrP < r.alpha ? 'secondary' : 'default'} icon={Sigma}>
          McFadden R² = {dropZero(r.mcFadden)} · “açıklanan varyans yüzdesi” değildir
        </MetricTile>
        <MetricTile label={`Model testi χ²(${r.lrDf})`} value={n2(r.lrChi2, 2)} icon={Activity} tone={r.lrP < r.alpha ? 'secondary' : 'default'}>
          p {formatP(r.lrP, true).startsWith('<') ? formatP(r.lrP, true) : `= ${formatP(r.lrP, true)}`} · {r.lrP < r.alpha ? 'model anlamlı' : 'model anlamlı değil'}
        </MetricTile>
        <MetricTile label="AUC (ayırt etme gücü)" value={dropZero(r.auc, 3)} icon={Target} tone={r.auc >= 0.7 ? 'secondary' : 'default'}>
          0,5 = şans · 1 = kusursuz
        </MetricTile>
        <MetricTile label="Doğruluk" value={`%${n2(c.accuracy * 100, 1)}`} icon={ListChecks} tone={c.accuracy > c.baseline + 0.01 ? 'secondary' : 'tertiary'}>
          Çoğunluk sınıfı tabanı %{n2(c.baseline * 100, 1)} · n = {nf.format(r.n)}
        </MetricTile>
      </div>

      {sepBad && (
        <Callout tone="danger" icon={OctagonAlert} title={r.separation === 'complete' ? 'Tam ayrışma: katsayılar anlamsız' : 'Yakınsama sorunu / olası ayrışma'}>
          <span className="text-body">Aşağıdaki uyarıyı okuyun; bu durumda OR ve p değerleri güvenilir değildir.</span>
        </Callout>
      )}

      <Panel>
        <SectionHeader icon={Table2} title="Katsayılar ve olasılık oranları" level={3} description="OR = exp(b): yordayıcı bir birim arttığında olayın odds'u OR kat değişir (diğerleri sabitken). OR = 1 etki yok demektir; güven aralığı 1'i içeriyorsa etki anlamlı değildir." />
        <DataTable caption="Lojistik regresyon katsayıları" columns={cols} rows={data.coefficients.rows} rowKey={(row) => row[0]!} density="compact" />
      </Panel>

      <Panel>
        <SectionHeader icon={TriangleAlert} title="Tanılar ve uyarılar" level={3} description="Eşikler (EPV 10, VIF 5/10) başparmak kurallarıdır, kesin bilimsel sınır değildir." />
        <NoteList notes={data.narrative.notes} />
        <div className="mt-5 grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div>
            <h3 className="mb-2 text-body-lg font-semibold text-fg">ROC eğrisi</h3>
            <div className="max-w-md">
              <RocCurve series={[{ id: 'model', label: 'Model', auc: r.auc, points: r.roc, color: 'var(--color-primary-strong)', emphasized: true }]} />
            </div>
            <p className="mt-1 text-caption text-fg-subtle">Eğri sol üst köşeye ne kadar yakınsa model olayı o kadar iyi ayırır; kesikli çizgi şans düzeyidir.</p>
          </div>
          <table className="h-fit w-full text-body">
            <caption className="sr-only">Model özeti ve tanı ölçütleri</caption>
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
        <SectionHeader icon={ListChecks} title="Sınıflandırma ve kalibrasyon" level={3} description={`Sınıflandırma, yordanan olasılığın ≥ ${c.threshold} olması kuralıyla yapılır. Duyarlılık: gerçek olayların yakalanma oranı; seçicilik: olmayanların doğru bırakılma oranı.`} />
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div>
            <h3 className="mb-2 text-body-lg font-semibold text-fg">Sınıflandırma tablosu</h3>
            <DataTable caption="Sınıflandırma tablosu" columns={tableCols(data.classification)} rows={data.classification.rows} rowKey={(row) => row[0]!} density="compact" />
          </div>
          {data.hosmerLemeshow && (
            <div>
              <h3 className="mb-2 text-body-lg font-semibold text-fg">Hosmer–Lemeshow grupları</h3>
              <DataTable caption="Hosmer–Lemeshow grupları" columns={tableCols(data.hosmerLemeshow)} rows={data.hosmerLemeshow.rows} rowKey={(row) => row[0]!} density="compact" />
            </div>
          )}
        </div>
      </Panel>

      <Panel>
        <SectionHeader icon={Languages} title="Nasıl okunur" level={3} />
        <ul className="flex list-disc flex-col gap-2 pl-5 text-body text-fg">
          {data.narrative.interpretation.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
        <div className="mt-4 rounded-card border border-line/30 bg-surface-lowest p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-body-lg font-semibold text-fg">APA 7 stilinde özet</h3>
            <CopyButton text={data.narrative.apaSummary} />
          </div>
          <p className="text-body text-fg">{data.narrative.apaSummary}</p>
        </div>
      </Panel>

      <Panel>
        <SectionHeader icon={FileCode2} title="Python kodu ve rapor" level={3} description="Betik, ekrandaki sayıları statsmodels ile yeniden üretir (otomatik testle doğrulanır). Veri dosyasını betikle aynı klasöre koyun." />
        <SaveToReports url={`/api/datasets/${datasetId}/logistic/save`} body={body} resetKey={`${datasetId}:${JSON.stringify(body)}`} />
        <ReportActions url={`/api/datasets/${datasetId}/logistic/report`} body={body} fileBase="lojistik-regresyon-raporu" />
        {data.code ? (
          <CodeBlock code={data.code.code} filename={data.code.filename} runtime={`Python · ${data.code.requirements.join(', ')}`} lineNumbers maxHeight="28rem" />
        ) : (
          <p className="text-body text-fg-muted">Tam ayrışmada en çok olabilirlik çözümü yoktur; statsmodels da bu durumda hata verir. Bu yüzden kod üretilmedi.</p>
        )}
      </Panel>
    </>
  );
}

function Logistic({ dataset }: { dataset: DatasetInfo }) {
  const cols = dataset.columns;
  const outcomes = outcomeCandidates(cols);
  const [dependent, setDependent] = useState<string | undefined>(() => outcomes[0]?.name);
  const [eventLevel, setEventLevel] = useState<string | undefined>(undefined);
  const [numeric, setNumeric] = useState<string[]>([]);
  const [categorical, setCategorical] = useState<string[]>([]);
  const [alpha, setAlpha] = useState('0.05');
  const [reference, setReference] = useState<Record<string, string>>({});

  const numOptions = numericCandidates(cols).filter((c) => c.name !== dependent);
  const catOptions = categoricalCandidates(cols).filter((c) => c.name !== dependent && !numeric.includes(c.name));
  const body = useMemo<LogisticBody | null>(() => {
    if (!dependent || numeric.length + categorical.length === 0) return null;
    const ref = Object.fromEntries(Object.entries(reference).filter(([k]) => categorical.includes(k)));
    return { dependent, numeric, categorical, alpha: Number(alpha), ...(eventLevel ? { eventLevel } : {}), ...(Object.keys(ref).length ? { reference: ref } : {}) };
  }, [dependent, eventLevel, numeric, categorical, alpha, reference]);
  const settled = useDebounced(body, 400);
  const q = useLogistic(dataset.id, settled);
  const stale = body !== settled || q.isFetching;

  const onDependent = (name: string) => {
    setDependent(name);
    setEventLevel(undefined);
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
        title="Lojistik Regresyon"
        description="İkili bir sonucun (evet/hayır, 0/1) olasılığını bir ya da birkaç yordayıcıyla açıklayan model. Olasılık oranları, ayırt etme gücü (AUC), kalibrasyon, uyarılar, APA özeti ve Python kodu birlikte gelir."
      />

      {outcomes.length === 0 ? (
        <Callout tone="warning" icon={Info} title="İkili sonuç sütunu bulunamadı">
          Lojistik regresyon, tam olarak iki farklı değer alan bir sonuç sütunu ister (ör. evet/hayır, 0/1). Bu veri setinde böyle bir sütun yok; sayısal bir sonuç için Doğrusal Regresyon sayfasını kullanın.
        </Callout>
      ) : (
        <Panel>
          <SectionHeader icon={Sigma} title="Model kurulumu" level={3} description="Seçimleri değiştirdikçe model otomatik yeniden kurulur. Test seçimi (Karar Sihirbazı) ile model kurma ayrı akışlardır: burada bir grup farkını sınamıyor, olasılığı yordayan bir model kuruyorsunuz." />
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Select label="Bağımlı değişken (ikili sonuç)" value={dependent} onChange={onDependent} options={outcomes.map((c) => ({ value: c.name, label: `${c.name} · ${c.examples.slice(0, 2).join(' / ')}` }))} />
              {dependent && <EventSelect key={dependent} datasetId={dataset.id} column={dependent} value={eventLevel} onChange={setEventLevel} />}
              <Select label="Güven düzeyi" value={alpha} onChange={setAlpha} options={[{ value: '0.05', label: '%95 (α = 0,05)' }, { value: '0.01', label: '%99 (α = 0,01)' }, { value: '0.1', label: '%90 (α = 0,10)' }]} />
            </div>
            <CheckboxGroup
              legend="Sayısal yordayıcılar"
              options={numOptions.map((c) => ({ value: c.name, label: c.name, hint: columnTypeLabel[c.type] }))}
              values={numeric}
              onChange={onNumeric}
              hint="Küçük örneklemde az yordayıcı seçin: yaygın başparmak kuralı, az olan sınıfta yordayıcı terim başına en az 10 olaydır."
            />
            <CheckboxGroup
              legend="Kategorik yordayıcılar (kukla kodlanır)"
              options={catOptions.map((c) => ({ value: c.name, label: c.name, hint: `${c.unique} düzey` }))}
              values={categorical}
              onChange={setCategorical}
              hint="2–12 farklı değer içeren sütunlar. Sayısal kodlu kategoriler (1 = Kadın, 2 = Erkek) buradan eklenmelidir."
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
      )}

      {outcomes.length > 0 && !body && (
        <Callout tone="info" icon={Info} title="Yordayıcı seçin">
          Modeli kurmak için en az bir sayısal ya da kategorik yordayıcı seçin.
        </Callout>
      )}
      {q.isError && body && (
        <Callout tone="danger" icon={OctagonAlert} title="Model kurulamadı">
          {q.error.message}
        </Callout>
      )}
      {q.data && body && (
        <div className={stale ? 'flex flex-col gap-6 opacity-60 transition-opacity' : 'flex flex-col gap-6'} aria-busy={stale}>
          <div className="flex flex-wrap items-center gap-2">
            <Tag tone="primary">{q.data.spec.numeric.length + q.data.spec.categorical.length} yordayıcı</Tag>
            <Tag>{q.data.result.events} olay · {q.data.result.nonEvents} olay değil</Tag>
            {stale && <span className="text-caption text-fg-subtle">Güncelleniyor…</span>}
          </div>
          <Results data={q.data} body={settled ?? body} datasetId={dataset.id} />
        </div>
      )}
    </>
  );
}
