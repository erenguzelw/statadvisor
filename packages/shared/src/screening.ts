/**
 * Anket yanıt taraması: düz çizgi (tüm maddelere aynı yanıt) ve çok değişkenli aykırı değer (Mahalanobis D²).
 * Yalnızca seçilen maddeleri tam yanıtlayan satırlar taranır; satır numaraları 0 tabanlıdır.
 */
import { AnalysisError } from './analysis.ts';
import type { QualityColumn } from './quality.ts';
import { chiSquareSurvival } from './stats.ts';

export interface ScreenOptions {
  items: string[];
  straightLine: boolean;
  mahalanobis: boolean;
  /** Mahalanobis için anlamlılık düzeyi (Tabachnick & Fidell: p < .001). */
  mahalanobisAlpha?: number;
}

export interface MahalanobisFlag {
  row: number;
  d2: number;
  p: number;
}

export interface ScreenResult {
  items: number;
  /** Tüm maddeleri yanıtlayan, taranan satır sayısı. */
  complete: number;
  straightLiners: number[];
  mahalanobis: MahalanobisFlag[];
  /** χ² kritik değeri (sd = madde sayısı). */
  critical: number | null;
  maxD2: number | null;
  /** Çıkarılması önerilen satırlar (iki ölçütün birleşimi, sıralı). */
  flagged: number[];
  notes: string[];
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Kısmi pivotlu Gauss-Jordan ile ters matris; tekil matriste null. */
export function invert(a: number[][]): number[][] | null {
  const n = a.length;
  const m = a.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  const scale = Math.max(...a.map((r, i) => Math.abs(r[i]!)), 1e-300);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r]![c]!) > Math.abs(m[piv]![c]!)) piv = r;
    if (Math.abs(m[piv]![c]!) < 1e-10 * scale) return null;
    [m[c], m[piv]] = [m[piv]!, m[c]!];
    const d = m[c]![c]!;
    for (let j = 0; j < 2 * n; j++) m[c]![j]! /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = m[r]![c]!;
      if (f !== 0) for (let j = 0; j < 2 * n; j++) m[r]![j]! -= f * m[c]![j]!;
    }
  }
  return m.map((row) => row.slice(n));
}

/** χ² dağılımının üst kuyruk kritik değeri (ikiye bölme). */
function chiSquareCritical(alpha: number, df: number): number {
  let lo = 0;
  let hi = Math.max(10, df * 10);
  while (chiSquareSurvival(hi, df) > alpha) hi *= 2;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (chiSquareSurvival(mid, df) > alpha) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function screenResponses(columns: QualityColumn[], opts: ScreenOptions): ScreenResult {
  if (!opts.straightLine && !opts.mahalanobis) throw new AnalysisError('En az bir tarama ölçütü seçin.');
  if (new Set(opts.items).size !== opts.items.length) throw new AnalysisError('Aynı madde birden fazla seçilmiş.');
  if (opts.items.length < 2) throw new AnalysisError('Tarama için en az 2 madde seçin.');
  const cols = opts.items.map((n) => {
    const c = columns.find((x) => x.name === n);
    if (!c) throw new AnalysisError(`“${n}” adlı sütun bulunamadı.`);
    if (!c.numeric) throw new AnalysisError(`“${n}” sayısal ya da sıralı değil; taramaya eklenemez.`);
    return c;
  });
  const k = cols.length;
  const rows = cols[0]!.values.length;
  const complete: number[] = [];
  for (let i = 0; i < rows; i++) if (cols.every((c) => isNum(c.values[i]))) complete.push(i);
  const notes: string[] = [];
  if (complete.length < rows) notes.push(`${rows - complete.length} satırda en az bir madde yanıtsız; bu satırlar taranmadı.`);

  const straightLiners = opts.straightLine ? complete.filter((i) => cols.every((c) => c.values[i] === cols[0]!.values[i])) : [];

  let mahalanobis: MahalanobisFlag[] = [];
  let critical: number | null = null;
  let maxD2: number | null = null;
  if (opts.mahalanobis) {
    const alpha = opts.mahalanobisAlpha ?? 0.001;
    if (complete.length <= k + 1) throw new AnalysisError(`Mahalanobis için tam yanıtlı satır sayısı (${complete.length}) madde sayısından (${k}) en az 2 fazla olmalı.`);
    const X = complete.map((i) => cols.map((c) => c.values[i] as number));
    const n = X.length;
    const mu = Array.from({ length: k }, (_, j) => X.reduce((s, r) => s + r[j]!, 0) / n);
    const cov = Array.from({ length: k }, (_, a) =>
      Array.from({ length: k }, (_, b) => X.reduce((s, r) => s + (r[a]! - mu[a]!) * (r[b]! - mu[b]!), 0) / (n - 1)),
    );
    const inv = invert(cov);
    if (!inv) throw new AnalysisError('Maddeler arasında tam doğrusal bağımlılık var (ör. sabit bir madde ya da başka maddelerin toplamı olan bir sütun); Mahalanobis uzaklığı hesaplanamaz.');
    const d2s = X.map((r) => {
      const d = r.map((v, j) => v - mu[j]!);
      let s = 0;
      for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) s += d[a]! * inv[a]![b]! * d[b]!;
      return s;
    });
    maxD2 = Math.max(...d2s);
    critical = chiSquareCritical(alpha, k);
    mahalanobis = d2s
      .map((d2, idx) => ({ row: complete[idx]!, d2, p: chiSquareSurvival(d2, k) }))
      .filter((f) => f.p < alpha)
      .sort((a, b) => b.d2 - a.d2);
  }
  const flagged = [...new Set([...straightLiners, ...mahalanobis.map((m) => m.row)])].sort((a, b) => a - b);
  return { items: k, complete: complete.length, straightLiners, mahalanobis, critical, maxD2, flagged, notes };
}
