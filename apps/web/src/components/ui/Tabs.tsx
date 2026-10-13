import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface TabItem<T extends string> {
  value: T;
  label: ReactNode;
}

export interface TabsProps<T extends string> {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  /** Sekme paneli içeriği; seçili sekmeye göre çağıran tarafından üretilir. */
  children: ReactNode;
  className?: string;
}

/** WAI-ARIA tabs deseni: ok tuşları, Home/End. */
export function Tabs<T extends string>({ items, value, onChange, label, children, className }: TabsProps<T>) {
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const activeIndex = Math.max(0, items.findIndex((i) => i.value === value));

  function select(index: number) {
    const item = items[index];
    if (!item) return;
    onChange(item.value);
    refs.current[index]?.focus();
  }

  function onKeyDown(e: KeyboardEvent) {
    const last = items.length - 1;
    const map: Record<string, number> = {
      ArrowRight: activeIndex === last ? 0 : activeIndex + 1,
      ArrowLeft: activeIndex === 0 ? last : activeIndex - 1,
      Home: 0,
      End: last,
    };
    const next = map[e.key];
    if (next === undefined) return;
    e.preventDefault();
    select(next);
  }

  return (
    <div className={className}>
      <div
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="flex gap-1 overflow-x-auto rounded-card bg-surface-lowest p-1"
      >
        {items.map((item, i) => {
          const selected = i === activeIndex;
          return (
            <button
              key={item.value}
              ref={(el) => {
                refs.current[i] = el;
              }}
              id={`${id}-tab-${item.value}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${id}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(item.value)}
              className={cn(
                'rounded-control px-3 py-2 text-body font-medium whitespace-nowrap transition-colors',
                selected ? 'bg-primary-strong/25 text-primary ring-1 ring-primary-strong/50' : 'text-fg-muted hover:bg-surface-high hover:text-fg',
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`${id}-panel`}
        aria-labelledby={`${id}-tab-${items[activeIndex]?.value}`}
        className="mt-4"
      >
        {children}
      </div>
    </div>
  );
}
