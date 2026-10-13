/**
 * Raporlar için bağımsız (kütüphanesiz) SVG grafikler. Çıktı belirleyicidir: aynı veri aynı metni üretir.
 */
import type { DistributionSample } from './types.ts';

const W = 520;
const H = 220;
const pad = { top: 14, right: 12, bottom: 28, left: 40 };

const n2 = (x: number) => (Math.round(x * 100) / 100).toString();

/** Kalıntıların histogramı ve aynı ortalama/SS'li kuramsal normal eğri. */
export function histogramSvg(d: DistributionSample, title: string): string {
  const first = d.bins[0];
  const last = d.bins[d.bins.length - 1];
  if (!first || !last) return '';
  const total = d.bins.reduce((s, b) => s + b.count, 0);
  const width = first.x1 - first.x0;
  const pdf = (x: number) => Math.exp(-0.5 * ((x - d.mean) / d.sd) ** 2) / (d.sd * Math.sqrt(2 * Math.PI));
  const curve = Array.from({ length: 60 }, (_, i) => {
    const x = first.x0 + ((last.x1 - first.x0) * i) / 59;
    return { x, y: total * width * pdf(x) };
  });
  const maxY = Math.max(...d.bins.map((b) => b.count), ...curve.map((c) => c.y)) * 1.08 || 1;
  const sx = (x: number) => pad.left + ((x - first.x0) / (last.x1 - first.x0 || 1)) * (W - pad.left - pad.right);
  const sy = (y: number) => H - pad.bottom - (y / maxY) * (H - pad.top - pad.bottom);
  const bars = d.bins
    .map((b) => {
      const x = sx(b.x0) + 1;
      const w = Math.max(0, sx(b.x1) - sx(b.x0) - 2);
      return `<rect x="${n2(x)}" y="${n2(sy(b.count))}" width="${n2(w)}" height="${n2(sy(0) - sy(b.count))}" fill="#6b6fe0" fill-opacity="0.75"/>`;
    })
    .join('');
  const path = curve.map((c, i) => `${i === 0 ? 'M' : 'L'}${n2(sx(c.x))} ${n2(sy(c.y))}`).join(' ');
  const ticks = [first.x0, (first.x0 + last.x1) / 2, last.x1]
    .map((t) => `<text x="${n2(sx(t))}" y="${H - 10}" text-anchor="middle" font-size="10" fill="#555">${n2(t)}</text>`)
    .join('');
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(title)}"><title>${esc(title)}</title><line x1="${pad.left}" y1="${n2(sy(0))}" x2="${W - pad.right}" y2="${n2(sy(0))}" stroke="#999"/>${bars}<path d="${path}" fill="none" stroke="#d98a00" stroke-width="2" stroke-dasharray="6 4"/>${ticks}<text x="${pad.left - 6}" y="${n2(sy(maxY) + 10)}" text-anchor="end" font-size="10" fill="#555">${n2(maxY)}</text></svg>`;
}
