import { cn } from '@/lib/cn';
import { formatP } from '@statadvisor/shared';

export { formatP };

/** p değerini anlamlılık eşiğine göre biçimlendirir: .001 / .01 / .05 kademeleri. */
export function significance(p: number, alpha = 0.05): 'strong' | 'significant' | 'none' {
  if (p < 0.01) return 'strong';
  if (p < alpha) return 'significant';
  return 'none';
}

const tones = {
  strong: 'text-secondary',
  significant: 'text-tertiary',
  none: 'text-fg-muted',
};


export function PValue({ p, alpha = 0.05, apa, className }: { p: number; alpha?: number; apa?: boolean; className?: string }) {
  const level = significance(p, alpha);
  const formatted = formatP(p, apa);
  return (
    <span
      data-significance={level}
      className={cn('font-mono text-data font-semibold tabular whitespace-nowrap', tones[level], className)}
    >
      <i>p</i> {formatted.startsWith('<') ? formatted : `= ${formatted}`}
    </span>
  );
}
