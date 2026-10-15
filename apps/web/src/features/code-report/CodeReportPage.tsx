import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ClipboardCheck, Database, Download, Eye, FileText, FileType2, FlaskConical, FolderOpen, Globe, History, Languages, Package, Quote, Route, ShieldAlert, SquareTerminal, Trash2, TriangleAlert } from 'lucide-react';
import { pText, REPORT_SECTION_IDS } from '@statadvisor/shared';
import { HeaderStat, PageHeader } from '@/components/layout/PageHeader';
import { QueryView } from '@/components/layout/PageStatus';
import { Button, Callout, Checklist, CodeBlock, ConsoleOutput, CopyButton, IconButton, LinkButton, Panel, RadioCardGroup, SectionHeader, SegmentedControl, StatusLine, Tag, type TagTone } from '@/components/ui';
import { DecisionPath } from '@/components/domain';
import { useActiveDataset } from '@/context/AppContext';
import type { CodeResponse, ReportKind, ReportListItem, SavedReportView } from '@/data/api';
import { useAnalysisCode, useCapabilities, useDeleteReport, useReports, useSavedAnalysis, useSavedReport, useSavedReportCode } from '@/data/hooks';
import { cn } from '@/lib/cn';
import { downloadText, toNotebook } from '@/lib/download';
import { NoteList } from '../regression/shared';

type Format = 'html' | 'pdf' | 'docx';
const formats: { id: Format; title: string; description: string; icon: typeof Globe }[] = [
  { id: 'html', title: 'HTML belgesi', description: 'Tarayıcıda açılır', icon: Globe },
  { id: 'pdf', title: 'PDF', description: 'A4, yazdırmaya hazır', icon: FileText },
  { id: 'docx', title: 'Word (.docx)', description: 'Düzenlenebilir; grafik içermez', icon: FileType2 },
];
const SECTION_LABELS: Record<string, string> = {
  desc: 'Tanımlayıcı istatistikler (n, medyan, ortalama, standart sapma)',
  assump: 'Varsayım testleri ve karar notları',
  result: 'Test sonucu ve etki büyüklüğü',
  apa: 'APA 7 stilinde metin özeti',
  refs: 'Kaynakça',
};

const KIND_LABEL: Record<ReportKind, string> = { test: 'Test', regression: 'Regresyon', logistic: 'Lojistik', model: 'Model karşılaştırma', factorial: 'Faktöriyel ANOVA' };
const KIND_TONE: Record<ReportKind, TagTone> = { test: 'neutral', regression: 'primary', logistic: 'secondary', model: 'tertiary', factorial: 'primary' };
const KIND_ORDER: ReportKind[] = ['test', 'regression', 'logistic', 'model', 'factorial'];
const FILE_BASE: Record<Exclude<ReportKind, 'test'>, string> = { regression: 'regresyon-raporu', logistic: 'lojistik-regresyon-raporu', model: 'model-karsilastirma-raporu', factorial: 'faktoriyel-anova-raporu' };
const when = (iso: string) => new Date(iso).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
const ctaClass = 'rounded-control bg-primary-strong px-4 py-2 font-semibold text-on-primary-strong';

export function CodeReportPage() {
  const { dataset, loading, error } = useActiveDataset();
  const [params, setParams] = useSearchParams();
  const list = useReports(dataset?.id ?? null);

  if (loading) return <p className="text-fg-muted">Yükleniyor…</p>;
  if (error) return <StatusLine status="danger">{error.message}</StatusLine>;
  const head = (
    <PageHeader
      features={['Özellik 04 & 09']}
      context={dataset && <span className="font-mono">{dataset.name}</span>}
      title="Kod Üretimi ve Otomatik Raporlama Merkezi"
      description="Kaydedilmiş testlerin, regresyonların ve model karşılaştırmalarının Python karşılığı ve raporu. Betik çalıştırıldığında aşağıdaki beklenen çıktıyı üretir."
    />
  );
  if (!dataset) {
    return (
      <>
        {head}
        <Callout tone="info" icon={Database} title="Önce bir veri seti seçin" actions={<Link className={ctaClass} to="/veri">Veri setlerine git</Link>}>
          Kod ve rapor, kaydedilmiş bir analizden üretilir.
        </Callout>
      </>
    );
  }
  const reports = list.data ?? [];
  // Adres çubuğundaki seçim önceliklidir: yeni kaydedilen kayıt liste yenilenmeden de açılır.
  const analiz = params.get('analiz');
  const rapor = params.get('rapor');
  const selected = analiz ? { id: analiz, test: true } : rapor ? { id: rapor, test: false } : reports[0] ? { id: reports[0].id, test: reports[0].kind === 'test' } : null;

  if (!selected) {
    return (
      <>
        {head}
        {list.isPending ? (
          <p className="text-fg-muted">Yükleniyor…</p>
        ) : list.isError ? (
          <StatusLine status="danger">{list.error.message}</StatusLine>
        ) : (
          <Callout tone="info" icon={FlaskConical} title="Henüz kaydedilmiş rapor yok" actions={<Link className={ctaClass} to="/karar-sihirbazi">Karar Sihirbazı’na git</Link>}>
            Karar Sihirbazı’nda “Kaydet ve kod/rapor oluştur”a basın; Regresyon, Lojistik Regresyon ve Model Karşılaştırma sayfalarında ise sonucun altındaki “Rapor merkezine kaydet” düğmesini kullanın.
          </Callout>
        )}
      </>
    );
  }
  return (
    <>
      {head}
      <ReportList
        reports={reports}
        selectedId={selected.id}
        onPick={(r) => setParams(r.kind === 'test' ? { analiz: r.id } : { rapor: r.id })}
        onDeleted={(id) => {
          if (id === selected.id) setParams({});
        }}
      />
      {selected.test ? <TestReport key={selected.id} id={selected.id} /> : <SavedReport key={selected.id} id={selected.id} />}
    </>
  );
}

/** Kayıtlı raporların listesi: türe göre süzme, seçme ve (onaylı) silme. */
function ReportList({ reports, selectedId, onPick, onDeleted }: { reports: ReportListItem[]; selectedId: string; onPick: (r: ReportListItem) => void; onDeleted: (id: string) => void }) {
  const [filter, setFilter] = useState<'all' | ReportKind>('all');
  const [confirm, setConfirm] = useState<string | null>(null);
  const remove = useDeleteReport();
  const kinds = KIND_ORDER.filter((k) => reports.some((r) => r.kind === k));
  const active = filter !== 'all' && kinds.includes(filter) ? filter : 'all';
  const visible = active === 'all' ? reports : reports.filter((r) => r.kind === active);
  if (reports.length === 0) return null;
  return (
    <Panel className="mb-6">
      <SectionHeader
        icon={FolderOpen}
        title="Kayıtlı raporlar"
        level={3}
        description={`Bu veri setinde ${reports.length} kayıt. Bir kayda tıklayınca kodu ve raporu aşağıda açılır.`}
        actions={
          kinds.length > 1 && (
            <SegmentedControl
              label="Rapor türü"
              value={active}
              onChange={setFilter}
              options={[{ value: 'all' as const, label: `Tümü (${reports.length})` }, ...kinds.map((k) => ({ value: k, label: `${KIND_LABEL[k]} (${reports.filter((r) => r.kind === k).length})` }))]}
            />
          )
        }
      />
      <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto" aria-label="Kayıtlı raporlar">
        {visible.map((r) => {
          const isSel = r.id === selectedId;
          return (
            <li key={r.id} className={cn('flex flex-wrap items-center gap-2 rounded-card px-3 py-2 sm:flex-nowrap', isSel ? 'bg-surface-highest ring-1 ring-primary/40' : 'hover:bg-surface-high')}>
              <button type="button" className="flex min-w-0 flex-1 flex-col items-start gap-1 text-left" aria-current={isSel ? 'true' : undefined} onClick={() => onPick(r)}>
                <span className="flex max-w-full min-w-0 items-center gap-2">
                  <Tag tone={KIND_TONE[r.kind]}>{KIND_LABEL[r.kind]}</Tag>
                  <span className="truncate font-medium text-fg">{r.title}</span>
                </span>
                <span className="max-w-full truncate text-caption text-fg-subtle">
                  {when(r.createdAt)}
                  {r.detail && ` · ${r.detail}`}
                </span>
              </button>
              {confirm === r.id ? (
                <span className="inline-flex items-center gap-2" role="group" aria-label="Silme onayı">
                  <span className="text-caption text-fg-muted">Silinsin mi?</span>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={remove.isPending}
                    onClick={() =>
                      remove.mutate(
                        { id: r.id, kind: r.kind },
                        {
                          onSuccess: () => {
                            setConfirm(null);
                            onDeleted(r.id);
                          },
                        },
                      )
                    }
                  >
                    Evet, sil
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>
                    Vazgeç
                  </Button>
                </span>
              ) : (
                <IconButton icon={Trash2} label={`“${r.title}” kaydını sil`} onClick={() => setConfirm(r.id)} />
              )}
            </li>
          );
        })}
      </ul>
      {remove.isError && <StatusLine status="danger" className="mt-2 text-caption">{remove.error.message}</StatusLine>}
    </Panel>
  );
}

/** Biçim seçimi ve indirme düğmeleri; HTML yeni sekmede açılır. */
function ReportDownloads({ href, fileBase }: { href: (f: Format) => string; fileBase: string }) {
  const [format, setFormat] = useState<Format>('html');
  const caps = useCapabilities();
  const pdfOk = caps.data?.pdf ?? true;
  return (
    <>
      <RadioCardGroup legend="Çıktı biçimi" options={formats.map((f) => ({ value: f.id, title: f.title, description: f.description, icon: f.icon }))} value={format} onChange={setFormat} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <LinkButton variant="tonal" icon={Eye} href={href('html')} target="_blank" rel="noopener noreferrer">
          Raporu incele
        </LinkButton>
        {format === 'pdf' && !pdfOk ? (
          <Button variant="primary" icon={Download} disabled>
            İndir (.pdf)
          </Button>
        ) : (
          <LinkButton variant="primary" icon={Download} href={href(format)} download={`${fileBase}.${format}`}>
            İndir (.{format})
          </LinkButton>
        )}
      </div>
      {format === 'pdf' && !pdfOk && (
        <StatusLine status="warning" className="text-caption">
          PDF üretimi için Chromium gerekir. Terminalde <code className="font-mono">npx playwright install chromium</code> çalıştırın; bu sırada HTML raporunu tarayıcıdan PDF olarak yazdırabilirsiniz.
        </StatusLine>
      )}
    </>
  );
}

/** Kod, beklenen çıktı ve indirme düğmeleri (test ve kaydedilmiş raporlar için ortak). */
function CodePanel({ code, datasetId, title, scipy }: { code: CodeResponse; datasetId: string; title: string; scipy: string }) {
  return (
    <div className="flex flex-col gap-4">
      <CodeBlock code={code.code} filename={code.filename} runtime="Python 3" lineNumbers maxHeight="30rem" />
      <ConsoleOutput lines={code.expectedOutput} />
      <div className="flex flex-wrap items-center gap-3">
        <Button icon={Download} onClick={() => downloadText(code.filename, code.code, 'text/x-python')}>
          Betiği indir (.py)
        </Button>
        <Button icon={Download} onClick={() => downloadText(code.filename.replace(/\.py$/, '.ipynb'), toNotebook(code.code, title), 'application/x-ipynb+json')}>
          Jupyter defteri (.ipynb)
        </Button>
        <LinkButton icon={Download} href={`/api/datasets/${datasetId}/download`} download>
          Veri dosyasını indir
        </LinkButton>
      </div>
      <div>
        <h3 className="mb-2 flex items-center gap-2 text-body font-semibold text-fg">
          <Package size={16} aria-hidden /> Gerekli paketler
        </h3>
        <CodeBlock code={`pip install ${code.requirements.join(' ')}`} language="text" filename="kurulum" />
        <p className="mt-2 text-caption text-fg-subtle">Veri dosyasını betikle aynı klasöre koyun. Paket sürümleri sizin ortamınıza göre değişebilir; doğrulama {scipy} sürümlü SciPy ile yapıldı.</p>
      </div>
    </div>
  );
}

function ApaBox({ text, tags }: { text: string; tags?: React.ReactNode }) {
  return (
    <section aria-labelledby="apa-ozet">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 id="apa-ozet" className="text-body font-semibold text-fg">
          APA 7 stili metin özeti
        </h3>
        <CopyButton text={text} label="Metni kopyala" variant="ghost" />
      </div>
      <div className="rounded-card border border-line/30 bg-surface-lowest p-4">
        <p className="mb-2 text-caption text-fg-subtle">Bulgular bölümü için taslak · Türkçe, APA 7</p>
        <p className="font-[Georgia,serif] text-body-lg leading-7 text-fg">“{text}”</p>
        {tags && <div className="mt-3 flex flex-wrap gap-2">{tags}</div>}
      </div>
    </section>
  );
}

/** Kaydedilmiş regresyon, lojistik regresyon ya da model karşılaştırma raporu. */
function SavedReport({ id }: { id: string }) {
  const saved = useSavedReport(id);
  return <QueryView query={saved}>{(r) => <SavedReportBody r={r} />}</QueryView>;
}

function SavedReportBody({ r }: { r: SavedReportView }) {
  const code = useSavedReportCode(r.id, r.codeUnavailable === null);
  const href = (f: Format) => `/api/reports/${r.id}/report?format=${f}`;
  return (
    <>
      <div className="mb-6 flex flex-wrap gap-3">
        <HeaderStat label="Tür" icon={<span className="size-2 rounded-full bg-secondary" aria-hidden />}>
          {KIND_LABEL[r.kind]}
        </HeaderStat>
        {r.highlights.map(([k, v]) => (
          <HeaderStat key={k} label={k}>
            <span className="font-mono text-secondary">{v}</span>
          </HeaderStat>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <Panel className="min-w-0 lg:col-span-7">
          <SectionHeader icon={SquareTerminal} title="Hazır kod üretimi" feature="Özellik 04" description={`${r.title}. Betik veri dosyasını okuyup aynı modeli aynı ayarlarla yeniden kurar; çıktısı aşağıdaki beklenen çıktıyla aynıdır.`} />
          {r.codeUnavailable ? (
            <Callout tone="warning" icon={TriangleAlert} title="Kod üretilmedi">
              {r.codeUnavailable}
            </Callout>
          ) : (
            <QueryView query={code}>{(c) => <CodePanel code={c} datasetId={r.datasetId} title={`${KIND_LABEL[r.kind]}: ${r.title}`} scipy={r.engine.referenceSuite.scipy} />}</QueryView>
          )}
        </Panel>

        <Panel className="flex min-w-0 flex-col gap-5 lg:col-span-5">
          <SectionHeader icon={ClipboardCheck} title="Rapor" feature="Özellik 09" description="Sonuçları, yorumları, uyarıları, yöntemi, kaynakçayı ve denetim izini tek dosyada toplar. Rapor tarihi kayıt tarihidir; aynı kayıt her zaman aynı raporu verir." className="mb-0" />
          <ReportDownloads href={href} fileBase={FILE_BASE[r.kind]} />
          {r.apaSummary && <ApaBox text={r.apaSummary} />}
          {r.summary.length > 0 && (
            <section>
              <h3 className="mb-2 flex items-center gap-2 text-body font-semibold text-fg">
                <Languages size={16} aria-hidden /> {r.kind === 'model' ? 'Genel sonuç' : 'Nasıl okunur'}
              </h3>
              <ul className="flex list-disc flex-col gap-2 pl-5 text-body text-fg">
                {r.summary.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </section>
          )}
        </Panel>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Panel>
          <SectionHeader icon={TriangleAlert} title="Yorum ve uyarılar" level={3} description="Kayıt anındaki sonuçtan üretilir; eşikler başparmak kurallarıdır." />
          <NoteList notes={r.notes} />
        </Panel>
        <Panel>
          <SectionHeader icon={History} title="Denetim izi" level={3} description="Aynı veri ve aynı ayarlar her zaman aynı karmayı ve sonucu verir." />
          <dl className="grid grid-cols-1 gap-2 text-caption">
            {r.audit.map(([k, v]) => (
              <div key={k}>
                <dt className="text-fg-subtle">{k}</dt>
                <dd className="font-mono break-all text-fg">{v}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      </div>
    </>
  );
}

/** Karar Sihirbazı'nda kaydedilmiş test. */
function TestReport({ id }: { id: string }) {
  const saved = useSavedAnalysis(id);
  const code = useAnalysisCode(id);

  return (
    <QueryView query={saved}>
      {(a) => {
        const r = a.result;
        const o = r.outcome;
        const normal = r.assumptions.find((x) => x.name === 'Shapiro-Wilk');
        const href = (f: Format) => `/api/analyses/${id}/report?format=${f}`;
        return (
          <>
            <div className="mb-6 flex flex-wrap gap-3">
              <HeaderStat label="Önerilen test" icon={<span className="size-2 rounded-full bg-secondary" aria-hidden />}>
                {o.test}
              </HeaderStat>
              <HeaderStat label="İstatistik" icon={<FlaskConical size={18} className="text-secondary" aria-hidden />}>
                <span className="font-mono text-secondary">
                  {o.statisticText}, {pText(o.p, false)}
                </span>
              </HeaderStat>
              {normal && (
                <HeaderStat label="Normallik" icon={<ShieldAlert size={18} className={normal.passed ? 'text-success' : 'text-tertiary'} aria-hidden />}>
                  <span className={normal.passed ? 'text-success' : 'text-tertiary'}>{normal.passed ? 'Sağlandı' : 'İhlal'}</span>
                </HeaderStat>
              )}
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              <Panel className="min-w-0 lg:col-span-7">
                <SectionHeader
                  icon={SquareTerminal}
                  title="Hazır kod üretimi"
                  feature="Özellik 04"
                  description="Betik, veri dosyasını okuyup analizi aynı yöntemle yeniden yapar. Çıktısı aşağıdaki beklenen çıktıyla satır satır aynıdır."
                />
                <QueryView query={code}>{(c) => <CodePanel code={c} datasetId={a.datasetId} title={`${o.test} analizi`} scipy={a.engine.referenceSuite.scipy} />}</QueryView>
              </Panel>

              <Panel className="flex min-w-0 flex-col gap-5 lg:col-span-5">
                <SectionHeader icon={ClipboardCheck} title="Rapor" feature="Özellik 09" description="Tanımlayıcı istatistikleri, varsayım testlerini, sonucu, APA özetini, kaynakçayı ve denetim izini tek dosyada toplar." className="mb-0" />
                <ReportDownloads href={href} fileBase="rapor" />
                <ApaBox
                  text={r.apaSummary}
                  tags={
                    <>
                      <Tag>{o.statisticText}</Tag>
                      <Tag tone="secondary">{pText(o.p)}</Tag>
                      <Tag>
                        {o.effect.symbol} = {o.effect.value.toFixed(2)} ({o.effect.magnitude} etki)
                      </Tag>
                      <Tag>N = {o.n}</Tag>
                    </>
                  }
                />

                <div className="rounded-card bg-surface-lowest p-3">
                  <p className="mb-2 flex items-center gap-2 text-caption font-semibold text-fg-muted">
                    <Quote size={16} className="text-primary" aria-hidden /> Metodoloji kaynakçası
                  </p>
                  <ul className="flex flex-col gap-2">
                    {r.references.map((ref) => (
                      <li key={ref} className="flex items-start gap-2 text-caption text-fg-subtle">
                        <span className="min-w-0 flex-1">{ref}</span>
                        <CopyButton text={ref} label="Kopyala" variant="ghost" />
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-caption text-fg-subtle">Künyeleri yayınlamadan önce doğrulayın.</p>
                </div>
              </Panel>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
              <Panel>
                <SectionHeader icon={Route} title="Test önerisi" level={3} />
                <DecisionPath path={r.decision} compact />
                <p className="mt-3 text-body text-fg-muted">
                  Önerilen test <span className="font-medium text-fg">{o.test}</span>
                  {r.decision.rerouteReason ? `: ${r.decision.rerouteReason.toLowerCase()}.` : '.'}
                </p>
              </Panel>
              <Panel>
                <SectionHeader title="Rapor içeriği" level={3} description="Rapor dosyasında yer alan bölümler." />
                <Checklist items={[...REPORT_SECTION_IDS, 'audit'].map((s) => ({ id: s, label: s === 'audit' ? 'Denetim izi' : SECTION_LABELS[s]! }))} />
              </Panel>
              <Panel className="md:col-span-2 xl:col-span-1">
                <SectionHeader icon={History} title="Denetim izi" level={3} description="Aynı girdi her zaman aynı karmayı ve sonucu verir." />
                <dl className="grid grid-cols-1 gap-2 text-caption">
                  <div>
                    <dt className="text-fg-subtle">Girdi karması (SHA-256)</dt>
                    <dd className="font-mono break-all text-fg">{a.inputHash}</dd>
                  </div>
                  <div>
                    <dt className="text-fg-subtle">Motor ve kural kümesi</dt>
                    <dd className="font-mono text-fg">
                      {a.engine.engineName} {a.engine.engine} · {a.engine.ruleSet}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-fg-subtle">Referans doğrulama</dt>
                    <dd className="font-mono text-fg">
                      SciPy {a.engine.referenceSuite.scipy}, {a.engine.referenceSuite.cases} vaka
                    </dd>
                  </div>
                  <div>
                    <dt className="text-fg-subtle">Çalışma ortamı</dt>
                    <dd className="font-mono text-fg">Node {a.engine.node}</dd>
                  </div>
                </dl>
              </Panel>
            </div>
          </>
        );
      }}
    </QueryView>
  );
}
