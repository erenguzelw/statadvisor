/**
 * ANOVA sonrası ikili karşılaştırmalar: Tukey HSD (Tukey–Kramer; eşit varyans) ve Games–Howell (eşit olmayan
 * varyans), güven aralıkları ve etki büyüklüğüyle; ayrıca anlamlılık harfleri (compact letter display).
 * Tukey SciPy `stats.tukey_hsd`, Games–Howell pingouin `pairwise_gameshowell` ile doğrulanır.
 */
import { mean } from './assumptions.ts';
import { studentizedRangeQuantile, studentizedRangeSurvival } from './studentized.ts';
import { sd } from './tests.ts';

export interface PostHocPair {
  a: number;
  b: number;
  /** Ortalama farkı: ort(a) − ort(b). */
  diff: number;
  /** Farkın standart hatası (Tukey'de √(MSE/2·(1/nₐ + 1/n_b)), Games–Howell'de √(sₐ²/nₐ + s_b²/n_b)). */
  se: number;
  /** Studentize edilmiş aralık istatistiği q = |fark| / se (Games–Howell'de √2·|t|). */
  q: number;
  df: number;
  /** Aile bazında düzeltilmiş p değeri (studentize edilmiş aralık dağılımından). */
  p: number;
  ciLow: number;
  ciHigh: number;
  /** Hedges g (iki grubun birleşik standart sapmasıyla, küçük örneklem düzeltmeli). */
  hedgesG: number;
}

function hedges(x: number[], y: number[]): number {
  const n1 = x.length;
  const n2 = y.length;
  const sp = Math.sqrt(((n1 - 1) * sd(x) ** 2 + (n2 - 1) * sd(y) ** 2) / (n1 + n2 - 2));
  return ((mean(x) - mean(y)) / sp) * (1 - 3 / (4 * (n1 + n2) - 9));
}

function checkGroups(groups: number[][]) {
  if (groups.length < 2) throw new Error('En az 2 grup gerekir.');
  if (groups.some((g) => g.length < 2)) throw new Error('Her grupta en az 2 gözlem olmalı.');
}

/** Tukey HSD (grup büyüklükleri farklıysa Tukey–Kramer). */
export function tukeyHsd(groups: number[][], confidence = 0.95): PostHocPair[] {
  checkGroups(groups);
  const k = groups.length;
  const N = groups.reduce((s, g) => s + g.length, 0);
  const df = N - k;
  const mse = groups.reduce((s, g) => s + (g.length - 1) * sd(g) ** 2, 0) / df;
  const crit = studentizedRangeQuantile(1 - confidence, k, df);
  const means = groups.map(mean);
  const out: PostHocPair[] = [];
  for (let a = 0; a < k; a++) {
    for (let b = a + 1; b < k; b++) {
      const diff = means[a]! - means[b]!;
      const se = Math.sqrt((mse / 2) * (1 / groups[a]!.length + 1 / groups[b]!.length));
      const q = Math.abs(diff) / se;
      out.push({ a, b, diff, se, q, df, p: studentizedRangeSurvival(q, k, df), ciLow: diff - crit * se, ciHigh: diff + crit * se, hedgesG: hedges(groups[a]!, groups[b]!) });
    }
  }
  return out;
}

/** Games–Howell: her çift için ayrı varyans ve Welch–Satterthwaite serbestlik derecesi. */
export function gamesHowell(groups: number[][], confidence = 0.95): PostHocPair[] {
  checkGroups(groups);
  const k = groups.length;
  const means = groups.map(mean);
  const v = groups.map((g) => sd(g) ** 2 / g.length);
  const out: PostHocPair[] = [];
  for (let a = 0; a < k; a++) {
    for (let b = a + 1; b < k; b++) {
      const diff = means[a]! - means[b]!;
      const va = v[a]!;
      const vb = v[b]!;
      const se = Math.sqrt(va + vb);
      const df = (va + vb) ** 2 / (va ** 2 / (groups[a]!.length - 1) + vb ** 2 / (groups[b]!.length - 1));
      const q = (Math.SQRT2 * Math.abs(diff)) / se;
      const crit = studentizedRangeQuantile(1 - confidence, k, df) / Math.SQRT2;
      out.push({ a, b, diff, se, q, df, p: studentizedRangeSurvival(q, k, df), ciLow: diff - crit * se, ciHigh: diff + crit * se, hedgesG: hedges(groups[a]!, groups[b]!) });
    }
  }
  return out;
}

/**
 * Anlamlılık harfleri (Piepho, 2004; ekle-ve-soğur algoritması): aynı harfi paylaşan gruplar birbirinden anlamlı
 * biçimde farklı değildir. `order` harflerin dağıtım sırasıdır (genellikle ortalamaya göre büyükten küçüğe);
 * ilk sıradaki grubun bulunduğu küme “a” olur.
 */
export function compactLetters(k: number, significant: [number, number][], order: number[] = Array.from({ length: k }, (_, i) => i)): string[] {
  let cols: Set<number>[] = [new Set(Array.from({ length: k }, (_, i) => i))];
  for (const [i, j] of significant) {
    const next: Set<number>[] = [];
    for (const c of cols) {
      if (c.has(i) && c.has(j)) {
        const ci = new Set(c);
        ci.delete(j);
        const cj = new Set(c);
        cj.delete(i);
        next.push(ci, cj);
      } else next.push(c);
    }
    // soğurma: başka bir kümenin alt kümesi olan kümeler atılır (eşit kümelerden biri kalır)
    cols = next.filter((c, idx) => !next.some((d, jdx) => jdx !== idx && [...c].every((x) => d.has(x)) && (d.size > c.size || jdx < idx)));
  }
  const rank = new Map(order.map((g, r) => [g, r]));
  const first = (c: Set<number>) => Math.min(...[...c].map((g) => rank.get(g) ?? g));
  cols.sort((x, y) => first(x) - first(y) || x.size - y.size);
  const letter = (i: number) => (i < 26 ? String.fromCharCode(97 + i) : `${String.fromCharCode(97 + (i % 26))}${Math.floor(i / 26)}`);
  return Array.from({ length: k }, (_, g) =>
    cols
      .map((c, i) => (c.has(g) ? letter(i) : ''))
      .join(''),
  );
}
