/**
 * Raporlar için bağımsız (kütüphanesiz) SVG grafikler. Çıktı belirleyicidir: aynı veri aynı metni üretir.
 */
import { mean, normalQuantile, quantile } from './assumptions.ts';
import { extent } from './extent.ts';
import { histogram, skewness } from './stats.ts';
import type { BoxStats, DistributionSample, ScatterSample } from './types.ts';

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
    .map((t, i) => `<text x="${n2(sx(t))}" y="${H - 10}" text-anchor="${i === 2 ? 'end' : 'middle'}" font-size="10" fill="#555">${n2(t)}</text>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(title)}"><title>${esc(title)}</title><line x1="${pad.left}" y1="${n2(sy(0))}" x2="${W - pad.right}" y2="${n2(sy(0))}" stroke="#999"/>${bars}<path d="${path}" fill="none" stroke="#d98a00" stroke-width="2" stroke-dasharray="6 4"/>${ticks}<text x="${pad.left - 6}" y="${n2(sy(maxY) + 10)}" text-anchor="end" font-size="10" fill="#555">${n2(maxY)}</text></svg>`;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Eksen sayıları için: büyük değerlerde ondalık gösterme. */
const tick = (v: number) => (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('en-US') : n2(v));
const COLORS = ['#6b6fe0', '#2a9d8f', '#d98a00', '#c2410c', '#7c3aed', '#0e7490', '#be185d', '#4d7c0f'];

/** Grup başına Tukey kutu grafiği: kutu = Q1–Q3, çizgi = medyan, bıyık = sınırlar içindeki uç gözlemler, nokta = uç gözlem. */
export function boxPlotSvg(boxes: BoxStats[], title: string): string {
  if (!boxes.length) return '';
  const pts = boxes.flatMap((b) => [b.whiskerLow, b.whiskerHigh, ...b.outliers]).filter(Number.isFinite);
  const { lo, hi } = extent(pts);
  if (!Number.isFinite(lo)) return '';
  const span = hi - lo || 1;
  const yLo = lo - span * 0.05;
  const yHi = hi + span * 0.05;
  const left = 52;
  const bottom = 40;
  const sy = (v: number) => H - bottom - ((v - yLo) / (yHi - yLo)) * (H - pad.top - bottom);
  const slot = (W - left - pad.right) / boxes.length;
  const bw = Math.min(70, slot * 0.5);
  const grid = [0, 1, 2, 3, 4]
    .map((i) => {
      const v = yLo + ((yHi - yLo) * i) / 4;
      return `<line x1="${left}" x2="${W - pad.right}" y1="${n2(sy(v))}" y2="${n2(sy(v))}" stroke="#ddd" stroke-dasharray="3 4"/><text x="${left - 6}" y="${n2(sy(v) + 3)}" text-anchor="end" font-size="10" fill="#555">${tick(v)}</text>`;
    })
    .join('');
  const shapes = boxes
    .map((b, i) => {
      const cx = left + slot * (i + 0.5);
      const c = COLORS[i % COLORS.length]!;
      const dots = b.outliers.map((o) => `<circle cx="${n2(cx)}" cy="${n2(sy(o))}" r="2.5" fill="none" stroke="${c}"/>`).join('');
      const label = b.group.length > 14 ? `${b.group.slice(0, 13)}…` : b.group;
      return `<g><line x1="${n2(cx)}" x2="${n2(cx)}" y1="${n2(sy(b.whiskerLow))}" y2="${n2(sy(b.whiskerHigh))}" stroke="${c}" stroke-width="1.5"/><line x1="${n2(cx - bw / 4)}" x2="${n2(cx + bw / 4)}" y1="${n2(sy(b.whiskerLow))}" y2="${n2(sy(b.whiskerLow))}" stroke="${c}" stroke-width="1.5"/><line x1="${n2(cx - bw / 4)}" x2="${n2(cx + bw / 4)}" y1="${n2(sy(b.whiskerHigh))}" y2="${n2(sy(b.whiskerHigh))}" stroke="${c}" stroke-width="1.5"/><rect x="${n2(cx - bw / 2)}" y="${n2(sy(b.q3))}" width="${n2(bw)}" height="${n2(Math.max(1, sy(b.q1) - sy(b.q3)))}" fill="${c}" fill-opacity="0.3" stroke="${c}" stroke-width="1.5"/><line x1="${n2(cx - bw / 2)}" x2="${n2(cx + bw / 2)}" y1="${n2(sy(b.median))}" y2="${n2(sy(b.median))}" stroke="${c}" stroke-width="3"/>${dots}<text x="${n2(cx)}" y="${H - 22}" text-anchor="middle" font-size="11" fill="#222">${esc(label)}</text><text x="${n2(cx)}" y="${H - 9}" text-anchor="middle" font-size="9" fill="#666">n = ${b.n}</text></g>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(title)}"><title>${esc(title)}</title>${grid}${shapes}</svg>`;
}

/** Çapraz tablo için yığılmış yatay çubuklar: her satır kendi içinde %100'e tamamlanır, sütun düzeyleri renk olur. */
export function crosstabSvg(t: { rowNames: string[]; colNames: string[]; table: number[][] }, title: string): string {
  if (!t.rowNames.length || !t.colNames.length) return '';
  const rowH = 26;
  const labelW = 130;
  const legendH = 22;
  const h = pad.top + t.rowNames.length * rowH + legendH + 26;
  const plotW = W - labelW - pad.right;
  const rows = t.rowNames
    .map((name, r) => {
      const counts = t.table[r] ?? [];
      const total = counts.reduce((s, v) => s + v, 0) || 1;
      let x = labelW;
      const y = pad.top + r * rowH;
      const segs = counts
        .map((v, c) => {
          const w = (v / total) * plotW;
          const x0 = x;
          x += w;
          const pct = Math.round((v / total) * 100);
          return `<rect x="${n2(x0)}" y="${y}" width="${n2(w)}" height="${rowH - 6}" fill="${COLORS[c % COLORS.length]}" fill-opacity="0.8"><title>${esc(`${name} / ${t.colNames[c] ?? ''}: ${v} (%${pct})`)}</title></rect>${w > 30 ? `<text x="${n2(x0 + w / 2)}" y="${y + 13}" text-anchor="middle" font-size="10" fill="#fff">%${pct}</text>` : ''}`;
        })
        .join('');
      const label = name.length > 18 ? `${name.slice(0, 17)}…` : name;
      return `<text x="${labelW - 8}" y="${y + 13}" text-anchor="end" font-size="11" fill="#222">${esc(label)}</text>${segs}`;
    })
    .join('');
  const axisY = pad.top + t.rowNames.length * rowH;
  const legend = t.colNames
    .map((c, i) => `<rect x="${labelW + i * 110}" y="${axisY + 6}" width="10" height="10" fill="${COLORS[i % COLORS.length]}" fill-opacity="0.8"/><text x="${labelW + i * 110 + 14}" y="${axisY + 15}" font-size="10" fill="#333">${esc(c.length > 12 ? `${c.slice(0, 11)}…` : c)}</text>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${h}" width="100%" role="img" aria-label="${esc(title)}"><title>${esc(title)}</title>${rows}${legend}</svg>`;
}

/** İki sayısal değişken için saçılım grafiği ve (tüm veriden hesaplanan) en küçük kareler doğrusu. */
export function scatterSvg(s: ScatterSample, title: string): string {
  const pts = s.points.filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
  if (pts.length < 2) return '';
  const xs = extent(pts.map((p) => p[0]));
  const ys = extent(pts.map((p) => p[1]));
  const xp = (xs.hi - xs.lo || 1) * 0.05;
  const yp = (ys.hi - ys.lo || 1) * 0.05;
  const x0 = xs.lo - xp;
  const x1 = xs.hi + xp;
  const y0 = ys.lo - yp;
  const y1 = ys.hi + yp;
  const left = 52;
  const bottom = 40;
  const sx = (v: number) => left + ((v - x0) / (x1 - x0)) * (W - left - pad.right);
  const sy = (v: number) => H - bottom - ((v - y0) / (y1 - y0)) * (H - pad.top - bottom);
  const grid = [0, 1, 2, 3, 4]
    .map((i) => {
      const v = y0 + ((y1 - y0) * i) / 4;
      const u = x0 + ((x1 - x0) * i) / 4;
      return `<line x1="${left}" x2="${W - pad.right}" y1="${n2(sy(v))}" y2="${n2(sy(v))}" stroke="#ddd" stroke-dasharray="3 4"/><text x="${left - 6}" y="${n2(sy(v) + 3)}" text-anchor="end" font-size="10" fill="#555">${tick(v)}</text><text x="${n2(sx(u))}" y="${H - bottom + 14}" text-anchor="middle" font-size="10" fill="#555">${tick(u)}</text>`;
    })
    .join('');
  const dots = pts.map(([a, b]) => `<circle cx="${n2(sx(a))}" cy="${n2(sy(b))}" r="2.6" fill="#6b6fe0" fill-opacity="0.45"/>`).join('');
  const line = Number.isFinite(s.slope)
    ? `<line x1="${n2(sx(xs.lo))}" y1="${n2(sy(s.intercept + s.slope * xs.lo))}" x2="${n2(sx(xs.hi))}" y2="${n2(sy(s.intercept + s.slope * xs.hi))}" stroke="#d98a00" stroke-width="2"/>`
    : '';
  const cut = (t: string) => (t.length > 40 ? `${t.slice(0, 39)}…` : t);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(title)}"><title>${esc(title)}</title>${grid}${dots}${line}<text x="${n2((left + W - pad.right) / 2)}" y="${H - 4}" text-anchor="middle" font-size="11" fill="#222">${esc(cut(s.xName))}</text><text transform="rotate(-90)" x="${-n2((H - bottom + pad.top) / 2)}" y="12" text-anchor="middle" font-size="11" fill="#222">${esc(cut(s.yName))}</text></svg>`;
}

/** İki SVG'yi yan yana tek SVG'de birleştirir (her biri W × H'lik kendi görünüm kutusunda). */
function sideBySide(a: string, b: string, title: string): string {
  if (!a || !b) return a || b;
  const place = (svg: string, x: number) => svg.replace('width="100%"', `x="${x}" y="0" width="${W}" height="${H}"`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W * 2 + 16} ${H}" width="100%" role="img" aria-label="${esc(title)}"><title>${esc(title)}</title>${place(a, 0)}${place(b, W + 16)}</svg>`;
}

/** Normal olasılık (Q-Q) grafiği: gözlenen sıralı değerler ile kuramsal normal kantiller; çizgi Q1–Q3 noktalarından geçer. */
export function qqPlotSvg(values: number[], title: string): string {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  const n = v.length;
  if (n < 3) return '';
  const theo = (i: number) => normalQuantile((i + 0.5) / n);
  const maxPoints = 300;
  const idx = n <= maxPoints ? v.map((_, i) => i) : Array.from({ length: maxPoints }, (_, k) => Math.round((k * (n - 1)) / (maxPoints - 1)));
  const pts = idx.map((i) => [theo(i), v[i]!] as const);
  const xs = extent(pts.map((p) => p[0]));
  const ys = extent(pts.map((p) => p[1]));
  const yp = (ys.hi - ys.lo || 1) * 0.05;
  const y0 = ys.lo - yp;
  const y1 = ys.hi + yp;
  const x0 = xs.lo - 0.2;
  const x1 = xs.hi + 0.2;
  const left = 52;
  const bottom = 40;
  const sx = (t: number) => left + ((t - x0) / (x1 - x0)) * (W - left - pad.right);
  const sy = (t: number) => H - bottom - ((t - y0) / (y1 - y0)) * (H - pad.top - bottom);
  const grid = [0, 1, 2, 3, 4]
    .map((i) => {
      const yv = y0 + ((y1 - y0) * i) / 4;
      const xv = x0 + ((x1 - x0) * i) / 4;
      return `<line x1="${left}" x2="${W - pad.right}" y1="${n2(sy(yv))}" y2="${n2(sy(yv))}" stroke="#ddd" stroke-dasharray="3 4"/><text x="${left - 6}" y="${n2(sy(yv) + 3)}" text-anchor="end" font-size="10" fill="#555">${tick(yv)}</text><text x="${n2(sx(xv))}" y="${H - bottom + 14}" text-anchor="middle" font-size="10" fill="#555">${n2(xv)}</text>`;
    })
    .join('');
  const q = (p: number) => quantile(v, p);
  const zq1 = normalQuantile(0.25);
  const zq3 = normalQuantile(0.75);
  const slope = (q(0.75) - q(0.25)) / (zq3 - zq1);
  const icpt = q(0.25) - slope * zq1;
  const line = Number.isFinite(slope) && slope > 0 ? `<line x1="${n2(sx(x0))}" y1="${n2(sy(icpt + slope * x0))}" x2="${n2(sx(x1))}" y2="${n2(sy(icpt + slope * x1))}" stroke="#d98a00" stroke-width="2" stroke-dasharray="6 4"/>` : '';
  const dots = pts.map(([a, b]) => `<circle cx="${n2(sx(a))}" cy="${n2(sy(b))}" r="2.4" fill="#6b6fe0" fill-opacity="0.55"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(title)}"><title>${esc(title)}</title>${grid}${line}${dots}<text x="${n2((left + W - pad.right) / 2)}" y="${H - 4}" text-anchor="middle" font-size="11" fill="#222">Kuramsal normal kantil (z)</text><text transform="rotate(-90)" x="${-n2((H - bottom + pad.top) / 2)}" y="12" text-anchor="middle" font-size="11" fill="#222">Gözlenen değer</text></svg>`;
}

/** Bir değişken için sol: histogram + kuramsal normal eğri, sağ: normal Q-Q grafiği. */
export function normalityPanelSvg(values: number[], name: string): string {
  const v = values.filter(Number.isFinite);
  if (v.length < 5) return '';
  const m = mean(v);
  const sdv = Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1));
  if (!(sdv > 0)) return '';
  const { lo, hi } = extent(v);
  const k = Math.min(30, Math.max(6, Math.ceil(Math.log2(v.length) + 1)));
  const width = (hi - lo) / k || 1;
  const dist: DistributionSample = { bins: histogram(v, k, lo, width), mean: m, sd: sdv, skewness: Number(skewness(v).toFixed(2)), n: v.length };
  const title = `${name}: histogram ve normal Q-Q grafiği`;
  return sideBySide(histogramSvg(dist, `${name} histogramı`), qqPlotSvg(v, `${name} normal Q-Q grafiği`), title);
}

export interface BarItem {
  label: string;
  value: number;
  /** Verilirse çubuğun ucunda ± hata çizgisi çizilir (ör. çapraz doğrulama standart sapması). */
  err?: number;
  text?: string;
}

/** Yatay çubuk grafiği; isteğe bağlı dikey referans çizgisi (ör. taban doğruluğu). Değerler 0'dan başlar. */
export function barsSvg(items: BarItem[], title: string, opts: { max?: number; baseline?: { value: number; label: string } } = {}): string {
  if (!items.length) return '';
  const rowH = 28;
  const labelW = 150;
  const right = 70;
  const top = 18;
  const h = top + items.length * rowH + 14;
  const max = opts.max ?? (Math.max(...items.map((i) => i.value + (i.err ?? 0)), opts.baseline?.value ?? 0) * 1.05 || 1);
  const sx = (v: number) => labelW + (v / max) * (W - labelW - right);
  const rows = items
    .map((it, i) => {
      const y = top + i * rowH;
      const c = COLORS[i % COLORS.length]!;
      const err = it.err && it.err > 0 ? `<line x1="${n2(sx(Math.max(0, it.value - it.err)))}" x2="${n2(sx(it.value + it.err))}" y1="${y + 9}" y2="${y + 9}" stroke="#222"/><line x1="${n2(sx(it.value + it.err))}" x2="${n2(sx(it.value + it.err))}" y1="${y + 5}" y2="${y + 13}" stroke="#222"/>` : '';
      const label = it.label.length > 24 ? `${it.label.slice(0, 23)}…` : it.label;
      const end = sx(it.value + (it.err ?? 0)) + 6;
      return `<text x="${labelW - 8}" y="${y + 13}" text-anchor="end" font-size="11" fill="#222">${esc(label)}</text><rect x="${labelW}" y="${y}" width="${n2(Math.max(0, sx(it.value) - labelW))}" height="18" fill="${c}" fill-opacity="0.75"/>${err}<text x="${n2(end)}" y="${y + 13}" font-size="10" fill="#333">${esc(it.text ?? n2(it.value))}</text>`;
    })
    .join('');
  const b = opts.baseline;
  const base = b ? `<line x1="${n2(sx(b.value))}" x2="${n2(sx(b.value))}" y1="${top - 6}" y2="${h - 12}" stroke="#d98a00" stroke-width="2" stroke-dasharray="6 4"/><text x="${n2(sx(b.value))}" y="${top - 8}" text-anchor="middle" font-size="10" fill="#9a6700">${esc(b.label)}</text>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${h}" width="100%" role="img" aria-label="${esc(title)}"><title>${esc(title)}</title><line x1="${labelW}" x2="${labelW}" y1="${top - 4}" y2="${h - 12}" stroke="#999"/>${rows}${base}</svg>`;
}

/** Etkileşim grafiği: x ekseninde bir faktörün düzeyleri, her çizgi diğer faktörün bir düzeyinin ortalamaları. */
export function interactionSvg(xLevels: string[], series: { name: string; values: (number | null)[] }[], xName: string, yName: string, title: string): string {
  const all = series.flatMap((s) => s.values).filter((v): v is number => v !== null && Number.isFinite(v));
  if (!all.length || xLevels.length < 2) return '';
  const { lo, hi } = extent(all);
  const span = hi - lo || 1;
  const y0 = lo - span * 0.1;
  const y1 = hi + span * 0.1;
  const left = 52;
  const bottom = 40;
  const legendW = 110;
  const sx = (i: number) => left + 20 + (i / (xLevels.length - 1)) * (W - left - legendW - 40);
  const sy = (v: number) => H - bottom - ((v - y0) / (y1 - y0)) * (H - pad.top - bottom);
  const grid = [0, 1, 2, 3, 4]
    .map((i) => {
      const v = y0 + ((y1 - y0) * i) / 4;
      return `<line x1="${left}" x2="${W - legendW}" y1="${n2(sy(v))}" y2="${n2(sy(v))}" stroke="#ddd" stroke-dasharray="3 4"/><text x="${left - 6}" y="${n2(sy(v) + 3)}" text-anchor="end" font-size="10" fill="#555">${tick(v)}</text>`;
    })
    .join('');
  const xt = xLevels.map((l, i) => `<text x="${n2(sx(i))}" y="${H - bottom + 14}" text-anchor="middle" font-size="10" fill="#333">${esc(l.length > 12 ? `${l.slice(0, 11)}…` : l)}</text>`).join('');
  const lines = series
    .map((s, k) => {
      const c = COLORS[k % COLORS.length]!;
      const pts = s.values.map((v, i) => (v === null || !Number.isFinite(v) ? null : ([sx(i), sy(v)] as const)));
      const path = pts.filter((p) => p).map((p, i) => `${i === 0 ? 'M' : 'L'}${n2(p![0])} ${n2(p![1])}`).join(' ');
      const dots = pts.map((p) => (p ? `<circle cx="${n2(p[0])}" cy="${n2(p[1])}" r="3.5" fill="${c}"/>` : '')).join('');
      const lg = `<line x1="${W - legendW + 8}" x2="${W - legendW + 24}" y1="${pad.top + 8 + k * 16}" y2="${pad.top + 8 + k * 16}" stroke="${c}" stroke-width="2"/><text x="${W - legendW + 28}" y="${pad.top + 12 + k * 16}" font-size="10" fill="#333">${esc(s.name.length > 10 ? `${s.name.slice(0, 9)}…` : s.name)}</text>`;
      return `<path d="${path}" fill="none" stroke="${c}" stroke-width="2"/>${dots}${lg}`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(title)}"><title>${esc(title)}</title>${grid}${lines}${xt}<text x="${n2((left + W - legendW) / 2)}" y="${H - 4}" text-anchor="middle" font-size="11" fill="#222">${esc(xName)}</text><text transform="rotate(-90)" x="${-n2((H - bottom + pad.top) / 2)}" y="12" text-anchor="middle" font-size="10" fill="#222">${esc(`${yName} (ortalama)`.slice(0, 40))}</text></svg>`;
}
