import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, BarChart3, Database, Download, Eye, FileCode2, Flag, Info, ListChecks, OctagonAlert, Play, Scale, ShieldCheck, Table2 } from 'lucide-react';
import { ALL_MODELS, MODEL_INFO, type ModelCv, type ModelId } from '@statadvisor/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, Callout, CheckboxGroup, CodeBlock, DataTable, LinkButton, MetricTile, Panel, ProgressBar, SectionHeader, Select, StatusLine, Tag, type Column } from '@/components/ui';
import { useActiveDataset } from '@/context/AppContext';
import { ApiClientError, type ColumnInfo, type DatasetInfo, type ModelRunBody, type ModelRunJob } from '@/data/api';
import { useCapabilities, useModelRun, useModelRunCode, useStartModelRun } from '@/data/hooks';
import { columnTypeLabel } from '@/lib/variables';
import { NoteList, SaveToReports } from '../regression/shared';
import { AssociationPanel, ClassDetail } from './MlInsights';

const nf = new Intl.NumberFormat('tr-TR');
const pct = (x: number, d = 1) => (Number.isFinite(x) ? `%${(x * 100).toFixed(d)}` : '–');

/** Hedef adayı: 2–20 farklı değeri olan, kimlik olmayan sütunlar. */
const targetCandidates = (cols: ColumnInfo[]) => cols.filter((c) => !c.likelyId && c.unique >= 2 && c.unique <= 20);
const numericFeatures = (cols: ColumnInfo[], target: string | undefined) => cols.filter((c) => c.name !== target && c.numeric && c.type !== 'categorical' && !c.likelyId);
const categoricalFeatures = (cols: ColumnInfo[], target: string | undefined) => cols.filter((c) => c.name !== target && !c.likelyId && (!c.numeric || c.type === 'categorical') && c.unique >= 2 && c.unique <= 30);

const DEFAULT_MODELS: ModelId[] = ['baseline', 'logistic', 'tree', 'knn', 'rf', 'gb'];

/** Son iş kimliği veri seti başına bu sekmenin oturumunda saklanır; depolama kapalı ya da bozuksa sessizce yok sayılır. */
const jobKey = (datasetId: string) => `statadvisor.modelRun.${datasetId}`;
function readJobId(datasetId: string): string | null {
  try {
    const v = sessionStorage.getItem(jobKey(datasetId));
    return v && /^[\w-]{1,100}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}
function writeJobId(datasetId: string, id: string | null) {
  try {
    if (id === null) sessionStorage.removeItem(jobKey(datasetId));
    else sessionStorage.setItem(jobKey(datasetId), id);
  } catch {
    // Depolama kapalıysa iş yalnızca bu açılışta izlenir.
  }
}

export function RealDataComparison() {
  const { dataset, loading, error } = useActiveDataset();
  if (loading) return <p className="text-fg-muted">Yükleniyor…</p>;
  if (error) return <StatusLine status="danger">{error.message}</StatusLine>;
  if (!dataset) {
    return (
      <>
        <PageHeader title="Model Karşılaştırma" description="Kendi verinizde birkaç sınıflandırma modelini çapraz doğrulamayla karşılaştırın." />
        <Callout tone="info" icon={Database} title="Önce bir veri seti seçin" actions={<Link className="rounded-control bg-primary-strong px-4 py-2 font-semibold text-on-primary-strong" to="/veri">Veri setlerine git</Link>}>
          Analiz için bir CSV dosyası yükleyin ya da örnek bir veri setiyle başlayın.
        </Callout>
      </>
    );
  }
  return <Comparison key={dataset.id} dataset={dataset} />;
}

/** Yatay çubuk grafik: ortalama doğruluk ± SS, taban doğruluğu kesikli çizgi. */
function AccuracyBars({ models, baseline }: { models: ModelCv[]; baseline: number }) {
  const rows = models.filter((m) => !m.skipped);
  const W = 640;
  const rowH = 34;
  const m = { l: 170, r: 24, t: 10, b: 28 };
  const H = m.t + rows.length * rowH + m.b;
  const lo = Math.max(0, Math.min(baseline, ...rows.map((r) => r.accuracy.mean - r.accuracy.sd)) - 0.05);
  const x = (v: number) => m.l + ((v - lo) / (1 - lo)) * (W - m.l - m.r);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => lo + t * (1 - lo));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Modellerin çapraz doğrulama doğrulukları: ${rows.map((r) => `${r.label} ${pct(r.accuracy.mean)}`).join(', ')}. Taban doğruluğu ${pct(baseline)}.`} className="w-full max-w-3xl">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={x(t)} x2={x(t)} y1={m.t} y2={H - m.b} stroke="var(--color-line)" strokeOpacity={0.25} />
          <text x={x(t)} y={H - 10} textAnchor="middle" fontSize={11} fill="var(--color-fg-subtle)">{`${Math.round(t * 100)}%`}</text>
        </g>
      ))}
      {rows.map((r, i) => {
        const y0 = m.t + i * rowH;
        const isBase = r.id === 'baseline';
        return (
          <g key={r.id}>
            <text x={m.l - 8} y={y0 + rowH / 2 + 4} textAnchor="end" fontSize={12} fill="var(--color-fg)">{r.label.replace(/ \(.*\)/, '')}</text>
            <rect x={m.l} y={y0 + 7} width={Math.max(1, x(r.accuracy.mean) - m.l)} height={rowH - 16} rx={3} fill={isBase ? 'var(--color-fg-subtle)' : 'var(--color-primary-strong)'} fillOpacity={isBase ? 0.5 : 0.85} />
            <line x1={x(Math.max(lo, r.accuracy.mean - r.accuracy.sd))} x2={x(Math.min(1, r.accuracy.mean + r.accuracy.sd))} y1={y0 + rowH / 2} y2={y0 + rowH / 2} stroke="var(--color-fg)" strokeWidth={1.5} />
            <text x={x(Math.min(1, r.accuracy.mean + r.accuracy.sd)) + 6} y={y0 + rowH / 2 + 4} fontSize={11} fill="var(--color-fg-muted)">{pct(r.accuracy.mean)}</text>
          </g>
        );
      })}
      <line x1={x(baseline)} x2={x(baseline)} y1={m.t} y2={H - m.b} stroke="var(--color-tertiary)" strokeDasharray="5 4" strokeWidth={1.5} />
    </svg>
  );
}

function Results({ job }: { job: ModelRunJob }) {
  const r = job.result!;
  const interp = job.interpretation!;
  const caps = useCapabilities();
  const code = useModelRunCode(job.id, true);
  const ran = r.models.filter((m) => !m.skipped);
  const skipped = r.models.filter((m) => m.skipped);
  const real = ran.filter((m) => m.id !== 'baseline');
  const best = real.length ? real.reduce((a, b) => (b.accuracy.mean > a.accuracy.mean ? b : a)) : undefined;
  const cols: Column<ModelCv>[] = [
    { key: 'model', header: 'Model', cell: (m) => <span className="font-medium text-fg">{m.label}{m.id === best?.id && <Tag tone="secondary" className="ml-2">en yüksek doğruluk</Tag>}</span> },
    { key: 'acc', header: 'Test doğruluğu', align: 'right', numeric: true, cell: (m) => `${pct(m.accuracy.mean)} ± ${(m.accuracy.sd * 100).toFixed(1)}` },
    { key: 'f1', header: 'Makro F1', align: 'right', numeric: true, cell: (m) => `${m.macroF1.mean.toFixed(3)} ± ${m.macroF1.sd.toFixed(3)}` },
    { key: 'auc', header: 'AUC', align: 'right', numeric: true, cell: (m) => (m.auc ? `${m.auc.mean.toFixed(3)} ± ${m.auc.sd.toFixed(3)}` : '–') },
    { key: 'train', header: 'Eğitim doğruluğu', align: 'right', numeric: true, cell: (m) => pct(m.trainAccuracy) },
    { key: 'gap', header: 'Eğitim − test', align: 'right', numeric: true, cellClassName: (m) => (m.gap >= 0.1 ? 'font-semibold text-tertiary' : undefined), cell: (m) => `${(m.gap * 100).toFixed(1)} puan` },
    { key: 'time', header: 'Süre', align: 'right', numeric: true, cell: (m) => `${m.seconds.toFixed(1)} s` },
  ];
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile label="Gözlem" value={nf.format(r.n)} unit="satır" icon={Table2} tone={r.droppedRows ? 'tertiary' : 'default'}>
          {r.droppedRows ? `${nf.format(r.droppedRows)} satır hedefi eksik olduğu için çıkarıldı` : 'Hedefi eksik satır yok'} · {r.featureColumns.length} model sütunu
        </MetricTile>
        <MetricTile label="Sınıf sayısı" value={r.classes.length} icon={ListChecks}>
          {r.classes.map((c, i) => `${c}: ${nf.format(r.classCounts[i]!)}`).join(' · ')}
        </MetricTile>
        <MetricTile label="Taban doğruluğu" value={pct(r.baselineAccuracy)} icon={Scale}>
          Her gözlemi en sık sınıfa atayan modelin doğruluğu; modeller bunun üstünde olmalı
        </MetricTile>
        <MetricTile label="En yüksek doğruluk" value={best ? pct(best.accuracy.mean) : '–'} icon={Activity} tone="secondary">
          {best ? `${best.label} · ${r.folds} katlı çapraz doğrulama ortalaması` : 'Karşılaştırılacak model yok'}
        </MetricTile>
      </div>

      <Panel>
        <SectionHeader icon={Table2} title="Çapraz doğrulama sonuçları" level={3} description={`Tabakalı ${r.folds} katlı çapraz doğrulama: her gözlem tam bir kez test edilir. ± değeri katmanlar arası standart sapmadır.`} />
        <DataTable caption="Model karşılaştırma sonuçları" columns={cols} rows={ran} rowKey={(m) => m.id} density="compact" />
        <div className="mt-4 flex flex-col gap-2 rounded-card bg-surface-lowest p-3">
          <StatusLine status="info">
            Doğruluk tek başına yeterli değildir; sınıflar dengesizse makro F1’e de bakın. Eğitim doğruluğu en çok 3000 gözlemlik tohumlu bir alt örnekte hesaplanır.
          </StatusLine>
          <StatusLine status="info">
            Ağaç, rastgele orman ve gradyan artırma rastgelelik içerir: scikit-learn ile aynı katmanlarda bile doğruluk birkaç binde ayrışabilir. Taban, lojistik, k-NN ve SVM scikit-learn ile birebir aynı sonucu verir.
          </StatusLine>
        </div>
        {skipped.map((m) => (
          <div key={m.id} className="mt-3">
            <StatusLine status="warning">
              <strong>{m.label} atlandı.</strong> {m.skipped}
            </StatusLine>
          </div>
        ))}
      </Panel>

      <Panel>
        <SectionHeader icon={Flag} title="Yorum ve uyarılar" level={3} description="Her cümle sayılardan üretilir. Eşikler (sınıf dengesi, eğitim–test farkı ≥ 10 puan) başparmak kurallarıdır." />
        <NoteList notes={interp.notes} />
      </Panel>

      <Panel>
        <SectionHeader icon={BarChart3} title="Doğruluk karşılaştırması" level={3} description="Çubuk: ortalama test doğruluğu; çizgi: ± 1 standart sapma; kesikli çizgi: taban doğruluğu." />
        <AccuracyBars models={r.models} baseline={r.baselineAccuracy} />
      </Panel>

      <ClassDetail result={r} defaultId={interp.best?.id} />
      <AssociationPanel result={r} interp={interp} />

      <Panel>
        <SectionHeader icon={ShieldCheck} title="Yöntem" level={3} />
        <ul className="flex list-disc flex-col gap-2 pl-5 text-body text-fg">
          <li>Gözlemler, sınıf oranlarını koruyarak ({r.folds} katmana) bölündü; tohum {r.seed}.</li>
          <li>Eksik değer doldurma, standartlaştırma ve tek-sıcak kodlama <strong>her katmanda yalnızca eğitim satırlarına</strong> uydurulur; test satırlarından eğitime bilgi sızmaz.</li>
          <li>Sayısal özelliklerde eksik değer eğitim medyanıyla, kategorik özelliklerde en sık düzeyle doldurulur. Hedefi eksik satırlar çıkarılır.</li>
          <li>Hiper-parametreler ayarlanmadı: scikit-learn varsayılanları kullanıldı. Ayarlanmış modeller farklı sıralanabilir.</li>
        </ul>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          {ran.map((m) => (
            <div key={m.id} className="rounded-card border border-line/30 bg-surface-lowest p-3">
              <p className="text-body font-semibold text-fg">{m.label} <span className="font-normal text-fg-subtle">· {m.family}</span></p>
              <p className="mt-1 text-caption text-fg-muted">{m.note}</p>
              <p className="mt-1 font-mono text-caption text-fg-subtle">{m.sklearn}</p>
            </div>
          ))}
        </div>
      </Panel>

      <Panel>
        <SectionHeader icon={FileCode2} title="Rapor ve Python (scikit-learn) kodu" level={3} description="Rapor; sonuçları, yorumları, sınıf bazında tabloları, ilişkileri, yöntemi ve denetim izini içerir. Betik, katman atamasını aynı tohumlu karıştırmayla yeniden üretir ve aynı karşılaştırmayı yapar; veri dosyasını betikle aynı klasöre koyun." />
        <SaveToReports url={`/api/model-runs/${job.id}/save`} resetKey={job.id} />
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <LinkButton variant="tonal" icon={Eye} href={`/api/model-runs/${job.id}/report?format=html`} target="_blank" rel="noopener noreferrer">Raporu aç (HTML)</LinkButton>
          <LinkButton variant="primary" icon={Download} href={`/api/model-runs/${job.id}/report?format=docx`} download="model-karsilastirma-raporu.docx">Word (.docx)</LinkButton>
          {caps.data?.pdf !== false && <LinkButton variant="secondary" icon={Download} href={`/api/model-runs/${job.id}/report?format=pdf`} download="model-karsilastirma-raporu.pdf">PDF</LinkButton>}
        </div>
        {code.isLoading && <p className="text-body text-fg-muted">Kod hazırlanıyor…</p>}
        {code.isError && <StatusLine status="danger">{code.error.message}</StatusLine>}
        {code.data && <CodeBlock code={code.data.code} filename={code.data.filename} runtime={`Python · ${code.data.requirements.join(', ')}`} lineNumbers maxHeight="28rem" />}
      </Panel>
    </>
  );
}

function Comparison({ dataset }: { dataset: DatasetInfo }) {
  const cols = dataset.columns;
  const targets = targetCandidates(cols);
  const [target, setTarget] = useState<string | undefined>(() => (targets.filter((c) => c.type === 'categorical' || !c.numeric).at(-1) ?? targets.at(-1))?.name);
  const [numeric, setNumeric] = useState<string[] | null>(null);
  const [categorical, setCategorical] = useState<string[] | null>(null);
  const [models, setModels] = useState<ModelId[]>(DEFAULT_MODELS);
  const [folds, setFolds] = useState('5');
  const [seed, setSeed] = useState('42');
  const [jobId, setJobId] = useState<string | null>(() => readJobId(dataset.id));
  const syncedJob = useRef<string | null>(null);
  // Yalnızca açılışta geri yüklenen işin ayarları forma yansıtılır; kullanıcı forma dokunduysa üzerine yazılmaz.
  const restoredJobId = useRef(jobId);
  const touched = useRef(false);
  const touch = <T,>(set: (v: T) => void) => (v: T) => {
    touched.current = true;
    set(v);
  };

  const numOptions = numericFeatures(cols, target);
  const catOptions = categoricalFeatures(cols, target);
  // kullanıcı dokunmadıysa, uygun tüm sütunlar varsayılan olarak seçili
  const numSel = (numeric ?? numOptions.map((c) => c.name)).filter((n) => numOptions.some((c) => c.name === n));
  const catSel = (categorical ?? catOptions.map((c) => c.name)).filter((n) => catOptions.some((c) => c.name === n));
  const start = useStartModelRun(dataset.id);
  const job = useModelRun(jobId);
  // Kayıtlı işin ilk durumu gelene kadar yeni iş başlatılamaz (iş zaten çalışıyor olabilir).
  const checking = jobId !== null && job.isPending;
  const running = job.data?.status === 'running' || start.isPending || checking;
  const seedNum = Number(seed);
  const seedOk = Number.isInteger(seedNum) && seedNum >= 0 && seedNum <= 2_147_483_647;
  const body = useMemo<ModelRunBody | null>(() => (target && numSel.length + catSel.length > 0 && models.length > 0 && seedOk ? { target, numeric: numSel, categorical: catSel, models, folds: Number(folds), seed: seedNum } : null), [target, numSel, catSel, models, folds, seedNum, seedOk]);

  // Kesin 404 (sunucu yeniden başladı ya da iş silindi): eski başvuruyu bırak; geçici ağ hatalarında tutulur.
  const stale = job.error instanceof ApiClientError && job.error.status === 404;
  useEffect(() => {
    if (!stale) return;
    writeJobId(dataset.id, null);
    setJobId(null);
  }, [stale, dataset.id]);
  // Geri yüklenen işin ayarlarını forma yansıt; form gösterilen sonuçla çelişmesin.
  const spec = job.data?.spec;
  const specJobId = job.data?.id;
  useEffect(() => {
    if (!spec || !specJobId || syncedJob.current === specJobId) return;
    syncedJob.current = specJobId;
    if (touched.current || specJobId !== restoredJobId.current) return;
    setTarget(spec.target);
    setNumeric(spec.numeric);
    setCategorical(spec.categorical);
    setModels(spec.models);
    setFolds(String(spec.folds));
    setSeed(String(spec.seed));
  }, [spec, specJobId]);

  const run = () => {
    if (!body || running) return;
    touched.current = true;
    start.mutate(body, {
      onSuccess: (j) => {
        writeJobId(dataset.id, j.id);
        setJobId(j.id);
      },
    });
  };
  const onTarget = (name: string) => {
    touched.current = true;
    setTarget(name);
    setNumeric(null);
    setCategorical(null);
  };
  const j = job.data;
  const progress = j && j.progress.total ? (j.progress.done / j.progress.total) * 100 : 0;

  return (
    <>
      <PageHeader
        context={<span className="font-mono">{dataset.name}</span>}
        title="Model Karşılaştırma (kendi verinizde)"
        description="Hedef sütunu ve özellikleri seçin; birkaç sınıflandırma modeli tabakalı çapraz doğrulamayla karşılaştırılsın. Ön işleme her katmanda yalnızca eğitim verisine uydurulur, sonuç tabanla birlikte okunur ve scikit-learn kodu üretilir."
      />

      {targets.length === 0 ? (
        <Callout tone="warning" icon={Info} title="Hedef sütunu bulunamadı">
          Sınıflandırma için 2–20 farklı değer içeren bir hedef sütun gerekir (ör. sınıf etiketi). Bu veri setinde böyle bir sütun yok; sayısal bir sonuç için Doğrusal Regresyon sayfasını kullanın.
        </Callout>
      ) : (
        <Panel>
          <SectionHeader icon={Scale} title="Karşılaştırma kurulumu" level={3} description="Hedef ve özellikler seçildikten sonra “Karşılaştırmayı başlat”a basın. Süre veri büyüklüğüne ve seçilen modellere bağlıdır; ilerleme canlı gösterilir." />
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Select label="Hedef sütun (sınıf)" value={target} onChange={onTarget} options={targets.map((c) => ({ value: c.name, label: `${c.name} · ${c.unique} sınıf` }))} />
              <Select label="Katman sayısı" value={folds} onChange={touch(setFolds)} options={['3', '5', '10'].map((v) => ({ value: v, label: `${v} katlı` }))} hint="Her sınıfta en az katman sayısı kadar gözlem olmalı." />
              <label className="flex min-w-0 flex-col gap-1.5 text-caption font-medium text-fg-subtle">
                Tohum (tekrarlanabilirlik)
                <input className="h-10 w-full rounded-card border border-line/40 bg-surface-lowest px-3 text-body text-fg hover:border-line-strong" inputMode="numeric" value={seed} onChange={(e) => touch(setSeed)(e.target.value)} aria-invalid={!seedOk} />
                {!seedOk && <span className="font-normal text-danger">0 ile 2147483647 arasında bir tamsayı girin.</span>}
              </label>
            </div>
            <CheckboxGroup
              legend="Sayısal özellikler"
              options={numOptions.map((c) => ({ value: c.name, label: c.name, hint: columnTypeLabel[c.type] }))}
              values={numSel}
              onChange={touch(setNumeric)}
              hint="Varsayılan: hedef dışındaki tüm sayısal sütunlar. Kimlik benzeri sütunlar listede yoktur."
            />
            <CheckboxGroup
              legend="Kategorik özellikler (tek-sıcak kodlanır)"
              options={catOptions.map((c) => ({ value: c.name, label: c.name, hint: `${c.unique} düzey` }))}
              values={catSel}
              onChange={touch(setCategorical)}
              hint="Metin sütunları ve “kategorik” olarak işaretlenmiş sayısal kodlar."
            />
            <CheckboxGroup
              legend="Modeller"
              options={ALL_MODELS.map((id) => ({ value: id, label: MODEL_INFO[id].label, hint: MODEL_INFO[id].family }))}
              values={models}
              onChange={(v) => touch(setModels)(v as ModelId[])}
              hint="Taban modeli her zaman eklemeniz önerilir. Destek vektör makinesi gözlem sayısıyla hızla yavaşlar (13 bin satırda yaklaşık 1 dakika; 15 bin eğitim gözleminin üzerinde atlanır)."
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary" icon={Play} disabled={!body || running} onClick={run}>
                {running ? 'Çalışıyor…' : 'Karşılaştırmayı başlat'}
              </Button>
              {!body && <span className="text-caption text-fg-subtle">En az bir özellik ve bir model seçin.</span>}
              {start.isError && <StatusLine status="danger" className="text-caption">{start.error.message}</StatusLine>}
            </div>
          </div>
        </Panel>
      )}

      {j?.status === 'running' && (
        <Panel>
          <SectionHeader icon={Activity} title="Çalışıyor" level={3} description={`${j.progress.done} / ${j.progress.total || '…'} adım · ${j.progress.model ? `${j.progress.model}, katman ${j.progress.fold}` : 'hazırlanıyor'} · ${j.elapsedSeconds.toFixed(0)} s`} />
          <ProgressBar value={progress} label="Model karşılaştırma ilerlemesi" />
          <p className="mt-2 text-caption text-fg-subtle" aria-live="polite">Sunucu hesaplama sırasında kısa süre yanıt vermeyebilir; sayfayı kapatmayın.</p>
        </Panel>
      )}
      {j?.status === 'error' && (
        <Callout tone="danger" icon={OctagonAlert} title="Karşılaştırma tamamlanamadı">
          {j.error}
        </Callout>
      )}
      {job.isError && !stale && (
        <Callout tone="danger" icon={OctagonAlert} title="Durum alınamadı">
          {job.error.message}
        </Callout>
      )}
      {j?.status === 'done' && j.result && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-2">
            <Tag tone="primary">{j.result.models.filter((m) => !m.skipped).length} model</Tag>
            <Tag>{j.result.folds} katlı çapraz doğrulama</Tag>
            <Tag>{j.elapsedSeconds.toFixed(1)} s</Tag>
          </div>
          <Results job={j} />
        </div>
      )}
    </>
  );
}
