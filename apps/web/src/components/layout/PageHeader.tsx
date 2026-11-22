import type { ReactNode } from 'react';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/cn';

export interface PageHeaderProps {
  /** Tanıtımdaki özellik numaraları, ör. ["Özellik 04", "Özellik 09"]. */
  features?: string[];
  context?: ReactNode;
  title: string;
  description: ReactNode;
  actions?: ReactNode;
  /** Başlığın sağında özet kutucukları. */
  aside?: ReactNode;
  className?: string;
}

export function PageHeader({ features, context, title, description, actions, aside, className }: PageHeaderProps) {
  const { t } = useI18n();
  return (
    <header className={cn('mb-8 flex flex-col gap-6 border-b border-line/20 pb-6 xl:flex-row xl:items-end xl:justify-between', className)}>
      <div className="min-w-0 max-w-3xl">
        {(features?.length || context) && (
          <p className="mb-3 flex flex-wrap items-center gap-2 text-caption text-fg-subtle">
            {features?.map((f) => (
              <span key={f} className="rounded-control bg-primary-strong/15 px-2 py-0.5 font-medium text-primary ring-1 ring-primary-strong/40">
                {t(f)}
              </span>
            ))}
            {context && <span>{context}</span>}
          </p>
        )}
        <h1 className="text-[1.875rem] leading-[2.375rem] font-bold tracking-tight text-fg md:text-display">{title}</h1>
        <p className="mt-2 text-body-lg text-fg-muted">{description}</p>
      </div>
      {(actions || aside) && (
        <div className="flex flex-wrap items-stretch gap-3 xl:justify-end">
          {aside}
          {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
        </div>
      )}
    </header>
  );
}

/** Sayfa başlığı yanındaki küçük özet kutucuğu. */
export function HeaderStat({ label, children, icon }: { label: string; children: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex min-w-36 items-center gap-3 rounded-card border border-line/30 bg-surface-low px-4 py-3">
      {icon}
      <div>
        <p className="text-caption text-fg-subtle">{label}</p>
        <div className="text-body font-semibold text-fg">{children}</div>
      </div>
    </div>
  );
}
