/**
 * Ölçek (alt boyut) puanları: anket maddelerinden toplam/ortalama puan üretir, ters maddeleri çevirir ve
 * Cronbach alfa ile iç tutarlılığı hesaplar. Alt boyutları kullanıcı elle tanımlar; uygulama madde anahtarı uydurmaz.
 */
import { AnalysisError } from './analysis.ts';
import { shapiroWilk } from './assumptions.ts';
import type { QualityColumn } from './quality.ts';
import { shapeStats } from './stats.ts';

export interface ScaleDef {
  name: string;
  items: string[];
  /** Ters kodlanacak maddeler (items alt kümesi): x → min + max − x. */
  reverse: string[];
  method: 'mean' | 'sum';
  /** Madde yanıt ölçeğinin en küçük ve en büyük değeri (ör. 0–4 ya da 1–5). */
  min: number;
  max: number;
  /** Puan için gereken en az yanıtlı madde oranı (1 = tüm maddeler). Toplamda yanıtlananların ortalaması × madde sayısı kullanılır. */
  minValidShare: number;
}

/** Madde analizi (SPSS “Item-Total Statistics” karşılığı); tüm maddeleri yanıtlayan satırlarda, ters maddeler çevrilmiş halde. */
export interface ItemStat {
  item: string;
  reversed: boolean;
  mean: number;
  sd: number;
  /** Düzeltilmiş madde-toplam korelasyonu: madde ile kendisi hariç kalan maddelerin toplamı arasındaki Pearson r. */
  itemTotalR: number | null;
  /** Bu madde çıkarılırsa Cronbach alfa (en az 2 madde kalmalı). */
  alphaIfDeleted: number | null;
}

/** Düzeltilmiş madde-toplam korelasyonu bu eşiğin altındaysa madde zayıf sayılır (Nunnally ve Bernstein, 1994). */
export const ITEM_TOTAL_MIN = 0.3;

export interface ScaleResult {
  name: string;
  values: (number | null)[];
  /** Cronbach alfa (tüm maddeleri yanıtlayan satırlarda); hesaplanamazsa null. */
  alpha: number | null;
  nAlpha: number;
  /** Madde analizi; alfa için yeterli satır yoksa boş. */
  itemStats: ItemStat[];
  nValid: number;
  mean: number | null;
  /** Puanın normalliği: düzeltilmiş çarpıklık/basıklık ve Shapiro-Wilk (en fazla 5000 gözlem; fazlası eşit aralıklı alt örnek). */
  skewness: number | null;
  kurtosis: number | null;
  shapiroW: number | null;
  shapiroP: number | null;
  /** Maddeler arası ortalama ilişki yerine okunabilir uyarılar. */
  notes: string[];
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function variance(xs: number[]): number {
  const m = xs.reduce((s, x) => s + x, 0) / xs.length;
  return xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
}

/** Cronbach alfa: verilen sütunlar (en az 2) üzerinden; toplam puanın varyansı 0 ise null. */
function cronbach(rows: number[][], cols: number[]): number | null {
  const k = cols.length;
  if (k < 2) return null;
  const totalVar = variance(rows.map((r) => cols.reduce((s, j) => s + r[j]!, 0)));
  if (!(totalVar > 0)) return null;
  const itemVar = cols.reduce((s, j) => s + variance(rows.map((r) => r[j]!)), 0);
  return (k / (k - 1)) * (1 - itemVar / totalVar);
}

function pearson(x: number[], y: number[]): number | null {
  const n = x.length;
  const mx = x.reduce((s, v) => s + v, 0) / n;
  const my = y.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i]! - mx) * (y[i]! - my);
    sxx += (x[i]! - mx) ** 2;
    syy += (y[i]! - my) ** 2;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
}

/** Madde analizi ve okunabilir uyarılar: negatif ya da düşük düzeltilmiş madde-toplam korelasyonu, alfayı belirgin artıran madde. */
function itemAnalysis(items: string[], reversed: boolean[], complete: number[][], alpha: number | null): { stats: ItemStat[]; notes: string[] } {
  const stats: ItemStat[] = [];
  const notes: string[] = [];
  if (complete.length < 3) return { stats, notes };
  const all = items.map((_, j) => j);
  items.forEach((item, j) => {
    const col = complete.map((r) => r[j]!);
    const others = all.filter((q) => q !== j);
    const rest = complete.map((r) => others.reduce((s, q) => s + r[q]!, 0));
    const itemTotalR = pearson(col, rest);
    const alphaIfDeleted = cronbach(complete, others);
    stats.push({ item, reversed: reversed[j]!, mean: col.reduce((s, x) => s + x, 0) / col.length, sd: Math.sqrt(variance(col)), itemTotalR, alphaIfDeleted });
    if (itemTotalR !== null && itemTotalR < 0) {
      notes.push(`“${item}”: düzeltilmiş madde-toplam korelasyonu negatif (r = ${itemTotalR.toFixed(2)}); madde ters kodlanması gereken bir madde olabilir.`);
    } else if (itemTotalR !== null && itemTotalR < ITEM_TOTAL_MIN) {
      notes.push(`“${item}”: düzeltilmiş madde-toplam korelasyonu düşük (r = ${itemTotalR.toFixed(2)} < .30); madde ölçeğin geri kalanıyla aynı yapıyı ölçmüyor olabilir.`);
    }
    if (alpha !== null && alphaIfDeleted !== null && alphaIfDeleted - alpha >= 0.01) {
      notes.push(`“${item}” çıkarılırsa Cronbach alfa ${alpha.toFixed(2)} → ${alphaIfDeleted.toFixed(2)} olur.`);
    }
  });
  return { stats, notes };
}

/** Alfa değeri için sözel yorum (George & Mallery eşikleri). */
export function alphaLabel(a: number | null): string {
  if (a === null) return 'hesaplanamadı';
  if (a >= 0.9) return 'mükemmel';
  if (a >= 0.8) return 'iyi';
  if (a >= 0.7) return 'kabul edilebilir';
  if (a >= 0.6) return 'şüpheli';
  if (a >= 0.5) return 'zayıf';
  return 'kabul edilemez';
}

export function computeScales(columns: QualityColumn[], defs: ScaleDef[]): ScaleResult[] {
  const byName = new Map(columns.map((c) => [c.name, c]));
  const taken = new Set(columns.map((c) => c.name));
  return defs.map((def) => {
    const name = def.name.trim();
    if (!name) throw new AnalysisError('Ölçek adı boş olamaz.');
    if (taken.has(name)) throw new AnalysisError(`“${name}” adı zaten bir sütun ya da başka bir ölçek tarafından kullanılıyor.`);
    taken.add(name);
    const items = def.items;
    if (new Set(items).size !== items.length) throw new AnalysisError(`“${name}”: aynı madde birden fazla seçilmiş.`);
    if (items.length < 2) throw new AnalysisError(`“${name}”: ölçek için en az 2 madde gerekir.`);
    if (!(def.min < def.max)) throw new AnalysisError(`“${name}”: en küçük değer en büyük değerden küçük olmalı.`);
    if (!(def.minValidShare > 0 && def.minValidShare <= 1)) throw new AnalysisError(`“${name}”: gerekli yanıt oranı 0 ile 1 arasında olmalı.`);
    for (const r of def.reverse) if (!items.includes(r)) throw new AnalysisError(`“${name}”: ters maddeler ölçeğin maddeleri arasında olmalı (“${r}”).`);
    const cols = items.map((n) => {
      const c = byName.get(n);
      if (!c) throw new AnalysisError(`“${n}” adlı sütun bulunamadı.`);
      if (!c.numeric) throw new AnalysisError(`“${n}” sayısal ya da sıralı değil; ölçek puanına eklenemez.`);
      return c;
    });
    const rows = cols[0]!.values.length;
    const flip = items.map((n) => def.reverse.includes(n));
    for (const c of cols) {
      const bad = c.values.find((v) => isNum(v) && (v < def.min || v > def.max));
      if (bad !== undefined) throw new AnalysisError(`“${c.name}” sütununda ${bad} değeri belirtilen aralığın (${def.min}–${def.max}) dışında.`);
    }
    const k = items.length;
    const needed = Math.max(1, Math.ceil(def.minValidShare * k - 1e-9));
    const m: (number | null)[][] = Array.from({ length: rows }, (_, i) =>
      cols.map((c, j) => {
        const v = c.values[i];
        return isNum(v) ? (flip[j] ? def.min + def.max - v : v) : null;
      }),
    );
    const values = m.map((row) => {
      const ok = row.filter(isNum);
      if (ok.length < needed) return null;
      const mean = ok.reduce((s, x) => s + x, 0) / ok.length;
      return def.method === 'sum' ? mean * k : mean;
    });
    const complete = m.filter((row) => row.every(isNum)) as number[][];
    let alpha: number | null = null;
    const notes: string[] = [];
    if (complete.length >= 3) {
      alpha = cronbach(complete, items.map((_, j) => j));
      if (alpha === null) notes.push('Toplam puanın varyansı 0; alfa hesaplanamadı.');
    } else notes.push('Alfa için tüm maddeleri yanıtlayan en az 3 satır gerekir.');
    if (alpha !== null && alpha < 0.7) notes.push(`Cronbach alfa ${alpha.toFixed(2)} (${alphaLabel(alpha)}): maddeler tek bir yapıyı tutarlı ölçmüyor olabilir; ters maddeleri ve madde seçimini kontrol edin.`);
    const analysis = itemAnalysis(items, flip, complete, alpha);
    notes.push(...analysis.notes);
    const present = values.filter(isNum);
    let skewness: number | null = null;
    let kurtosis: number | null = null;
    let shapiroW: number | null = null;
    let shapiroP: number | null = null;
    if (present.length >= 4) {
      const sh = shapeStats(present);
      skewness = Number.isFinite(sh.skewness) ? sh.skewness : null;
      kurtosis = Number.isFinite(sh.kurtosis) ? sh.kurtosis : null;
      if (skewness !== null) {
        const sorted = [...present].sort((a, b) => a - b);
        const sample = sorted.length <= 5000 ? present : Array.from({ length: 5000 }, (_, i) => sorted[Math.floor((i * sorted.length) / 5000)]!);
        const w = shapiroWilk(sample);
        shapiroW = w.W;
        shapiroP = w.p;
      }
    }
    if (present.length < rows) notes.push(`${rows - present.length} satırda yeterli yanıt olmadığı için puan eksik bırakıldı.`);
    return { name, values, alpha, nAlpha: complete.length, itemStats: analysis.stats, nValid: present.length, mean: present.length ? present.reduce((s, x) => s + x, 0) / present.length : null, skewness, kurtosis, shapiroW, shapiroP, notes };
  });
}
