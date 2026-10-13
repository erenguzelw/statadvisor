import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export type PanelTone = 'base' | 'raised' | 'recessed' | 'accent' | 'warning' | 'danger';

const tones: Record<PanelTone, string> = {
  base: 'bg-surface border border-line/40 shadow-1',
  raised: 'bg-surface-high border border-primary-strong/25 shadow-2',
  recessed: 'bg-surface-lowest border border-white/5',
  accent: 'bg-surface border border-line/40 border-l-4 border-l-primary-strong shadow-1',
  warning: 'bg-surface border border-line/40 border-l-4 border-l-tertiary shadow-1',
  danger: 'bg-surface border border-line/40 border-l-4 border-l-danger-strong shadow-1',
};

const paddings = { none: '', sm: 'p-3', md: 'p-4', lg: 'p-5 md:p-6' };

export interface PanelProps extends HTMLAttributes<HTMLElement> {
  tone?: PanelTone;
  padding?: keyof typeof paddings;
  as?: 'section' | 'div' | 'article' | 'aside';
}

export function Panel({ tone = 'base', padding = 'lg', as: Tag = 'section', className, ...rest }: PanelProps) {
  const radius = tone === 'recessed' ? 'rounded-card' : 'rounded-panel';
  return <Tag className={cn('min-w-0', radius, tones[tone], paddings[padding], className)} {...rest} />;
}
