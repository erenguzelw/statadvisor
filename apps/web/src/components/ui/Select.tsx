import { useId, type ReactNode } from 'react';
import { ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface SelectOption {
  value: string;
  label: ReactNode;
  disabled?: boolean;
}

export interface SelectProps {
  label: string;
  value: string | undefined;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  hint?: ReactNode;
  disabled?: boolean;
  className?: string;
}

/** Yerel <select> üzerine kurulu, etiketli seçim kutusu (klavye ve ekran okuyucu desteği hazır). */
export function Select({ label, value, onChange, options, placeholder = 'Seçin…', hint, disabled, className }: SelectProps) {
  const id = useId();
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-caption font-medium text-fg-subtle">
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value ?? ''}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-full appearance-none truncate rounded-card border border-line/40 bg-surface-lowest pr-9 pl-3 text-body text-fg hover:border-line-strong disabled:opacity-50"
        >
          {(value === undefined || value === '') && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronsUpDown size={14} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-fg-subtle" aria-hidden />
      </div>
      {hint && <p className="text-caption text-fg-subtle">{hint}</p>}
    </div>
  );
}
