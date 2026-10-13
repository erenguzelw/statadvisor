import type { AnchorHTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface LinkButtonProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  variant?: 'primary' | 'secondary' | 'tonal';
  icon?: LucideIcon;
  children: ReactNode;
}

const variants = {
  primary: 'bg-primary-strong text-on-primary-strong font-semibold hover:shadow-glow hover:brightness-110',
  secondary: 'border border-line-strong text-fg hover:bg-surface-highest/60',
  tonal: 'bg-surface-highest text-fg hover:bg-surface-bright',
};

/** Düğme görünümlü bağlantı (dosya indirme ve yeni sekmede açma için). */
export function LinkButton({ variant = 'secondary', icon: Icon, className, children, ...rest }: LinkButtonProps) {
  return (
    <a className={cn('inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-control px-4 text-body whitespace-nowrap transition', variants[variant], className)} {...rest}>
      {Icon && <Icon size={16} aria-hidden />}
      {children}
    </a>
  );
}
