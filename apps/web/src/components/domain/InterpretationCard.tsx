import type { ReactNode } from 'react';
import { Lightbulb, MessageSquareQuote } from 'lucide-react';
import type { Interpretation } from '@/data/types';
import { useApp } from '@/context/AppContext';
import { StatusChip, Tag } from '@/components/ui';

/** "İnsan dilinde sonuç": metin, Yeni Başlayan / Uzman seçimine göre değişir. */
export function InterpretationCard({ result, footer }: { result: Interpretation; footer?: ReactNode }) {
  const { narrate } = useApp();
  return (
    <div className="flex flex-col gap-4 rounded-card border border-line/30 bg-surface-lowest p-4 md:p-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Tag tone="secondary">{result.metric}</Tag>
        {result.threshold && <span className="text-caption text-fg-subtle">Anlamlılık eşiği <span className="font-mono">{result.threshold}</span></span>}
        {result.verdict && (
          <StatusChip status="success" className="ml-auto">
            {result.verdict}
          </StatusChip>
        )}
      </div>
      <blockquote className="flex gap-3">
        <MessageSquareQuote size={22} className="mt-1 shrink-0 text-primary" aria-hidden />
        <div>
          <p className="font-display text-heading font-semibold text-fg md:text-title">“{result.headline}”</p>
          <p className="mt-2 max-w-prose text-body-lg text-fg-muted" aria-live="polite">
            {narrate(result.body)}
          </p>
        </div>
      </blockquote>
      {result.recommendation && (
        <p className="flex gap-2 rounded-control bg-surface p-3 text-body text-fg-muted">
          <Lightbulb size={16} className="mt-0.5 shrink-0 text-tertiary" aria-hidden />
          <span>
            <strong className="font-semibold text-fg">{result.recommendation.label}:</strong> {result.recommendation.text}{' '}
            {result.recommendation.link && <span className="font-medium text-secondary">{result.recommendation.link}</span>}
          </span>
        </p>
      )}
      {footer}
    </div>
  );
}
