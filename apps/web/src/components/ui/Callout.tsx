import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

export type CalloutTone = 'danger' | 'warning' | 'info' | 'success' | 'neutral';

const tones: Record<CalloutTone, { box: string; icon: string }> = {
  danger: { box: 'border-danger-strong/40 bg-gradient-to-r from-danger-bg to-surface', icon: 'bg-danger-strong/20 text-danger' },
  warning: { box: 'border-tertiary/40 bg-gradient-to-r from-warning-bg to-surface', icon: 'bg-tertiary/20 text-tertiary' },
  info: { box: 'border-info/30 bg-gradient-to-r from-info-bg to-surface', icon: 'bg-info/15 text-info' },
  success: { box: 'border-success/30 bg-gradient-to-r from-success-bg to-surface', icon: 'bg-success/15 text-success' },
  neutral: { box: 'border-line/50 bg-surface-high', icon: 'bg-surface-highest text-primary' },
};

export interface CalloutProps {
  tone?: CalloutTone;
  icon: LucideIcon;
  title?: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}

/** Sayfa düzeyinde dikkat çeken bilgi bandı. */
export function Callout({ tone = 'neutral', icon: Icon, title, meta, children, actions, className }: CalloutProps) {
  const t = tones[tone];
  return (
    <div className={cn('flex flex-col gap-4 rounded-panel border p-4 sm:flex-row sm:items-center md:p-5', t.box, className)}>
      <span className={cn('inline-flex size-11 shrink-0 items-center justify-center rounded-card', t.icon)}>
        <Icon size={22} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        {(title || meta) && (
          <div className="mb-1 flex flex-wrap items-center gap-2">
            {title && <p className="text-caption font-semibold text-fg-muted">{title}</p>}
            {meta}
          </div>
        )}
        <div className="text-body-lg text-fg">{children}</div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
