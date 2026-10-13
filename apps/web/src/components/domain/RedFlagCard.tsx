import { Check, Flag, Lightbulb } from 'lucide-react';
import type { RedFlag } from '@statadvisor/shared';
import { cn } from '@/lib/cn';
import { Button, StatusChip } from '@/components/ui';

export interface RedFlagCardProps {
  flag: RedFlag;
  resolved: boolean;
  onResolve: () => void;
}

export function RedFlagCard({ flag, resolved, onResolve }: RedFlagCardProps) {
  return (
    <article
      className={cn(
        'flex flex-col gap-4 rounded-panel border bg-surface p-5 shadow-1 transition-colors',
        resolved ? 'border-success/40' : 'border-line/40',
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <p className={cn('flex items-center gap-2 text-caption font-semibold', resolved ? 'text-success' : 'text-danger')}>
          {resolved ? <Check size={16} aria-hidden /> : <Flag size={16} className="fill-current" aria-hidden />}
          {resolved ? 'Çözüldü' : 'Kırmızı bayrak'}
        </p>
        <StatusChip status="neutral" hideIcon>
          {flag.category}
        </StatusChip>
      </header>
      <div>
        <h3 className="text-heading font-semibold text-fg">{flag.title}</h3>
        <p className="mt-2 text-body text-fg-muted">{flag.description}</p>
      </div>
      <p className="flex gap-2 rounded-card bg-surface-lowest p-3 text-body text-fg">
        <Lightbulb size={16} className="mt-0.5 shrink-0 text-tertiary" aria-hidden />
        <span>
          <span className="block text-caption text-fg-subtle">Önerilen çözüm</span>
          {flag.solution}
        </span>
      </p>
      <Button
        className="mt-auto"
        block
        variant={resolved ? 'secondary' : 'primary'}
        icon={resolved ? Check : undefined}
        disabled={resolved}
        onClick={onResolve}
      >
        {resolved ? flag.resolvedLabel : flag.actionLabel}
      </Button>
    </article>
  );
}
