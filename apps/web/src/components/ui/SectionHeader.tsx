import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/cn';

export interface SectionHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  /** Tanıtımdaki özellik numarası, ör. "Özellik 02". */
  feature?: string;
  actions?: ReactNode;
  level?: 2 | 3;
  className?: string;
}

export function SectionHeader({ title, description, icon: Icon, feature, actions, level = 2, className }: SectionHeaderProps) {
  const { t } = useI18n();
  const H = level === 2 ? 'h2' : 'h3';
  return (
    <header className={cn('mb-4 flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="flex min-w-[min(100%,16rem)] flex-1 items-start gap-3">
        {Icon && (
          <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-card bg-surface-highest text-primary">
            <Icon size={18} aria-hidden />
          </span>
        )}
        <div className="min-w-0">
          <H className={cn('font-semibold text-fg', level === 2 ? 'text-heading' : 'text-body-lg')}>{title}</H>
          {description && <p className="mt-1 max-w-prose text-body text-fg-muted">{description}</p>}
        </div>
      </div>
      {(feature || actions) && (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {feature && (
            <span className="rounded-control border border-line px-2 py-0.5 text-caption whitespace-nowrap text-fg-subtle">
              {t(feature)}
            </span>
          )}
          {actions}
        </div>
      )}
    </header>
  );
}
