import { Activity, Languages, ListChecks, Ruler, Table2 } from 'lucide-react';
import type { AnalysisResult, GroupDescriptive, OutcomePair } from '@statadvisor/shared';
import { ExpertiseToggle } from '@/components/layout/ExpertiseToggle';
import { DataTable, Panel, SectionHeader, StatusChip, Tag, type Column } from '@/components/ui';
import { ChartLegend, HistogramWithNormal } from '@/components/charts';
import { AssumptionTestCard, InterpretationCard, PValue, RecommendationNotes, RerouteBanner } from '@/components/domain';

const n2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : '–');

const descColumns: Column<GroupDescriptive>[] = [
  { key: 'group', header: 'Grup / değişken', cell: (d) => <span className="font-medium text-fg">{d.group}</span> },
  { key: 'n', header: 'n', numeric: true, align: 'right', cell: (d) => d.n },
  { key: 'median', header: 'Medyan', numeric: true, align: 'right', cell: (d) => n2(d.median) },
  { key: 'mean', header: 'Ortalama', numeric: true, align: 'right', cell: (d) => n2(d.mean) },
  { key: 'sd', header: 'SS', numeric: true, align: 'right', cell: (d) => n2(d.sd) },
];

const pairColumns: Column<OutcomePair>[] = [
  { key: 'pair', header: 'Çift', cell: (p) => <span className="font-medium whitespace-nowrap text-fg">{p.a} – {p.b}</span> },
  { key: 'p', header: 'Ham p', numeric: true, align: 'right', cell: (p) => <PValue p={p.p} apa /> },
  { key: 'padj', header: 'Düzeltilmiş p', numeric: true, align: 'right', cell: (p) => <PValue p={p.pAdj} apa /> },
  { key: 'sig', header: 'Sonuç', cell: (p) => <StatusChip status={p.significant ? 'info' : 'neutral'}>{p.significant ? 'Anlamlı' : 'Anlamsız'}</StatusChip> },
];

export function AnalysisView({ result: r }: { result: AnalysisResult }) {
  const o = r.outcome;
  return (
    <>
      <RerouteBanner path={r.decision} />
      {r.notes.length > 0 && <RecommendationNotes title="Veri hazırlama notları" warnings={r.notes} />}

      {r.assumptions.length > 0 && (
        <Panel>
          <SectionHeader icon={Activity} title="Otomatik varsayım kontrolü" feature="Özellik 01" description="Testler veriden hesaplanır; “Bu ne demek?” ile açıklamayı görün." />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {r.assumptions.map((t) => (
              <AssumptionTestCard key={t.id} test={t} />
            ))}
          </div>
          {r.distribution && (
            <div className="mt-4 rounded-card border border-line/30 bg-surface-lowest p-4">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-body-lg font-semibold text-fg">Kalıntıların histogramı ve kuramsal normal eğri</h3>
                  <p className="text-caption text-fg-subtle">
                    n = <span className="font-mono">{r.distribution.n}</span>, çarpıklık = <span className="font-mono">{r.distribution.skewness > 0 ? '+' : ''}{r.distribution.skewness}</span>
                  </p>
                </div>
                <ChartLegend
                  items={[
                    { label: 'Gözlenen veri', swatch: 'bar', color: 'var(--color-primary-strong)' },
                    { label: 'Beklenen normal', swatch: 'dash', color: 'var(--color-tertiary)' },
                  ]}
                />
              </div>
              <HistogramWithNormal
                bins={r.distribution.bins}
                normal={{ mean: r.distribution.mean, sd: r.distribution.sd }}
                annotation={r.distribution.skewness > 0.5 ? 'Sağa çarpık (uzun sağ kuyruk)' : r.distribution.skewness < -0.5 ? 'Sola çarpık (uzun sol kuyruk)' : undefined}
                summary={`Kalıntıların histogramı, çarpıklık ${r.distribution.skewness}; kuramsal normal eğri ile karşılaştırılıyor.`}
                className="p-0!"
              />
            </div>
          )}
        </Panel>
      )}

      {r.descriptives.length > 0 && (
        <Panel>
          <SectionHeader icon={Table2} title="Tanımlayıcı istatistikler" level={3} />
          <DataTable caption="Tanımlayıcı istatistikler" columns={descColumns} rows={r.descriptives} rowKey={(d) => d.group} density="compact" />
        </Panel>
      )}

      <Panel>
        <SectionHeader icon={Languages} title="İnsan dilinde sonuçlar" feature="Özellik 03 & 10" actions={<ExpertiseToggle />} />
        <div className="mb-4 flex flex-wrap items-center gap-2" aria-label="Test sonucu özeti">
          <Tag tone="primary">{o.test}</Tag>
          <Tag>{o.statisticText}</Tag>
          <Tag tone={o.significant ? 'secondary' : 'neutral'}>
            <PValue p={o.p} apa className="font-normal" />
          </Tag>
          <Tag>
            {o.effect.symbol} = {n2(o.effect.value)} ({o.effect.magnitude})
          </Tag>
          <Tag>N = {o.n}</Tag>
          {o.ci && (
            <Tag>
              <Ruler size={12} className="mr-1" aria-hidden />
              %95 GA [{n2(o.ci.low)}, {n2(o.ci.high)}]
            </Tag>
          )}
        </div>
        <InterpretationCard result={r.interpretation} />
      </Panel>

      {o.postHoc && (
        <Panel>
          <SectionHeader icon={ListChecks} title="Post-hoc karşılaştırmalar" level={3} description={o.postHoc.method} />
          <DataTable caption="Post-hoc karşılaştırmalar" columns={pairColumns} rows={o.postHoc.pairs} rowKey={(p) => `${p.a}|${p.b}`} density="compact" />
        </Panel>
      )}
    </>
  );
}
