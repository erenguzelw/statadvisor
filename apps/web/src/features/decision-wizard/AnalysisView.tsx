import { Activity, Languages, ListChecks, Ruler, Table2 } from 'lucide-react';
import type { AnalysisResult, GroupDescriptive, OutcomePair, PostHocResult } from '@statadvisor/shared';
import { ExpertiseToggle } from '@/components/layout/ExpertiseToggle';
import { DataTable, Panel, SectionHeader, StatusChip, Tag, type Column } from '@/components/ui';
import { ChartLegend, HistogramWithNormal } from '@/components/charts';
import { AlternativeMethods, AssumptionTestCard, ConditionChecks, InterpretationCard, PValue, RecommendationNotes, RerouteBanner } from '@/components/domain';
import { useI18n } from '@/i18n';

const n2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : '–');

type LetterRow = PostHocResult['letters'][number];

function PostHocPanel({ ph }: { ph: PostHocResult }) {
  const { t, locale } = useI18n();
  const range = ph.pairs.some((p) => p.diff !== undefined);

  const pairCell: Column<OutcomePair> = { key: 'pair', header: t('Çift'), cell: (p) => <span className="font-medium whitespace-nowrap text-fg">{p.a} – {p.b}</span> };
  const sigCell: Column<OutcomePair> = { key: 'sig', header: t('Sonuç'), cell: (p) => <StatusChip status={p.significant ? 'info' : 'neutral'}>{p.significant ? t('Anlamlı') : t('Anlamsız')}</StatusChip> };
  /** Holm düzeltmeli yöntemler: ham ve düzeltilmiş p. */
  const holmColumns: Column<OutcomePair>[] = [
    pairCell,
    { key: 'p', header: t('Ham p'), numeric: true, align: 'right', cell: (p) => <PValue p={p.p} apa /> },
    { key: 'padj', header: t('Düzeltilmiş p'), numeric: true, align: 'right', cell: (p) => <PValue p={p.pAdj} apa /> },
    sigCell,
  ];
  /** Tukey / Games–Howell: fark, eşzamanlı güven aralığı, aile bazında p ve etki büyüklüğü. */
  const rangeColumns: Column<OutcomePair>[] = [
    pairCell,
    { key: 'diff', header: t('Fark'), numeric: true, align: 'right', cell: (p) => n2(p.diff!) },
    { key: 'ci', header: t('%95 GA'), numeric: true, align: 'right', cell: (p) => <span className="whitespace-nowrap">[{n2(p.ciLow!)}, {n2(p.ciHigh!)}]</span> },
    { key: 'p', header: 'p', numeric: true, align: 'right', cell: (p) => <PValue p={p.pAdj} apa /> },
    { key: 'g', header: 'Hedges g', numeric: true, align: 'right', cell: (p) => n2(p.hedgesG!) },
    sigCell,
  ];
  const letterColumns: Column<LetterRow>[] = [
    { key: 'group', header: t('Grup'), cell: (l) => <span className="font-medium text-fg">{l.group}</span> },
    { key: 'center', header: t(ph.centerLabel), numeric: true, align: 'right', cell: (l) => n2(l.center) },
    { key: 'letters', header: t('Harf'), cell: (l) => <Tag tone="secondary">{l.letters}</Tag> },
  ];
  return (
    <Panel>
      <SectionHeader
        icon={ListChecks}
        title={t('Post-hoc karşılaştırmalar')}
        level={3}
        description={
          range
            ? t('{method}. p değerleri aile bazında düzeltilmiştir (ayrıca Holm gerekmez); güven aralıkları eşzamanlıdır. Fark = ilk grubun ortalaması − ikincinin.', { method: t(ph.method) })
            : t(ph.method)
        }
      />
      <DataTable caption={t('Post-hoc karşılaştırmalar')} columns={range ? rangeColumns : holmColumns} rows={ph.pairs} rowKey={(p) => `${p.a}|${p.b}`} density="compact" />
      <div className="mt-5">
        <h4 className="mb-1 text-body font-semibold text-fg">{t('Anlamlılık harfleri')}</h4>
        <p className="mb-2 text-caption text-fg-subtle">
          {t('Aynı harfi paylaşan gruplar arasındaki fark anlamlı değildir. Gruplar {center} değerine göre büyükten küçüğe sıralıdır; tezlerde tablo ya da grafik üzerinde bu harfler gösterilir.', { center: t(ph.centerLabel).toLocaleLowerCase(locale) })}
        </p>
        <DataTable caption={t('Anlamlılık harfleri')} columns={letterColumns} rows={ph.letters} rowKey={(l) => l.group} density="compact" />
      </div>
    </Panel>
  );
}

export function AnalysisView({ result: r, onRunAlternative }: { result: AnalysisResult; onRunAlternative?: (test: string) => void }) {
  const { t } = useI18n();
  const o = r.outcome;
  const descColumns: Column<GroupDescriptive>[] = [
    { key: 'group', header: t('Grup / değişken'), cell: (d) => <span className="font-medium text-fg">{d.group}</span> },
    { key: 'n', header: 'n', numeric: true, align: 'right', cell: (d) => d.n },
    { key: 'median', header: t('Medyan'), numeric: true, align: 'right', cell: (d) => n2(d.median) },
    { key: 'mean', header: t('Ortalama'), numeric: true, align: 'right', cell: (d) => n2(d.mean) },
    { key: 'sd', header: t('SS'), numeric: true, align: 'right', cell: (d) => n2(d.sd) },
    { key: 'skew', header: t('Çarpıklık'), numeric: true, align: 'right', cell: (d) => n2(d.skewness) },
    { key: 'kurt', header: t('Basıklık'), numeric: true, align: 'right', cell: (d) => n2(d.kurtosis) },
  ];
  return (
    <>
      <RerouteBanner path={r.decision} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ConditionChecks checks={r.decision.checks ?? []} />
        <AlternativeMethods finalTest={r.decision.finalTest} alternatives={r.decision.alternatives ?? []} onRun={onRunAlternative} />
      </div>
      {r.notes.length > 0 && <RecommendationNotes title={t('Veri hazırlama notları')} warnings={r.notes} />}

      {r.assumptions.length > 0 && (
        <Panel>
          <SectionHeader icon={Activity} title={t('Otomatik varsayım kontrolü')} feature="Özellik 01" description={t('Testler veriden hesaplanır; “Bu ne demek?” ile açıklamayı görün.')} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {r.assumptions.map((a) => (
              <AssumptionTestCard key={a.id} test={a} />
            ))}
          </div>
          {r.distribution && (
            <div className="mt-4 rounded-card border border-line/30 bg-surface-lowest p-4">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-body-lg font-semibold text-fg">{t('Kalıntıların histogramı ve kuramsal normal eğri')}</h3>
                  <p className="text-caption text-fg-subtle">
                    n = <span className="font-mono">{r.distribution.n}</span>, {t('çarpıklık')} = <span className="font-mono">{r.distribution.skewness > 0 ? '+' : ''}{r.distribution.skewness}</span>
                  </p>
                </div>
                <ChartLegend
                  items={[
                    { label: t('Gözlenen veri'), swatch: 'bar', color: 'var(--color-primary-strong)' },
                    { label: t('Beklenen normal'), swatch: 'dash', color: 'var(--color-tertiary)' },
                  ]}
                />
              </div>
              <HistogramWithNormal
                bins={r.distribution.bins}
                normal={{ mean: r.distribution.mean, sd: r.distribution.sd }}
                annotation={r.distribution.skewness > 0.5 ? t('Sağa çarpık (uzun sağ kuyruk)') : r.distribution.skewness < -0.5 ? t('Sola çarpık (uzun sol kuyruk)') : undefined}
                summary={t('Kalıntıların histogramı, çarpıklık {skew}; kuramsal normal eğri ile karşılaştırılıyor.', { skew: r.distribution.skewness })}
                className="p-0!"
              />
            </div>
          )}
        </Panel>
      )}

      {r.descriptives.length > 0 && (
        <Panel>
          <SectionHeader icon={Table2} title={t('Tanımlayıcı istatistikler')} level={3} />
          <DataTable caption={t('Tanımlayıcı istatistikler')} columns={descColumns} rows={r.descriptives} rowKey={(d) => d.group} density="compact" />
        </Panel>
      )}

      <Panel>
        <SectionHeader icon={Languages} title={t('İnsan dilinde sonuçlar')} feature="Özellik 03 & 10" actions={<ExpertiseToggle />} />
        <div className="mb-4 flex flex-wrap items-center gap-2" aria-label={t('Test sonucu özeti')}>
          <Tag tone="primary">{t(o.test)}</Tag>
          <Tag>{o.statisticText}</Tag>
          <Tag tone={o.significant ? 'secondary' : 'neutral'}>
            <PValue p={o.p} apa className="font-normal" />
          </Tag>
          <Tag>
            {o.effect.symbol} = {n2(o.effect.value)} ({t(o.effect.magnitude)})
          </Tag>
          <Tag>N = {o.n}</Tag>
          {o.ci && (
            <Tag>
              <Ruler size={12} className="mr-1" aria-hidden />
              {t('%95 GA')} [{n2(o.ci.low)}, {n2(o.ci.high)}]
            </Tag>
          )}
        </div>
        <InterpretationCard result={r.interpretation} />
      </Panel>

      {o.postHoc && <PostHocPanel ph={o.postHoc} />}
    </>
  );
}
