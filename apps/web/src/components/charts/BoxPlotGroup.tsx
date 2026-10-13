import { useId } from 'react';
import { scaleBand, scaleLinear } from 'd3-scale';
import type { BoxStats } from '@/data/types';

const W = 420;
const H = 200;
const pad = { top: 28, right: 12, bottom: 28, left: 12 };
const colors = ['var(--color-primary-strong)', 'var(--color-secondary)', 'var(--color-tertiary)'];

export interface BoxPlotGroupProps {
  boxes: BoxStats[];
  summary: string;
  /** Aykırı değerleri gizle (temizlenmiş görünüm). */
  hideOutliers?: boolean;
}

/**
 * Ölçek bıyıklara göre kurulur; aykırı değerler kutuları ezmesin diye
 * üst kenarda değeriyle birlikte işaretlenir.
 */
export function BoxPlotGroup({ boxes, summary, hideOutliers }: BoxPlotGroupProps) {
  const titleId = useId();
  const lo = Math.min(...boxes.map((b) => b.min));
  const hi = Math.max(...boxes.map((b) => b.max));
  const span = hi - lo;
  const y = scaleLinear()
    .domain([lo - span * 0.08, hi + span * 0.08])
    .range([H - pad.bottom, pad.top]);
  const x = scaleBand<string>()
    .domain(boxes.map((b) => b.group))
    .range([pad.left, W - pad.right])
    .padding(0.45);
  const bw = x.bandwidth();

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-labelledby={titleId}>
      <title id={titleId}>{summary}</title>
      {boxes.map((b, i) => {
        const cx = (x(b.group) ?? 0) + bw / 2;
        const color = colors[i % colors.length];
        return (
          <g key={b.group}>
            <line x1={cx} x2={cx} y1={y(b.max)} y2={y(b.min)} stroke="var(--color-fg-subtle)" />
            <line x1={cx - bw / 4} x2={cx + bw / 4} y1={y(b.max)} y2={y(b.max)} stroke="var(--color-fg-subtle)" />
            <line x1={cx - bw / 4} x2={cx + bw / 4} y1={y(b.min)} y2={y(b.min)} stroke="var(--color-fg-subtle)" />
            <rect
              x={cx - bw / 2}
              y={y(b.q3)}
              width={bw}
              height={y(b.q1) - y(b.q3)}
              rx={3}
              fill={color}
              fillOpacity={0.25}
              stroke={color}
              strokeWidth={1.5}
            />
            <line x1={cx - bw / 2} x2={cx + bw / 2} y1={y(b.median)} y2={y(b.median)} stroke={color} strokeWidth={2.5} />
            {!hideOutliers &&
              b.outliers.map((o) => (
                <g key={o} transform={`translate(${cx}, ${pad.top - 12})`}>
                  <path d="M0 -5 L5 3 L-5 3 Z" fill="var(--color-danger)" />
                  <text x={9} y={3} fontSize={11} fill="var(--color-danger)" fontFamily="var(--font-mono)">
                    {o} (ölçek dışı)
                  </text>
                </g>
              ))}
            <text x={cx} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--color-fg-muted)" fontFamily="var(--font-sans)">
              {b.group} (n={b.n})
            </text>
          </g>
        );
      })}
    </svg>
  );
}
