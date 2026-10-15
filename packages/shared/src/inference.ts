/**
 * Birleşik çalıştırıcı: karar motorunun önerdiği testi (ad olarak) alır, veriye uygular, etki büyüklüğünü ve
 * gerekiyorsa post-hoc karşılaştırmaları hesaplar ve sonucu Yeni Başlayan / Uzman dillerinde yorumlar.
 */
import { mean, median, quantile, tukeyFences } from './assumptions.ts';
import { extent } from './extent.ts';
import { compactLetters, gamesHowell, tukeyHsd, type PostHocPair } from './posthoc.ts';
import { effectLabel, kruskalWallis, pText, shapeStats } from './stats.ts';
import {
  anovaOneWay,
  anovaRepeated,
  chiSquareContingency,
  dunnTest,
  fisherExact,
  friedmanTest,
  mannWhitneyU,
  pairwisePaired,
  pearson,
  sd,
  spearman,
  tTestIndependent,
  tTestPaired,
  welchAnova,
  wilcoxonSignedRank,
  type PairResult,
} from './tests.ts';
import type { BoxStats, GroupDescriptive, Interpretation, ScatterSample } from './types.ts';

export type TestInput =
  | { kind: 'groups'; names: string[]; groups: number[][] }
  | { kind: 'paired'; names: string[]; conditions: number[][] }
  | { kind: 'xy'; xName: string; yName: string; x: number[]; y: number[] }
  | { kind: 'table'; rowNames: string[]; colNames: string[]; table: number[][] };

export type Magnitude = 'ihmal edilebilir' | 'küçük' | 'orta' | 'geniş';

export interface OutcomePair {
  a: string;
  b: string;
  /** Ham p; Tukey ve Games–Howell'de p zaten aile bazındadır ve pAdj ile aynıdır. */
  p: number;
  pAdj: number;
  significant: boolean;
  /** Tukey / Games–Howell: ortalama farkı (a − b), %95 eşzamanlı güven aralığı, Hedges g ve serbestlik derecesi. */
  diff?: number;
  ciLow?: number;
  ciHigh?: number;
  hedgesG?: number;
  df?: number;
}

export interface PostHocResult {
  method: string;
  /** familywise: yöntem aile bazında hata oranını kendi içinde korur (Tukey, Games–Howell); holm: ham p değerleri Holm ile düzeltilir. */
  adjustment: 'familywise' | 'holm';
  pairs: OutcomePair[];
  /** Anlamlılık harfleri: aynı harfi paylaşan gruplar arasındaki fark anlamlı değildir. Sıra merkeze göre büyükten küçüğe. */
  letters: { group: string; center: number; letters: string }[];
  /** Harflerin sıralandığı ölçü. */
  centerLabel: 'Ortalama' | 'Medyan';
}

export interface TestOutcome {
  /** Gerçekten çalıştırılan test (ör. 2×2 tabloda beklenen sayı küçükse ki-kare yerine Fisher). */
  test: string;
  /** Gösterim için hazır istatistik dizgesi, ör. "H(2) = 11.70". */
  statisticText: string;
  statistic: { symbol: string; value: number; df: number[] };
  p: number;
  alpha: number;
  significant: boolean;
  effect: { symbol: string; name: string; value: number; magnitude: Magnitude };
  ci?: { label: string; low: number; high: number };
  postHoc?: PostHocResult;
  n: number;
  kind: TestInput['kind'];
  /** Korelasyon için işaret; karşılaştırmalar için anlamsız. */
  direction?: 'pozitif' | 'negatif';
  notes: string[];
}

const mag = (v: number, t: [number, number, number]): Magnitude => {
  const a = Math.abs(v);
  return a < t[0] ? 'ihmal edilebilir' : a < t[1] ? 'küçük' : a < t[2] ? 'orta' : 'geniş';
};
const magVar = (v: number) => effectLabel(v); // ε² / η²: .01 / .06 / .14
const magD = (v: number) => mag(v, [0.2, 0.5, 0.8]);
const magR = (v: number) => mag(v, [0.1, 0.3, 0.5]);

const n2 = (x: number) => x.toFixed(2);
const dfText = (df: number[]) => df.map((d) => (Number.isInteger(d) ? String(d) : d.toFixed(2))).join(', ');

function mkPairs(names: string[], pairs: PairResult[], alpha: number): OutcomePair[] {
  return pairs.map((r) => ({ a: names[r.a]!, b: names[r.b]!, p: r.p, pAdj: r.pAdj, significant: r.pAdj < alpha }));
}

function mkRangePairs(names: string[], pairs: PostHocPair[], alpha: number): OutcomePair[] {
  return pairs.map((r) => ({ a: names[r.a]!, b: names[r.b]!, p: r.p, pAdj: r.p, significant: r.p < alpha, diff: r.diff, ciLow: r.ciLow, ciHigh: r.ciHigh, hedgesG: r.hedgesG, df: r.df }));
}

/** Post-hoc sonucunu anlamlılık harfleriyle kurar; harfler merkeze (ortalama/medyan) göre büyükten küçüğe dağıtılır. */
function postHocOf(method: string, adjustment: PostHocResult['adjustment'], names: string[], pairs: OutcomePair[], samples: number[][], centerLabel: PostHocResult['centerLabel']): PostHocResult {
  const center = samples.map((g) => (centerLabel === 'Ortalama' ? mean(g) : median(g)));
  const order = center.map((_, i) => i).sort((x, y) => center[y]! - center[x]! || x - y);
  const index = new Map(names.map((n, i) => [n, i]));
  const sig = pairs.filter((q) => q.significant).map((q) => [index.get(q.a)!, index.get(q.b)!] as [number, number]);
  const letters = compactLetters(names.length, sig, order);
  return { method, adjustment, pairs, letters: order.map((i) => ({ group: names[i]!, center: center[i]!, letters: letters[i]! })), centerLabel };
}

export function describeGroups(names: string[], groups: number[][]): GroupDescriptive[] {
  return groups.map((g, i) => {
    const sh = shapeStats(g);
    const s = g.length > 1 ? sd(g) : NaN;
    const { lo, hi } = extent(g);
    return {
      group: names[i]!,
      n: g.length,
      median: median(g),
      mean: mean(g),
      sd: s,
      skewness: sh.skewness,
      kurtosis: sh.kurtosis,
      min: lo,
      q1: quantile(g, 0.25),
      q3: quantile(g, 0.75),
      max: hi,
      se: s / Math.sqrt(g.length),
    };
  });
}

/** Saçılım grafiğinde çizilen en fazla nokta sayısı. */
const MAX_SCATTER_POINTS = 500;

/** Saçılım özeti: noktalar sabit aralıkla seçilir (aynı veri → aynı grafik); doğru tüm gözlemlerden hesaplanır. */
export function scatterSample(xName: string, yName: string, x: number[], y: number[]): ScatterSample {
  const n = x.length;
  const stride = Math.max(1, Math.ceil(n / MAX_SCATTER_POINTS));
  const points: [number, number][] = [];
  for (let i = 0; i < n; i += stride) points.push([x[i]!, y[i]!]);
  const mx = mean(x);
  const my = mean(y);
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i]! - mx) * (y[i]! - my);
    sxx += (x[i]! - mx) ** 2;
  }
  const slope = sxx > 0 ? sxy / sxx : NaN;
  return { xName, yName, points, n, slope, intercept: my - slope * mx };
}

/** Rapordaki kutu grafiğinde tek tek çizilen en fazla uç gözlem sayısı (büyük veride rapor şişmesin diye). */
const MAX_BOX_OUTLIERS = 40;

/** Tukey kutu grafiği özeti; sınır dışı gözlemlerin ortancadan en uzak olan en çok 40 tanesi tutulur. */
export function boxStatsFor(names: string[], groups: number[][]): BoxStats[] {
  return groups.map((g, i) => {
    const f = tukeyFences(g);
    const inside = g.filter((x) => x >= f.lower && x <= f.upper);
    const out = g.filter((x) => x < f.lower || x > f.upper);
    const m = median(g);
    const { lo, hi } = extent(inside.length ? inside : g);
    return {
      group: names[i]!,
      n: g.length,
      whiskerLow: lo,
      q1: f.q1,
      median: m,
      q3: f.q3,
      whiskerHigh: hi,
      outliers: out.sort((a, b) => Math.abs(b - m) - Math.abs(a - m)).slice(0, MAX_BOX_OUTLIERS).sort((a, b) => a - b),
    };
  });
}

/** Karar motorunun önerdiği testi çalıştırır. Desteklenmeyen ad ya da uyumsuz girdi için hata fırlatır. */
export function runTest(finalTest: string, input: TestInput, alpha = 0.05): TestOutcome {
  const need = (kind: TestInput['kind']) => {
    if (input.kind !== kind) throw new Error(`“${finalTest}” için “${kind}” türünde girdi gerekir (verilen: ${input.kind}).`);
  };
  const notes: string[] = [];

  switch (finalTest) {
    case 'Bağımsız örneklem t-testi':
    case 'Welch t-testi': {
      need('groups');
      if (input.kind !== 'groups' || input.groups.length !== 2) throw new Error('t-testi için tam olarak 2 grup gerekir.');
      const [x, y] = input.groups as [number[], number[]];
      const r = tTestIndependent(x, y, { equalVar: finalTest === 'Bağımsız örneklem t-testi' });
      return {
        test: finalTest,
        statisticText: `t(${dfText([r.df])}) = ${n2(r.t)}`,
        statistic: { symbol: 't', value: r.t, df: [r.df] },
        p: r.p,
        alpha,
        significant: r.p < alpha,
        effect: { symbol: 'g', name: 'Hedges g', value: r.hedgesG, magnitude: magD(r.hedgesG) },
        ci: { label: 'Ortalama farkı için %95 güven aralığı', low: r.ci[0], high: r.ci[1] },
        n: r.n1 + r.n2,
        kind: 'groups',
        notes,
      };
    }
    case 'Mann-Whitney U testi': {
      need('groups');
      if (input.kind !== 'groups' || input.groups.length !== 2) throw new Error('Mann-Whitney için tam olarak 2 grup gerekir.');
      const [x, y] = input.groups as [number[], number[]];
      const r = mannWhitneyU(x, y);
      if (r.method === 'asymptotic') notes.push('P değeri normal yaklaşımla (sürekliklik düzeltmeli) hesaplandı.');
      return {
        test: finalTest,
        statisticText: `U = ${r.U}`,
        statistic: { symbol: 'U', value: r.U, df: [] },
        p: r.p,
        alpha,
        significant: r.p < alpha,
        effect: { symbol: 'r', name: 'rank-biserial korelasyon', value: r.rankBiserial, magnitude: magR(r.rankBiserial) },
        n: r.n1 + r.n2,
        kind: 'groups',
        notes,
      };
    }
    case 'Tek Yönlü ANOVA':
    case 'Welch ANOVA': {
      need('groups');
      if (input.kind !== 'groups') throw new Error('Grup girdisi gerekir.');
      const r = finalTest === 'Welch ANOVA' ? welchAnova(input.groups) : anovaOneWay(input.groups);
      const significant = r.p < alpha;
      const out: TestOutcome = {
        test: finalTest,
        statisticText: `F(${dfText([r.df1, r.df2])}) = ${n2(r.F)}`,
        statistic: { symbol: 'F', value: r.F, df: [r.df1, r.df2] },
        p: r.p,
        alpha,
        significant,
        effect: { symbol: 'η²', name: 'eta-kare', value: r.etaSquared, magnitude: magVar(r.etaSquared) },
        n: input.groups.flat().length,
        kind: 'groups',
        notes,
      };
      if (significant && input.groups.length > 2) {
        // Eşit varyans varsayan ANOVA'dan sonra Tukey HSD (grup büyüklükleri farklıysa Tukey–Kramer);
        // Welch ANOVA'dan sonra her çift için ayrı varyans kullanan Games–Howell.
        const welch = finalTest === 'Welch ANOVA';
        const unequal = new Set(input.groups.map((g) => g.length)).size > 1;
        const method = welch ? 'Games–Howell' : unequal ? 'Tukey HSD (Tukey–Kramer)' : 'Tukey HSD';
        const pairs = mkRangePairs(input.names, welch ? gamesHowell(input.groups) : tukeyHsd(input.groups), alpha);
        out.postHoc = postHocOf(method, 'familywise', input.names, pairs, input.groups, 'Ortalama');
      }
      return out;
    }
    case 'Kruskal-Wallis H testi': {
      need('groups');
      if (input.kind !== 'groups') throw new Error('Grup girdisi gerekir.');
      const r = kruskalWallis(input.groups);
      const significant = r.p < alpha;
      const out: TestOutcome = {
        test: finalTest,
        statisticText: `H(${r.df}) = ${n2(r.H)}`,
        statistic: { symbol: 'H', value: r.H, df: [r.df] },
        p: r.p,
        alpha,
        significant,
        effect: { symbol: 'ε²', name: 'epsilon-kare', value: r.epsilonSquared, magnitude: magVar(r.epsilonSquared) },
        n: r.n,
        kind: 'groups',
        notes,
      };
      if (significant && input.groups.length > 2) {
        out.postHoc = postHocOf('Dunn testi (Holm düzeltmeli)', 'holm', input.names, mkPairs(input.names, dunnTest(input.groups), alpha), input.groups, 'Medyan');
      }
      return out;
    }
    case 'Eşleştirilmiş t-testi': {
      need('paired');
      if (input.kind !== 'paired' || input.conditions.length !== 2) throw new Error('Eşleştirilmiş t-testi için 2 koşul gerekir.');
      const [x, y] = input.conditions as [number[], number[]];
      const r = tTestPaired(x, y);
      return {
        test: finalTest,
        statisticText: `t(${r.df}) = ${n2(r.t)}`,
        statistic: { symbol: 't', value: r.t, df: [r.df] },
        p: r.p,
        alpha,
        significant: r.p < alpha,
        effect: { symbol: 'd_z', name: 'Cohen d_z', value: r.cohenD, magnitude: magD(r.cohenD) },
        ci: { label: 'Ortalama fark için %95 güven aralığı', low: r.ci[0], high: r.ci[1] },
        n: r.n1,
        kind: 'paired',
        notes,
      };
    }
    case 'Wilcoxon işaretli sıra testi': {
      need('paired');
      if (input.kind !== 'paired' || input.conditions.length !== 2) throw new Error('Wilcoxon için 2 koşul gerekir.');
      const [x, y] = input.conditions as [number[], number[]];
      const r = wilcoxonSignedRank(x, y);
      if (r.method === 'approx') notes.push('P değeri normal yaklaşımla hesaplandı; sıfır farklar atıldı.');
      return {
        test: finalTest,
        statisticText: `W = ${r.W}`,
        statistic: { symbol: 'W', value: r.W, df: [] },
        p: r.p,
        alpha,
        significant: r.p < alpha,
        effect: { symbol: 'r', name: 'rank-biserial korelasyon', value: r.rankBiserial, magnitude: magR(r.rankBiserial) },
        n: r.n,
        kind: 'paired',
        notes,
      };
    }
    case 'Tekrarlı ölçümler ANOVA': {
      need('paired');
      if (input.kind !== 'paired') throw new Error('Koşul girdisi gerekir.');
      const r = anovaRepeated(input.conditions);
      notes.push('Küresellik varsayılmıştır; Greenhouse-Geisser düzeltmesi uygulanmadı.');
      const out: TestOutcome = {
        test: finalTest,
        statisticText: `F(${dfText([r.df1, r.df2])}) = ${n2(r.F)}`,
        statistic: { symbol: 'F', value: r.F, df: [r.df1, r.df2] },
        p: r.p,
        alpha,
        significant: r.p < alpha,
        effect: { symbol: 'η²p', name: 'kısmi eta-kare', value: r.partialEtaSquared, magnitude: magVar(r.partialEtaSquared) },
        n: input.conditions[0]!.length,
        kind: 'paired',
        notes,
      };
      if (out.significant && input.conditions.length > 2) {
        out.postHoc = postHocOf('İkili eşleştirilmiş t-testleri (Holm düzeltmeli)', 'holm', input.names, mkPairs(input.names, pairwisePaired(input.conditions, 't'), alpha), input.conditions, 'Ortalama');
      }
      return out;
    }
    case 'Friedman testi': {
      need('paired');
      if (input.kind !== 'paired') throw new Error('Koşul girdisi gerekir.');
      const r = friedmanTest(input.conditions);
      const out: TestOutcome = {
        test: finalTest,
        statisticText: `χ²(${r.df}) = ${n2(r.chi2)}`,
        statistic: { symbol: 'χ²', value: r.chi2, df: [r.df] },
        p: r.p,
        alpha,
        significant: r.p < alpha,
        effect: { symbol: 'W', name: 'Kendall W', value: r.kendallW, magnitude: magR(r.kendallW) },
        n: r.n,
        kind: 'paired',
        notes,
      };
      if (out.significant && input.conditions.length > 2) {
        out.postHoc = postHocOf('İkili Wilcoxon testleri (Holm düzeltmeli)', 'holm', input.names, mkPairs(input.names, pairwisePaired(input.conditions, 'wilcoxon'), alpha), input.conditions, 'Medyan');
      }
      return out;
    }
    case 'Pearson korelasyonu':
    case 'Spearman sıra korelasyonu': {
      need('xy');
      if (input.kind !== 'xy') throw new Error('x ve y girdisi gerekir.');
      const r = finalTest === 'Pearson korelasyonu' ? pearson(input.x, input.y) : spearman(input.x, input.y);
      return {
        test: finalTest,
        statisticText: `r(${r.n - 2}) = ${n2(r.r)}`,
        statistic: { symbol: 'r', value: r.r, df: [r.n - 2] },
        p: r.p,
        alpha,
        significant: r.p < alpha,
        effect: { symbol: finalTest === 'Pearson korelasyonu' ? 'r' : 'ρ', name: 'korelasyon katsayısı', value: r.r, magnitude: magR(r.r) },
        ci: { label: 'Korelasyon için %95 güven aralığı (Fisher z)', low: r.ci[0], high: r.ci[1] },
        n: r.n,
        kind: 'xy',
        direction: r.r >= 0 ? 'pozitif' : 'negatif',
        notes,
      };
    }
    case 'Ki-kare homojenlik testi':
    case 'Ki-kare bağımsızlık testi': {
      need('table');
      if (input.kind !== 'table') throw new Error('Tablo girdisi gerekir.');
      const r = chiSquareContingency(input.table);
      const total = input.table.flat().reduce((s, v) => s + v, 0);
      const is2x2 = input.table.length === 2 && input.table[0]!.length === 2;
      if (is2x2 && r.lowExpectedShare > 0) {
        const f = fisherExact(input.table as [[number, number], [number, number]]);
        notes.push('Beklenen hücre sayısı 5’ten küçük olduğu için ki-kare yerine Fisher kesin testi kullanıldı.');
        return {
          test: 'Fisher kesin testi',
          statisticText: `OR = ${Number.isFinite(f.oddsRatio) ? n2(f.oddsRatio) : '∞'}`,
          statistic: { symbol: 'OR', value: f.oddsRatio, df: [] },
          p: f.p,
          alpha,
          significant: f.p < alpha,
          effect: { symbol: 'V', name: 'Cramér V', value: r.cramersV, magnitude: magR(r.cramersV) },
          n: total,
          kind: 'table',
          notes,
        };
      }
      if (r.lowExpectedShare > 0.2) notes.push('Hücrelerin %20’sinden fazlasında beklenen sayı 5’ten küçük: ki-kare yaklaşımı güvenilir olmayabilir.');
      return {
        test: finalTest,
        statisticText: `χ²(${r.df}) = ${n2(r.chi2)}`,
        statistic: { symbol: 'χ²', value: r.chi2, df: [r.df] },
        p: r.p,
        alpha,
        significant: r.p < alpha,
        effect: { symbol: 'V', name: 'Cramér V', value: r.cramersV, magnitude: magR(r.cramersV) },
        n: total,
        kind: 'table',
        notes,
      };
    }
    default:
      throw new Error(`Desteklenmeyen test: ${finalTest}`);
  }
}

/* ---------- Yorum ---------- */

/** "A – B (fark = −2.10, %95 GA [−3.40, −0.80], p = .002)"; farkı olmayan yöntemlerde yalnızca p. */
export function pairText(p: OutcomePair): string {
  return p.diff === undefined
    ? `${p.a} – ${p.b} (${pText(p.pAdj)})`
    : `${p.a} – ${p.b} (fark = ${n2(p.diff)}, %95 GA [${n2(p.ciLow!)}, ${n2(p.ciHigh!)}], ${pText(p.pAdj)})`;
}

function pPhrase(p: number): string {
  if (p < 0.001) return 'binde birden az';
  if (p < 0.01) return `yaklaşık binde ${Math.round(p * 1000)}`;
  return `yaklaşık yüzde ${Math.round(p * 100)}`;
}

const SUBJECT: Record<TestInput['kind'], { diff: string; none: string; same: string }> = {
  groups: { diff: 'Gruplar arasında', none: 'Gruplar arasında', same: 'gruplar gerçekte aynı olsaydı' },
  paired: { diff: 'Koşullar arasında', none: 'Koşullar arasında', same: 'koşullar gerçekte aynı olsaydı' },
  xy: { diff: 'Değişkenler arasında', none: 'Değişkenler arasında', same: 'değişkenler gerçekte ilişkisiz olsaydı' },
  table: { diff: 'Değişkenler arasında', none: 'Değişkenler arasında', same: 'değişkenler gerçekte ilişkisiz olsaydı' },
};

export function interpretOutcome(o: TestOutcome): Interpretation {
  const s = SUBJECT[o.kind];
  const isRel = o.kind === 'xy' || o.kind === 'table';
  const headline = o.significant
    ? isRel
      ? `${s.diff} istatistiksel olarak anlamlı bir ilişki var.`
      : `${s.diff} istatistiksel olarak anlamlı bir fark var.`
    : isRel
      ? `${s.none} anlamlı bir ilişki bulunamadı.`
      : `${s.none} anlamlı bir fark bulunamadı.`;

  const effectSentence = `Etki büyüklüğü ${o.effect.magnitude} (${o.effect.symbol} = ${n2(o.effect.value)}).`;
  const dirSentence = o.direction ? ` İlişki ${o.direction}: ${o.direction === 'pozitif' ? 'biri arttıkça diğeri de artma' : 'biri arttıkça diğeri azalma'} eğiliminde.` : '';
  const noviceSig = `${s.same[0]!.toUpperCase()}${s.same.slice(1)}, örneğimizdeki kadar belirgin bir ${isRel ? 'ilişki' : 'fark'} görme ihtimali ${pPhrase(o.p)} olurdu. ${effectSentence}${dirSentence} Bu sonuç, nedenini göstermez.`;
  const noviceNs = `Bu veride gördüğümüz ${isRel ? 'ilişki' : 'fark'}, ${s.same.replace('olsaydı', 'olsa bile')} sık rastlanan bir düzeyde (ihtimal ${pPhrase(o.p)}). Bu, “${isRel ? 'ilişki' : 'fark'} yok” demek değildir: etki küçük ya da örneklem yetersiz olabilir. ${effectSentence}`;
  const stat = `${o.test}: ${o.statisticText}, ${pText(o.p)}, ${o.effect.symbol} = ${n2(o.effect.value)} (${o.effect.magnitude}), N = ${o.n}`;
  const ci = o.ci ? ` ${o.ci.label}: [${n2(o.ci.low)}, ${n2(o.ci.high)}].` : '';

  const sigPairs = o.postHoc?.pairs.filter((p) => p.significant) ?? [];
  const recommendation = o.postHoc
    ? sigPairs.length
      ? {
          label: 'Post-hoc sonucu',
          text: `${o.postHoc.method}: anlamlı çiftler: ${sigPairs.map(pairText).join('; ')}. Aynı harfi paylaşan gruplar birbirinden anlamlı biçimde farklı değildir: ${o.postHoc.letters.map((l) => `${l.group} (${l.letters})`).join(', ')}.`,
        }
      : { label: 'Post-hoc sonucu', text: `${o.postHoc.method}: ${o.postHoc.adjustment === 'holm' ? 'düzeltmeden sonra ' : ''}anlamlı çift bulunamadı.` }
    : o.significant && o.kind === 'groups'
      ? { label: 'Sıradaki adım', text: 'İkiden fazla grup yoksa fark doğrudan grup ortalamalarından/medyanlarından okunur.' }
      : undefined;

  return {
    id: o.test,
    metric: `${pText(o.p, false)}`,
    threshold: `α = ${o.alpha}`,
    verdict: o.significant ? 'H₀ reddedildi' : 'H₀ reddedilemedi',
    significant: o.significant,
    headline,
    body: {
      novice: o.significant ? noviceSig : noviceNs,
      expert: `${stat}.${ci}${o.notes.length ? ` ${o.notes.join(' ')}` : ''}`,
    },
    recommendation,
  };
}
