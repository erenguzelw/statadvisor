/**
 * Gerçek veriden analiz: sütunları test girdisine çevirir, varsayım testlerini hesaplar, kural motorunu
 * çalıştırır, önerilen testi uygular ve sonucu (APA metni, kaynakça ve uyarılarla) döndürür.
 */
import { groupResiduals, levene, mean, shapiroWilk } from './assumptions.ts';
import { recommendTest, type AssumptionInput, type Design, type Goal, type Target, type WizardAnswers } from './decision.ts';
import { describeGroups, interpretOutcome, runTest, type TestInput, type TestOutcome } from './inference.ts';
import { histogram, meanSd, pText, skewness } from './stats.ts';
import type { AssumptionTest, DecisionPath, DistributionSample, GroupDescriptive, Interpretation } from './types.ts';

/** Çözümlenebilir bir istek biçimi hatası; kullanıcıya olduğu gibi gösterilebilir. */
export class AnalysisError extends Error {
  readonly code = 'analysis_error';
}

export type NumericColumn = { name: string; values: (number | null)[] };
export type TextColumn = { name: string; values: (string | null)[] };

export interface AnalysisRequest {
  goal: Goal;
  design: Design;
  target: Target;
  alpha?: number;
  /** Karşılaştırma (bağımsız gruplar): sonuç değişkeni ve grup değişkeni. */
  value?: NumericColumn;
  group?: TextColumn;
  /** Karşılaştırma (eşleşmiş): her koşul bir sütundur, satırlar aynı denekleri gösterir. */
  conditions?: NumericColumn[];
  /** İlişki (sayısal): iki sütun. */
  x?: NumericColumn;
  y?: NumericColumn;
  /** Kategorik hedef: çapraz tablo için iki sütun (karşılaştırmada satır = grup, sütun = sonuç). */
  rowVar?: TextColumn;
  colVar?: TextColumn;
  datasetName?: string;
}

export interface AnalysisResult {
  datasetName: string;
  answers: WizardAnswers;
  decision: DecisionPath;
  assumptions: AssumptionTest[];
  assumptionInput: AssumptionInput;
  /** Grup içi kalıntıların dağılımı (sayısal hedefler için). */
  distribution?: DistributionSample;
  descriptives: GroupDescriptive[];
  outcome: TestOutcome;
  interpretation: Interpretation;
  apaSummary: string;
  references: string[];
  /** Veri hazırlama notları (eksik veri atımı, örnekleme). */
  notes: string[];
  /** Gösterimde kullanılan değişken adları. */
  variables: string[];
  /** Kategorik analizlerde çapraz tablo ve etiket sırası. */
  table?: { rowNames: string[]; colNames: string[]; table: number[][] };
}

const collator = new Intl.Collator('tr', { numeric: true });
const SHAPIRO_MAX = 5000;

const REFERENCES: Record<string, string> = {
  shapiro: 'Royston, P. (1995). Remark AS R94: A remark on algorithm AS 181: The W-test for normality. Applied Statistics, 44(4), 547–551.',
  levene: 'Brown, M. B., & Forsythe, A. B. (1974). Robust tests for the equality of variances. Journal of the American Statistical Association, 69(346), 364–367.',
  kruskal: 'Kruskal, W. H., & Wallis, W. A. (1952). Use of ranks in one-criterion variance analysis. Journal of the American Statistical Association, 47(260), 583–621.',
  dunn: 'Dunn, O. J. (1964). Multiple comparisons using rank sums. Technometrics, 6(3), 241–252.',
  holm: 'Holm, S. (1979). A simple sequentially rejective multiple test procedure. Scandinavian Journal of Statistics, 6(2), 65–70.',
  welch: 'Welch, B. L. (1951). On the comparison of several mean values: An alternative approach. Biometrika, 38(3–4), 330–336.',
  student: 'Student. (1908). The probable error of a mean. Biometrika, 6(1), 1–25.',
  mannwhitney: 'Mann, H. B., & Whitney, D. R. (1947). On a test of whether one of two random variables is stochastically larger than the other. The Annals of Mathematical Statistics, 18(1), 50–60.',
  wilcoxon: 'Wilcoxon, F. (1945). Individual comparisons by ranking methods. Biometrics Bulletin, 1(6), 80–83.',
  friedman: 'Friedman, M. (1937). The use of ranks to avoid the assumption of normality implicit in the analysis of variance. Journal of the American Statistical Association, 32(200), 675–701.',
  spearman: 'Spearman, C. (1904). The proof and measurement of association between two things. The American Journal of Psychology, 15(1), 72–101.',
  fisher: 'Fisher, R. A. (1922). On the interpretation of χ² from contingency tables, and the calculation of P. Journal of the Royal Statistical Society, 85(1), 87–94.',
};

function referencesFor(o: TestOutcome, usedShapiro: boolean, usedLevene: boolean): string[] {
  const out: string[] = [];
  if (usedShapiro) out.push(REFERENCES.shapiro!);
  if (usedLevene) out.push(REFERENCES.levene!);
  const t = o.test;
  if (t === 'Kruskal-Wallis H testi') out.push(REFERENCES.kruskal!);
  if (t === 'Welch ANOVA' || t === 'Welch t-testi') out.push(REFERENCES.welch!);
  if (t === 'Bağımsız örneklem t-testi' || t === 'Eşleştirilmiş t-testi') out.push(REFERENCES.student!);
  if (t === 'Mann-Whitney U testi') out.push(REFERENCES.mannwhitney!);
  if (t === 'Wilcoxon işaretli sıra testi') out.push(REFERENCES.wilcoxon!);
  if (t === 'Friedman testi') out.push(REFERENCES.friedman!);
  if (t === 'Spearman sıra korelasyonu') out.push(REFERENCES.spearman!);
  if (t === 'Fisher kesin testi') out.push(REFERENCES.fisher!);
  if (o.postHoc?.method.startsWith('Dunn')) out.push(REFERENCES.dunn!);
  if (o.postHoc) out.push(REFERENCES.holm!);
  return [...new Set(out)];
}

/** Sütunlardaki eksik satırları atar (liste bazlı silme) ve atılan satır sayısını döndürür. */
function completeRows<T extends { values: unknown[] }>(cols: T[]): { keep: number[]; dropped: number; total: number } {
  const total = cols[0]!.values.length;
  const keep: number[] = [];
  for (let i = 0; i < total; i++) if (cols.every((c) => c.values[i] !== null && c.values[i] !== undefined)) keep.push(i);
  return { keep, dropped: total - keep.length, total };
}

function crosstab(rows: string[], cols: string[]): { rowNames: string[]; colNames: string[]; table: number[][] } {
  const rowNames = [...new Set(rows)].sort(collator.compare);
  const colNames = [...new Set(cols)].sort(collator.compare);
  const table = rowNames.map(() => colNames.map(() => 0));
  rows.forEach((r, i) => {
    table[rowNames.indexOf(r)]![colNames.indexOf(cols[i]!)]!++;
  });
  return { rowNames, colNames, table };
}

/** Kullanıcıya gösterilen varsayım kartları. */
export function shapiroAssumption(label: string, subject: string, values: number[], alpha: number): { test: AssumptionTest; p: number } {
  const r = shapiroWilk(values);
  const passed = r.p >= alpha;
  return {
    p: r.p,
    test: {
      id: `shapiro:${label}`,
      name: 'Shapiro-Wilk',
      subject: `${subject}, n = ${r.n}`,
      statistic: `W = ${r.W.toFixed(3)}`,
      p: r.p,
      alpha,
      passed,
      verdict: passed ? 'Normallikten sapma saptanmadı (bu, normalliğin kanıtı değildir).' : 'Normallik varsayımı reddedildi: veri normal dağılımdan sapıyor.',
      explain: {
        novice:
          'Bu test, değerlerin çan eğrisine benzeyip benzemediğine bakar. p küçükse veri çan eğrisinden belirgin biçimde sapıyor demektir. Küçük örneklemde güçsüzdür; büyük örneklemde ise çok küçük sapmalara bile uyarı verir.',
        expert: `H₀: ${subject} normal dağılımdan gelir. W = ${r.W.toFixed(3)}, ${pText(r.p)} (Royston, 1995). Ön test sonrası test seçimi koşullu Tip I hatayı etkileyebilir; Q-Q grafiği ve çarpıklık/basıklık ile birlikte değerlendirin.`,
      },
    },
  };
}

export function leveneAssumption(groups: number[][], alpha: number): { test: AssumptionTest; p: number } {
  const r = levene(groups);
  const passed = r.p >= alpha;
  return {
    p: r.p,
    test: {
      id: 'levene',
      name: 'Levene',
      subject: `medyan merkezli (Brown-Forsythe), ${groups.length} grup`,
      statistic: `F(${r.df1}, ${r.df2}) = ${r.F.toFixed(2)}`,
      p: r.p,
      alpha,
      passed,
      verdict: passed ? 'Varyans eşitliğine karşı kanıt bulunamadı (bu, eşitliğin kanıtı değildir).' : 'Varyanslar eşit değil: gruplar arasında yayılım farkı var.',
      explain: {
        novice:
          'Bu test, grupların ne kadar yayıldığının benzer olup olmadığına bakar. p küçükse yayılımlar belirgin biçimde farklıdır. Büyük p, “eşit” demek değil, “fark gösteremedik” demektir.',
        expert: `H₀: grup varyansları eşit. Brown-Forsythe, F(${r.df1}, ${r.df2}) = ${r.F.toFixed(2)}, ${pText(r.p)}. Anlamsız sonuç eşitliği kanıtlamaz; bu yüzden Welch yaklaşımı varsayılan olarak daha güvenlidir.`,
      },
    },
  };
}

/** Çok büyük örneklemde Shapiro-Wilk için eşit aralıklı, belirleyici bir alt örnek seçer. */
export function shapiroSubsample(values: number[], notes: string[]): number[] {
  if (values.length <= SHAPIRO_MAX) return values;
  const sorted = [...values].sort((a, b) => a - b);
  notes.push(`Shapiro-Wilk en fazla ${SHAPIRO_MAX} gözlemle çalışır; ${values.length} gözlemden eşit aralıklı ${SHAPIRO_MAX} gözlemlik bir alt örnek kullanıldı.`);
  // numpy ile aynı biçim: floor(i·n / 5000) (üretilen Python kodu bunu birebir kullanır)
  return Array.from({ length: SHAPIRO_MAX }, (_, i) => sorted[Math.floor((i * sorted.length) / SHAPIRO_MAX)]!);
}

/** Eşleşmiş tasarımda normallik, farklar (2 koşul) ya da iki yönlü kalıntılar (3+ koşul) üzerinden aranır. */
function pairedResiduals(conds: number[][]): { values: number[]; subject: string } {
  if (conds.length === 2) return { values: conds[0]!.map((v, i) => v - conds[1]![i]!), subject: 'eşleşmiş farklar' };
  const n = conds[0]!.length;
  const grand = mean(conds.flat());
  const condMeans = conds.map(mean);
  const subjMeans = Array.from({ length: n }, (_, i) => mean(conds.map((c) => c[i]!)));
  const out: number[] = [];
  for (let j = 0; j < conds.length; j++) for (let i = 0; i < n; i++) out.push(conds[j]![i]! - condMeans[j]! - subjMeans[i]! + grand);
  return { values: out, subject: 'iki yönlü kalıntılar' };
}

function apaSentence(o: TestOutcome, assumptions: AssumptionTest[]): string {
  const parts: string[] = [];
  const sh = assumptions.filter((a) => a.name === 'Shapiro-Wilk');
  if (sh.length) {
    parts.push(
      `Normallik varsayımı Shapiro-Wilk testiyle incelenmiştir (${sh.map((a) => `${a.subject}: ${a.statistic}, ${pText(a.p)}`).join('; ')}) ve ${sh.every((a) => a.passed) ? 'karşılandığı' : 'karşılanmadığı'} görülmüştür.`,
    );
  }
  const lv = assumptions.find((a) => a.name === 'Levene');
  if (lv) parts.push(`Varyansların homojenliği Levene (Brown-Forsythe) testiyle sınanmıştır, ${lv.statistic}, ${pText(lv.p)}.`);
  parts.push(`Analizde ${o.test} kullanılmıştır.`);
  const rel = o.kind === 'xy' || o.kind === 'table';
  const subject = o.kind === 'groups' ? 'gruplar' : o.kind === 'paired' ? 'koşullar' : 'değişkenler';
  const result = `${o.statisticText}, ${pText(o.p)}, ${o.effect.symbol} = ${o.effect.value.toFixed(2)}, N = ${o.n}`;
  parts.push(
    o.significant
      ? `${subject[0]!.toUpperCase()}${subject.slice(1)} arasında istatistiksel olarak anlamlı bir ${rel ? 'ilişki' : 'fark'} bulunmuştur, ${result}.`
      : `${subject[0]!.toUpperCase()}${subject.slice(1)} arasında istatistiksel olarak anlamlı bir ${rel ? 'ilişki' : 'fark'} bulunamamıştır, ${result}.`,
  );
  const sig = o.postHoc?.pairs.filter((p) => p.significant) ?? [];
  if (o.postHoc) {
    parts.push(
      sig.length
        ? `${o.postHoc.method} sonucunda ${sig.map((p) => `${p.a}–${p.b} (${pText(p.pAdj)})`).join(', ')} çiftleri arasındaki fark anlamlı bulunmuştur.`
        : `${o.postHoc.method} sonucunda düzeltmeden sonra anlamlı çift bulunamamıştır.`,
    );
  }
  return parts.join(' ');
}

/** Ana giriş noktası: isteği doğrular, analizi yapar. Geçersiz istekte AnalysisError fırlatır. */
export function analyze(req: AnalysisRequest): AnalysisResult {
  const alpha = req.alpha ?? 0.05;
  if (!(alpha > 0 && alpha < 1)) throw new AnalysisError('Anlamlılık düzeyi (α) 0 ile 1 arasında olmalıdır.');
  if (req.goal === 'predict') throw new AnalysisError('Tahmin amaçlı çalışmalar için Model Karşılaştırma sayfasını kullanın; bu çözümleme hipotez testleri içindir.');

  const notes: string[] = [];
  const assumptions: AssumptionTest[] = [];
  let input: TestInput;
  let normalP = 1;
  let varianceP = 1;
  let groupsForLevene: number[][] | undefined;
  let residualsForChart: number[] | undefined;
  let groupCount: '2' | '3+' = '2';
  let descriptives: GroupDescriptive[] = [];
  let variables: string[];
  let usedShapiro = false;
  const numeric = req.target !== 'categorical';

  const drop = (dropped: number, what: string) => {
    if (dropped > 0) notes.push(`${what} sütunlarında eksik değer bulunan ${dropped} satır analizden çıkarıldı.`);
  };

  if (req.goal === 'compare' && req.target === 'categorical') {
    if (!req.rowVar || !req.colVar) throw new AnalysisError('Kategorik karşılaştırma için bir grup sütunu ve bir sonuç sütunu seçin.');
    const { keep, dropped } = completeRows([req.rowVar, req.colVar]);
    drop(dropped, `“${req.rowVar.name}” ve “${req.colVar.name}”`);
    const ct = crosstab(keep.map((i) => req.rowVar!.values[i]!), keep.map((i) => req.colVar!.values[i]!));
    if (ct.rowNames.length < 2 || ct.colNames.length < 2) throw new AnalysisError('Ki-kare için her iki değişkenin de en az 2 düzeyi olmalıdır.');
    groupCount = ct.rowNames.length === 2 ? '2' : '3+';
    input = { kind: 'table', ...ct };
    variables = [req.rowVar.name, req.colVar.name];
  } else if (req.goal === 'relate' && req.target === 'categorical') {
    if (!req.rowVar || !req.colVar) throw new AnalysisError('İlişki için iki kategorik sütun seçin.');
    const { keep, dropped } = completeRows([req.rowVar, req.colVar]);
    drop(dropped, `“${req.rowVar.name}” ve “${req.colVar.name}”`);
    const ct = crosstab(keep.map((i) => req.rowVar!.values[i]!), keep.map((i) => req.colVar!.values[i]!));
    if (ct.rowNames.length < 2 || ct.colNames.length < 2) throw new AnalysisError('Ki-kare için her iki değişkenin de en az 2 düzeyi olmalıdır.');
    input = { kind: 'table', ...ct };
    variables = [req.rowVar.name, req.colVar.name];
  } else if (req.goal === 'relate') {
    if (!req.x || !req.y) throw new AnalysisError('İlişki için iki sayısal sütun seçin.');
    const { keep, dropped } = completeRows([req.x, req.y]);
    drop(dropped, `“${req.x.name}” ve “${req.y.name}”`);
    const x = keep.map((i) => req.x!.values[i] as number);
    const y = keep.map((i) => req.y!.values[i] as number);
    if (x.length < 5) throw new AnalysisError('Korelasyon için en az 5 tam gözlem gerekir.');
    if (numeric && req.target === 'continuous') {
      const a = shapiroAssumption('x', `“${req.x.name}”`, shapiroSubsample(x, notes), alpha);
      const b = shapiroAssumption('y', `“${req.y.name}”`, shapiroSubsample(y, notes), alpha);
      assumptions.push(a.test, b.test);
      normalP = Math.min(a.p, b.p);
      usedShapiro = true;
    }
    input = { kind: 'xy', xName: req.x.name, yName: req.y.name, x, y };
    variables = [req.x.name, req.y.name];
    descriptives = describeGroups([req.x.name, req.y.name], [x, y]);
  } else if (req.design === 'paired') {
    if (!req.conditions || req.conditions.length < 2) throw new AnalysisError('Eşleşmiş karşılaştırma için en az 2 sütun (koşul) seçin.');
    const { keep, dropped } = completeRows(req.conditions);
    drop(dropped, 'koşul');
    const conds = req.conditions.map((c) => keep.map((i) => c.values[i] as number));
    if (conds[0]!.length < 3) throw new AnalysisError('Eşleşmiş test için en az 3 tam denek gerekir.');
    groupCount = conds.length === 2 ? '2' : '3+';
    if (req.target === 'continuous') {
      const r = pairedResiduals(conds);
      const a = shapiroAssumption('paired', r.subject, shapiroSubsample(r.values, notes), alpha);
      assumptions.push(a.test);
      normalP = a.p;
      usedShapiro = true;
      residualsForChart = r.values;
    }
    input = { kind: 'paired', names: req.conditions.map((c) => c.name), conditions: conds };
    variables = req.conditions.map((c) => c.name);
    descriptives = describeGroups(variables, conds);
  } else {
    if (!req.value || !req.group) throw new AnalysisError('Karşılaştırma için bir sonuç sütunu ve bir grup sütunu seçin.');
    const { keep, dropped } = completeRows([req.value, req.group]);
    drop(dropped, `“${req.value.name}” ve “${req.group.name}”`);
    const levels = [...new Set(keep.map((i) => req.group!.values[i]!))].sort(collator.compare);
    if (levels.length < 2) throw new AnalysisError('Karşılaştırma için grup sütununda en az 2 farklı değer olmalıdır.');
    if (levels.length > 12) throw new AnalysisError(`Grup sütununda ${levels.length} farklı değer var; bu bir grup sütunu gibi görünmüyor (en fazla 12 grup desteklenir).`);
    const groups = levels.map((lv) => keep.filter((i) => req.group!.values[i] === lv).map((i) => req.value!.values[i] as number));
    const tooSmall = levels.filter((_, i) => groups[i]!.length < 2);
    if (tooSmall.length) throw new AnalysisError(`Şu gruplarda 2’den az gözlem var: ${tooSmall.join(', ')}.`);
    groupCount = levels.length === 2 ? '2' : '3+';
    if (req.target === 'continuous') {
      const residuals = groupResiduals(groups);
      if (residuals.length < 3) throw new AnalysisError('Normallik testi için en az 3 gözlem gerekir.');
      const a = shapiroAssumption('residuals', 'grup içi kalıntılar', shapiroSubsample(residuals, notes), alpha);
      assumptions.push(a.test);
      normalP = a.p;
      usedShapiro = true;
      residualsForChart = residuals;
      const l = leveneAssumption(groups, alpha);
      assumptions.push(l.test);
      varianceP = l.p;
      groupsForLevene = groups;
    }
    input = { kind: 'groups', names: levels, groups };
    variables = [req.value.name, req.group.name];
    descriptives = describeGroups(levels, groups);
  }

  const answers: WizardAnswers = { goal: req.goal, groups: groupCount, design: req.design, target: req.target };
  const nTotal =
    input.kind === 'groups' ? input.groups.flat().length : input.kind === 'paired' ? input.conditions[0]!.length : input.kind === 'xy' ? input.x.length : input.table.flat().reduce((s, v) => s + v, 0);
  const minGroupN =
    input.kind === 'groups' ? Math.min(...input.groups.map((g) => g.length)) : input.kind === 'paired' ? input.conditions[0]!.length : nTotal;
  const assumptionInput: AssumptionInput = { normalP, varianceP, alpha, n: nTotal, minGroupN };
  const rec = recommendTest(answers, assumptionInput);

  let outcome: TestOutcome;
  try {
    outcome = runTest(rec.finalTest, input, alpha);
  } catch (e) {
    throw new AnalysisError(e instanceof Error ? e.message : 'Test çalıştırılamadı.');
  }

  let distribution: DistributionSample | undefined;
  if (residualsForChart && residualsForChart.length >= 5) {
    const { mean: m, sd } = meanSd(residualsForChart);
    const lo = Math.min(...residualsForChart);
    const hi = Math.max(...residualsForChart);
    const bins = Math.max(5, Math.min(24, Math.round(Math.sqrt(residualsForChart.length) * 1.2)));
    const width = (hi - lo) / bins || 1;
    distribution = { bins: histogram(residualsForChart, bins, lo, width), mean: m, sd, skewness: Number(skewness(residualsForChart).toFixed(2)), n: residualsForChart.length };
  }

  return {
    datasetName: req.datasetName ?? '',
    answers,
    decision: {
      conditions: rec.conditions,
      plannedTest: rec.plannedTest,
      finalTest: outcome.test,
      rerouteReason: rec.rerouteReason,
      warnings: rec.warnings,
    },
    assumptions,
    assumptionInput,
    distribution,
    descriptives,
    outcome,
    interpretation: interpretOutcome(outcome),
    table: input.kind === 'table' ? { rowNames: input.rowNames, colNames: input.colNames, table: input.table } : undefined,
    apaSummary: apaSentence(outcome, assumptions),
    references: referencesFor(outcome, usedShapiro, groupsForLevene !== undefined),
    notes,
    variables,
  };
}
