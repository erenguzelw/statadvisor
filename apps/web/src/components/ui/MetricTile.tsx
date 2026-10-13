import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface MetricTileProps {
  label: string;
  value: ReactNode;
  unit?: ReactNode;
  icon?: LucideIcon;
  /** Değerin rengi. */
  tone?: 'default' | 'secondary' | 'tertiary' | 'danger';
  badge?: ReactNode;
  children?: ReactNode;
  className?: string;
}

const valueTones = {
  default: 'text-fg',
  secondary: 'text-secondary',
  tertiary: 'text-tertiary',
  danger: 'text-danger',
};

export function MetricTile({ label, value, unit, icon: Icon, tone = 'default', badge, children, className }: MetricTileProps) {
  return (
    <div className={cn('flex flex-col gap-2 rounded-panel border border-line/40 bg-surface p-4 shadow-1', className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-caption font-medium text-fg-subtle">{label}</p>
        {Icon && <Icon size={16} className="shrink-0 text-fg-subtle" aria-hidden />}
      </div>
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className={cn('font-display text-display leading-none font-bold tabular', valueTones[tone])}>{value}</span>
        {unit && <span className="text-caption text-fg-subtle">{unit}</span>}
        {badge}
      </p>
      {children && <div className="text-caption text-fg-muted">{children}</div>}
    </div>
  );
}
