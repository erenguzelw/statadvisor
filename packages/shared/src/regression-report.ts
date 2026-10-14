/**
 * Regresyon sonuçlarının yorumu, uyarıları, APA metni, raporu ve Python karşılığı.
 *
 * Uyarı eşikleri (VIF 5/10, Cook 4/n, kaldıraç 2k/n, Durbin–Watson 1,5–2,5, gözlem/yordayıcı oranı) kesin bilimsel
 * sınırlar değil, yaygın başparmak kurallarıdır; metinde böyle belirtilir.
 */
import { requirementsOf, fmt, naBlock, readCsvLine, type DatasetFile, type GeneratedCode } from './codegen.ts';
import type { RegressionResult } from './regression.ts';
import { formatP, pText } from './stats.ts';

export interface RegressionSpec {
  dependent: string;
  /** Sayısal yordayıcılar (sırayla). */
  numeric: string[];
  /** Kategorik yordayıcılar (kukla kodlanır). */
  categorical: string[];
  alpha?: number;
  /** Kategorik yordayıcı başına referans düzey. */
  reference?: Record<string, string>;
  /** Sayısal kodlu kategorik sütunlar (ör. 1, 2, 3): betik düzey adını sayıdan üretir. */
  numericCategorical?: string[];
}

export type NoteLevel = 'info' | 'warning' | 'danger';
export interface RegressionNote {
  level: NoteLevel;
  /** Kısa başlık (ör. “Çoklu doğrusallık”). */
  title: string;
  text: string;
}

export interface RegressionNarrative {
  resultLine: string;
  apaSummary: string;
  /** Sade dille okuma notları. */
  interpretation: string[];
  notes: RegressionNote[];
  references: string[];
}

const REFERENCES = {
  ols: 'Cohen, J., Cohen, P., West, S. G., & Aiken, L. S. (2003). Applied multiple regression/correlation analysis for the behavioral sciences (3rd ed.). Routledge.',
  vif: 'Belsley, D. A., Kuh, E., & Welsch, R. E. (1980). Regression diagnostics: Identifying influential data and sources of collinearity. Wiley.',
  bp: 'Koenker, R. (1981). A note on studentizing a test for heteroscedasticity. Journal of Econometrics, 17(1), 107–112.',
  cook: 'Cook, R. D. (1977). Detection of influential observation in linear regression. Technometrics, 19(1), 15–18.',
  dw: 'Durbin, J., & Watson, G. S. (1951). Testing for serial correlation in least squares regression. II. Biometrika, 38(1–2), 159–177.',
  shapiro: 'Royston, P. (1995). Remark AS R94: A remark on algorithm AS 181: The W-test for normality. Applied Statistics, 44(4), 547–551.',
  sm: 'Seabold, S., & Perktold, J. (2010). Statsmodels: Econometric and statistical modeling with Python. Proceedings of the 9th Python in Science Conference, 92–96.',
};

const num = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '–');
/** APA: baştaki sıfırsız (|değer| ≤ 1 olan β, R² gibi büyüklükler). */
const noZero = (x: number, d = 2) => num(x, d).replace(/^(-?)0\./, '$1.');

export function narrateRegression(r: RegressionResult, dependent: string): RegressionNarrative {
  const a = r.alpha;
  const dg = r.diagnostics;
  const predictors = r.coefficients.slice(1);
  const modelSig = r.pF < a;
  const fText = `F(${r.dfModel}, ${r.dfResid}) = ${num(r.F)}, ${pText(r.pF)}`;
  const resultLine = `${fText}, R² = ${noZero(r.r2)}, düzeltilmiş R² = ${noZero(r.adjR2)}, N = ${r.n}`;

  const sig = predictors.filter((c) => c.p < a);
  const coefText = (c: (typeof predictors)[number]) =>
    `${c.term} (b = ${num(c.b)}, SH = ${num(c.se)}, β = ${noZero(c.beta ?? NaN)}, t(${r.dfResid}) = ${num(c.t)}, ${pText(c.p)}, %${Math.round((1 - a) * 100)} GA [${num(c.ciLow)}, ${num(c.ciHigh)}])`;
  const apaModel = `${predictors.length > 1 ? 'Çoklu' : 'Basit'} doğrusal regresyon modeli ${dependent} değişkenini ${modelSig ? 'anlamlı biçimde yordadı' : 'anlamlı biçimde yordamadı'}, ${resultLine}. Model, ${dependent} varyansının %${num(r.r2 * 100, 1)}'ini açıkladı.`;
  const apaCoefs = sig.length
    ? ` Anlamlı yordayıcılar: ${sig.map(coefText).join('; ')}.`
    : predictors.length
      ? ' Hiçbir yordayıcı tek başına anlamlı bulunmadı.'
      : '';
  const apaSummary = apaModel + apaCoefs;

  const interpretation: string[] = [];
  interpretation.push(
    modelSig
      ? `Model bir bütün olarak anlamlı (${fText}): yordayıcılar birlikte ${dependent} değişkenindeki değişimin bir kısmını açıklıyor. Açıklanan oran R² = ${noZero(r.r2)} (düzeltilmiş: ${noZero(r.adjR2)}).`
      : `Model bir bütün olarak anlamlı değil (${fText}): bu veride yordayıcılar birlikte ${dependent} değişkenini, şansla açıklanabilecek düzeyin ötesinde açıklamıyor.`,
  );
  for (const c of predictors) {
    const per = c.level !== undefined ? `“${c.predictor}” değişkeninde “${c.level}” düzeyi, referans düzeye (“${r.categories.find((x) => x.name === c.predictor)?.reference}”) göre` : `${c.term} bir birim arttığında, diğer yordayıcılar sabitken,`;
    const dir = c.b >= 0 ? 'artış' : 'azalış';
    interpretation.push(`${per} ${dependent} ortalamada ${num(Math.abs(c.b))} birim ${dir} gösteriyor (${c.p < a ? 'anlamlı' : 'anlamlı değil'}; ${pText(c.p)}, %${Math.round((1 - a) * 100)} GA [${num(c.ciLow)}, ${num(c.ciHigh)}]).`);
  }
  interpretation.push('Bu sonuçlar ilişkiyi tanımlar; tek başına nedensellik göstermez.');

  const notes: RegressionNote[] = [];
  if (r.droppedRows > 0) {
    notes.push({ level: 'info', title: 'Eksik değer', text: `${r.droppedRows} satır, model değişkenlerinden en az birinde eksik değer olduğu için çıkarıldı (liste bazlı silme); model ${r.n} gözlemle kuruldu. Eksiklik rastgele değilse tahminler yanlı olabilir.` });
  }
  const ratio = r.n / Math.max(1, r.k - 1);
  if (ratio < 10) {
    notes.push({ level: 'warning', title: 'Örneklem küçük', text: `Yordayıcı terim başına ${num(ratio, 1)} gözlem düşüyor. Yaygın başparmak kuralı terim başına en az 10–20 gözlemdir; daha azında katsayılar kararsız ve R² şişkin olabilir.` });
  }
  if (Number.isFinite(dg.maxVif) && dg.maxVif >= 5) {
    const bad = predictors.filter((c) => (c.vif ?? 0) >= 5).map((c) => `${c.term} (VIF = ${num(c.vif ?? NaN, 1)})`);
    notes.push({
      level: dg.maxVif >= 10 ? 'danger' : 'warning',
      title: 'Çoklu doğrusallık',
      text: `${bad.join(', ')}. VIF için 5 ve 10 başparmak eşikleridir; yordayıcılar birbirini büyük ölçüde açıklıyor, bu yüzden tek tek katsayılar ve standart hataları güvenilmez olabilir. Birbirine çok benzeyen değişkenlerden birini çıkarmayı ya da birleştirmeyi düşünün.`,
    });
  }
  if (Number.isFinite(dg.breuschPagan.p) && dg.breuschPagan.p < a) {
    notes.push({ level: 'warning', title: 'Değişen varyans', text: `Breusch–Pagan testi anlamlı (LM = ${num(dg.breuschPagan.lm)}, ${pText(dg.breuschPagan.p)}): kalıntıların yayılımı yordayıcılara göre değişiyor. Bu durumda standart hatalar, p değerleri ve güven aralıkları yanlı olabilir; dayanıklı (HC) standart hata ya da bağımlı değişkene dönüşüm düşünün. (Bu sürüm yalnızca klasik standart hataları hesaplar.)` });
  }
  if (dg.shapiro && dg.shapiro.p < a) {
    notes.push({ level: 'info', title: 'Kalıntı normalliği', text: `Kalıntıların normalliği reddedildi (Shapiro–Wilk W = ${num(dg.shapiro.W, 3)}, ${pText(dg.shapiro.p)}). Büyük örneklemde (n ≈ ${r.n}) küçük sapmalar da anlamlı çıkar ve katsayı çıkarımı bundan çok etkilenmez; kalıntı histogramına ve uç değerlere bakın. Küçük örneklemde ciddiye alın.` });
  }
  if (dg.durbinWatson < 1.5 || dg.durbinWatson > 2.5) {
    notes.push({ level: 'info', title: 'Ardışık ilişki', text: `Durbin–Watson = ${num(dg.durbinWatson)} (2 civarı ardışık ilişki yok demektir; 1,5–2,5 dışı başparmak kuralıdır). Satır sırası zamanı ya da bir sıralamayı gösteriyorsa kalıntılar ardışık ilişkili olabilir; satır sırasının anlamı yoksa dikkate almayın.` });
  }
  if (dg.cooks.flagged.length > 0) {
    notes.push({ level: 'warning', title: 'Etkili gözlemler', text: `${dg.cooks.flagged.length} gözlemin Cook uzaklığı 4/n = ${num(dg.cooks.threshold, 3)} başparmak eşiğini aşıyor (en büyüğü ${num(dg.cooks.max, 3)}, veri satırı ${dg.cooks.maxIndex + 1}). Bu gözlemler katsayıları fazla etkiliyor olabilir; hatalı girilmiş mi diye bakın, ama yalnızca uç diye silmeyin. Modeli bu gözlemlerle ve onlarsız karşılaştırın.` });
  }
  if (dg.leverage.flagged.length > 0) {
    notes.push({ level: 'info', title: 'Yüksek kaldıraç', text: `${dg.leverage.flagged.length} gözlemin kaldıracı 2k/n = ${num(dg.leverage.threshold, 3)} eşiğini aşıyor (yordayıcı uzayında uçta yer alıyorlar).` });
  }
  const small = r.categories.filter((c) => c.levels.length > 12).map((c) => `“${c.name}” (${c.levels.length} düzey)`);
  if (small.length) notes.push({ level: 'warning', title: 'Çok düzeyli kategori', text: `${small.join(', ')} çok sayıda kukla değişken üretiyor; her düzeyin gözlem sayısını ve bu sütunun gerçekten kategorik olup olmadığını kontrol edin.` });

  return {
    resultLine,
    apaSummary,
    interpretation,
    notes,
    references: [REFERENCES.ols, REFERENCES.vif, REFERENCES.bp, REFERENCES.cook, REFERENCES.dw, REFERENCES.shapiro, REFERENCES.sm],
  };
}

/** Katsayı tablosu (rapor ve arayüz için ortak satırlar). */
export function coefficientRows(r: RegressionResult): { header: string[]; rows: string[][] } {
  const ci = `%${Math.round((1 - r.alpha) * 100)} GA`;
  return {
    header: ['Terim', 'b', 'SH', 'β', 't', 'p', `${ci} alt`, `${ci} üst`, 'VIF'],
    rows: r.coefficients.map((c) => [c.term, num(c.b, 3), num(c.se, 3), c.beta === undefined ? '–' : noZero(c.beta, 3), num(c.t, 2), formatP(c.p, true), num(c.ciLow, 3), num(c.ciHigh, 3), c.vif === undefined ? '–' : num(c.vif, 2)],
    ),
  };
}

export function modelRows(r: RegressionResult): [string, string][] {
  const dg = r.diagnostics;
  return [
    ['Gözlem sayısı (n)', String(r.n)],
    ['Çıkarılan satır (eksik değer)', String(r.droppedRows)],
    ['R² / düzeltilmiş R²', `${noZero(r.r2, 3)} / ${noZero(r.adjR2, 3)}`],
    [`F(${r.dfModel}, ${r.dfResid})`, `${num(r.F, 2)}, ${pText(r.pF)}`],
    ['Kalıntı standart hatası', num(r.sigma, 3)],
    ['AIC / BIC', `${num(r.aic, 1)} / ${num(r.bic, 1)}`],
    ['Kalıntı normalliği (Shapiro–Wilk)', dg.shapiro ? `W = ${num(dg.shapiro.W, 3)}, ${pText(dg.shapiro.p)}` : '–'],
    ['Değişen varyans (Breusch–Pagan)', `LM = ${num(dg.breuschPagan.lm, 2)}, ${pText(dg.breuschPagan.p)}`],
    ['Durbin–Watson', num(dg.durbinWatson, 2)],
    ['En büyük Cook uzaklığı', `${num(dg.cooks.max, 3)} (eşik 4/n = ${num(dg.cooks.threshold, 3)})`],
    ['En büyük VIF', num(dg.maxVif, 2)],
  ];
}

/** Konsola yazdırılacak satırlar: üretilen Python betiği bunlarla birebir aynı çıktıyı verir. */
export function regressionExpectedOutput(r: RegressionResult): string[] {
  const dg = r.diagnostics;
  const lines = [
    `n: ${r.n}`,
    `R2: ${fmt(r.r2, 4)} duzeltilmis R2: ${fmt(r.adjR2, 4)}`,
    `F(${r.dfModel}, ${r.dfResid}): ${fmt(r.F, 4)} p: ${fmt(r.pF, 6)}`,
  ];
  for (const c of r.coefficients) {
    lines.push(`${c.term}: b = ${fmt(c.b, 4)} SH = ${fmt(c.se, 4)} t = ${fmt(c.t, 4)} p = ${fmt(c.p, 6)} GA = [${fmt(c.ciLow, 4)}, ${fmt(c.ciHigh, 4)}]${c.beta === undefined ? '' : ` beta = ${fmt(c.beta, 4)} VIF = ${fmt(c.vif ?? NaN, 4)}`}`);
  }
  lines.push(
    `Shapiro-Wilk (kalintilar) W: ${fmt(dg.shapiro?.W ?? NaN, 4)} p: ${fmt(dg.shapiro?.p ?? NaN, 6)}`,
    `Breusch-Pagan LM: ${fmt(dg.breuschPagan.lm, 4)} p: ${fmt(dg.breuschPagan.p, 6)}`,
    `Durbin-Watson: ${fmt(dg.durbinWatson, 4)}`,
    `Cook uzakligi (en buyuk): ${fmt(dg.cooks.max, 4)}`,
  );
  return lines;
}

const py = (s: string) => JSON.stringify(s);
const pyList = (xs: string[]) => `[${xs.map(py).join(', ')}]`;

/** statsmodels ile aynı modeli kuran Python betiği. */
export function generateRegressionCode(file: DatasetFile, spec: RegressionSpec, r: RegressionResult): GeneratedCode {
  const alpha = spec.alpha ?? 0.05;
  const numCat = new Set(spec.numericCategorical ?? []);
  const levels = Object.fromEntries(r.categories.map((c) => [c.name, c.levels]));
  const refs = Object.fromEntries(r.categories.map((c) => [c.name, c.reference]));
  const dictLit = (m: Record<string, string[] | string>) =>
    `{${Object.entries(m)
      .map(([k, v]) => `${py(k)}: ${Array.isArray(v) ? pyList(v) : py(v)}`)
      .join(', ')}}`;
  const lines: string[] = [
    '# StatAdvisor AI tarafından üretildi. Veri dosyası betikle aynı klasörde olmalıdır.',
    '',
    'import numpy as np',
    'import pandas as pd',
    'import statsmodels.api as sm',
    'from scipy import stats',
    'from statsmodels.stats.diagnostic import het_breuschpagan',
    'from statsmodels.stats.outliers_influence import variance_inflation_factor',
    'from statsmodels.stats.stattools import durbin_watson',
    '',
    naBlock,
    `ALPHA = ${alpha}`,
    '',
    readCsvLine(file),
    '',
    `BAGIMLI = ${py(spec.dependent)}`,
    `SAYISAL = ${pyList(spec.numeric)}`,
    `KATEGORIK = ${pyList(spec.categorical)}`,
  ];
  if (spec.categorical.length) {
    lines.push(
      `DUZEYLER = ${dictLit(levels)}  # kukla kodlamada kullanılan düzeyler (sıralı)`,
      `REFERANS = ${dictLit(refs)}  # referans düzey: kukla değişkeni olmayan düzey`,
      '',
      'def etiket(v):',
      '    # sayısal kodlu kategorilerde 1.0 yerine 1 yazılır (uygulamayla aynı düzey adı)',
      '    if isinstance(v, (int, float, np.integer, np.floating)):',
      '        return str(int(v)) if float(v).is_integer() else repr(float(v))',
      '    return str(v)',
    );
  }
  lines.push(
    '',
    'd = df[[BAGIMLI] + SAYISAL + KATEGORIK].copy()',
    'for s in [BAGIMLI] + SAYISAL:',
    '    d[s] = pd.to_numeric(d[s], errors="coerce")',
  );
  const numCats = spec.categorical.filter((c) => numCat.has(c));
  if (numCats.length) lines.push(`for s in ${pyList(numCats)}:`, '    d[s] = pd.to_numeric(d[s], errors="coerce")');
  lines.push('d = d.dropna()  # eksik değeri olan satırlar çıkarılır (liste bazlı silme)', 'y = d[BAGIMLI].to_numpy(dtype=float)', 'X = pd.DataFrame({"Sabit": np.ones(len(d))}, index=d.index)', 'for s in SAYISAL:', '    X[s] = d[s].astype(float)');
  if (spec.categorical.length) {
    lines.push(
      'for s in KATEGORIK:',
      '    etiketler = d[s].map(etiket)',
      '    for duzey in DUZEYLER[s]:',
      '        if duzey != REFERANS[s]:',
      '            X[f"{s}[{duzey}]"] = (etiketler == duzey).astype(float)',
    );
  }
  lines.push(
    '',
    'model = sm.OLS(y, X.to_numpy(dtype=float)).fit()',
    'terimler = list(X.columns)',
    'ci = model.conf_int(ALPHA)',
    'kalintilar = model.resid',
    'influence = model.get_influence()',
    'sd_y = np.std(y, ddof=1)',
    '',
    'print(f"n: {int(model.nobs)}")',
    'print(f"R2: {model.rsquared:.4f} duzeltilmis R2: {model.rsquared_adj:.4f}")',
    'print(f"F({int(model.df_model)}, {int(model.df_resid)}): {model.fvalue:.4f} p: {model.f_pvalue:.6f}")',
    'for j, ad in enumerate(terimler):',
    '    satir = f"{ad}: b = {model.params[j]:.4f} SH = {model.bse[j]:.4f} t = {model.tvalues[j]:.4f} p = {model.pvalues[j]:.6f} GA = [{ci[j, 0]:.4f}, {ci[j, 1]:.4f}]"',
    '    if j > 0:',
    '        beta = model.params[j] * X.iloc[:, j].std(ddof=1) / sd_y',
    '        vif = variance_inflation_factor(X.to_numpy(dtype=float), j)',
    '        satir += f" beta = {beta:.4f} VIF = {vif:.4f}"',
    '    print(satir)',
    'if len(kalintilar) > 5000:  # Shapiro-Wilk en fazla 5000 gözlemle çalışır',
    '    kalintilar = np.sort(kalintilar)[np.floor(np.arange(5000) * len(kalintilar) / 5000).astype(int)]',
    'w, p_sw = stats.shapiro(kalintilar)',
    'print(f"Shapiro-Wilk (kalintilar) W: {w:.4f} p: {p_sw:.6f}")',
    'lm, p_bp, _, _ = het_breuschpagan(model.resid, X.to_numpy(dtype=float))',
    'print(f"Breusch-Pagan LM: {lm:.4f} p: {p_bp:.6f}")',
    'print(f"Durbin-Watson: {durbin_watson(model.resid):.4f}")',
    'print(f"Cook uzakligi (en buyuk): {influence.cooks_distance[0].max():.4f}")',
  );
  const code = lines.join('\n') + '\n';
  return { filename: 'regresyon.py', code, expectedOutput: regressionExpectedOutput(r), requirements: requirementsOf(code) };
}

/** Rapora yazılan düz veri. */
export const LINEAR_COEFFICIENT_NOTE = 'b: düzeltilmemiş katsayı; SH: standart hata; β: standartlaştırılmış katsayı; VIF: varyans şişirme çarpanı.';

export interface RegressionReportData {
  title: string;
  datasetName: string;
  date: string;
  dependent: string;
  predictors: string[];
  model: [string, string][];
  coefficients: { header: string[]; rows: string[][] };
  /** Katsayı tablosunun altındaki açıklama (verilmezse doğrusal regresyon açıklaması). */
  coefficientNote?: string;
  /** Katsayılardan sonra eklenen ek tablolar (ör. sınıflandırma tablosu). */
  extraTables?: { title: string; header: string[]; rows: string[][] }[];
  narrative: RegressionNarrative;
  audit?: [string, string][];
}

export function regressionReportData(r: RegressionResult, spec: RegressionSpec, datasetName: string, date: string, audit?: [string, string][]): RegressionReportData {
  return {
    title: 'Doğrusal regresyon raporu',
    datasetName,
    date,
    dependent: spec.dependent,
    predictors: [...spec.numeric, ...spec.categorical],
    model: modelRows(r),
    coefficients: coefficientRows(r),
    narrative: narrateRegression(r, spec.dependent),
    audit,
  };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const style = `body{font-family:Georgia,'Times New Roman',serif;max-width:44rem;margin:2.5rem auto;padding:0 1.25rem;line-height:1.65;color:#111}
h1{font-size:1.6rem;margin-bottom:.25rem}h2{font-size:1.15rem;margin-top:2rem;border-bottom:1px solid #bbb;padding-bottom:.25rem}
table{border-collapse:collapse;width:100%;margin:.75rem 0;font-size:.9rem}th,td{border:1px solid #bbb;padding:.3rem .5rem;text-align:left}
th{background:#f2f2f2}td.n{text-align:right;font-variant-numeric:tabular-nums}.muted{color:#555;font-size:.9rem}
.warn{background:#fff7e0;border-left:4px solid #c98a00;padding:.5rem .8rem;margin:.4rem 0}.bad{background:#fde8e8;border-left-color:#b91c1c}.info{background:#eef3fb;border-left-color:#3b6fb5}
li{margin:.3rem 0}@media print{body{margin:0}section{break-inside:avoid}}`;
const tbl = (header: string[], cells: string[][]) =>
  `<table><thead><tr>${header.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${cells.map((r) => `<tr>${r.map((c, i) => `<td${i > 0 ? ' class="n"' : ''}>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;

export function buildRegressionReport(d: RegressionReportData): string {
  const notes = d.narrative.notes.map((n) => `<p class="warn ${n.level === 'danger' ? 'bad' : n.level === 'info' ? 'info' : ''}"><strong>${esc(n.title)}.</strong> ${esc(n.text)}</p>`).join('');
  const body = `<h1>${esc(d.title)}</h1>
<p class="muted">${esc(d.datasetName)} · ${esc(d.date)} · StatAdvisor AI</p>
<p>Bağımlı değişken: <strong>${esc(d.dependent)}</strong>. Yordayıcılar: ${d.predictors.map((p) => `<strong>${esc(p)}</strong>`).join(', ')}.</p>
<section data-section="model"><h2>Model özeti</h2>${tbl(['Ölçüt', 'Değer'], d.model)}</section>
<section data-section="coef"><h2>Katsayılar</h2>${tbl(d.coefficients.header, d.coefficients.rows)}<p class="muted">${esc(d.coefficientNote ?? LINEAR_COEFFICIENT_NOTE)}</p>${(d.extraTables ?? []).map((t) => `<p class="muted">${esc(t.title)}</p>${tbl(t.header, t.rows)}`).join('')}</section>
<section data-section="notes"><h2>Tanılar ve uyarılar</h2>${notes || '<p class="muted">Uyarı yok.</p>'}</section>
<section data-section="read"><h2>Nasıl okunur</h2><ul>${d.narrative.interpretation.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></section>
<section data-section="apa"><h2>APA 7 stilinde özet</h2><p>${esc(d.narrative.apaSummary)}</p></section>
<section data-section="refs"><h2>Kaynakça</h2><ul>${d.narrative.references.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></section>
${d.audit ? `<section data-section="audit"><h2>Denetim izi</h2>${tbl(['Öğe', 'Değer'], d.audit)}</section>` : ''}
<p class="muted">Bu rapor bir karar destek aracı tarafından üretilmiştir; yöntem seçiminin ve yorumun sorumluluğu araştırmacıya aittir.</p>`;
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${esc(d.title)}</title><style>${style}</style></head><body>${body}</body></html>`;
}
