import type { ReactNode } from 'react';
import { Check } from 'lucide-react';

export interface ChecklistItem {
  id: string;
  label: ReactNode;
  meta?: ReactNode;
}

export function Checklist({ items }: { items: ChecklistItem[] }) {
  return (
    <ul className="divide-y divide-line/30">
      {items.map((item) => (
        <li key={item.id} className="flex items-start gap-3 py-2.5">
          <Check size={16} className="mt-0.5 shrink-0 text-secondary" aria-label="Tamamlandı" />
          <span className="flex-1 text-body text-fg">{item.label}</span>
          {item.meta && <span className="shrink-0 text-caption whitespace-nowrap text-fg-subtle">{item.meta}</span>}
        </li>
      ))}
    </ul>
  );
}
