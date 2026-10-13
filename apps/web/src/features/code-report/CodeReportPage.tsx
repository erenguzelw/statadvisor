import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  ClipboardCheck,
  Download,
  Eye,
  FileText,
  FileType2,
  FlaskConical,
  Globe,
  Package,
  Quote,
  Route,
  ShieldAlert,
  SquareTerminal,
} from 'lucide-react';
import { HeaderStat, PageHeader } from '@/components/layout/PageHeader';
import { QueryView } from '@/components/layout/PageStatus';
import {
  Button,
  Checklist,
  CodeBlock,
  ConsoleOutput,
  CopyButton,
  Panel,
  ProgressBar,
  RadioCardGroup,
  SectionHeader,
  StatusChip,
  StatusLine,
  Tabs,
  Tag,
} from '@/components/ui';
import { DecisionPath } from '@/components/domain';
import { useApp } from '@/context/AppContext';
import { useCodeReport } from '@/data/queries';
import type { ReportFormat } from '@/data/types';
import { downloadText, htmlReport, openHtml, toNotebook } from '@/lib/download';
import { effectLabel, formatP } from '@/lib/stats';

const formatIcons = { pdf: FileText, docx: FileType2, html: Globe } as const;

/** Rapor üretimini taklit eden ilerleme (sunucu aşamasında gerçek iş durumuyla değişecek). */
function useFakeProgress(key: string) {
  const [progress, setProgress] = useState(100);
  useEffect(() => {
    setProgress(15);
    const id = setInterval(() => setProgress((p) => (p >= 100 ? 100 : Math.min(100, p + 17))), 180);
    return () => clearInterval(id);
  }, [key]);
  return progress;
}

export function CodeReportPage() {
  const { datasetId } = useApp();
  const query = useCodeReport(datasetId);
  const [snippetId, setSnippetId] = useState('scipy');
  const [formatId, setFormatId] = useState<ReportFormat['id']>('pdf');
  const progress = useFakeProgress(formatId);

  return (
    <QueryView query={query}>
      {({ snippets, reportFormats, apaSummary, citation, reportSections, requirements, analysis }) => {
        const snippet = snippets.find((s) => s.id === snippetId) ?? snippets[0]!;
        const format = reportFormats.find((f) => f.id === formatId) ?? reportFormats[0]!;
        const ready = progress >= 100;
        const t = analysis.testStatistic;
        const report = htmlReport('Hipotez testi sonuçları', apaSummary, citation);

        return (
          <>
            <PageHeader
              features={['Özellik 04 & 09']}
              context="İstatistik çekirdeği işlem hattı 4.2"
              title="Kod Üretimi ve Otomatik Raporlama Merkezi"
              description="Jupyter’da hemen çalıştırılabilir, açıklamalı kod parçaları ve APA 7 standardında anlık akademik raporlar."
              aside={
                <>
                  <HeaderStat label="Yönlendirilmiş test" icon={<span className="size-2 rounded-full bg-secondary" aria-hidden />}>
                    {analysis.decision.finalTest}
                  </HeaderStat>
                  <HeaderStat label="İstatistik / p değeri" icon={<FlaskConical size={18} className="text-secondary" aria-hidden />}>
                    <span className="font-mono text-secondary">
                      {t.name}={t.value.toFixed(2)}, p={formatP(t.p)}
                    </span>
                  </HeaderStat>
                  <HeaderStat label="Varsayım durumu" icon={<ShieldAlert size={18} className="text-tertiary" aria-hidden />}>
                    <span className="text-tertiary">Normallik ihlali</span>
                  </HeaderStat>
                </>
              }
            />

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              <Panel className="min-w-0 lg:col-span-7">
                <SectionHeader
                  icon={SquareTerminal}
                  title="Hazır kod üretimi"
                  feature="Özellik 04"
                  description="Jupyter’da hemen çalıştırılabilir, açıklamalı kod parçaları. Kopyala, yapıştır, çalıştır."
                  actions={<StatusChip status="success">Test senkronize</StatusChip>}
                />
                <Tabs
                  label="Kod dili ve kütüphane"
                  items={snippets.map((s) => ({ value: s.id, label: s.label }))}
                  value={snippet.id}
                  onChange={setSnippetId}
                >
                  <div className="flex flex-col gap-4">
                    <CodeBlock
                      code={snippet.code}
                      language={snippet.language}
                      filename={snippet.filename}
                      runtime={snippet.runtime}
                      lineNumbers
                    />
                    <ConsoleOutput lines={snippet.output} duration={snippet.duration} />
                  </div>
                </Tabs>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Button
                    icon={Download}
                    disabled={snippet.language !== 'python'}
                    title={snippet.language !== 'python' ? 'Jupyter defteri yalnızca Python için üretilir' : undefined}
                    onClick={() =>
                      downloadText(
                        snippet.filename.replace(/\.py$/, '.ipynb'),
                        toNotebook(snippet.code, `${analysis.decision.finalTest} analizi`),
                        'application/x-ipynb+json',
                      )
                    }
                  >
                    Jupyter defteri olarak indir (.ipynb)
                  </Button>
                  <StatusLine status="success" className="text-caption">
                    Bağımlılıklar yüklü
                  </StatusLine>
                </div>
              </Panel>

              <Panel className="flex flex-col gap-5 lg:col-span-5">
                <SectionHeader
                  icon={ClipboardCheck}
                  title="Tek tıkla rapor üretimi"
                  feature="Özellik 09"
                  description="Akademik yayın standartlarında APA 7 biçimlendirme."
                  className="mb-0"
                />
                <RadioCardGroup
                  legend="Çıktı biçimi"
                  options={reportFormats.map((f) => ({ value: f.id, title: f.title, description: f.description, icon: formatIcons[f.id] }))}
                  value={formatId}
                  onChange={setFormatId}
                />

                <div className="rounded-card border border-line/30 bg-surface-lowest p-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="flex min-w-0 items-center gap-2 font-mono text-data text-fg">
                      <CheckCircle2 size={16} className={ready ? 'shrink-0 text-secondary' : 'shrink-0 text-fg-subtle'} aria-hidden />
                      <span className="truncate">{format.fileName}</span>
                    </p>
                    <Tag tone={ready ? 'secondary' : 'neutral'}>
                      <span aria-live="polite">{ready ? 'Hazır' : `%${progress}`}</span>
                    </Tag>
                  </div>
                  <ProgressBar value={progress} label="Rapor oluşturma ilerlemesi" />
                  <p className="mt-2 text-caption text-fg-subtle">
                    Boyut: <span className="font-mono">{format.size}</span>
                    {format.pages && <>, {format.pages} sayfa</>}
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <Button icon={Eye} variant="tonal" disabled={!ready} onClick={() => openHtml(report)}>
                      Raporu incele
                    </Button>
                    <Button
                      icon={Download}
                      variant="primary"
                      disabled={!ready || format.id !== 'html'}
                      title={format.id !== 'html' ? 'PDF ve Word çıktısı sunucu aşamasında etkinleşecek' : undefined}
                      onClick={() => downloadText(format.fileName, report, 'text/html')}
                    >
                      İndir ({format.id.toUpperCase()})
                    </Button>
                  </div>
                </div>

                <section aria-labelledby="apa-ozet">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 id="apa-ozet" className="text-body font-semibold text-fg">
                      APA 7 stili metin özeti
                    </h3>
                    <CopyButton text={apaSummary} label="Metni kopyala" variant="ghost" />
                  </div>
                  <div className="rounded-card border border-line/30 bg-surface-lowest p-4">
                    <p className="mb-2 text-caption text-fg-subtle">Yayınlanabilir metin, bulgular bölümü · Türkçe, APA 7</p>
                    <p className="font-[Georgia,serif] text-body-lg leading-7 text-fg">“{apaSummary}”</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Tag>
                        {t.name}({t.df}) = {t.value.toFixed(2)}
                      </Tag>
                      <Tag tone="secondary">p = {formatP(t.p, true)}</Tag>
                      <Tag>
                        {t.effect} = {t.effectValue.toFixed(2)} ({effectLabel(t.effectValue)} etki)
                      </Tag>
                      <Tag>N = {t.n}</Tag>
                    </div>
                  </div>
                </section>

                <div className="flex items-start gap-3 rounded-card bg-surface-lowest p-3">
                  <Quote size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-caption font-semibold text-fg-muted">Metodoloji kaynakçası</p>
                    <p className="text-caption text-fg-subtle">{citation}</p>
                  </div>
                  <CopyButton text={citation} label="Kaynağı kopyala" variant="ghost" />
                </div>
              </Panel>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
              <Panel>
                <SectionHeader icon={Package} title="Paket bağımlılıkları" level={3} />
                <CodeBlock code={requirements} language="text" filename="requirements.txt" />
                <p className="mt-3 text-caption text-fg-subtle">Ortam sürüm uyumsuzluklarına karşı sabitlenmiş paketler.</p>
              </Panel>
              <Panel>
                <SectionHeader
                  icon={Route}
                  title="Otomatik rota"
                  level={3}
                  actions={<StatusChip status="danger">Varsayım ihlali</StatusChip>}
                />
                <DecisionPath path={analysis.decision} compact />
                <p className="mt-3 text-body text-fg-muted">
                  Shapiro-Wilk normallik testi (<span className="font-mono">p = 0.012</span>) başarısız olduğu için kod{' '}
                  <code className="text-secondary">scipy.stats.kruskal</code> fonksiyonuna yönlendirildi.
                </p>
              </Panel>
              <Panel className="md:col-span-2 xl:col-span-1">
                <SectionHeader title="Rapor içeriği ve denetim listesi" level={3} />
                <Checklist items={reportSections.map((s) => ({ id: s.id, label: s.label, meta: `Sayfa ${s.page}` }))} />
              </Panel>
            </div>
          </>
        );
      }}
    </QueryView>
  );
}
