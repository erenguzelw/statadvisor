import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'tonal' | 'success';
export type ButtonSize = 'sm' | 'md' | 'lg';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-primary-strong text-on-primary-strong font-semibold hover:shadow-glow hover:brightness-110',
  secondary: 'border border-line-strong text-fg hover:bg-surface-highest/60',
  ghost: 'text-fg-muted hover:bg-surface-high hover:text-fg',
  tonal: 'bg-surface-highest text-fg hover:bg-surface-bright',
  success: 'bg-secondary text-on-secondary-strong font-semibold hover:brightness-110',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-caption gap-1.5',
  md: 'h-10 px-4 text-body gap-2',
  lg: 'h-12 px-5 text-body-lg gap-2',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  iconEnd?: LucideIcon;
  block?: boolean;
  children?: ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  iconEnd: IconEnd,
  block,
  className,
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  const iconSize = size === 'sm' ? 14 : 16;
  return (
    <button
      type={type}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-control whitespace-nowrap transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50',
        variants[variant],
        sizes[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {Icon && <Icon size={iconSize} aria-hidden />}
      {children}
      {IconEnd && <IconEnd size={iconSize} aria-hidden />}
    </button>
  );
}
