import type { AssumptionTest } from '@/data/types';
import { StatusChip, StatusLine } from '@/components/ui';
import { PValue } from './PValue';

export function AssumptionTestCard({ test }: { test: AssumptionTest }) {
  const status = test.passed ? 'success' : 'danger';
  return (
    <article className="flex flex-col gap-3 rounded-card border border-line/30 bg-surface-lowest p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-body-lg font-semibold text-fg">{test.name} testi</h3>
        <StatusChip status={status}>{test.passed ? 'Geçerli' : 'İhlal edildi'}</StatusChip>
      </header>
      <p className="flex flex-wrap items-baseline gap-x-2 text-caption text-fg-subtle">
        <PValue p={test.p} alpha={test.alpha} className="text-body-lg!" />
        <span className="whitespace-nowrap">
          eşik <span className="font-mono">α = {test.alpha}</span>
        </span>
      </p>
      <StatusLine status={status} className="text-caption">
        {test.verdict}
      </StatusLine>
    </article>
  );
}
