import { useState } from 'react';
import { ClipboardCheck, Download, Eye, FileText, FileType2, FlaskConical, Globe, Package, Printer, Quote, Route, ShieldAlert, SquareTerminal } from 'lucide-react';
import { HeaderStat, PageHeader } from '@/components/layout/PageHeader';
import { QueryView } from '@/components/layout/PageStatus';
import { Button, Checklist, CodeBlock, ConsoleOutput, CopyButton, Panel, RadioCardGroup, SectionHeader, StatusChip, Tabs, Tag } from '@/components/ui';
import { DecisionPath } from '@/components/domain';
import { useApp } from '@/context/AppContext';
import { useCodeReport } from '@/data/queries';
import type { ReportFormat } from '@statadvisor/shared';
import { downloadText, openHtml, toNotebook } from '@/lib/download';
import { buildReport } from '@statadvisor/shared';
import { effectLabel, formatP } from '@statadvisor/shared';

const formatIcons = { html: Globe, print: FileText, word: FileType2 } as const;
const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;

export function CodeReportPage() {
  const { datasetId } = useApp();
  const query = useCodeReport(datasetId);
  const [snippetId, setSnippetId] = useState('scipy');
  const [formatId, setFormatId] = useState<ReportFormat['id']>('html');

  return (
    <QueryView query={query}>
      {({ snippets, reportFormats, apaSummary, citation, reportSections, requirements, analysis }) => {
        const snippet = snippets.find((s) => s.id === snippetId) ?? snippets[0]!;
        const format = reportFormats.find((f) => f.id === formatId) ?? reportFormats[0]!;
        const t = analysis.testStatistic;
        const shapiro = analysis.assumptions.find((a) => a.id === 'shapiro');
        const date = new Date().toLocaleDateString('tr-TR');
        const reportInput = { analysis, apaSummary, citation, date };
        const html = buildReport(reportInput, 'html');
        const size = new Blob([html]).size;

        const primary =
          format.id === 'html'
            ? { label: 'İndir (.html)', icon: Download, run: () => downloadText(format.fileName, html, 'text/html') }
            : format.id === 'print'
              ? { label: 'Yazdır / PDF kaydet', icon: Printer, run: () => openHtml(buildReport(reportInput, 'print')) }
              : { label: 'İndir (.doc)', icon: Download, run: () => downloadText(format.fileName, buildReport(reportInput, 'word'), 'application/msword') };

        return (
          <>
            <PageHeader
              features={['Özellik 04 & 09']}
              context="İstatistik çekirdeği v0.1"
              title="Kod Üretimi ve Otomatik Raporlama Merkezi"
              description="Jupyter’da çalıştırılabilir, açıklamalı kod parçaları ve APA 7 stilinde rapor özeti."
              aside={
                <>
                  <HeaderStat label="Önerilen test" icon={<span className="size-2 rounded-full bg-secondary" aria-hidden />}>
                    {analysis.decision.finalTest}
                  </HeaderStat>
                  <HeaderStat label="İstatistik / p değeri" icon={<FlaskConical size={18} className="text-secondary" aria-hidden />}>
                    <span className="font-mono text-secondary">
                      {t.name}={t.value.toFixed(2)}, p={formatP(t.p)}
                    </span>
                  </HeaderStat>
                  <HeaderStat
                    label="Varsayım durumu"
                    icon={<ShieldAlert size={18} className={shapiro?.passed ? 'text-success' : 'text-tertiary'} aria-hidden />}
                  >
                    <span className={shapiro?.passed ? 'text-success' : 'text-tertiary'}>{shapiro?.passed ? 'Normallik sağlandı' : 'Normallik ihlali'}</span>
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
                  description="Kopyala, yapıştır, çalıştır. Beklenen çıktı, koddaki örnek verinin hesabından gelir; kendi verinizde farklı olacaktır."
                />
                <Tabs
                  label="Kod dili ve kütüphane"
                  items={snippets.map((s) => ({ value: s.id, label: s.label }))}
                  value={snippet.id}
                  onChange={setSnippetId}
                >
                  <div className="flex flex-col gap-4">
                    <CodeBlock code={snippet.code} language={snippet.language} filename={snippet.filename} runtime={snippet.runtime} lineNumbers maxHeight="26rem" />
                    <ConsoleOutput lines={snippet.output} />
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
                </div>
              </Panel>

              <Panel className="flex min-w-0 flex-col gap-5 lg:col-span-5">
                <SectionHeader
                  icon={ClipboardCheck}
                  title="Tek tıkla rapor"
                  feature="Özellik 09"
                  description="Tanımlayıcı istatistikleri, varsayım testlerini, sonucu ve APA özetini tek dosyada toplar."
                  className="mb-0"
                />
                <RadioCardGroup
                  legend="Çıktı biçimi"
                  options={reportFormats.map((f) => ({ value: f.id, title: f.title, description: f.description, icon: formatIcons[f.id] }))}
                  value={formatId}
                  onChange={setFormatId}
                />

                <div className="rounded-card border border-line/30 bg-surface-lowest p-4">
                  <p className="mb-1 flex min-w-0 items-center gap-2 font-mono text-data text-fg">
                    <FileText size={16} className="shrink-0 text-secondary" aria-hidden />
                    <span className="truncate">{format.fileName}</span>
                  </p>
                  <p className="text-caption text-fg-subtle">
                    Boyut: <span className="font-mono">≈ {kb(size)}</span> · {reportSections.length} bölüm
                  </p>
                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Button icon={Eye} variant="tonal" onClick={() => openHtml(html)}>
                      Raporu incele
                    </Button>
                    <Button icon={primary.icon} variant="primary" onClick={primary.run}>
                      {primary.label}
                    </Button>
                  </div>
                  {format.id !== 'html' && (
                    <p className="mt-3 text-caption text-fg-subtle">
                      {format.id === 'print'
                        ? 'Açılan sayfada yazdırma penceresinden “PDF olarak kaydet” seçeneğini kullanın.'
                        : 'Dosya, Word’ün açabildiği HTML tabanlı bir belgedir; biçim uyarısı çıkabilir.'}
                    </p>
                  )}
                </div>

                <section aria-labelledby="apa-ozet">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 id="apa-ozet" className="text-body font-semibold text-fg">
                      APA 7 stili metin özeti
                    </h3>
                    <CopyButton text={apaSummary} label="Metni kopyala" variant="ghost" />
                  </div>
                  <div className="rounded-card border border-line/30 bg-surface-lowest p-4">
                    <p className="mb-2 text-caption text-fg-subtle">Bulgular bölümü için taslak · Türkçe, APA 7</p>
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
                <p className="mt-3 text-caption text-fg-subtle">Sürüm uyumsuzluklarına karşı sabitlenmiş (ya da alt sınırı verilmiş) paketler. Kurulumu sizin ortamınızda yapılır.</p>
              </Panel>
              <Panel>
                <SectionHeader
                  icon={Route}
                  title="Test önerisi"
                  level={3}
                  actions={
                    <StatusChip status={analysis.decision.plannedTest === analysis.decision.finalTest ? 'success' : 'warning'}>
                      {analysis.decision.plannedTest === analysis.decision.finalTest ? 'Plan geçerli' : 'Plan değişti'}
                    </StatusChip>
                  }
                />
                <DecisionPath path={analysis.decision} compact />
                {shapiro && (
                  <p className="mt-3 text-body text-fg-muted">
                    Shapiro-Wilk (<span className="font-mono">p = {formatP(shapiro.p)}</span>, grup içi kalıntılar) normallik varsayımını reddettiği için kod{' '}
                    <code className="text-secondary">scipy.stats.kruskal</code> fonksiyonunu kullanıyor.
                  </p>
                )}
              </Panel>
              <Panel className="md:col-span-2 xl:col-span-1">
                <SectionHeader title="Rapor içeriği" level={3} description="Rapor dosyasında yer alan bölümler." />
                <Checklist items={reportSections.map((s) => ({ id: s.id, label: s.label }))} />
              </Panel>
            </div>
          </>
        );
      }}
    </QueryView>
  );
}
