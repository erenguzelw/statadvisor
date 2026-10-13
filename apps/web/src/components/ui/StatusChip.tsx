import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Circle, Info, XCircle, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

export type Status = 'success' | 'danger' | 'warning' | 'info' | 'neutral';

export const statusStyles: Record<Status, { chip: string; text: string; icon: LucideIcon }> = {
  success: { chip: 'bg-success-bg text-success border-success/30', text: 'text-success', icon: CheckCircle2 },
  danger: { chip: 'bg-danger-bg text-danger border-danger/30', text: 'text-danger', icon: XCircle },
  warning: { chip: 'bg-warning-bg text-warning border-warning/30', text: 'text-warning', icon: AlertTriangle },
  info: { chip: 'bg-info-bg text-info border-info/30', text: 'text-info', icon: Info },
  neutral: { chip: 'bg-surface-highest text-fg-muted border-line', text: 'text-fg-muted', icon: Circle },
};

export interface StatusChipProps {
  status: Status;
  children: ReactNode;
  hideIcon?: boolean;
  className?: string;
}

/** Durum her zaman ikon + metinle anlatılır; yalnızca renge güvenilmez. */
export function StatusChip({ status, children, hideIcon, className }: StatusChipProps) {
  const { chip, icon: Icon } = statusStyles[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-caption font-medium whitespace-nowrap',
        chip,
        className,
      )}
    >
      {!hideIcon && <Icon size={12} aria-hidden />}
      {children}
    </span>
  );
}

/** Satır içi durum mesajı: ikon + metin. */
export function StatusLine({ status, children, className }: { status: Status; children: ReactNode; className?: string }) {
  const { text, icon: Icon } = statusStyles[status];
  return (
    <p className={cn('flex items-start gap-1.5 text-body', text, className)}>
      <Icon size={16} className="mt-0.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}
