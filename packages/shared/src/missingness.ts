/**
 * Eksiklik tanılaması: “eksik olma durumu diğer değişkenlerle ilişkili mi?”
 *
 * Bu bir MCAR kanıtı değildir. MCAR (tamamen rastgele eksiklik) ancak varsayılabilir; veriden kanıtlanamaz. Her eksikli
 * sütun için eksik-gösterge değişkeni (1 = eksik) gözlenen diğer sütunlarla karşılaştırılır: sayısal sütunlarda
 * Mann–Whitney U, kategorik sütunlarda ki-kare. Testler Holm yöntemiyle birlikte düzeltilir. Sonuç yalnızca iki
 * türlüdür: “MCAR ile uyumsuz olabilir” ya da “bu testler çelişki göstermedi, MCAR kanıtlanmadı”.
 * Little'ın MCAR testi (EM tahmini gerektirir) bilerek uygulanmadı.
 */
import { adjustPValues, chiSquareContingency, mannWhitneyU } from './tests.ts';

export interface MissingnessColumn {
  name: string;
  numeric: boolean;
  /** Sıralı/sürekli sayısal sütunlar Mann–Whitney ile, kategorik sütunlar ki-kare ile karşılaştırılır. */
  categorical: boolean;
  values: (number | string | null)[];
  skip?: boolean;
}

export type MissingnessVerdict = 'incompatible' | 'noContradiction' | 'insufficient';

export interface MissingnessAssociation {
  other: string;
  test: 'Mann–Whitney U' | 'ki-kare';
  p: number;
  pAdjusted: number;
  /** Etki büyüklüğü: rank-biserial (|r|) ya da Cramér V. */
  effect: number;
}

export interface ColumnMissingness {
  column: string;
  missing: number;
  verdict: MissingnessVerdict;
  tests: number;
  /** Düzeltilmiş p < alfa olan ilişkiler (en küçük p önce). */
  associations: MissingnessAssociation[];
  note?: string;
}

export interface MissingnessReport {
  alpha: number;
  /** Eksik değeri olan ve en az bir testi çalışan sütunlar. */
  columns: ColumnMissingness[];
  incompatible: number;
}

const MIN_GROUP = 5;
const MAX_LEVELS = 10;

const filled = (v: unknown) => v !== null && v !== undefined;

export function analyzeMissingness(columns: MissingnessColumn[], alpha = 0.05): MissingnessReport {
  const rows = columns[0]?.values.length ?? 0;
  const out: ColumnMissingness[] = [];
  for (const target of columns) {
    if (target.skip) continue;
    const ind = target.values.map((v) => !filled(v));
    const nMissing = ind.filter(Boolean).length;
    if (nMissing === 0) continue;
    if (nMissing < MIN_GROUP || rows - nMissing < MIN_GROUP) {
      out.push({ column: target.name, missing: nMissing, verdict: 'insufficient', tests: 0, associations: [], note: `Eksik (${nMissing}) ya da dolu (${rows - nMissing}) gözlem sayısı ${MIN_GROUP}'ten az; ilişki sınanamaz.` });
      continue;
    }
    const raw: { other: string; test: MissingnessAssociation['test']; p: number; effect: number }[] = [];
    for (const c of columns) {
      if (c === target || c.skip) continue;
      if (c.numeric && !c.categorical) {
        const a: number[] = [];
        const b: number[] = [];
        c.values.forEach((v, i) => {
          if (typeof v === 'number' && Number.isFinite(v)) (ind[i] ? a : b).push(v);
        });
        if (a.length < MIN_GROUP || b.length < MIN_GROUP) continue;
        if (new Set([...a, ...b]).size < 2) continue;
        const r = mannWhitneyU(a, b);
        raw.push({ other: c.name, test: 'Mann–Whitney U', p: r.p, effect: Math.abs(r.rankBiserial) });
      } else {
        const counts = new Map<string, [number, number]>();
        c.values.forEach((v, i) => {
          if (!filled(v)) return;
          const e = counts.get(String(v)) ?? [0, 0];
          e[ind[i] ? 0 : 1]++;
          counts.set(String(v), e);
        });
        if (counts.size < 2 || counts.size > MAX_LEVELS) continue;
        const table = [...counts.values()].filter((e) => e[0] + e[1] > 0);
        // Hiç eksik gözlemi olmayan (ya da yalnızca eksik gözlemi olan) tablo bilgi vermez.
        if (table.reduce((s, e) => s + e[0], 0) < MIN_GROUP || table.reduce((s, e) => s + e[1], 0) < MIN_GROUP) continue;
        const t = [table.map((e) => e[0]), table.map((e) => e[1])];
        const r = chiSquareContingency(t);
        if (!Number.isFinite(r.p)) continue;
        // Beklenen sayılar çok küçükse yaklaşık p güvenilmez: sınama dışı bırak.
        if (r.lowExpectedShare > 0.2) continue;
        raw.push({ other: c.name, test: 'ki-kare', p: r.p, effect: r.cramersV });
      }
    }
    if (raw.length === 0) {
      out.push({ column: target.name, missing: nMissing, verdict: 'insufficient', tests: 0, associations: [], note: 'Karşılaştırılabilecek yeterli veri içeren başka sütun yok.' });
      continue;
    }
    const adj = adjustPValues(raw.map((r) => r.p), 'holm');
    const associations = raw
      .map((r, i) => ({ ...r, pAdjusted: adj[i]! }))
      .filter((r) => r.pAdjusted < alpha)
      .sort((x, y) => x.pAdjusted - y.pAdjusted);
    out.push({ column: target.name, missing: nMissing, verdict: associations.length ? 'incompatible' : 'noContradiction', tests: raw.length, associations });
  }
  return { alpha, columns: out, incompatible: out.filter((c) => c.verdict === 'incompatible').length };
}
