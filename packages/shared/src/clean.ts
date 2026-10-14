/**
 * Veri temizleme: kullanıcının seçtiği kurallara göre hücreleri eksik işaretleme ya da satır silme, ardından (yalnızca
 * istenirse) eksik değerleri doldurma. Sonuç yeni bir veri sürümüdür; ham veri değiştirilmez.
 *
 * Doldurma sütun türüne göre yapılır: sürekli ölçümlerde medyan ya da KNN; sıralı ve kategorik sütunlarda mod
 * (ortalama/KNN ara değerleri geçerli bir cevap kategorisi olmayabilir).
 */
import { AnalysisError } from './analysis.ts';
import { median } from './assumptions.ts';
import { isNum, kindOf, planRules, type CleanRule, type QualityColumn } from './quality.ts';

export type ImputeMethod = 'none' | 'median' | 'knn';

export interface CleanOptions {
  rules: CleanRule[];
  impute: ImputeMethod;
  k?: number;
  tukeyK?: number;
}

export interface CleanResult {
  columns: QualityColumn[];
  /** Benzersiz silinen satır sayısı. */
  removedRows: number;
  /** Kurallarla eksik işaretlenen hücre sayısı. */
  setMissingCells: number;
  imputedCells: number;
  /** Okunabilir işlem günlüğü (denetim izi). */
  log: string[];
}

export const KNN_MAX_ROWS = 5000;

/** Mod: en sık değer; eşitlikte küçük olan (sayılar sayısal, metinler sözlük sırasıyla). */
export function modeOf<T extends number | string>(values: T[]): T | null {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: T | null = null;
  let bestN = 0;
  for (const [v, n] of counts) {
    if (n > bestN || (n === bestN && best !== null && v < best)) {
      best = v;
      bestN = n;
    }
  }
  return best;
}

const fmt = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(2));

export function cleanColumns(columns: QualityColumn[], opts: CleanOptions): CleanResult {
  const rows = columns[0]?.values.length ?? 0;
  const log: string[] = [];
  const plan = planRules(columns, opts.rules, opts.tukeyK ?? 1.5);

  for (const r of plan.byRule) {
    const c = columns.find((x) => x.name === r.column)!;
    const s = plan.scans.get(r.column)!;
    const what =
      r.issue === 'invalid'
        ? `${r.cells} geçersiz hücre (${s.validity === 'range' ? `doğrulanmış aralık ${fmt(c.validRange!.min)}–${fmt(c.validRange!.max)}` : 'doğrulanmış kategoriler dışında'})`
        : `${r.cells} incelenecek uç değer (Tukey sınırları [${s.lower?.toFixed(2) ?? '–'}, ${s.upper?.toFixed(2) ?? '–'}] dışında)`;
    log.push(`“${r.column}”: ${what}; ${r.action === 'setMissing' ? 'hücreler eksik işaretlendi' : 'bu hücrelerin satırları silinecek satırlara eklendi'}.`);
  }

  // 1) Eksik işaretleme, 2) satır silme. İşaretler özgün veriden hesaplandığı için sıra sonucu değiştirmez.
  const keepIdx: number[] = [];
  for (let i = 0; i < rows; i++) if (!plan.remove[i]) keepIdx.push(i);
  const removedRows = rows - keepIdx.length;
  if (removedRows > 0) log.push(`${removedRows} benzersiz satır silindi (%${((removedRows / rows) * 100).toFixed(1)}); birden fazla kuralla işaretlenen satır bir kez sayılır.`);
  const kept: QualityColumn[] = columns.map((c) => {
    const miss = plan.setMissing.get(c.name);
    return { ...c, values: keepIdx.map((i) => (miss?.[i] ? null : c.values[i]!)) };
  });
  const setMissingCells = keepIdx.reduce((s, i) => s + [...plan.setMissing.values()].filter((m) => m[i]).length, 0);
  if (setMissingCells > 0) log.push(`${setMissingCells} hücre eksik olarak işaretlendi (silinen satırlardakiler hariç).`);

  // 3) Eksik değerleri doldur (yalnızca açıkça istenirse).
  let imputedCells = 0;
  const fillMode = (c: QualityColumn) => {
    const filled = c.values.filter((v): v is number | string => v !== null && v !== undefined);
    const missing = c.values.length - filled.length;
    if (missing === 0 || filled.length === 0) return;
    const fill = c.numeric ? modeOf(filled.filter(isNum)) : modeOf(filled.map(String));
    c.values = c.values.map((v) => (v === null ? fill : v));
    imputedCells += missing;
    log.push(`“${c.name}”: ${missing} eksik değer mod (${fill}) ile dolduruldu.`);
  };
  const fillable = kept.filter((c) => !c.skip);

  if (opts.impute === 'median') {
    for (const c of fillable) {
      if (kindOf(c) === 'continuous' && c.numeric) {
        const filled = c.values.filter(isNum);
        const missing = c.values.length - filled.length;
        if (missing === 0 || filled.length === 0) continue;
        const fill = median(filled);
        c.values = c.values.map((v) => (v === null ? fill : v));
        imputedCells += missing;
        log.push(`“${c.name}”: ${missing} eksik değer medyan (${fill.toFixed(2)}) ile dolduruldu.`);
      } else fillMode(c);
    }
  } else if (opts.impute === 'knn') {
    const n = kept[0]?.values.length ?? 0;
    if (n > KNN_MAX_ROWS) throw new AnalysisError(`KNN imputasyonu en fazla ${KNN_MAX_ROWS.toLocaleString('tr-TR')} satırda desteklenir (bulunan: ${n.toLocaleString('tr-TR')}); medyan/mod ile doldurmayı seçin.`);
    const k = opts.k ?? 5;
    const features = fillable.filter((c) => c.numeric && kindOf(c) === 'continuous');
    const stats = features.map((c) => {
      const v = c.values.filter(isNum);
      const m = v.reduce((s, x) => s + x, 0) / v.length;
      // StandardScaler ile aynı: nüfus standart sapması (ddof = 0)
      const sd = Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / v.length) || 1;
      return { m, sd };
    });
    // Mesafeler her zaman özgün (doldurulmamış) değerlerden hesaplanır; scikit-learn KNNImputer ile aynı.
    const originals = features.map((c) => [...c.values]);
    const z = (fi: number, i: number) => {
      const v = originals[fi]![i];
      return isNum(v) ? (v - stats[fi]!.m) / stats[fi]!.sd : null;
    };
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
        // Komşu yoksa scikit-learn KNNImputer sütun ortalamasına döner.
        const fill = nn.length ? nn.reduce((s, x) => s + x.v, 0) / nn.length : donors.reduce((s, j) => s + (originals[fi]![j] as number), 0) / donors.length;
        col.values[i] = fill;
        imputedCells++;
      }
      log.push(`“${col.name}”: ${targets.length} eksik değer KNN (k=${k}) ile dolduruldu.`);
    }
    // Sıralı ve kategorik sütunlarda KNN ortalaması geçerli bir kategori olmayabilir; mod kullanılır.
    for (const c of fillable) if (!(c.numeric && kindOf(c) === 'continuous')) fillMode(c);
  }
  return { columns: kept, removedRows, setMissingCells, imputedCells, log };
}

/** Sütunları CSV metnine çevirir (virgül ayraç, nokta ondalık, eksik = boş). */
export function columnsToCsv(columns: QualityColumn[]): string {
  const rows = columns[0]?.values.length ?? 0;
  const q = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const out = [columns.map((c) => q(c.name)).join(',')];
  for (let i = 0; i < rows; i++) out.push(columns.map((c) => (c.values[i] === null || c.values[i] === undefined ? '' : q(String(c.values[i])))).join(','));
  return out.join('\n') + '\n';
}
