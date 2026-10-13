import { cn } from '@/lib/cn';

export function ProgressBar({ value, label, className }: { value: number; label: string; className?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn('h-2 overflow-hidden rounded-full bg-surface-highest', className)}
    >
      <div
        className="h-full rounded-full bg-gradient-to-r from-secondary-strong to-secondary transition-[width] duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
