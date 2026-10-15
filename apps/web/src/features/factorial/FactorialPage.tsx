import { useMemo, useState } from 'react';
import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Database, FileText, Grid3x3, Info, Languages, OctagonAlert, ShieldCheck, Table2, TriangleAlert } from 'lucide-react';
import { formatP } from '@statadvisor/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { Callout, CheckboxGroup, CodeBlock, DataTable, MetricTile, Panel, SectionHeader, Select, StatusLine, Tag, type Column } from '@/components/ui';
import { useActiveDataset, useApp } from '@/context/AppContext';
import type { ColumnInfo, DatasetInfo, FactorialBody, FactorialResponse } from '@/data/api';
import { useFactorial } from '@/data/hooks';
import { useDebounced } from '@/lib/useDebounced';
import { columnTypeLabel } from '@/lib/variables';
import { n2, nf, ReportActions, SaveToReports } from '../regression/shared';

/** Bağımlı değişken adayı: sayısal, kimlik olmayan sütunlar. */
const dependentCandidates = (cols: ColumnInfo[]) => cols.filter((c) => c.numeric && c.type !== 'categorical' && !c.likelyId);
/** Faktör adayı: 2–20 farklı değer içeren, kimlik olmayan sütunlar. */
const factorCandidates = (cols: ColumnInfo[]) => cols.filter((c) => !c.likelyId && c.unique >= 2 && c.unique <= 20);

const pCell = (p: number, df: number) => (df > 0 && Number.isFinite(p) ? formatP(p, true) : '–');

export function FactorialPage() {
  const { dataset, loading, error, datasets } = useActiveDataset();
  const { setDatasetId } = useApp();
  const [params] = useSearchParams();
  // Adres satırından gelen veri seti: ?veri=<kimlik> (ve isteğe bağlı bagimli, faktor). Etkin veri setini değiştirir.
  const wanted = params.get('veri');
  useEffect(() => {
    if (wanted && dataset?.id !== wanted && datasets.some((d) => d.id === wanted)) setDatasetId(wanted);
  }, [wanted, dataset?.id, datasets, setDatasetId]);
  if (loading) return <p className="text-fg-muted">Yükleniyor…</p>;
  if (error) return <StatusLine status="danger">{error.message}</StatusLine>;
  if (!dataset) {
    return (
      <>
        <PageHeader title="Faktöriyel ANOVA" description="Bir sayısal sonucu birden çok faktöre ve faktörlerin etkileşimlerine göre sınayan çok faktörlü varyans analizi." />
        <Callout tone="info" icon={Database} title="Önce bir veri seti seçin" actions={<Link className="rounded-control bg-primary-strong px-4 py-2 font-semibold text-on-primary-strong" to="/veri">Veri setlerine git</Link>}>
          Analiz için bir CSV, Excel ya da SPSS (.sav) dosyası yükleyin.
        </Callout>
      </>
    );
  }
  const preset = wanted === dataset.id ? { dependent: params.get('bagimli') ?? undefined, factors: params.getAll('faktor') } : undefined;
  return <Factorial key={dataset.id} dataset={dataset} preset={preset} />;
}

type Row = string[];

function Results({ data, body, datasetId }: { data: FactorialResponse; body: FactorialBody; datasetId: string }) {
  const r = data.result;
  const anova: Row[] = [
    ['Düzeltilmiş model', n2(r.model.ss), String(r.model.df), n2(r.model.ms), n2(r.model.F), pCell(r.model.p, r.model.df), '–'],
    ...r.terms.map((t) => [t.name, n2(t.ss), String(t.df), n2(t.ms), n2(t.F), pCell(t.p, t.df), n2(t.partialEta2, 3).replace(/^0/, '')]),
    ['Hata', n2(r.error.ss), String(r.error.df), n2(r.error.ms), '–', '–', '–'],
    ['Toplam (düzeltilmiş)', n2(r.total.ssCorrected), String(r.total.dfCorrected), '–', '–', '–', '–'],
  ];
  const header = ['Kaynak', 'Kareler toplamı', 'sd', 'Kareler ortalaması', 'F', 'p', 'ηp²'];
  const cols: Column<Row>[] = header.map((h, i) => ({
    key: h,
    header: h,
    numeric: i > 0,
    align: i > 0 ? 'right' : 'left',
    cell: (row) => (i === 0 ? <span className="font-medium text-fg">{row[i]}</span> : row[i]),
    cellClassName: (row) => (i === 5 && row[i] !== '–' && (row[i]!.startsWith('<') || Number(row[i]) < r.alpha) ? 'font-semibold text-secondary' : undefined),
  }));
  const cellCols: Column<Row>[] = [...r.factors, 'n', 'Ortalama', 'SS'].map((h, i) => ({ key: h, header: h, numeric: i >= r.factors.length, align: i >= r.factors.length ? 'right' : 'left', cell: (row) => row[i] }));
  const cellRows: Row[] = r.cells.map((c) => [...c.levels, String(c.n), n2(c.mean), n2(c.sd)]);

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile label="R² (açıklanan varyans)" value={n2(r.r2, 3).replace(/^0/, '')} tone={r.model.p < r.alpha ? 'secondary' : 'default'} icon={Grid3x3}>
          Düzeltilmiş R² = {n2(r.adjR2, 3).replace(/^0/, '')}
        </MetricTile>
        <MetricTile label={`Model F(${r.model.df}, ${r.error.df})`} value={n2(r.model.F)} tone={r.model.p < r.alpha ? 'secondary' : 'default'} icon={Table2}>
          p {formatP(r.model.p, true).startsWith('<') ? formatP(r.model.p, true) : `= ${formatP(r.model.p, true)}`}
        </MetricTile>
        <MetricTile label="Gözlem sayısı" value={nf.format(r.n)} unit="satır" icon={Table2} tone={r.dropped ? 'tertiary' : 'default'}>
          {r.dropped ? `${nf.format(r.dropped)} satır eksik değer nedeniyle çıkarıldı` : 'Eksik değer nedeniyle satır çıkarılmadı'}
        </MetricTile>
        <MetricTile label="Hücreler" value={`${r.totalCells - r.emptyCells}/${r.totalCells}`} tone={r.emptyCells ? 'tertiary' : 'default'} icon={Grid3x3}>
          Hücre başına n: {r.minCellN}–{r.maxCellN}
        </MetricTile>
      </div>

      {r.ssTypeSwitched && (
        <Callout tone="warning" icon={TriangleAlert} title="Boş hücre var: Tip II kullanıldı">
          {r.emptyCells} hücrede gözlem yok. Tip III kareler toplamı boş hücrelerde tanımsızdır; Tip II (marjinalite ilkesine uygun) hesaplandı. Sonuçlar SPSS’in Tip III çıktısından farklı olabilir.
        </Callout>
      )}
      {r.minCellN < 5 && (
        <Callout tone="warning" icon={TriangleAlert} title="Küçük hücreler">
          En küçük hücrede yalnızca {r.minCellN} gözlem var; varsayım testlerinin gücü ve sonuçların kararlılığı sınırlıdır.
        </Callout>
      )}

      <Panel>
        <SectionHeader icon={Table2} title={`ANOVA tablosu (Tip ${r.ssType})`} level={3} description="ηp²: kısmi eta-kare (≈ .01 küçük, .06 orta, .14 büyük etki). Anlamlı etkileşim varsa ana etkiler tek başına yorumlanmamalıdır." />
        <DataTable caption="ANOVA tablosu" columns={cols} rows={anova} rowKey={(row) => row[0]!} density="compact" />
      </Panel>

      <Panel>
        <SectionHeader icon={ShieldCheck} title="Varsayımlar" level={3} />
        <ul className="flex list-disc flex-col gap-2 pl-5 text-body text-fg">
          {r.levene && (
            <li>
              Levene (hücreler arası varyans homojenliği): F({r.levene.df1}, {r.levene.df2}) = {n2(r.levene.F)}, p {formatP(r.levene.p, true)} · {r.levene.p >= r.alpha ? 'sağlandı' : <strong>ihlal edildi</strong>}
            </li>
          )}
          {r.residualNormality && (
            <li>
              Shapiro-Wilk (kalıntılar): W = {n2(r.residualNormality.W, 3)}, p {formatP(r.residualNormality.p, true)} · {r.residualNormality.p >= r.alpha ? 'sağlandı' : <strong>ihlal edildi</strong>}
            </li>
          )}
        </ul>
      </Panel>

      <Panel>
        <SectionHeader icon={Table2} title="Hücre ortalamaları" level={3} description="Faktör düzeyi kombinasyonlarına göre ortalama ve standart sapma. Etkileşim grafikleri raporda yer alır." />
        <DataTable caption="Hücre ortalamaları" columns={cellCols} rows={cellRows} rowKey={(row) => row.slice(0, r.factors.length).join('|')} density="compact" />
      </Panel>

      {r.postHoc.map((ph) => {
        const pcols: Column<Row>[] = ['Çift', 'Fark', `%${Math.round((1 - r.alpha) * 100)} GA`, 'p', 'Sonuç'].map((h, i) => ({
          key: h,
          header: h,
          numeric: i > 0 && i < 4,
          align: i > 0 && i < 4 ? 'right' : 'left',
          cell: (row) => row[i],
          cellClassName: (row) => (i === 4 && row[i] === 'Anlamlı' ? 'font-semibold text-secondary' : undefined),
        }));
        const prows: Row[] = ph.pairs.map((x) => [`${x.a} – ${x.b}`, n2(x.diff), `[${n2(x.ciLow)}, ${n2(x.ciHigh)}]`, formatP(x.p, true), x.p < r.alpha ? 'Anlamlı' : 'Anlamlı değil']);
        return (
          <Panel key={ph.factor}>
            <SectionHeader icon={Table2} title={`İkili karşılaştırmalar: ${ph.factor} (Tukey HSD)`} level={3} description="Modelin hata kareler ortalamasıyla; p değerleri aile bazında düzeltilmiştir. Ortalamalar gözlenen marjinal ortalamalardır." />
            <DataTable caption={`${ph.factor} ikili karşılaştırmalar`} columns={pcols} rows={prows} rowKey={(row) => row[0]!} density="compact" />
          </Panel>
        );
      })}

      {r.simpleEffects.length > 0 && (
        <Panel>
          <SectionHeader icon={Table2} title="Basit etkiler (anlamlı etkileşimin ardından)" level={3} description="Bir faktörün etkisi, diğer faktörün her düzeyinde ayrı sınanır. Düzeltilmiş p: aynı ailedeki düzey sayısına göre Bonferroni." />
          <DataTable
            caption="Basit etkiler"
            columns={['Etkileşim', 'Etki', 'Koşul', 'F', 'p', 'Düzeltilmiş p'].map((h, i) => ({
              key: h,
              header: h,
              numeric: i >= 3,
              align: i >= 3 ? 'right' : 'left',
              cell: (row: Row) => row[i],
              cellClassName: (row: Row) => (i === 5 && (row[i]!.startsWith('<') || Number(row[i]) < r.alpha) ? 'font-semibold text-secondary' : undefined),
            }))}
            rows={r.simpleEffects.map((s) => [s.term, s.factor, `${s.at.factor} = ${s.at.level}`, `${n2(s.F)} (${s.df}, ${r.error.df})`, formatP(s.p, true), formatP(s.pAdj, true)])}
            rowKey={(row) => `${row[0]}|${row[1]}|${row[2]}`}
            density="compact"
          />
        </Panel>
      )}

      <Panel>
        <SectionHeader icon={Languages} title="Nasıl okunur" level={3} />
        <ul className="flex list-disc flex-col gap-2 pl-5 text-body text-fg">
          {data.interpretation.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      </Panel>

      <Panel>
        <SectionHeader icon={FileText} title="Python kodu ve rapor" level={3} description="Rapor: amaç, tasarım, betimleyici istatistikler, varsayım grafikleri, ANOVA tablosu, post-hoc, etkileşim grafikleri, yorum ve APA özeti. Betik aynı sayıları numpy ve scipy ile yeniden üretir; veri dosyasını betikle aynı klasöre koyun." />
        <SaveToReports url={`/api/datasets/${datasetId}/factorial/save`} body={body} resetKey={`${datasetId}:${JSON.stringify(body)}`} />
        <ReportActions url={`/api/datasets/${datasetId}/factorial/report`} body={body} fileBase="faktoriyel-anova-raporu" />
        <CodeBlock code={data.code.code} filename={data.code.filename} runtime={`Python · ${data.code.requirements.join(', ')}`} lineNumbers maxHeight="28rem" />
      </Panel>
    </>
  );
}

function Factorial({ dataset, preset }: { dataset: DatasetInfo; preset?: { dependent?: string; factors: string[] } }) {
  const cols = dataset.columns;
  const deps = dependentCandidates(cols);
  const [dependent, setDependent] = useState<string | undefined>(() => (preset?.dependent && deps.some((c) => c.name === preset.dependent) ? preset.dependent : (deps.find((c) => c.type === 'continuous')?.name ?? deps[0]?.name)));
  const [factors, setFactors] = useState<string[]>(() => (preset?.factors ?? []).filter((f) => cols.some((c) => c.name === f)).slice(0, 4));
  const [alpha, setAlpha] = useState('0.05');
  const [ssType, setSsType] = useState<FactorialBody['ssType']>('auto');

  const options = factorCandidates(cols).filter((c) => c.name !== dependent);
  const body = useMemo<FactorialBody | null>(() => (dependent && factors.length > 0 ? { dependent, factors, alpha: Number(alpha), ssType } : null), [dependent, factors, alpha, ssType]);
  const settled = useDebounced(body, 400);
  const q = useFactorial(dataset.id, settled);
  const stale = body !== settled || q.isFetching;

  return (
    <>
      <PageHeader
        context={<span className="font-mono">{dataset.name}</span>}
        title="Faktöriyel ANOVA"
        description="Sayısal bir sonucu bir ya da birkaç faktöre ve faktörlerin etkileşimlerine göre sınar (ör. cinsiyet × bölüm × barınma). Tip III kareler toplamı, SPSS ile aynı biçimde; boş hücre varsa Tip II."
      />

      <Panel>
        <SectionHeader icon={Grid3x3} title="Model kurulumu" level={3} description="Seçimleri değiştirdikçe analiz otomatik yenilenir. Seçilen tüm faktörler arasındaki etkileşimler modele dahil edilir; eksik değerli satırlar çıkarılır." />
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Select
              label="Bağımlı değişken (sayısal sonuç)"
              value={dependent}
              onChange={(v) => {
                setDependent(v);
                setFactors((f) => f.filter((x) => x !== v));
              }}
              options={deps.map((c) => ({ value: c.name, label: `${c.name} · ${columnTypeLabel[c.type]}` }))}
            />
            <Select label="Anlamlılık düzeyi" value={alpha} onChange={setAlpha} options={[{ value: '0.05', label: 'α = 0,05' }, { value: '0.01', label: 'α = 0,01' }, { value: '0.1', label: 'α = 0,10' }]} />
            <Select
              label="Kareler toplamı"
              value={ssType}
              onChange={(v) => setSsType(v as FactorialBody['ssType'])}
              options={[
                { value: 'auto', label: 'Otomatik (önerilen)' },
                { value: 'III', label: 'Tip III' },
                { value: 'II', label: 'Tip II' },
              ]}
              hint="Boş hücre varsa Tip III tanımsızdır; otomatik seçim Tip II’ye geçer."
            />
          </div>
          <CheckboxGroup
            legend="Faktörler (en çok 4)"
            options={options.map((c) => ({ value: c.name, label: c.name, hint: `${c.unique} düzey` }))}
            values={factors}
            onChange={setFactors}
            hint="2–20 farklı değer içeren sütunlar. Sayısal kodlu gruplar (1, 2, 3) da faktör olarak kullanılabilir."
          />
        </div>
      </Panel>

      {!body && (
        <Callout tone="info" icon={Info} title="Faktör seçin">
          Analizi kurmak için en az bir faktör seçin. Etkileşim için iki ya da daha fazla faktör gerekir.
        </Callout>
      )}
      {q.isError && body && (
        <Callout tone="danger" icon={OctagonAlert} title="Analiz kurulamadı">
          {q.error.message}
        </Callout>
      )}
      {q.data && body && (
        <div className={stale ? 'flex flex-col gap-6 opacity-60 transition-opacity' : 'flex flex-col gap-6'} aria-busy={stale}>
          <div className="flex flex-wrap items-center gap-2">
            <Tag tone="primary">{q.data.spec.factors.length} faktör</Tag>
            <Tag>{q.data.result.terms.length} model terimi</Tag>
            {stale && <span className="text-caption text-fg-subtle">Güncelleniyor…</span>}
          </div>
          <Results data={q.data} body={settled ?? body} datasetId={dataset.id} />
        </div>
      )}
    </>
  );
}
