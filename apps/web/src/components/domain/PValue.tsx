import { cn } from '@/lib/cn';

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

export function formatP(p: number, apa = false) {
  if (p < 0.001) return apa ? '< .001' : '< 0.001';
  const s = p < 0.01 ? p.toFixed(3) : p.toFixed(p < 0.1 ? 3 : 2);
  return apa ? s.replace(/^0/, '') : s;
}

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
