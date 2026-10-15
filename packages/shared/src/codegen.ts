/**
 * Python kodu üretici. Üretilen betik, kullanıcının CSV dosyasını okuyup uygulamadaki analizi yeniden yapar ve
 * `expectedOutput` ile birebir aynı satırları yazdırır. Bu eşitlik, Python bulunan ortamda otomatik testle doğrulanır.
 */
import type { AnalysisResult, NormalityMethod } from './analysis.ts';
import type { ImputeMethod } from './clean.ts';
import type { CleanRule } from './quality.ts';
import type { ScaleDef, ScaleResult } from './scales.ts';
import type { ScreenOptions, ScreenResult } from './screening.ts';

export interface DatasetFile {
  fileName: string;
  delimiter: string;
  decimalComma: boolean;
  /** "2:Etiket" biçiminde kodlu sütunlar; betik baştaki sayıyı alır. */
  prefixCoded?: string[];
  /** Aralık etiketli sıralı sütunlar: ad → küçükten büyüğe etiketler (betik sıra numarasına çevirir). */
  rankCoded?: Record<string, string[]>;
}

/** Sunucuya gönderilen (normalleştirilmiş) analiz isteği. */
export interface AnalysisSpec {
  goal: 'compare' | 'relate' | 'predict';
  design: 'independent' | 'paired' | 'unknown';
  target: 'continuous' | 'ordinal' | 'categorical';
  alpha?: number;
  normality?: NormalityMethod;
  variance?: 'welch' | 'levene';
  value?: string;
  group?: string;
  conditions?: string[];
  x?: string;
  y?: string;
  rowVar?: string;
  colVar?: string;
}

export interface GeneratedCode {
  filename: string;
  code: string;
  /** Betik çalıştırıldığında beklenen konsol çıktısı. */
  expectedOutput: string[];
  requirements: string[];
}

const py = (s: string) => JSON.stringify(s);
const pyList = (xs: string[]) => `[${xs.map(py).join(', ')}]`;

/** Python'un f"{x:.nf}" biçimiyle aynı çıktı (sonsuz ve NaN dahil). */
export function fmt(x: number, digits: number): string {
  if (Number.isNaN(x)) return 'nan';
  if (!Number.isFinite(x)) return x > 0 ? 'inf' : '-inf';
  return x.toFixed(digits);
}

const ASCII_SYMBOL: Record<string, string> = { 'ε²': 'epsilon2', 'η²': 'eta2', 'η²p': 'eta2_kismi', ρ: 'rho', 'V': 'V' };
const sym = (s: string) => ASCII_SYMBOL[s] ?? s;

const NA_VALUES = ['', 'na', 'NA', 'n/a', 'N/A', 'nan', 'NaN', 'NAN', 'null', 'NULL', 'none', 'None', '-', '?', '#N/A'];

export function readCsvLine(file: DatasetFile): string {
  const read = `df = pd.read_csv(${py(file.fileName)}, sep=${py(file.delimiter)}, decimal=${py(file.decimalComma ? ',' : '.')}, na_values=NA_DEGERLERI, keep_default_na=False)`;
  const lines = [read];
  if (file.prefixCoded?.length) {
    lines.push(
      `KODLU = ${pyList(file.prefixCoded)}  # "2:Bazen katılıyorum" gibi etiketlerin baştaki sayısı alınır`,
      'for s in KODLU:',
      '    df[s] = pd.to_numeric(df[s].astype("string").str.extract(r"^\\s*(-?\\d+)\\s*:")[0], errors="coerce")',
    );
  }
  const ranks = Object.entries(file.rankCoded ?? {});
  if (ranks.length) {
    lines.push(`SIRALI = {${ranks.map(([k, v]) => `${py(k)}: ${pyList(v)}`).join(', ')}}  # aralık etiketleri küçükten büyüğe sıra numarası alır`);
    lines.push('for s, etiketler in SIRALI.items():', '    df[s] = df[s].astype("string").str.strip().map({e: i for i, e in enumerate(etiketler)})');
  }
  return lines.join('\n');
}

export const naBlock = `NA_DEGERLERI = ${pyList(NA_VALUES)}  # uygulamanın eksik saydığı değerler`;

/** Betiğin yazdıracağı satırlar. */
export function expectedLines(r: AnalysisResult): string[] {
  const o = r.outcome;
  const L: string[] = [];
  for (const a of r.assumptions) {
    if (a.shape) L.push(`Carpiklik-Basiklik [${a.id.split(':')[1]}] carpiklik: ${fmt(a.shape.skewness, 3)} basiklik: ${fmt(a.shape.kurtosis, 3)}`);
    else if (a.name === 'Shapiro-Wilk') L.push(`Shapiro-Wilk [${a.id.split(':')[1]}] W: ${a.statistic.replace('W = ', '')} p: ${fmt(a.p, 6)}`);
    else L.push(`Levene F: ${a.statistic.replace(/^F\(.*\) = /, '')} p: ${fmt(a.p, 6)}`);
  }
  L.push(`Test: ${o.test}`);
  L.push(`Istatistik: ${fmt(o.statistic.value, 4)}`);
  if (o.statistic.df.length) L.push(`Serbestlik derecesi: ${o.statistic.df.map((d) => fmt(d, 4)).join(', ')}`);
  L.push(`p: ${fmt(o.p, 6)}`);
  L.push(`Etki (${sym(o.effect.symbol)}): ${fmt(o.effect.value, 4)}`);
  if (o.ci) L.push(`GA: [${fmt(o.ci.low, 4)}, ${fmt(o.ci.high, 4)}]`);
  L.push(`N: ${o.n}`);
  if (o.postHoc) {
    L.push(`Post-hoc: ${o.postHoc.method}`);
    for (const p of o.postHoc.pairs) {
      L.push(
        p.diff === undefined
          ? `${p.a} - ${p.b}: p_duz = ${fmt(p.pAdj, 6)}`
          : `${p.a} - ${p.b}: fark = ${fmt(p.diff, 4)} GA: [${fmt(p.ciLow!, 4)}, ${fmt(p.ciHigh!, 4)}] p_duz = ${fmt(p.pAdj, 6)}`,
      );
    }
  }
  return L;
}

const ETIKET_FN = `def etiket(v):
    # Grup etiketlerini uygulamadaki gösterimle aynı yapar (1.0 -> "1")
    return str(int(v)) if isinstance(v, (int, float, np.integer, np.floating)) and float(v).is_integer() else str(v)`;

const SHAPIRO_SUBSAMPLE = `    if len(kalintilar) > 5000:  # Shapiro-Wilk en fazla 5000 gözlemle çalışır
        kalintilar = np.sort(kalintilar)[np.floor(np.arange(5000) * len(kalintilar) / 5000).astype(int)]`;

function shapiroBlock(label: string, arr: string): string[] {
  return [
    `kalintilar = ${arr}`,
    ...SHAPIRO_SUBSAMPLE.split('\n').map((l) => l.replace(/^ {4}/, '')),
    'w, p_sw = stats.shapiro(kalintilar)',
    `print(f"Shapiro-Wilk [${label}] W: {w:.3f} p: {p_sw:.6f}")`,
  ];
}

function skewKurtBlock(label: string, arr: string): string[] {
  return [
    `kalintilar = ${arr}`,
    'carp = stats.skew(kalintilar, bias=False)  # düzeltilmiş çarpıklık (SPSS ile aynı)',
    'bas = stats.kurtosis(kalintilar, bias=False)  # düzeltilmiş fazlalık basıklık (SPSS ile aynı)',
    `print(f"Carpiklik-Basiklik [${label}] carpiklik: {carp:.3f} basiklik: {bas:.3f}")`,
  ];
}

function printStat(varStat: string, varP: string, effLabel: string, effVar: string, n: string, df?: string, ci?: [string, string]): string[] {
  return [
    `print(f"Istatistik: {${varStat}:.4f}")`,
    ...(df ? [`print(f"Serbestlik derecesi: ${df}")`] : []),
    `print(f"p: {${varP}:.6f}")`,
    `print(f"Etki (${effLabel}): {${effVar}:.4f}")`,
    ...(ci ? [`print(f"GA: [{${ci[0]}:.4f}, {${ci[1]}:.4f}]")`] : []),
    `print(f"N: {${n}}")`,
  ];
}

function postHocBlock(r: AnalysisResult, names: string, kind: 'dunn' | 'tukey' | 'games-howell' | 'paired-t' | 'wilcoxon', dataVar: string): string[] {
  const ph = r.outcome.postHoc;
  if (!ph) return [];
  const header = `print("Post-hoc: ${ph.method}")`;
  const lines: string[] = [`if p_deger < ALPHA and len(${dataVar}) > 2:`, `    ${header}`, '    ciftler = list(combinations(range(len(' + dataVar + ')), 2))'];
  const printRange = `        print(f"{${names}[a]} - {${names}[b]}: fark = {fark:.4f} GA: [{alt:.4f}, {ust:.4f}] p_duz = {p:.6f}")`;
  if (kind === 'tukey') {
    // Tukey HSD (eşit olmayan grup büyüklüklerinde Tukey–Kramer): ortak hata varyansı, studentize edilmiş aralık
    lines.push(
      `    tk = stats.tukey_hsd(*${dataVar})`,
      '    tk_ga = tk.confidence_interval(0.95)',
      '    for a, b in ciftler:',
      '        fark, alt, ust, p = tk.statistic[a, b], tk_ga.low[a, b], tk_ga.high[a, b], tk.pvalue[a, b]',
      printRange,
    );
    return lines;
  }
  if (kind === 'games-howell') {
    // Games–Howell: her çift için ayrı varyans ve Welch–Satterthwaite serbestlik derecesi
    lines.push(
      `    k = len(${dataVar})`,
      '    for a, b in ciftler:',
      `        ga_, gb_ = ${dataVar}[a], ${dataVar}[b]`,
      '        va, vb = ga_.var(ddof=1) / len(ga_), gb_.var(ddof=1) / len(gb_)',
      '        se = np.sqrt(va + vb)',
      '        sd_ = (va + vb) ** 2 / (va ** 2 / (len(ga_) - 1) + vb ** 2 / (len(gb_) - 1))',
      '        fark = ga_.mean() - gb_.mean()',
      '        p = stats.studentized_range.sf(np.sqrt(2) * abs(fark) / se, k, sd_)',
      '        kritik = stats.studentized_range.ppf(0.95, k, sd_) / np.sqrt(2)',
      '        alt, ust = fark - kritik * se, fark + kritik * se',
      printRange,
    );
    return lines;
  }
  if (kind === 'dunn') {
    lines.push('    import scikit_posthocs as sp', `    dunn = sp.posthoc_dunn(${dataVar}, p_adjust="holm").to_numpy()`, '    duz = [dunn[a, b] for a, b in ciftler]');
  } else {
    const raw =
      kind === 'paired-t'
        ? `stats.ttest_rel(${dataVar}[a], ${dataVar}[b]).pvalue`
        : `stats.wilcoxon(${dataVar}[a], ${dataVar}[b], alternative="two-sided", method="auto").pvalue`;
    lines.push('    from statsmodels.stats.multitest import multipletests', `    ham = [${raw} for a, b in ciftler]`, '    duz = multipletests(ham, method="holm")[1]');
  }
  lines.push(`    for (a, b), p in zip(ciftler, duz):`, `        print(f"{${names}[a]} - {${names}[b]}: p_duz = {p:.6f}")`);
  return lines;
}

/** Betikte kullanılan paketleri koddan çıkarır (pip adlarıyla). */
export function requirementsOf(code: string): string[] {
  const req = new Set(['numpy', 'pandas']);
  if (/stats./.test(code)) req.add('scipy');
  if (code.includes('statsmodels')) req.add('statsmodels');
  if (code.includes('scikit_posthocs')) req.add('scikit-posthocs');
  if (code.includes('sklearn')) req.add('scikit-learn');
  return [...req].sort();
}

export function generateAnalysisCode(file: DatasetFile, spec: AnalysisSpec, r: AnalysisResult): GeneratedCode {
  const o = r.outcome;
  const alpha = spec.alpha ?? 0.05;
  const imports = new Set(['import numpy as np', 'import pandas as pd', 'from scipy import stats']);
  const body: string[] = [];
  const names = r.descriptives.map((d) => d.group);
  const needsEtiket = spec.group || spec.rowVar || spec.colVar;
  const limit = spec.normality === 'skewkurt-2' ? 2 : 1.5;
  const byShape = spec.normality === 'skewkurt-1.5' || spec.normality === 'skewkurt-2';
  const normBlock = (label: string, arr: string) => (byShape ? skewKurtBlock(label, arr) : shapiroBlock(label, arr));

  const head = (): string[] => [
    '# StatAdvisor AI tarafından üretildi. Veri dosyası betikle aynı klasörde olmalıdır.',
    '',
    ...[...imports].sort((a, b) => (a.startsWith('import') === b.startsWith('import') ? a.localeCompare(b) : a.startsWith('import') ? -1 : 1)),
    '',
  ];

  body.push(naBlock, `ALPHA = ${alpha}`, '', readCsvLine(file), '');
  if (needsEtiket) body.push(ETIKET_FN, '');

  if (o.kind === 'groups') {
    const { value, group } = spec;
    body.push(
      `d = df[[${py(value!)}, ${py(group!)}]].copy()`,
      `d[${py(value!)}] = pd.to_numeric(d[${py(value!)}], errors="coerce")`,
      'd = d.dropna()',
      `d[${py(group!)}] = d[${py(group!)}].map(etiket)`,
      `siralama = ${pyList(names)}`,
      `gruplar = [d.loc[d[${py(group!)}] == s, ${py(value!)}].to_numpy(dtype=float) for s in siralama]`,
      '',
    );
    const hasAssumptions = r.assumptions.length > 0;
    if (hasAssumptions) {
      body.push('# Varsayım testleri: grup içi kalıntılarda normallik, gruplar arasında varyans eşitliği');
      if (byShape) body.push(`# Normallik ölçütü: |çarpıklık| ve |basıklık| ≤ ${limit}`);
      body.push(...normBlock('residuals', 'np.concatenate([g - g.mean() for g in gruplar])'));
      body.push('f_l, p_l = stats.levene(*gruplar, center="median")', 'print(f"Levene F: {f_l:.2f} p: {p_l:.6f}")', '');
    }
    body.push(`print("Test: ${o.test}")`);
    const g = (i: number) => `gruplar[${i}]`;
    switch (o.test) {
      case 'Welch t-testi':
      case 'Bağımsız örneklem t-testi': {
        const eq = o.test === 'Bağımsız örneklem t-testi';
        body.push(
          `res = stats.ttest_ind(${g(0)}, ${g(1)}, equal_var=${eq ? 'True' : 'False'})`,
          'ci = res.confidence_interval(0.95)',
          `n1, n2 = len(${g(0)}), len(${g(1)})`,
          `sp = np.sqrt(((n1 - 1) * ${g(0)}.var(ddof=1) + (n2 - 1) * ${g(1)}.var(ddof=1)) / (n1 + n2 - 2))`,
          `hedges_g = (${g(0)}.mean() - ${g(1)}.mean()) / sp * (1 - 3 / (4 * (n1 + n2) - 9))`,
          'p_deger = res.pvalue',
          ...printStat('res.statistic', 'p_deger', 'g', 'hedges_g', 'n1 + n2', '{res.df:.4f}', ['ci.low', 'ci.high']),
        );
        break;
      }
      case 'Mann-Whitney U testi':
        body.push(
          `res = stats.mannwhitneyu(${g(0)}, ${g(1)}, alternative="two-sided", method="auto")`,
          `rank_biserial = 2 * res.statistic / (len(${g(0)}) * len(${g(1)})) - 1`,
          'p_deger = res.pvalue',
          ...printStat('res.statistic', 'p_deger', 'r', 'rank_biserial', `len(${g(0)}) + len(${g(1)})`),
        );
        break;
      case 'Tek Yönlü ANOVA':
      case 'Welch ANOVA': {
        const welch = o.test === 'Welch ANOVA';
        if (welch) imports.add('from statsmodels.stats.oneway import anova_oneway');
        body.push(
          'tum = np.concatenate(gruplar)',
          'genel = tum.mean()',
          'eta2 = sum(len(g) * (g.mean() - genel) ** 2 for g in gruplar) / ((tum - genel) ** 2).sum()',
          ...(welch
            ? [
                'res = anova_oneway(gruplar, use_var="unequal", welch_correction=True)',
                'F, p_deger, df1, df2 = res.statistic, res.pvalue, res.df_num, res.df_denom',
              ]
            : ['res = stats.f_oneway(*gruplar)', 'F, p_deger = res.statistic, res.pvalue', 'df1, df2 = len(gruplar) - 1, len(tum) - len(gruplar)']),
          ...printStat('F', 'p_deger', 'eta2', 'eta2', 'len(tum)', '{df1:.4f}, {df2:.4f}'),
        );
        imports.add('from itertools import combinations');
        body.push(...postHocBlock(r, 'siralama', welch ? 'games-howell' : 'tukey', 'gruplar'));
        break;
      }
      case 'Kruskal-Wallis H testi':
        imports.add('from itertools import combinations');
        body.push(
          'res = stats.kruskal(*gruplar)',
          'n = sum(len(g) for g in gruplar)',
          'epsilon2 = res.statistic / (n - 1)  # etki büyüklüğü',
          'p_deger = res.pvalue',
          ...printStat('res.statistic', 'p_deger', 'epsilon2', 'epsilon2', 'n', '{len(gruplar) - 1:.4f}'),
          ...postHocBlock(r, 'siralama', 'dunn', 'gruplar'),
        );
        break;
      default:
        throw new Error(`Kod üretimi desteklenmeyen test: ${o.test}`);
    }
  } else if (o.kind === 'paired') {
    const cols = spec.conditions!;
    body.push(
      `d = df[${pyList(cols)}].apply(pd.to_numeric, errors="coerce").dropna()`,
      `kosul_adlari = ${pyList(cols)}`,
      'kosullar = [d[c].to_numpy(dtype=float) for c in kosul_adlari]',
      '',
    );
    if (r.assumptions.length) {
      const two = cols.length === 2;
      body.push(
        two ? '# Eşleşmiş tasarımda normallik farklar üzerinde aranır' : '# Eşleşmiş tasarımda normallik iki yönlü kalıntılar üzerinde aranır',
        ...normBlock('paired', two ? '(kosullar[0] - kosullar[1])' : '(lambda M: (M - M.mean(axis=1, keepdims=True) - M.mean(axis=0, keepdims=True) + M.mean()).ravel())(np.vstack(kosullar))'),
        '',
      );
    }
    body.push(`print("Test: ${o.test}")`);
    switch (o.test) {
      case 'Eşleştirilmiş t-testi':
        body.push(
          'res = stats.ttest_rel(kosullar[0], kosullar[1])',
          'ci = res.confidence_interval(0.95)',
          'fark = kosullar[0] - kosullar[1]',
          'dz = fark.mean() / fark.std(ddof=1)',
          'p_deger = res.pvalue',
          ...printStat('res.statistic', 'p_deger', 'd_z', 'dz', 'len(fark)', '{res.df:.4f}', ['ci.low', 'ci.high']),
        );
        break;
      case 'Wilcoxon işaretli sıra testi':
        body.push(
          'res = stats.wilcoxon(kosullar[0], kosullar[1], alternative="two-sided", method="auto")',
          'fark = kosullar[0] - kosullar[1]',
          'fark = fark[fark != 0]  # sıfır farklar atılır',
          'sira = stats.rankdata(np.abs(fark))',
          'w_arti, w_eksi = sira[fark > 0].sum(), sira[fark < 0].sum()',
          'rank_biserial = (w_arti - w_eksi) / (w_arti + w_eksi)',
          'p_deger = res.pvalue',
          ...printStat('res.statistic', 'p_deger', 'r', 'rank_biserial', 'len(fark)'),
        );
        break;
      case 'Friedman testi':
        imports.add('from itertools import combinations');
        body.push(
          'res = stats.friedmanchisquare(*kosullar)',
          'n = len(kosullar[0])',
          'kendall_w = res.statistic / (n * (len(kosullar) - 1))',
          'p_deger = res.pvalue',
          ...printStat('res.statistic', 'p_deger', 'W', 'kendall_w', 'n', '{len(kosullar) - 1:.4f}'),
          ...postHocBlock(r, 'kosul_adlari', 'wilcoxon', 'kosullar'),
        );
        break;
      case 'Tekrarlı ölçümler ANOVA':
        imports.add('from itertools import combinations');
        imports.add('from statsmodels.stats.anova import AnovaRM');
        body.push(
          'k, n = len(kosullar), len(kosullar[0])',
          'uzun = pd.DataFrame({"denek": np.tile(np.arange(n), k), "kosul": np.repeat(np.arange(k), n), "deger": np.concatenate(kosullar)})',
          'tablo = AnovaRM(uzun, "deger", "denek", within=["kosul"]).fit().anova_table.iloc[0]',
          'M = np.vstack(kosullar)',
          'genel = M.mean()',
          'ss_kosul = n * ((M.mean(axis=1) - genel) ** 2).sum()',
          'ss_denek = k * ((M.mean(axis=0) - genel) ** 2).sum()',
          'ss_hata = ((M - genel) ** 2).sum() - ss_kosul - ss_denek',
          'kismi_eta2 = ss_kosul / (ss_kosul + ss_hata)',
          'F, p_deger = tablo["F Value"], tablo["Pr > F"]',
          ...printStat('F', 'p_deger', 'eta2_kismi', 'kismi_eta2', 'n', '{tablo["Num DF"]:.4f}, {tablo["Den DF"]:.4f}'),
          ...postHocBlock(r, 'kosul_adlari', 'paired-t', 'kosullar'),
        );
        break;
      default:
        throw new Error(`Kod üretimi desteklenmeyen test: ${o.test}`);
    }
  } else if (o.kind === 'xy') {
    body.push(
      `d = df[[${py(spec.x!)}, ${py(spec.y!)}]].apply(pd.to_numeric, errors="coerce").dropna()`,
      `x = d[${py(spec.x!)}].to_numpy(dtype=float)`,
      `y = d[${py(spec.y!)}].to_numpy(dtype=float)`,
      '',
    );
    if (r.assumptions.length) {
      body.push('# Normallik her değişken için ayrı sınanır', ...normBlock('x', 'x'), ...normBlock('y', 'y'), '');
    }
    body.push(`print("Test: ${o.test}")`);
    if (o.test === 'Pearson korelasyonu') {
      body.push('res = stats.pearsonr(x, y)', 'ci = res.confidence_interval(0.95)', 'p_deger = res.pvalue', ...printStat('res.statistic', 'p_deger', 'r', 'res.statistic', 'len(x)', '{len(x) - 2:.4f}', ['ci.low', 'ci.high']));
    } else {
      body.push(
        'res = stats.spearmanr(x, y)',
        'z = np.arctanh(res.statistic)',
        'se = 1 / np.sqrt(len(x) - 3)',
        'kritik = stats.norm.ppf(0.975)',
        'ci_alt, ci_ust = np.tanh(z - kritik * se), np.tanh(z + kritik * se)  # Fisher z',
        'p_deger = res.pvalue',
        ...printStat('res.statistic', 'p_deger', 'rho', 'res.statistic', 'len(x)', '{len(x) - 2:.4f}', ['ci_alt', 'ci_ust']),
      );
    }
  } else {
    const t = r.table!;
    body.push(
      `d = df[[${py(spec.rowVar!)}, ${py(spec.colVar!)}]].dropna()`,
      `d[${py(spec.rowVar!)}] = d[${py(spec.rowVar!)}].map(etiket)`,
      `d[${py(spec.colVar!)}] = d[${py(spec.colVar!)}].map(etiket)`,
      `tablo = pd.crosstab(d[${py(spec.rowVar!)}], d[${py(spec.colVar!)}]).reindex(index=${pyList(t.rowNames)}, columns=${pyList(t.colNames)}, fill_value=0).to_numpy()`,
      '',
      `print("Test: ${o.test}")`,
    );
    if (o.test === 'Fisher kesin testi') {
      body.push(
        'v = stats.contingency.association(tablo, method="cramer", correction=False)',
        'res = stats.fisher_exact(tablo, alternative="two-sided")',
        'p_deger = res.pvalue',
        ...printStat('res.statistic', 'p_deger', 'V', 'v', 'int(tablo.sum())'),
      );
    } else {
      body.push(
        'res = stats.chi2_contingency(tablo, correction=True)  # 2x2 tabloda Yates düzeltmesi',
        'v = stats.contingency.association(tablo, method="cramer", correction=False)',
        'p_deger = res.pvalue',
        ...printStat('res.statistic', 'p_deger', 'V', 'v', 'int(tablo.sum())', '{res.dof:.4f}'),
      );
    }
  }

  const code = [...head(), ...body].join('\n') + '\n';
  return { filename: 'analiz.py', code, expectedOutput: expectedLines(r), requirements: requirementsOf(code) };
}

/** Temizleme kodunun girdisi: uygulamanın yaptığı işlemle aynı kurallar ve sütun rolleri. */
export interface CleaningCodeOptions {
  /** Tüm sayısal sütunlar (sayıya çevrilir; çevrilemeyen değerler eksik sayılır). */
  numericColumns: string[];
  /** Sürekli, kimlik olmayan sayısal sütunlar: medyan ya da KNN ile doldurulur. */
  continuousColumns: string[];
  /** Sıralı ve kategorik, kimlik olmayan sütunlar: mod ile doldurulur. */
  modeColumns: string[];
  rules: CleanRule[];
  /** Kullanıcının doğruladığı geçerlilik kuralları (yalnızca kurallarda geçen sütunlar için gerekir). */
  validity: Record<string, { numeric: boolean; range?: { min: number; max: number }; categories?: string[] }>;
  impute: ImputeMethod;
  k?: number;
}

/** Veri temizleme kodu: kullanıcının seçtiği kurallar (eksik işaretle / satır sil) ve isteğe bağlı doldurma. Sonucu temizlenmis.csv dosyasına yazar. */
export function generateCleaningCode(file: DatasetFile, opts: CleaningCodeOptions): GeneratedCode {
  const imports = ['import numpy as np', 'import pandas as pd'];
  const L: string[] = ['# StatAdvisor AI tarafından üretildi. Veri dosyası betikle aynı klasörde olmalıdır.', ''];
  if (opts.impute === 'knn') {
    imports.push('from sklearn.impute import KNNImputer', 'from sklearn.preprocessing import StandardScaler');
  }
  L.push(...imports, '', naBlock, '', readCsvLine(file));
  L.push('', '# Sayısal sütunlar: sayıya çevrilemeyen değerler eksik sayılır');
  L.push(`SAYISAL = ${pyList(opts.numericColumns)}`, 'for s in SAYISAL:', '    df[s] = pd.to_numeric(df[s], errors="coerce")');
  if (opts.rules.length) {
    const ranges = Object.entries(opts.validity).filter(([, v]) => v.range);
    const cats = Object.entries(opts.validity).filter(([, v]) => v.categories?.length);
    L.push('', '# 1. Kullanıcının seçtiği kurallar. Hepsi özgün veri üzerinde değerlendirilir; hiçbiri diğerinin sonucunu etkilemez.');
    L.push('#    Geçerli aralık/kategoriler kullanıcı tarafından doğrulanmıştır; gözlenen min/maks değerlerden türetilmemiştir.');
    L.push(`GECERLI_ARALIK = {${ranges.map(([n, v]) => `${py(n)}: (${v.range!.min}, ${v.range!.max})`).join(', ')}}`);
    L.push(
      `GECERLI_KATEGORI = {${cats.map(([n, v]) => `${py(n)}: [${v.categories!.map((c) => (v.numeric ? String(Number(c)) : py(c))).join(', ')}]`).join(', ')}}`,
    );
    L.push('# (sütun, sorun, eylem): sorun = gecersiz | uc (Tukey 1.5 x IQR, incelenecek uç değer); eylem = eksik | satir');
    L.push('KURALLAR = [');
    for (const r of opts.rules) L.push(`    (${py(r.column)}, ${py(r.issue === 'invalid' ? 'gecersiz' : 'uc')}, ${py(r.action === 'setMissing' ? 'eksik' : 'satir')}),`);
    L.push(
      ']',
      'satir_sil = pd.Series(False, index=df.index)',
      'eksik_yap = {}',
      'for s, sorun, eylem in KURALLAR:',
      '    gecersiz = pd.Series(False, index=df.index)',
      '    if s in GECERLI_ARALIK:',
      '        alt, ust = GECERLI_ARALIK[s]',
      '        gecersiz = df[s].notna() & ((df[s] < alt) | (df[s] > ust))',
      '    elif s in GECERLI_KATEGORI:',
      '        gecersiz = df[s].notna() & ~df[s].isin(GECERLI_KATEGORI[s])',
      '    if sorun == "gecersiz":',
      '        m = gecersiz',
      '    else:  # Tukey sınırı geçersiz hücreler dışarıda bırakılarak hesaplanır',
      '        v = df[s][~gecersiz].dropna()',
      '        m = pd.Series(False, index=df.index)',
      '        if len(v) >= 4:',
      '            q1, q3 = v.quantile([0.25, 0.75])',
      '            iqr = q3 - q1',
      '            m = df[s].notna() & ~gecersiz & ((df[s] < q1 - 1.5 * iqr) | (df[s] > q3 + 1.5 * iqr))',
      '    if eylem == "satir":',
      '        satir_sil |= m',
      '    else:',
      '        eksik_yap[s] = eksik_yap[s] | m if s in eksik_yap else m',
      'for s, m in eksik_yap.items():',
      '    df.loc[m, s] = np.nan',
      'df = df[~satir_sil].reset_index(drop=True)  # silmeden önce işaretlenen hücrelerin geçerliliğini kontrol edin',
    );
  }
  if (opts.impute === 'median') {
    L.push(
      '',
      '# 2. Eksik değerler: sürekli sütunlarda medyan; sıralı ve kategorik sütunlarda mod',
      `for s in ${pyList(opts.continuousColumns)}:`,
      '    df[s] = df[s].fillna(df[s].median())',
      `for s in ${pyList(opts.modeColumns)}:`,
      '    if df[s].isna().any() and df[s].notna().any():',
      '        df[s] = df[s].fillna(df[s].mode().iloc[0])',
    );
  } else if (opts.impute === 'knn') {
    L.push(
      '',
      `# 2. Eksik değerler: sürekli sütunlarda KNN (k=${opts.k ?? 5}, standartlaştırılmış); sıralı ve kategorik sütunlarda mod`,
      `OZELLIK = ${pyList(opts.continuousColumns)}`,
      'if OZELLIK:',
      '    olcek = StandardScaler()',
      '    z = olcek.fit_transform(df[OZELLIK])',
      `    df[OZELLIK] = olcek.inverse_transform(KNNImputer(n_neighbors=${opts.k ?? 5}).fit_transform(z))`,
      `for s in ${pyList(opts.modeColumns)}:`,
      '    if df[s].isna().any() and df[s].notna().any():',
      '        df[s] = df[s].fillna(df[s].mode().iloc[0])',
    );
  }
  L.push('', 'df.to_csv("temizlenmis.csv", index=False)', 'print(f"Temizlenen veri: {len(df)} satır")');
  const code = L.join('\n') + '\n';
  return { filename: 'temizle.py', code, expectedOutput: [], requirements: requirementsOf(code) };
}

/** Ölçek puanı kodu: ters maddeleri çevirir, toplam/ortalama puanı ve Cronbach alfayı hesaplar; olcekli.csv'ye yazar. */
export function generateScalesCode(file: DatasetFile, defs: ScaleDef[], results: ScaleResult[]): GeneratedCode {
  const L: string[] = ['# StatAdvisor AI tarafından üretildi. Veri dosyası betikle aynı klasörde olmalıdır.', ''];
  L.push('import numpy as np', 'import pandas as pd', 'from scipy import stats', '', naBlock, '', readCsvLine(file), '');
  L.push('# Ölçekler: alt boyutlar araştırmacı tarafından tanımlanmıştır (ters maddeler: min + max - x)');
  L.push('SKALALAR = [');
  for (const d of defs) {
    L.push(`    {"ad": ${py(d.name.trim())}, "maddeler": ${pyList(d.items)}, "ters": ${pyList(d.reverse)}, "yontem": ${py(d.method)}, "min": ${d.min}, "max": ${d.max}, "gecerli_oran": ${d.minValidShare}},`);
  }
  L.push(']', 'for sk in SKALALAR:', '    k = len(sk["maddeler"])', '    for s in sk["maddeler"]:', '        df[s] = pd.to_numeric(df[s], errors="coerce")');
  L.push(
    '    m = df[sk["maddeler"]].copy()',
    '    for s in sk["ters"]:',
    '        m[s] = sk["min"] + sk["max"] - m[s]',
    '    gerekli = max(1, int(np.ceil(sk["gecerli_oran"] * k - 1e-9)))',
    '    puan = m.mean(axis=1)',
    '    if sk["yontem"] == "sum":',
    '        puan = puan * k  # yanıtlananların ortalaması x madde sayısı',
    '    puan = puan.where(m.notna().sum(axis=1) >= gerekli)',
    '    df[sk["ad"]] = puan',
    '    tam = m.dropna()  # alfa yalnızca tüm maddeleri yanıtlayanlarda',
    '    toplam_var = tam.sum(axis=1).var(ddof=1) if len(tam) >= 3 else float("nan")',
    '    alfa = k / (k - 1) * (1 - tam.var(ddof=1).sum() / toplam_var) if toplam_var > 0 else float("nan")',
    '    ort = puan.mean() if puan.notna().any() else float("nan")',
    '    print(f"Olcek [{sk[\'ad\']}] alfa: {alfa:.4f} n_alfa: {len(tam)}")',
    '    print(f"Olcek [{sk[\'ad\']}] ortalama: {ort:.4f} gecerli: {int(puan.notna().sum())}")',
    '    v = puan.dropna().to_numpy(dtype=float)',
    '    if len(v) >= 4 and v.std() > 0:  # puanın normalliği',
    '        u = np.sort(v)[np.floor(np.arange(5000) * len(v) / 5000).astype(int)] if len(v) > 5000 else v',
    '        w, p_sw = stats.shapiro(u)',
    '        print(f"Olcek [{sk[\'ad\']}] carpiklik: {stats.skew(v, bias=False):.3f} basiklik: {stats.kurtosis(v, bias=False):.3f} Shapiro-Wilk W: {w:.3f} p: {p_sw:.6f}")',
    '',
    'df.to_csv("olcekli.csv", index=False)',
  );
  const expected = results.flatMap((r) => [
    `Olcek [${r.name}] alfa: ${r.alpha === null ? 'nan' : fmt(r.alpha, 4)} n_alfa: ${r.nAlpha}`,
    `Olcek [${r.name}] ortalama: ${r.mean === null ? 'nan' : fmt(r.mean, 4)} gecerli: ${r.nValid}`,
    ...(r.skewness !== null && r.shapiroP !== null
      ? [`Olcek [${r.name}] carpiklik: ${fmt(r.skewness, 3)} basiklik: ${fmt(r.kurtosis ?? NaN, 3)} Shapiro-Wilk W: ${fmt(r.shapiroW!, 3)} p: ${fmt(r.shapiroP, 6)}`]
      : []),
  ]);
  const code = L.join('\n') + '\n';
  return { filename: 'olcek.py', code, expectedOutput: expected, requirements: requirementsOf(code) };
}

/** Anket yanıt taraması kodu: düz çizgi yanıtlar ve Mahalanobis D²; işaretli satırlar çıkarılıp taranmis.csv'ye yazılır. */
export function generateScreeningCode(file: DatasetFile, opts: ScreenOptions, r: ScreenResult): GeneratedCode {
  const alpha = opts.mahalanobisAlpha ?? 0.001;
  const L: string[] = ['# StatAdvisor AI tarafından üretildi. Veri dosyası betikle aynı klasörde olmalıdır.', ''];
  L.push('import numpy as np', 'import pandas as pd', 'from scipy import stats', '', naBlock, '', readCsvLine(file), '');
  L.push(`MADDELER = ${pyList(opts.items)}`, 'for s in MADDELER:', '    df[s] = pd.to_numeric(df[s], errors="coerce")', 'tam = df[MADDELER].dropna()  # yalnızca tüm maddeleri yanıtlayanlar taranır', 'isaretli = set()');
  if (opts.straightLine) {
    L.push('', '# Düz çizgi: tüm maddelere aynı yanıt', 'duz = tam.index[tam.nunique(axis=1) == 1]', 'isaretli |= set(duz)', 'print(f"Duz cizgi: {len(duz)}")');
  }
  if (opts.mahalanobis) {
    L.push(
      '',
      `# Mahalanobis D²: ki-kare (sd = madde sayısı), p < ${alpha} (Tabachnick ve Fidell, 2013)`,
      'X = tam.to_numpy(dtype=float)',
      'fark = X - X.mean(axis=0)',
      'S_ters = np.linalg.inv(np.cov(X, rowvar=False))',
      'd2 = np.einsum("ij,jk,ik->i", fark, S_ters, fark)',
      'p = stats.chi2.sf(d2, df=X.shape[1])',
      `mah = tam.index[p < ${alpha}]`,
      'isaretli |= set(mah)',
      'print(f"Mahalanobis: {len(mah)} en_buyuk_D2: {d2.max():.4f}")',
    );
  }
  L.push('', 'print(f"Cikarilan satir: {len(isaretli)}")', 'df = df.drop(index=sorted(isaretli)).reset_index(drop=True)', 'df.to_csv("taranmis.csv", index=False)');
  const expected: string[] = [];
  if (opts.straightLine) expected.push(`Duz cizgi: ${r.straightLiners.length}`);
  if (opts.mahalanobis) expected.push(`Mahalanobis: ${r.mahalanobis.length} en_buyuk_D2: ${fmt(r.maxD2 ?? NaN, 4)}`);
  expected.push(`Cikarilan satir: ${r.flagged.length}`);
  const code = L.join('\n') + '\n';
  return { filename: 'tarama.py', code, expectedOutput: expected, requirements: requirementsOf(code) };
}
