import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ClipboardCheck, Database, Download, Eye, FileText, FileType2, FlaskConical, Globe, History, Package, Quote, Route, ShieldAlert, SquareTerminal } from 'lucide-react';
import { pText, REPORT_SECTION_IDS } from '@statadvisor/shared';
import { HeaderStat, PageHeader } from '@/components/layout/PageHeader';
import { QueryView } from '@/components/layout/PageStatus';
import { Button, Callout, Checklist, CodeBlock, ConsoleOutput, CopyButton, LinkButton, Panel, RadioCardGroup, SectionHeader, Select, StatusLine, Tag } from '@/components/ui';
import { DecisionPath } from '@/components/domain';
import { useActiveDataset } from '@/context/AppContext';
import { useAnalyses, useAnalysisCode, useCapabilities, useSavedAnalysis } from '@/data/hooks';
import { downloadText, toNotebook } from '@/lib/download';

type Format = 'html' | 'pdf' | 'docx';
const formats: { id: Format; title: string; description: string; icon: typeof Globe }[] = [
  { id: 'html', title: 'HTML belgesi', description: 'Grafiklerle, tarayıcıda açılır', icon: Globe },
  { id: 'pdf', title: 'PDF', description: 'A4, grafiklerle', icon: FileText },
  { id: 'docx', title: 'Word (.docx)', description: 'Düzenlenebilir; grafik içermez', icon: FileType2 },
];
const SECTION_LABELS: Record<string, string> = {
  desc: 'Tanımlayıcı istatistikler (n, medyan, ortalama, standart sapma)',
  assump: 'Varsayım testleri ve karar notları',
  result: 'Test sonucu ve etki büyüklüğü',
  apa: 'APA 7 stilinde metin özeti',
  refs: 'Kaynakça',
};

export function CodeReportPage() {
  const { dataset, loading, error } = useActiveDataset();
  const [params, setParams] = useSearchParams();
  const history = useAnalyses(dataset?.id ?? null);
  const id = params.get('analiz') ?? history.data?.[0]?.id ?? null;

  if (loading) return <p className="text-fg-muted">Yükleniyor…</p>;
  if (error) return <StatusLine status="danger">{error.message}</StatusLine>;
  const head = (
    <PageHeader
      features={['Özellik 04 & 09']}
      context={dataset && <span className="font-mono">{dataset.name}</span>}
      title="Kod Üretimi ve Otomatik Raporlama Merkezi"
      description="Kaydedilmiş analizin Python karşılığı ve raporu. Betik çalıştırıldığında aşağıdaki beklenen çıktıyı birebir üretir."
    />
  );
  if (!dataset) {
    return (
      <>
        {head}
        <Callout tone="info" icon={Database} title="Önce bir veri seti seçin" actions={<Link className="rounded-control bg-primary-strong px-4 py-2 font-semibold text-on-primary-strong" to="/veri">Veri setlerine git</Link>}>
          Kod ve rapor, kaydedilmiş bir analizden üretilir.
        </Callout>
      </>
    );
  }
  if (!id) {
    return (
      <>
        {head}
        {history.isPending ? (
          <p className="text-fg-muted">Yükleniyor…</p>
        ) : (
          <Callout tone="info" icon={FlaskConical} title="Henüz kaydedilmiş analiz yok" actions={<Link className="rounded-control bg-primary-strong px-4 py-2 font-semibold text-on-primary-strong" to="/karar-sihirbazi">Karar Sihirbazı’na git</Link>}>
            Karar Sihirbazı’nda bir analiz kurup “Kaydet ve kod/rapor oluştur” düğmesine basın.
          </Callout>
        )}
      </>
    );
  }
  return (
    <Report
      key={id}
      id={id}
      head={head}
      history={history.data ?? []}
      onPick={(v) => setParams({ analiz: v })}
    />
  );
}

function Report({ id, head, history, onPick }: { id: string; head: React.ReactNode; history: { id: string; createdAt: string; test: string }[]; onPick: (id: string) => void }) {
  const saved = useSavedAnalysis(id);
  const code = useAnalysisCode(id);
  const [format, setFormat] = useState<Format>('html');
  const caps = useCapabilities();
  const pdfOk = caps.data?.pdf ?? true;

  return (
    <>
      {head}
      <QueryView query={saved}>
        {(a) => {
          const r = a.result;
          const o = r.outcome;
          const normal = r.assumptions.find((x) => x.name === 'Shapiro-Wilk');
          const href = (f: Format) => `/api/analyses/${id}/report?format=${f}`;
          return (
            <>
              <div className="-mt-4 mb-6 flex flex-wrap items-end gap-4">
                {history.length > 1 && (
                  <Select
                    className="w-full max-w-md"
                    label="Kaydedilmiş analiz"
                    value={id}
                    onChange={onPick}
                    options={history.map((h) => ({ value: h.id, label: `${new Date(h.createdAt).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })} · ${h.test}` }))}
                  />
                )}
                <div className="flex flex-wrap gap-3">
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
              </div>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                <Panel className="min-w-0 lg:col-span-7">
                  <SectionHeader
                    icon={SquareTerminal}
                    title="Hazır kod üretimi"
                    feature="Özellik 04"
                    description="Betik, veri dosyasını okuyup analizi aynı yöntemle yeniden yapar. Çıktısı aşağıdaki beklenen çıktıyla satır satır aynıdır."
                  />
                  <QueryView query={code}>
                    {(c) => (
                      <div className="flex flex-col gap-4">
                        <CodeBlock code={c.code} filename={c.filename} runtime="Python 3" lineNumbers maxHeight="30rem" />
                        <ConsoleOutput lines={c.expectedOutput} />
                        <div className="flex flex-wrap items-center gap-3">
                          <Button icon={Download} onClick={() => downloadText(c.filename, c.code, 'text/x-python')}>
                            Betiği indir (.py)
                          </Button>
                          <Button icon={Download} onClick={() => downloadText(c.filename.replace(/\.py$/, '.ipynb'), toNotebook(c.code, `${o.test} analizi`), 'application/x-ipynb+json')}>
                            Jupyter defteri (.ipynb)
                          </Button>
                          <LinkButton icon={Download} href={`/api/datasets/${a.datasetId}/download`} download>
                            Veri dosyasını indir
                          </LinkButton>
                        </div>
                        <div>
                          <h3 className="mb-2 flex items-center gap-2 text-body font-semibold text-fg">
                            <Package size={16} aria-hidden /> Gerekli paketler
                          </h3>
                          <CodeBlock code={`pip install ${c.requirements.join(' ')}`} language="text" filename="kurulum" />
                          <p className="mt-2 text-caption text-fg-subtle">Veri dosyasını betikle aynı klasöre koyun. Paket sürümleri sizin ortamınıza göre değişebilir; doğrulama {a.engine.referenceSuite.scipy} sürümlü SciPy ile yapıldı.</p>
                        </div>
                      </div>
                    )}
                  </QueryView>
                </Panel>

                <Panel className="flex min-w-0 flex-col gap-5 lg:col-span-5">
                  <SectionHeader icon={ClipboardCheck} title="Rapor" feature="Özellik 09" description="Tanımlayıcı istatistikleri, varsayım testlerini, sonucu, APA özetini, kaynakçayı ve denetim izini tek dosyada toplar." className="mb-0" />
                  <RadioCardGroup legend="Çıktı biçimi" options={formats.map((f) => ({ value: f.id, title: f.title, description: f.description, icon: f.icon }))} value={format} onChange={setFormat} />
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <LinkButton variant="tonal" icon={Eye} href={href('html')} target="_blank" rel="noopener noreferrer">
                      Raporu incele
                    </LinkButton>
                    {format === 'html' && (
                      <LinkButton variant="primary" icon={Download} href={href('html')} download="rapor.html">
                        İndir (.html)
                      </LinkButton>
                    )}
                    {format === 'pdf' && pdfOk && (
                      <LinkButton variant="primary" icon={Download} href={href('pdf')} download="rapor.pdf">
                        İndir (.pdf)
                      </LinkButton>
                    )}
                    {format === 'pdf' && !pdfOk && (
                      <Button variant="primary" icon={Download} disabled>
                        İndir (.pdf)
                      </Button>
                    )}
                    {format === 'docx' && (
                      <LinkButton variant="primary" icon={Download} href={href('docx')} download="rapor.docx">
                        İndir (.docx)
                      </LinkButton>
                    )}
                  </div>
                  {format === 'pdf' && !pdfOk && (
                    <StatusLine status="warning" className="text-caption">
                      PDF üretimi için Chromium gerekir. Terminalde <code className="font-mono">npx playwright install chromium</code> çalıştırın; bu sırada HTML raporunu tarayıcıdan PDF olarak yazdırabilirsiniz.
                    </StatusLine>
                  )}

                  <section aria-labelledby="apa-ozet">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h3 id="apa-ozet" className="text-body font-semibold text-fg">
                        APA 7 stili metin özeti
                      </h3>
                      <CopyButton text={r.apaSummary} label="Metni kopyala" variant="ghost" />
                    </div>
                    <div className="rounded-card border border-line/30 bg-surface-lowest p-4">
                      <p className="mb-2 text-caption text-fg-subtle">Bulgular bölümü için taslak · Türkçe, APA 7</p>
                      <p className="font-[Georgia,serif] text-body-lg leading-7 text-fg">“{r.apaSummary}”</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Tag>{o.statisticText}</Tag>
                        <Tag tone="secondary">{pText(o.p)}</Tag>
                        <Tag>
                          {o.effect.symbol} = {o.effect.value.toFixed(2)} ({o.effect.magnitude} etki)
                        </Tag>
                        <Tag>N = {o.n}</Tag>
                      </div>
                    </div>
                  </section>

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
                  <SectionHeader
                    icon={Route}
                    title="Test önerisi"
                    level={3}
                  />
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
    </>
  );
}
