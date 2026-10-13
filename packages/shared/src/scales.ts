/**
 * Ölçek (alt boyut) puanları: anket maddelerinden toplam/ortalama puan üretir, ters maddeleri çevirir ve
 * Cronbach alfa ile iç tutarlılığı hesaplar. Alt boyutları kullanıcı elle tanımlar; uygulama madde anahtarı uydurmaz.
 */
import { AnalysisError } from './analysis.ts';
import type { QualityColumn } from './quality.ts';

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

export interface ScaleResult {
  name: string;
  values: (number | null)[];
  /** Cronbach alfa (tüm maddeleri yanıtlayan satırlarda); hesaplanamazsa null. */
  alpha: number | null;
  nAlpha: number;
  nValid: number;
  mean: number | null;
  /** Maddeler arası ortalama ilişki yerine okunabilir uyarılar. */
  notes: string[];
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function variance(xs: number[]): number {
  const m = xs.reduce((s, x) => s + x, 0) / xs.length;
  return xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
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
      const totalVar = variance(complete.map((r) => r.reduce((s, x) => s + x, 0)));
      if (totalVar > 0) {
        const itemVar = items.reduce((s, _, j) => s + variance(complete.map((r) => r[j]!)), 0);
        alpha = (k / (k - 1)) * (1 - itemVar / totalVar);
      } else notes.push('Toplam puanın varyansı 0; alfa hesaplanamadı.');
    } else notes.push('Alfa için tüm maddeleri yanıtlayan en az 3 satır gerekir.');
    if (alpha !== null && alpha < 0.7) notes.push(`Cronbach alfa ${alpha.toFixed(2)} (${alphaLabel(alpha)}): maddeler tek bir yapıyı tutarlı ölçmüyor olabilir; ters maddeleri ve madde seçimini kontrol edin.`);
    const present = values.filter(isNum);
    if (present.length < rows) notes.push(`${rows - present.length} satırda yeterli yanıt olmadığı için puan eksik bırakıldı.`);
    return { name, values, alpha, nAlpha: complete.length, nValid: present.length, mean: present.length ? present.reduce((s, x) => s + x, 0) / present.length : null, notes };
  });
}
