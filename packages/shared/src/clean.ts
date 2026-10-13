/**
 * Veri temizleme: Tukey sınırları dışındaki satırları çıkarma ve eksik değerleri doldurma (medyan/mod ya da KNN).
 * Sonuç yeni bir veri sürümüdür; ham veri değiştirilmez.
 */
import { AnalysisError } from './analysis.ts';
import { median, tukeyFences } from './assumptions.ts';
import type { QualityColumn } from './quality.ts';

export type ImputeMethod = 'none' | 'median' | 'knn';

export interface CleanOptions {
  /** Aykırı değeri olan satırların çıkarılacağı sütunlar. */
  outlierColumns: string[];
  impute: ImputeMethod;
  k?: number;
  tukeyK?: number;
}

export interface CleanResult {
  columns: QualityColumn[];
  removedRows: number;
  imputedCells: number;
  /** Okunabilir işlem günlüğü (denetim izi). */
  log: string[];
}

export const KNN_MAX_ROWS = 5000;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function mode(values: string[]): string | null {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: string | null = null;
  let bestN = 0;
  for (const [v, n] of counts) {
    if (n > bestN || (n === bestN && best !== null && v < best)) {
      best = v;
      bestN = n;
    }
  }
  return best;
}

export function cleanColumns(columns: QualityColumn[], opts: CleanOptions): CleanResult {
  const rows = columns[0]?.values.length ?? 0;
  const log: string[] = [];
  const known = new Set(columns.map((c) => c.name));
  for (const n of opts.outlierColumns) {
    const c = columns.find((x) => x.name === n);
    if (!known.has(n)) throw new AnalysisError(`“${n}” adlı sütun bulunamadı.`);
    if (!c!.numeric) throw new AnalysisError(`“${n}” sayısal değil; aykırı değer sınırı hesaplanamaz.`);
  }

  // 1) Aykırı değer içeren satırları çıkar (sınırlar tüm veri üzerinden hesaplanır).
  const remove = new Array<boolean>(rows).fill(false);
  for (const name of opts.outlierColumns) {
    const c = columns.find((x) => x.name === name)!;
    const nums = c.values.filter(isNum);
    if (nums.length < 4) continue;
    const f = tukeyFences(nums, opts.tukeyK ?? 1.5);
    let flagged = 0;
    c.values.forEach((v, i) => {
      if (isNum(v) && (v < f.lower || v > f.upper)) {
        remove[i] = true;
        flagged++;
      }
    });
    log.push(`“${name}”: Tukey sınırları [${f.lower.toFixed(2)}, ${f.upper.toFixed(2)}] dışında ${flagged} gözlem.`);
  }
  const keepIdx = remove.map((r, i) => (r ? -1 : i)).filter((i) => i >= 0);
  const removedRows = rows - keepIdx.length;
  if (removedRows > 0) log.push(`${removedRows} satır çıkarıldı.`);
  const kept: QualityColumn[] = columns.map((c) => ({ ...c, values: keepIdx.map((i) => c.values[i]!) }));

  // 2) Eksik değerleri doldur.
  let imputedCells = 0;
  if (opts.impute === 'median') {
    for (const c of kept) {
      const filled = c.values.filter((v) => v !== null);
      const missing = c.values.length - filled.length;
      if (missing === 0 || c.skip || filled.length === 0) continue;
      const fill = c.numeric ? median(filled.filter(isNum)) : mode(filled.map(String));
      c.values = c.values.map((v) => (v === null ? fill : v));
      imputedCells += missing;
      log.push(`“${c.name}”: ${missing} eksik değer ${c.numeric ? 'medyan' : 'mod'} (${typeof fill === 'number' ? fill.toFixed(2) : fill}) ile dolduruldu.`);
    }
  } else if (opts.impute === 'knn') {
    const n = kept[0]?.values.length ?? 0;
    if (n > KNN_MAX_ROWS) throw new AnalysisError(`KNN imputasyonu en fazla ${KNN_MAX_ROWS.toLocaleString('tr-TR')} satırda desteklenir (bulunan: ${n.toLocaleString('tr-TR')}); medyan ile doldurmayı deneyin.`);
    const k = opts.k ?? 5;
    const features = kept.filter((c) => c.numeric && !c.skip);
    const stats = features.map((c) => {
      const v = c.values.filter(isNum);
      const m = v.reduce((s, x) => s + x, 0) / v.length;
      // StandardScaler ile aynı: nüfus standart sapması (ddof = 0)
      const sd = Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / v.length) || 1;
      return { m, sd };
    });
    const z = (fi: number, i: number) => {
      const v = features[fi]!.values[i];
      return isNum(v) ? (v - stats[fi]!.m) / stats[fi]!.sd : null;
    };
    const originals = features.map((c) => [...c.values]);
    for (let fi = 0; fi < features.length; fi++) {
      const col = features[fi]!;
      const targets = originals[fi]!.map((v, i) => (v === null ? i : -1)).filter((i) => i >= 0);
      if (targets.length === 0) continue;
      const donors = originals[fi]!.map((v, i) => (v !== null ? i : -1)).filter((i) => i >= 0);
      for (const i of targets) {
        const dists: { d: number; v: number }[] = [];
        for (const j of donors) {
          let s = 0;
          let cnt = 0;
          for (let g = 0; g < features.length; g++) {
            if (g === fi) continue;
            const a = z(g, i);
            const b = z(g, j);
            if (a !== null && b !== null) {
              s += (a - b) ** 2;
              cnt++;
            }
          }
          if (cnt > 0) dists.push({ d: Math.sqrt(s / cnt), v: originals[fi]![j] as number });
        }
        dists.sort((x, y) => x.d - y.d);
        const nn = dists.slice(0, k);
        const fill = nn.length ? nn.reduce((s, x) => s + x.v, 0) / nn.length : median(donors.map((j) => originals[fi]![j] as number));
        col.values[i] = fill;
        imputedCells++;
      }
      log.push(`“${col.name}”: ${targets.length} eksik değer KNN (k=${k}) ile dolduruldu.`);
    }
    // Kategorik sütunlarda eksikler mod ile doldurulur.
    for (const c of kept) {
      if (c.numeric || c.skip) continue;
      const filled = c.values.filter((v) => v !== null);
      const missing = c.values.length - filled.length;
      if (missing === 0 || filled.length === 0) continue;
      const fill = mode(filled.map(String));
      c.values = c.values.map((v) => (v === null ? fill : v));
      imputedCells += missing;
      log.push(`“${c.name}”: ${missing} eksik değer mod (${fill}) ile dolduruldu.`);
    }
  }
  return { columns: kept, removedRows, imputedCells, log };
}

/** Sütunları CSV metnine çevirir (virgül ayraç, nokta ondalık, eksik = boş). */
export function columnsToCsv(columns: QualityColumn[]): string {
  const rows = columns[0]?.values.length ?? 0;
  const q = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const out = [columns.map((c) => q(c.name)).join(',')];
  for (let i = 0; i < rows; i++) out.push(columns.map((c) => (c.values[i] === null || c.values[i] === undefined ? '' : q(String(c.values[i])))).join(','));
  return out.join('\n') + '\n';
}
