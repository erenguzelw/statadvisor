import { Brain, Gauge, Star, Target, Zap } from 'lucide-react';
import type { Model } from '@/data/types';
import { cn } from '@/lib/cn';
import { Button, DataTable, MeterBar, Tag, type Column } from '@/components/ui';

export const modelColors: Record<string, string> = {
  logreg: 'var(--color-primary)',
  rf: 'var(--color-secondary)',
  xgb: 'var(--color-tertiary)',
};

function RecommendedBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-control bg-primary-strong/20 px-1.5 py-0.5 text-caption whitespace-nowrap text-primary">
      <Star size={12} className="fill-current" aria-hidden />
      Dengeli seçim
    </span>
  );
}

const metrics = [
  { key: 'speed', label: 'İşlem hızı', icon: Zap },
  { key: 'interpretability', label: 'Yorumlanabilirlik', icon: Brain },
  { key: 'accuracy', label: 'Doğruluk', icon: Target },
] as const;

export interface ModelCardProps {
  model: Model;
  selected: boolean;
  onSelect: () => void;
}

export function ModelCard({ model, selected, onSelect }: ModelCardProps) {
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
          Dengeli seçim, önerilen
        </p>
      )}
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-caption text-fg-subtle">{model.family}</p>
          <h3 className="text-heading font-semibold text-fg">{model.name}</h3>
        </div>
        <Tag tone={model.recommended ? 'secondary' : 'primary'}>Doğruluk %{model.accuracy}</Tag>
      </header>
      <p className="text-body text-fg-muted">{model.summary}</p>
      <dl className="flex flex-col gap-3">
        {metrics.map(({ key, label, icon: Icon }) => (
          <div key={key}>
            <dt className="mb-1 flex items-center gap-1.5 text-caption text-fg-muted">
              <Icon size={13} aria-hidden />
              {label}
            </dt>
            <dd>
              <MeterBar value={model[key]} label={`${model.name} ${label}`} valueText={`${model[key]}`} />
            </dd>
          </div>
        ))}
      </dl>
      <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-line/20 pt-4">
        <p className="flex items-center gap-1.5 text-caption text-fg-subtle">
          <Gauge size={14} aria-hidden />
          ROC AUC <span className="font-mono text-body font-semibold text-fg tabular">{model.rocAuc.toFixed(2)}</span>
        </p>
        <Button
          size="sm"
          variant={selected ? 'success' : 'tonal'}
          onClick={onSelect}
          aria-pressed={selected}
        >
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
  /** Ayrıntılı tablo: F1 ve ROC AUC sütunlarını da gösterir. */
  detailed?: boolean;
}

export function ModelComparisonTable({ models, selectedId, onSelect, detailed }: ModelComparisonTableProps) {
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
    ...metrics.map(
      ({ key, label }): Column<Model> =>
        detailed
          ? { key, header: label, numeric: true, align: 'right', cell: (m) => (key === 'accuracy' ? `%${m[key]}` : m[key]) }
          : { key, header: label, width: '18%', cell: (m) => <MeterBar value={m[key]} label={`${m.name} ${label}`} /> },
    ),
  ];
  if (detailed) {
    columns.push(
      { key: 'f1', header: 'F1', numeric: true, align: 'right', cell: (m) => m.f1.toFixed(2) },
      { key: 'auc', header: 'ROC AUC', numeric: true, align: 'right', cell: (m) => m.rocAuc.toFixed(2) },
    );
  }
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
      density={detailed ? 'compact' : 'comfortable'}
    />
  );
}
