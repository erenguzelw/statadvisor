import { ChevronDown } from 'lucide-react';
import type { AssumptionTest } from '@/data/types';
import { useApp } from '@/context/AppContext';
import { StatusChip, StatusLine, Tag } from '@/components/ui';
import { PValue } from './PValue';

export function AssumptionTestCard({ test }: { test: AssumptionTest }) {
  const { narrate } = useApp();
  const status = test.passed ? 'success' : 'danger';
  return (
    <article className="flex flex-col gap-3 rounded-card border border-line/30 bg-surface-lowest p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-body-lg font-semibold text-fg">{test.name} testi</h3>
        <StatusChip status={status}>{test.passed ? 'Sağlandı' : 'İhlal edildi'}</StatusChip>
      </header>
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-caption text-fg-subtle">
        <PValue p={test.p} alpha={test.alpha} className="text-body-lg!" />
        <Tag>{test.statistic}</Tag>
        <span className="whitespace-nowrap">
          eşik <span className="font-mono">α = {test.alpha}</span>
        </span>
      </p>
      <p className="text-caption text-fg-subtle">Uygulandığı veri: {test.subject}</p>
      <StatusLine status={status} className="text-caption">
        {test.verdict}
      </StatusLine>
      <details className="group rounded-control bg-surface px-3 py-2 text-caption text-fg-muted">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-medium text-fg">
          Bu ne demek?
          <ChevronDown size={14} className="transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <p className="mt-2 max-w-prose leading-5">{narrate(test.explain)}</p>
      </details>
    </article>
  );
}
