import type { ButtonHTMLAttributes } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  /** Ekran okuyucu için zorunlu etiket. */
  label: string;
  badge?: boolean;
}

export function IconButton({ icon: Icon, label, badge, className, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'relative inline-flex size-10 items-center justify-center rounded-control text-fg-muted transition hover:bg-surface-high hover:text-fg',
        className,
      )}
      {...rest}
    >
      <Icon size={18} aria-hidden />
      {badge && <span className="absolute top-2 right-2 size-2 rounded-full bg-danger-strong ring-2 ring-canvas" />}
    </button>
  );
}
