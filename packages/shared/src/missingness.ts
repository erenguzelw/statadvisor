/**
 * Eksiklik tanılaması: “eksik olma durumu diğer değişkenlerle ilişkili mi?”
 *
 * Bu bir MCAR kanıtı değildir. MCAR (tamamen rastgele eksiklik) ancak varsayılabilir; veriden kanıtlanamaz. Her eksikli
 * sütun için eksik-gösterge değişkeni (1 = eksik) gözlenen diğer sütunlarla karşılaştırılır: sayısal sütunlarda
 * Mann–Whitney U, kategorik sütunlarda ki-kare. Testler Holm yöntemiyle birlikte düzeltilir. Sonuç yalnızca iki
 * türlüdür: “MCAR ile uyumsuz olabilir” ya da “bu testler çelişki göstermedi, MCAR kanıtlanmadı”.
 * Little'ın MCAR testi (EM tahmini gerektirir) bilerek uygulanmadı.
 */
import { normalSurvival } from './assumptions.ts';
import { adjustPValues, chiSquareContingency, mannWhitneyU, rankData } from './tests.ts';

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

/** Sütun başına bir kez hazırlanan bilgi: sayısal sütunda sıralar, kategorik sütunda düzey kodları. */
type Prepared =
  | { kind: 'rank'; present: Uint8Array; ranks: Float64Array; count: number; distinct: number; tieTerm: number }
  | { kind: 'levels'; codes: Int32Array; levels: number }
  | { kind: 'skip' };

function prepare(c: MissingnessColumn): Prepared {
  if (c.skip) return { kind: 'skip' };
  const n = c.values.length;
  if (c.numeric && !c.categorical) {
    const present = new Uint8Array(n);
    const idx: number[] = [];
    const vals: number[] = [];
    c.values.forEach((v, i) => {
      if (typeof v === 'number' && Number.isFinite(v)) {
        present[i] = 1;
        idx.push(i);
        vals.push(v);
      }
    });
    // Sıralar, sütunun dolu tüm gözlemleri üzerinden hesaplanır: bu havuz hedef sütundan bağımsızdır,
    // bu yüzden her hedef için yeniden sıralamaya gerek yoktur (sonuç mannWhitneyU ile aynıdır).
    const { ranks, ties } = rankData(vals);
    const r = new Float64Array(n).fill(NaN);
    idx.forEach((row, k) => (r[row] = ranks[k]!));
    return { kind: 'rank', present, ranks: r, count: vals.length, distinct: new Set(vals).size, tieTerm: ties.reduce((s, t) => s + t ** 3 - t, 0) };
  }
  const map = new Map<string, number>();
  const codes = new Int32Array(n).fill(-1);
  c.values.forEach((v, i) => {
    if (!filled(v)) return;
    const k = String(v);
    let code = map.get(k);
    if (code === undefined) {
      code = map.size;
      map.set(k, code);
    }
    codes[i] = code;
  });
  return { kind: 'levels', codes, levels: map.size };
}

export function analyzeMissingness(columns: MissingnessColumn[], alpha = 0.05): MissingnessReport {
  const rows = columns[0]?.values.length ?? 0;
  const out: ColumnMissingness[] = [];
  const prepared = columns.map(prepare);
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
    for (const [ci, c] of columns.entries()) {
      const pc = prepared[ci]!;
      if (c === target || pc.kind === 'skip') continue;
      if (pc.kind === 'rank') {
        let n1 = 0;
        let r1 = 0;
        for (let i = 0; i < rows; i++) {
          if (ind[i] && pc.present[i]) {
            n1++;
            r1 += pc.ranks[i]!;
          }
        }
        const n2 = pc.count - n1;
        if (n1 < MIN_GROUP || n2 < MIN_GROUP) continue;
        if (pc.distinct < 2) continue;
        let p: number;
        let rb: number;
        if (n1 <= 8 && n2 <= 8) {
          // küçük örneklem: tam dağılım kullanılabilir; mevcut fonksiyon aynen çağrılır
          const a: number[] = [];
          const b: number[] = [];
          for (let i = 0; i < rows; i++) if (pc.present[i]) (ind[i] ? a : b).push(c.values[i] as number);
          const r = mannWhitneyU(a, b);
          p = r.p;
          rb = r.rankBiserial;
        } else {
          // mannWhitneyU'nun asimptotik dalıyla aynı formül (bağ ve süreklilik düzeltmesi)
          const U1 = r1 - (n1 * (n1 + 1)) / 2;
          const U2 = n1 * n2 - U1;
          const n = n1 + n2;
          const sd = Math.sqrt(((n1 * n2) / 12) * (n + 1 - pc.tieTerm / (n * (n - 1))));
          p = Math.min(1, 2 * normalSurvival((Math.max(U1, U2) - (n1 * n2) / 2 - 0.5) / sd));
          rb = (2 * U1) / (n1 * n2) - 1;
        }
        raw.push({ other: c.name, test: 'Mann–Whitney U', p, effect: Math.abs(rb) });
      } else {
        if (pc.levels < 2 || pc.levels > MAX_LEVELS) continue;
        const counts = Array.from({ length: pc.levels }, () => [0, 0] as [number, number]);
        for (let i = 0; i < rows; i++) {
          const code = pc.codes[i]!;
          if (code >= 0) counts[code]![ind[i] ? 0 : 1]++;
        }
        const table = counts.filter((e) => e[0] + e[1] > 0);
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
