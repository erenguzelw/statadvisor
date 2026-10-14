/**
 * Model karşılaştırma verisindeki ilişkiler:
 *  - sayısal özellikler arası Pearson korelasyonu (yön ve sıralama, |r| büyükten küçüğe),
 *  - her özelliğin hedef sınıflarla ilişkisi (sayısal: η², kategorik: Cramér V).
 * Büyüklük etiketleri Cohen'in başparmak eşikleridir (kesin sınır değildir). Çok büyük örneklemde küçük
 * ilişkiler de anlamlı çıkar; bu yüzden metin p değerine değil büyüklüğe dayanır.
 */
import { anovaOneWay, chiSquareContingency, pearson } from './tests.ts';
import type { PreparedData } from './ml-prep.ts';

export type Strength = 'ihmal edilebilir' | 'zayıf' | 'orta' | 'güçlü';

export interface CorrPair {
  a: string;
  b: string;
  r: number;
  n: number;
  direction: 'pozitif' | 'negatif';
  strength: Strength;
}

export interface TargetAssoc {
  feature: string;
  kind: 'numeric' | 'categorical';
  measure: 'η²' | 'Cramér V';
  effect: number;
  strength: Strength;
  /** Sayısal özellikte sınıf ortalamaları (ortalaması en yüksek ve en düşük sınıfı söylemek için). */
  classMeans?: { cls: string; mean: number }[];
}

export interface Associations {
  /** Tüm sayısal çiftler, |r| büyükten küçüğe. */
  pairs: CorrPair[];
  /** Hedefle ilişki, etki büyüklüğü büyükten küçüğe. */
  target: TargetAssoc[];
}

export const corrStrength = (r: number): Strength => {
  const a = Math.abs(r);
  return a < 0.1 ? 'ihmal edilebilir' : a < 0.3 ? 'zayıf' : a < 0.5 ? 'orta' : 'güçlü';
};
const etaStrength = (e: number): Strength => (e < 0.01 ? 'ihmal edilebilir' : e < 0.06 ? 'zayıf' : e < 0.14 ? 'orta' : 'güçlü');
const vStrength = (v: number): Strength => (v < 0.1 ? 'ihmal edilebilir' : v < 0.3 ? 'zayıf' : v < 0.5 ? 'orta' : 'güçlü');

export function describeAssociations(data: PreparedData): Associations {
  const numeric = data.features.filter((f) => f.kind === 'numeric');
  const pairs: CorrPair[] = [];
  for (let i = 0; i < numeric.length; i++) {
    for (let j = i + 1; j < numeric.length; j++) {
      const x: number[] = [];
      const y: number[] = [];
      for (let r = 0; r < data.n; r++) {
        const u = numeric[i]!.values[r];
        const v = numeric[j]!.values[r];
        if (typeof u === 'number' && typeof v === 'number' && Number.isFinite(u) && Number.isFinite(v)) {
          x.push(u);
          y.push(v);
        }
      }
      if (x.length < 5 || new Set(x).size < 2 || new Set(y).size < 2) continue;
      const c = pearson(x, y);
      if (!Number.isFinite(c.r)) continue;
      pairs.push({ a: numeric[i]!.name, b: numeric[j]!.name, r: c.r, n: x.length, direction: c.r >= 0 ? 'pozitif' : 'negatif', strength: corrStrength(c.r) });
    }
  }
  pairs.sort((p, q) => Math.abs(q.r) - Math.abs(p.r));

  const K = data.classes.length;
  const target: TargetAssoc[] = [];
  for (const f of data.features) {
    if (f.kind === 'numeric') {
      const groups: number[][] = Array.from({ length: K }, () => []);
      for (let r = 0; r < data.n; r++) {
        const v = f.values[r];
        if (typeof v === 'number' && Number.isFinite(v)) groups[data.y[r]!]!.push(v);
      }
      if (groups.some((g) => g.length < 2)) continue;
      const a = anovaOneWay(groups);
      if (!Number.isFinite(a.etaSquared)) continue;
      target.push({
        feature: f.name,
        kind: 'numeric',
        measure: 'η²',
        effect: a.etaSquared,
        strength: etaStrength(a.etaSquared),
        classMeans: groups.map((g, c) => ({ cls: data.classes[c]!, mean: g.reduce((s, v) => s + v, 0) / g.length })),
      });
    } else {
      const levels = [...new Set(f.values.filter((v) => v !== null && v !== undefined).map(String))].sort();
      if (levels.length < 2) continue;
      const table = levels.map(() => new Array<number>(K).fill(0));
      for (let r = 0; r < data.n; r++) {
        const v = f.values[r];
        if (v !== null && v !== undefined) table[levels.indexOf(String(v))]![data.y[r]!]!++;
      }
      const v = chiSquareContingency(table, false).cramersV;
      if (Number.isFinite(v)) target.push({ feature: f.name, kind: 'categorical', measure: 'Cramér V', effect: v, strength: vStrength(v) });
    }
  }
  target.sort((p, q) => q.effect - p.effect);
  return { pairs, target };
}
