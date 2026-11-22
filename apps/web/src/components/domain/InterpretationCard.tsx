import type { ReactNode } from 'react';
import { Lightbulb, MessageSquareQuote } from 'lucide-react';
import type { Interpretation } from '@statadvisor/shared';
import { useApp } from '@/context/AppContext';
import { StatusChip, Tag } from '@/components/ui';
import { useI18n } from '@/i18n';
import { hypothesesFor } from './hypotheses';

/** "İnsan dilinde sonuç": metin, Yeni Başlayan / Uzman seçimine göre değişir. */
export function InterpretationCard({ result, footer }: { result: Interpretation; footer?: ReactNode }) {
  const { narrate } = useApp();
  const { t } = useI18n();
  const hypotheses = hypothesesFor(result.id);
  return (
    <div className="flex flex-col gap-4 rounded-card border border-line/30 bg-surface-lowest p-4 md:p-5">
      {hypotheses && (
        <section aria-label={t('Testin hipotezleri')} className="rounded-control border border-line/30 bg-surface p-3">
          <h3 className="mb-2 text-body font-semibold text-fg">{t('Testin hipotezleri')}</h3>
          <dl className="space-y-2 text-body text-fg-muted">
            <div>
              <dt className="font-semibold text-fg">{t('H₀ — Sıfır hipotezi')}</dt>
              <dd>{t(hypotheses.null)}</dd>
            </div>
            <div>
              <dt className="font-semibold text-fg">{t('H₁ — Alternatif hipotez')}</dt>
              <dd>{t(hypotheses.alternative)}</dd>
            </div>
          </dl>
          {hypotheses.note && <p className="mt-3 text-caption text-fg-muted">{t(hypotheses.note)}</p>}
          <p className="mt-2 text-caption text-fg-muted">
            {t('H₀’ın reddedilememesi, doğru olduğunun kanıtı değildir. H₀’ın reddedilmesi de H₁’in kesin olarak kanıtlandığı anlamına gelmez.')}
          </p>
        </section>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Tag tone="secondary">{result.metric}</Tag>
        {result.threshold && <span className="text-caption text-fg-subtle">{t('Anlamlılık eşiği')} <span className="font-mono">{result.threshold}</span></span>}
        {result.verdict && (
          <StatusChip status={result.significant === false ? 'neutral' : 'info'} className="ml-auto">
            {t(result.verdict)}
          </StatusChip>
        )}
      </div>
      <blockquote className="flex gap-3">
        <MessageSquareQuote size={22} className="mt-1 shrink-0 text-primary" aria-hidden />
        <div>
          <p className="font-display text-heading font-semibold text-fg md:text-title">“{t(result.headline)}”</p>
          <p className="mt-2 max-w-prose text-body-lg text-fg-muted" aria-live="polite">
            {t(narrate(result.body))}
          </p>
        </div>
      </blockquote>
      {result.recommendation && (
        <p className="flex gap-2 rounded-control bg-surface p-3 text-body text-fg-muted">
          <Lightbulb size={16} className="mt-0.5 shrink-0 text-tertiary" aria-hidden />
          <span>
            <strong className="font-semibold text-fg">{t(result.recommendation.label)}:</strong> {t(result.recommendation.text)}{' '}
            {result.recommendation.link && <span className="font-medium text-secondary">{t(result.recommendation.link)}</span>}
          </span>
        </p>
      )}
      {footer}
    </div>
  );
}
