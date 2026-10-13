import type { ReactNode } from 'react';
import { ArrowRight, CheckCircle2, GitFork, Info } from 'lucide-react';
import { wizardQuestions, type WizardAnswers } from '@/lib/decision';
import { Callout, RadioCardGroup, Tag } from '@/components/ui';

export interface DecisionPathLike {
  conditions: string[];
  plannedTest: string;
  finalTest: string;
  rerouteReason?: string;
}

export interface DecisionWizardProps {
  answers: WizardAnswers;
  onChange: (next: WizardAnswers) => void;
  /** Veri setinden çıkarılıp otomatik doldurulan sorular. */
  inferred: (keyof WizardAnswers)[];
}

/** Karar sihirbazı: yanıtlar değişince test önerisi anında güncellenir. */
export function DecisionWizard({ answers, onChange, inferred }: DecisionWizardProps) {
  return (
    <div className="flex flex-col gap-4">
      {wizardQuestions.map((q) => {
        const isInferred = inferred.includes(q.id);
        return (
          <div key={q.id} className="rounded-card border border-line/30 bg-surface-lowest p-4">
            <RadioCardGroup
              legend={isInferred ? `${q.question} (veriden çıkarıldı, doğruysa onaylayın)` : q.question}
              layout="stack"
              options={q.options.map((o) => ({ value: String(o.value), title: o.label, description: o.description }))}
              value={String(answers[q.id])}
              onChange={(v) => onChange({ ...answers, [q.id]: v } as WizardAnswers)}
            />
          </div>
        );
      })}
    </div>
  );
}

/** Koşullar → planlanan test (üstü çizili) → nihai test. */
export function DecisionPath({ path, compact }: { path: DecisionPathLike; compact?: boolean }) {
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
          <>
            <span className="text-fg-subtle">Önerilen test:</span>
            <Tag tone="secondary">{path.finalTest}</Tag>
          </>
        )}
      </p>
    </div>
  );
}

/** Yöntemsel uyarılar: ön test sınırlamaları, bağımsızlık, örneklem büyüklüğü. */
export function RecommendationNotes({ warnings }: { warnings: string[] }) {
  if (!warnings.length) return null;
  return (
    <section aria-label="Dikkat edilmesi gerekenler" className="rounded-card border border-line/30 bg-surface-lowest p-4">
      <h3 className="mb-2 text-body font-semibold text-fg">Dikkat edilmesi gerekenler</h3>
      <ul className="flex flex-col gap-2">
        {warnings.map((w) => (
          <li key={w} className="flex gap-2 text-caption text-fg-muted">
            <Info size={14} className="mt-0.5 shrink-0 text-info" aria-hidden />
            <span>{w}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Varsayım sonucuna göre testin değiştiğini ya da planla uyumlu kaldığını duyuran bant. */
export function RerouteBanner({ path, actions }: { path: DecisionPathLike; actions?: ReactNode }) {
  if (path.plannedTest === path.finalTest) {
    return (
      <Callout tone="info" icon={CheckCircle2} title="Önerilen test" meta={<Tag>Kural motoru</Tag>} actions={actions}>
        Yanıtlarınıza uygun test: <strong className="font-semibold text-secondary">{path.finalTest}</strong>.
      </Callout>
    );
  }
  return (
    <Callout tone="danger" icon={GitFork} title="Akıllı yönlendirme devrede" meta={<Tag>Kural motoru</Tag>} actions={actions}>
      {path.rerouteReason}: <del className="text-fg-subtle">{path.plannedTest}</del> yerine{' '}
      <strong className="font-semibold text-secondary">{path.finalTest}</strong> önerildi.
    </Callout>
  );
}
