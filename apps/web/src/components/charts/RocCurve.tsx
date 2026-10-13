import { useId } from 'react';
import { scaleLinear } from 'd3-scale';
import { line } from 'd3-shape';
import type { RocPoint } from '@statadvisor/shared';

export interface RocSeries {
  id: string;
  label: string;
  auc: number;
  points: RocPoint[];
  color: string;
  emphasized?: boolean;
}

const W = 360;
const H = 240;
const pad = { top: 12, right: 12, bottom: 28, left: 32 };

export function RocCurve({ series }: { series: RocSeries[] }) {
  const titleId = useId();
  const x = scaleLinear().domain([0, 1]).range([pad.left, W - pad.right]);
  const y = scaleLinear().domain([0, 1]).range([H - pad.bottom, pad.top]);
  const path = line<RocPoint>()
    .x((d) => x(d.fpr))
    .y((d) => y(d.tpr));
  const summary = `ROC eğrisi: ${series.map((s) => `${s.label} AUC ${s.auc.toFixed(2)}`).join(', ')}`;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full rounded-card bg-surface-lowest" role="img" aria-labelledby={titleId}>
        <title id={titleId}>{summary}</title>
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line x1={x(0)} x2={x(1)} y1={y(t)} y2={y(t)} stroke="var(--color-line)" strokeOpacity={0.4} />
            <text x={pad.left - 6} y={y(t) + 4} textAnchor="end" fontSize={10} fill="var(--color-fg-subtle)" fontFamily="var(--font-mono)">
              {t.toFixed(1)}
            </text>
            <text x={x(t)} y={H - 10} textAnchor="middle" fontSize={10} fill="var(--color-fg-subtle)" fontFamily="var(--font-mono)">
              {t.toFixed(1)}
            </text>
          </g>
        ))}
        <line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} stroke="var(--color-fg-subtle)" strokeDasharray="4 4" />
        {series.map((s) => (
          <path
            key={s.id}
            d={path(s.points) ?? undefined}
            fill="none"
            stroke={s.color}
            strokeWidth={s.emphasized ? 2.75 : 1.75}
          />
        ))}
        <text x={x(1)} y={H - 10} dx={-24} textAnchor="end" fontSize={10} fill="var(--color-fg-subtle)" fontFamily="var(--font-sans)">
          Yanlış pozitif oranı
        </text>
      </svg>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-caption text-fg-muted">
        {series.map((s) => (
          <li key={s.id} className="flex items-center gap-1.5">
            <span className="h-0.5 w-4" style={{ background: s.color }} aria-hidden />
            {s.label} <span className="font-mono tabular">({s.auc.toFixed(2)})</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
