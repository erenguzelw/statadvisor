import { cn } from '@/lib/cn';

export type MeterTone = 'auto' | 'primary' | 'secondary' | 'tertiary' | 'danger';

const fills: Record<Exclude<MeterTone, 'auto'>, string> = {
  primary: 'bg-primary-strong',
  secondary: 'bg-secondary',
  tertiary: 'bg-tertiary',
  danger: 'bg-danger',
};

/** auto: ≥80 iyi, ≥55 orta, altı zayıf. */
function autoTone(value: number): Exclude<MeterTone, 'auto'> {
  if (value >= 80) return 'secondary';
  if (value >= 55) return 'tertiary';
  return 'danger';
}

export interface MeterBarProps {
  value: number;
  max?: number;
  label: string;
  tone?: MeterTone;
  /** Görünür değer metni; varsayılan "value". */
  valueText?: string;
  showValue?: boolean;
  className?: string;
}

export function MeterBar({ value, max = 100, label, tone = 'auto', valueText, showValue = true, className }: MeterBarProps) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const fill = fills[tone === 'auto' ? autoTone(pct) : tone];
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        role="meter"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuetext={valueText ?? `${value} / ${max}`}
        className="h-1.5 min-w-12 flex-1 overflow-hidden rounded-full bg-surface-highest"
      >
        <div className={cn('h-full rounded-full', fill)} style={{ width: `${pct}%` }} />
      </div>
      {showValue && <span className="w-10 text-right font-mono text-data tabular text-fg">{valueText ?? value}</span>}
    </div>
  );
}
