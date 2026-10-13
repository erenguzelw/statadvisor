import { Brain, Gauge, Star, Zap } from 'lucide-react';
import type { Model } from '@statadvisor/shared';
import { cn } from '@/lib/cn';
import { Button, DataTable, MeterBar, Tag, type Column } from '@/components/ui';

export const modelColors: Record<string, string> = {
  logreg: 'var(--color-primary)',
  rf: 'var(--color-secondary)',
  gb: 'var(--color-tertiary)',
};

const pct = (x: number) => `%${(x * 100).toFixed(1)}`;
const num = (x: number) => x.toFixed(2);

function RecommendedBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-control bg-primary-strong/20 px-1.5 py-0.5 text-caption whitespace-nowrap text-primary">
      <Star size={12} className="fill-current" aria-hidden />
      Önerilen
    </span>
  );
}

const ratings = [
  { key: 'speedRating', label: 'Hız (nitel)', icon: Zap },
  { key: 'interpretabilityRating', label: 'Yorumlanabilirlik (nitel)', icon: Brain },
] as const;

export interface ModelCardProps {
  model: Model;
  selected: boolean;
  onSelect: () => void;
  /** Test setinde, hep çoğunluk sınıfını tahmin eden modelin doğruluğu (0–1). */
  baselineAccuracy: number;
}

export function ModelCard({ model, selected, onSelect, baselineAccuracy }: ModelCardProps) {
  const m = model.metrics;
  return (
    <article
      className={cn(
        'relative flex flex-col gap-4 rounded-panel border bg-surface p-5 shadow-1',
        selected ? 'border-secondary ring-1 ring-secondary/40' : 'border-line/40',
      )}
    >
      {model.recommended && (
        <p className="absolute -top-3 right-4 inline-flex items-center gap-1 rounded-control bg-secondary px-2 py-0.5 text-caption font-semibold text-on-secondary-strong">
          <Star size={12} className="fill-current" aria-hidden />
          Önerilen (en yüksek PR-AUC)
        </p>
      )}
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-caption text-fg-subtle">{model.family}</p>
          <h3 className="text-heading font-semibold text-fg">{model.name}</h3>
        </div>
        <Tag tone={model.recommended ? 'secondary' : 'primary'}>F1 (azınlık) {num(m.f1)}</Tag>
      </header>
      <p className="text-body text-fg-muted">{model.summary}</p>

      <section aria-label="Niteliksel değerlendirme">
        <p className="mb-2 text-caption text-fg-subtle">Niteliksel değerlendirme (ölçüm değil)</p>
        <dl className="flex flex-col gap-3">
          {ratings.map(({ key, label, icon: Icon }) => (
            <div key={key}>
              <dt className="mb-1 flex items-center gap-1.5 text-caption text-fg-muted">
                <Icon size={13} aria-hidden />
                {label}
              </dt>
              <dd>
                <MeterBar value={model[key]} max={5} label={`${model.name} ${label}`} valueText={`${model[key]}/5`} tone="primary" />
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-label="Test seti ölçütleri">
        <p className="mb-2 text-caption text-fg-subtle">Test seti ölçütleri (hesaplanmış)</p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-caption">
          <div>
            <dt className="text-fg-subtle">Doğruluk</dt>
            <dd className="font-mono text-body font-semibold text-fg tabular">{pct(m.accuracy)}</dd>
            <dd className="text-fg-subtle">taban çizgisi {pct(baselineAccuracy)}</dd>
          </div>
          <div>
            <dt className="text-fg-subtle">Duyarlılık (azınlık)</dt>
            <dd className="font-mono text-body font-semibold text-fg tabular">{num(m.recall)}</dd>
            <dd className="text-fg-subtle">kesinlik {num(m.precision)}</dd>
          </div>
          <div>
            <dt className="text-fg-subtle">PR-AUC</dt>
            <dd className="font-mono text-body font-semibold text-fg tabular">{num(m.prAuc)}</dd>
          </div>
          <div>
            <dt className="text-fg-subtle">ROC AUC</dt>
            <dd className="font-mono text-body font-semibold text-fg tabular">{num(m.rocAuc)}</dd>
          </div>
        </dl>
      </section>

      <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-line/20 pt-4">
        <p className="flex items-center gap-1.5 text-caption text-fg-subtle">
          <Gauge size={14} aria-hidden />
          Eğitim doğruluğu <span className="font-mono tabular text-fg">{pct(m.trainAccuracy)}</span>
        </p>
        <Button size="sm" variant={selected ? 'success' : 'tonal'} onClick={onSelect} aria-pressed={selected}>
          {selected ? 'Seçili model' : 'Bu modeli seç'}
        </Button>
      </footer>
    </article>
  );
}

export interface ModelComparisonTableProps {
  models: Model[];
  selectedId: string;
  onSelect?: (id: string) => void;
}

export function ModelComparisonTable({ models, selectedId, onSelect }: ModelComparisonTableProps) {
  const columns: Column<Model>[] = [
    {
      key: 'name',
      header: 'Model',
      cell: (m) => (
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium text-fg">
          <span className="inline-flex items-center gap-2 whitespace-nowrap">
            <span className="size-2 rounded-full" style={{ background: modelColors[m.id] }} aria-hidden />
            {m.name}
          </span>
          {m.recommended && <RecommendedBadge />}
        </span>
      ),
    },
    { key: 'speed', header: 'Hız (nitel)', numeric: true, align: 'right', cell: (m) => `${m.speedRating}/5` },
    { key: 'interp', header: 'Yorumlanabilirlik (nitel)', numeric: true, align: 'right', cell: (m) => `${m.interpretabilityRating}/5` },
    { key: 'acc', header: 'Doğruluk', numeric: true, align: 'right', cell: (m) => pct(m.metrics.accuracy) },
    { key: 'f1', header: 'F1 (azınlık)', numeric: true, align: 'right', cell: (m) => num(m.metrics.f1) },
    { key: 'pr', header: 'PR-AUC', numeric: true, align: 'right', cell: (m) => num(m.metrics.prAuc) },
    { key: 'auc', header: 'ROC AUC', numeric: true, align: 'right', cell: (m) => num(m.metrics.rocAuc) },
  ];
  if (onSelect) {
    columns.push({
      key: 'action',
      header: <span className="sr-only">Eylem</span>,
      align: 'right',
      cell: (m) => (
        <Button
          size="sm"
          variant={m.id === selectedId ? 'primary' : 'tonal'}
          aria-pressed={m.id === selectedId}
          onClick={() => onSelect(m.id)}
          aria-label={`${m.name} modelini seç`}
        >
          {m.id === selectedId ? 'Aktif' : 'Seç'}
        </Button>
      ),
    });
  }

  return (
    <DataTable
      caption="Model karşılaştırması"
      columns={columns}
      rows={models}
      rowKey={(m) => m.id}
      isRowHighlighted={(m) => m.id === selectedId}
      density="compact"
    />
  );
}
