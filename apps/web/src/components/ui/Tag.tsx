import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type TagTone = 'neutral' | 'primary' | 'secondary' | 'tertiary' | 'danger';

const tones: Record<TagTone, string> = {
  neutral: 'bg-surface-highest text-fg-muted',
  primary: 'bg-primary-strong/20 text-primary',
  secondary: 'bg-secondary/15 text-secondary',
  tertiary: 'bg-tertiary/15 text-tertiary',
  danger: 'bg-danger-bg text-danger',
};

/** Sayısal veri ve kod parçaları için mono çip: p = .003, H(2) = 11.6 */
export function Tag({ children, tone = 'neutral', className }: { children: ReactNode; tone?: TagTone; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-control px-1.5 py-0.5 font-mono text-data tabular whitespace-nowrap',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
