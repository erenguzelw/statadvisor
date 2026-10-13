import type { ReactNode } from 'react';
import { ArrowRight, CheckCircle2, GitFork } from 'lucide-react';
import type { DecisionPath as DecisionPathData, WizardStep } from '@/data/types';
import { Callout, Tag } from '@/components/ui';

/** Sihirbaz cevapları: sıralı bir süreç olduğu için numaralı. */
export function WizardSteps({ steps }: { steps: WizardStep[] }) {
  return (
    <ol className="flex flex-col gap-3">
      {steps.map((step, i) => (
        <li key={step.id} className="flex items-center gap-3 rounded-card border border-line/30 bg-surface-lowest p-4">
          <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-highest font-mono text-caption text-fg-muted">
            {i + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-caption text-fg-subtle">{step.question}</p>
            <p className="text-body-lg font-medium text-fg">{step.answer}</p>
          </div>
          <CheckCircle2 size={18} className="shrink-0 text-secondary" aria-label="Cevaplandı" />
        </li>
      ))}
    </ol>
  );
}

/** Koşullar → planlanan test (üstü çizili) → nihai test. */
export function DecisionPath({ path, compact }: { path: DecisionPathData; compact?: boolean }) {
  const rerouted = path.plannedTest !== path.finalTest;
  return (
    <div className="flex flex-col gap-3">
      {!compact && (
        <ol className="flex flex-wrap items-center gap-2" aria-label="Karar ağacında izlenen yol">
          {path.conditions.map((c, i) => (
            <li key={c} className="flex items-center gap-2">
              {i > 0 && <ArrowRight size={14} className="text-fg-subtle" aria-hidden />}
              <span className="rounded-control bg-surface-highest px-2.5 py-1.5 text-caption text-fg">{c}</span>
            </li>
          ))}
        </ol>
      )}
      <p className="flex flex-wrap items-center gap-2 text-body">
        {rerouted ? (
          <>
            <span className="text-fg-subtle">Teorik plan:</span>
            <del className="rounded-control bg-surface-highest px-2 py-1 font-mono text-data text-fg-muted decoration-danger">{path.plannedTest}</del>
            <ArrowRight size={16} className="text-secondary" aria-label="yerine" />
            <Tag tone="secondary" className="text-body! font-semibold">
              {path.finalTest}
            </Tag>
          </>
        ) : (
          <Tag tone="secondary">{path.finalTest}</Tag>
        )}
      </p>
    </div>
  );
}

/** Varsayım ihlali nedeniyle testin değiştiğini duyuran bant. */
export function RerouteBanner({ path, actions }: { path: DecisionPathData; actions?: ReactNode }) {
  return (
    <Callout
      tone="danger"
      icon={GitFork}
      title="Akıllı yönlendirme devrede"
      meta={<Tag>SciPy kural motoru</Tag>}
      actions={actions}
    >
      {path.rerouteReason}: <del className="text-fg-subtle">{path.plannedTest}</del> yerine{' '}
      <strong className="font-semibold text-secondary">{path.finalTest}</strong> testine yönlendirildi.
    </Callout>
  );
}
