import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface CheckboxOption {
  value: string;
  label: ReactNode;
  hint?: ReactNode;
}

export interface CheckboxGroupProps {
  legend: string;
  options: CheckboxOption[];
  values: string[];
  onChange: (values: string[]) => void;
  hint?: ReactNode;
  className?: string;
}

/** Çoklu seçim: seçim sırası korunur (ör. eşleşmiş koşulların sırası önemlidir). */
export function CheckboxGroup({ legend, options, values, onChange, hint, className }: CheckboxGroupProps) {
  const toggle = (v: string) => onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  return (
    <fieldset className={cn('min-w-0', className)}>
      <legend className="mb-2 text-caption font-medium text-fg-subtle">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const order = values.indexOf(o.value);
          const checked = order >= 0;
          return (
            <label
              key={o.value}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-card border px-3 py-2 text-body transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary',
                checked ? 'border-secondary bg-secondary/10 text-fg' : 'border-line/50 bg-surface-lowest text-fg-muted hover:border-line-strong',
              )}
            >
              <input type="checkbox" checked={checked} onChange={() => toggle(o.value)} className="accent-[var(--color-secondary)]" />
              <span>{o.label}</span>
              {checked && <span className="font-mono text-caption text-secondary">{order + 1}</span>}
              {o.hint && <span className="text-caption text-fg-muted">{o.hint}</span>}
            </label>
          );
        })}
      </div>
      {hint && <p className="mt-2 text-caption text-fg-subtle">{hint}</p>}
    </fieldset>
  );
}
