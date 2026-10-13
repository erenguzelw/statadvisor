import { useId } from 'react';
import { scaleLinear } from 'd3-scale';
import { curveCatmullRom, line } from 'd3-shape';
import type { HistogramBin } from '@statadvisor/shared';
import { cn } from '@/lib/cn';

export interface HistogramWithNormalProps {
  bins: HistogramBin[];
  /** Beklenen normal eğri; verilmezse yalnızca histogram çizilir. */
  normal?: { mean: number; sd: number };
  /** Grafiğin ne gösterdiğini anlatan metin (ekran okuyucu). */
  summary: string;
  /** Tepe noktasına iliştirilen not. */
  annotation?: string;
  barTone?: 'primary' | 'secondary';
  compact?: boolean;
  className?: string;
}

const W = 480;

function pdf(x: number, mean: number, sd: number) {
  return Math.exp(-0.5 * ((x - mean) / sd) ** 2) / (sd * Math.sqrt(2 * Math.PI));
}

export function HistogramWithNormal({
  bins,
  normal,
  summary,
  annotation,
  barTone = 'primary',
  compact,
  className,
}: HistogramWithNormalProps) {
  const titleId = useId();
  const H = compact ? 120 : 220;
  const pad = { top: compact ? 8 : 36, right: 8, bottom: 8, left: 8 };
  const first = bins[0];
  const last = bins[bins.length - 1];
  if (!first || !last) return null;

  const total = bins.reduce((s, b) => s + b.count, 0);
  const binWidth = first.x1 - first.x0;
  const x = scaleLinear().domain([first.x0, last.x1]).range([pad.left, W - pad.right]);

  const expected = normal
    ? Array.from({ length: 60 }, (_, i) => {
        const v = first.x0 + ((last.x1 - first.x0) * i) / 59;
        return { v, count: total * binWidth * pdf(v, normal.mean, normal.sd) };
      })
    : [];

  const maxCount = Math.max(...bins.map((b) => b.count), ...expected.map((e) => e.count));
  const y = scaleLinear().domain([0, maxCount * 1.08]).range([H - pad.bottom, pad.top]);
  const curve = line<{ v: number; count: number }>()
    .x((d) => x(d.v))
    .y((d) => y(d.count))
    .curve(curveCatmullRom)(expected);

  const peak = bins.reduce((a, b) => (b.count > a.count ? b : a), first);
  const fill = barTone === 'primary' ? 'var(--color-primary-strong)' : 'var(--color-secondary)';

  return (
    <div className={cn('rounded-card bg-surface-lowest p-3', className)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-labelledby={titleId}>
        <title id={titleId}>{summary}</title>
        {!compact &&
          y.ticks(4).map((t) => (
            <line key={t} x1={pad.left} x2={W - pad.right} y1={y(t)} y2={y(t)} stroke="var(--color-line)" strokeOpacity={0.5} strokeDasharray="3 5" />
          ))}
        {bins.map((b) => (
          <rect
            key={b.x0}
            x={x(b.x0) + 3}
            y={y(b.count)}
            width={Math.max(0, x(b.x1) - x(b.x0) - 6)}
            height={y(0) - y(b.count)}
            rx={2}
            fill={fill}
            fillOpacity={b === peak ? 0.95 : 0.7}
          />
        ))}
        {curve && (
          <path d={curve} fill="none" stroke="var(--color-tertiary)" strokeWidth={2} strokeDasharray="6 4" />
        )}
        {annotation && (
          <g transform={`translate(${x((peak.x0 + peak.x1) / 2)}, ${y(peak.count) - 22})`}>
            <circle r={4} fill="var(--color-danger)" />
            <text x={8} y={4} fontSize={12} fill="var(--color-danger)" fontFamily="var(--font-sans)">
              {annotation}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

/** Grafiğin altında kullanılan HTML legend (SVG içindeki metinden daha iyi ölçeklenir). */
export function ChartLegend({ items }: { items: { label: string; swatch: 'bar' | 'dash' | 'line'; color: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-fg-muted">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className={cn(item.swatch === 'bar' ? 'size-2.5 rounded-sm' : 'h-0.5 w-4', item.swatch === 'dash' && 'border-t-2 border-dashed bg-transparent!')}
            style={item.swatch === 'dash' ? { borderColor: item.color } : { background: item.color }}
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
