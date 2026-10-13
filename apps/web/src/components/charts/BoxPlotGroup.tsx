import { useId } from 'react';
import { scaleBand, scaleLinear } from 'd3-scale';
import type { BoxStats } from '@statadvisor/shared';

const W = 420;
const H = 230;
const pad = { top: 16, right: 12, bottom: 32, left: 40 };
const colors = ['var(--color-primary-strong)', 'var(--color-secondary)', 'var(--color-tertiary)'];

export interface BoxPlotGroupProps {
  boxes: BoxStats[];
  summary: string;
  /** Değer ekseni başlığı. */
  unit?: string;
}

/** Tukey kutu grafiği: bıyıklar sınırlar içindeki en uç gözlemlerdir; sınır dışı gözlemler tek tek işaretlenir. */
export function BoxPlotGroup({ boxes, summary, unit }: BoxPlotGroupProps) {
  const titleId = useId();
  const all = boxes.flatMap((b) => [b.whiskerLow, b.whiskerHigh, ...b.outliers]);
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const span = hi - lo || 1;
  const y = scaleLinear()
    .domain([lo - span * 0.04, hi + span * 0.04])
    .range([H - pad.bottom, pad.top])
    .nice(5);
  const x = scaleBand<string>()
    .domain(boxes.map((b) => b.group))
    .range([pad.left, W - pad.right])
    .padding(0.45);
  const bw = x.bandwidth();

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-labelledby={titleId}>
      <title id={titleId}>{summary}</title>
      {y.ticks(5).map((t) => (
        <g key={t}>
          <line x1={pad.left} x2={W - pad.right} y1={y(t)} y2={y(t)} stroke="var(--color-line)" strokeOpacity={0.35} strokeDasharray="3 5" />
          <text x={pad.left - 6} y={y(t) + 4} textAnchor="end" fontSize={10} fill="var(--color-fg-subtle)" fontFamily="var(--font-mono)">
            {t}
          </text>
        </g>
      ))}
      {unit && (
        <text x={4} y={10} fontSize={10} fill="var(--color-fg-subtle)" fontFamily="var(--font-sans)">
          {unit}
        </text>
      )}
      {boxes.map((b, i) => {
        const cx = (x(b.group) ?? 0) + bw / 2;
        const color = colors[i % colors.length];
        return (
          <g key={b.group}>
            <line x1={cx} x2={cx} y1={y(b.whiskerHigh)} y2={y(b.whiskerLow)} stroke="var(--color-fg-subtle)" />
            <line x1={cx - bw / 4} x2={cx + bw / 4} y1={y(b.whiskerHigh)} y2={y(b.whiskerHigh)} stroke="var(--color-fg-subtle)" />
            <line x1={cx - bw / 4} x2={cx + bw / 4} y1={y(b.whiskerLow)} y2={y(b.whiskerLow)} stroke="var(--color-fg-subtle)" />
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
            {b.outliers.map((o, k) => (
              <circle key={`${o}-${k}`} cx={cx + ((k % 3) - 1) * 4} cy={y(o)} r={2.5} fill="var(--color-danger)" fillOpacity={0.85} />
            ))}
            <text x={cx} y={H - 16} textAnchor="middle" fontSize={11} fill="var(--color-fg-muted)" fontFamily="var(--font-sans)">
              {b.group} (n={b.n})
            </text>
            <text x={cx} y={H - 3} textAnchor="middle" fontSize={10} fill="var(--color-fg-subtle)" fontFamily="var(--font-sans)">
              {b.outliers.length ? `${b.outliers.length} sınır dışı` : 'sınır dışı yok'}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
