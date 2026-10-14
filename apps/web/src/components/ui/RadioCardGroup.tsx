import { useId, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface RadioCardOption<T extends string> {
  value: T;
  title: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  /** Sağ üstte küçük not, ör. "Hızlı". */
  hint?: ReactNode;
  disabled?: boolean;
}

export interface RadioCardGroupProps<T extends string> {
  legend: string;
  hideLegend?: boolean;
  options: RadioCardOption<T>[];
  value: T;
  onChange: (value: T) => void;
  layout?: 'row' | 'stack';
  className?: string;
}

/** Yerel radio input'ları üzerine kurulu kart seçici (klavye ve ekran okuyucu ücretsiz gelir). */
export function RadioCardGroup<T extends string>({
  legend,
  hideLegend,
  options,
  value,
  onChange,
  layout = 'row',
  className,
}: RadioCardGroupProps<T>) {
  const name = useId();
  return (
    <fieldset className={className}>
      <legend className={cn('mb-2 text-caption font-medium text-fg-subtle', hideLegend && 'sr-only')}>{legend}</legend>
      <div
        className={cn(
          'grid gap-2',
          layout === 'row' ? 'grid-cols-[repeat(auto-fit,minmax(7rem,1fr))]' : 'grid-cols-1',
        )}
      >
        {options.map(({ value: v, title, description, icon: Icon, hint, disabled }) => {
          const checked = v === value;
          return (
            <label
              key={v}
              className={cn(
                'relative flex cursor-pointer gap-3 rounded-card border p-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary',
                layout === 'row' && Icon ? 'flex-col items-center text-center' : 'items-start',
                checked ? 'border-secondary bg-secondary/10' : 'border-line/50 bg-surface-lowest hover:border-line-strong',
                disabled && 'cursor-not-allowed opacity-50 hover:border-line/50',
              )}
            >
              <input
                type="radio"
                name={name}
                value={v}
                checked={checked}
                disabled={disabled}
                onChange={() => onChange(v)}
                className={cn(Icon ? 'sr-only' : 'mt-1 accent-[var(--color-primary-strong)]')}
              />
              {Icon && <Icon size={22} className={checked ? 'text-secondary' : 'text-primary'} aria-hidden />}
              <span className="min-w-0 flex-1">
                <span className="block text-body font-semibold text-fg">{title}</span>
                {description && <span className="mt-0.5 block text-caption text-fg-muted">{description}</span>}
                {hint && <span className="mt-0.5 block text-caption text-secondary">{hint}</span>}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
