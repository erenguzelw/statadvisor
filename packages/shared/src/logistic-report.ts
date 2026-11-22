/**
 * Lojistik regresyon sonuçlarının yorumu, uyarıları, APA metni, raporu ve Python karşılığı.
 * Eşikler (EPV 10, VIF 5/10, HL α) başparmak kurallarıdır; metinde böyle belirtilir.
 */
import { requirementsOf, fmt, naBlock, readCsvLine, type DatasetFile, type GeneratedCode } from './codegen.ts';
import type { LogisticResult } from './logistic.ts';
import type { RegressionNarrative, RegressionNote, RegressionReportData, RegressionSpec } from './regression-report.ts';
import { formatP, pText } from './stats.ts';

export interface LogisticSpec extends RegressionSpec {
  /** Olay düzeyi (1 olarak kodlanan sonuç). */
  eventLevel: string;
}

const REFERENCES = {
  logit: 'Hosmer, D. W., Lemeshow, S., & Sturdivant, R. X. (2013). Applied logistic regression (3rd ed.). Wiley.',
  epv: 'Peduzzi, P., Concato, J., Kemper, E., Holford, T. R., & Feinstein, A. R. (1996). A simulation study of the number of events per variable in logistic regression analysis. Journal of Clinical Epidemiology, 49(12), 1373–1379.',
  nagelkerke: 'Nagelkerke, N. J. D. (1991). A note on a general definition of the coefficient of determination. Biometrika, 78(3), 691–692.',
  mcfadden: 'McFadden, D. (1974). Conditional logit analysis of qualitative choice behavior. In P. Zarembka (Ed.), Frontiers in econometrics (pp. 105–142). Academic Press.',
  separation: 'Albert, A., & Anderson, J. A. (1984). On the existence of maximum likelihood estimates in logistic regression models. Biometrika, 71(1), 1–10.',
  sm: 'Seabold, S., & Perktold, J. (2010). Statsmodels: Econometric and statistical modeling with Python. Proceedings of the 9th Python in Science Conference, 92–96.',
};

const num = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '–');
const noZero = (x: number, d = 2) => num(x, d).replace(/^(-?)0\./, '$1.');
const pct = (x: number, d = 1) => (Number.isFinite(x) ? `%${(x * 100).toFixed(d)}` : '–');

export function narrateLogistic(r: LogisticResult, dependent: string): RegressionNarrative {
  const a = r.alpha;
  const preds = r.coefficients.slice(1);
  const modelSig = r.lrP < a;
  const lrText = `χ²(${r.lrDf}, N = ${r.n}) = ${num(r.lrChi2)}, ${pText(r.lrP)}`;
  const resultLine = `${lrText}, Nagelkerke R² = ${noZero(r.nagelkerke)}, McFadden R² = ${noZero(r.mcFadden)}, AUC = ${noZero(r.auc)}`;
  const ev = `${dependent} = ${r.eventLevel}`;

  const sig = preds.filter((c) => c.p < a);
  const coefText = (c: (typeof preds)[number]) => `${c.term} (OR = ${num(c.or)}, %${Math.round((1 - a) * 100)} GA [${num(c.orLow)}, ${num(c.orHigh)}], b = ${num(c.b)}, SH = ${num(c.se)}, z = ${num(c.z)}, ${pText(c.p)})`;
  const apaSummary =
    `Lojistik regresyon modeli ${ev} olasılığını ${modelSig ? 'anlamlı biçimde yordadı' : 'anlamlı biçimde yordamadı'}, ${resultLine}. Model gözlemlerin ${pct(r.classification.accuracy)}'ini doğru sınıflandırdı (çoğunluk sınıfı tabanı ${pct(r.classification.baseline)}).` +
    (sig.length ? ` Anlamlı yordayıcılar: ${sig.map(coefText).join('; ')}.` : preds.length ? ' Hiçbir yordayıcı tek başına anlamlı bulunmadı.' : '');

  const interpretation: string[] = [];
  interpretation.push(
    modelSig
      ? `Model bir bütün olarak anlamlı (${lrText}): yordayıcılar birlikte ${ev} olasılığını yalnızca sabit terimli modelden daha iyi açıklıyor. Nagelkerke R² = ${noZero(r.nagelkerke)} (McFadden R² = ${noZero(r.mcFadden)}; bunlar doğrusal regresyondaki R² gibi “açıklanan varyans yüzdesi” değildir).`
      : `Model bir bütün olarak anlamlı değil (${lrText}): bu veride yordayıcılar ${ev} olasılığını, yalnızca sabit terimli modelden anlamlı biçimde daha iyi açıklamıyor.`,
  );
  for (const c of preds) {
    const sub = c.level !== undefined ? `“${c.predictor}” değişkeninde “${c.level}” düzeyinin, referans düzeye (“${r.categories.find((x) => x.name === c.predictor)?.reference}”) göre` : `${c.term} bir birim arttığında, diğer yordayıcılar sabitken,`;
    const change = c.or >= 1 ? `${ev} odds'u ${num(c.or)} kat (%${num((c.or - 1) * 100, 0)} artış)` : `${ev} odds'u ${num(c.or)} kat (%${num((1 - c.or) * 100, 0)} azalış)`;
    interpretation.push(`${sub} ${change} (OR = ${num(c.or)}, %${Math.round((1 - a) * 100)} GA [${num(c.orLow)}, ${num(c.orHigh)}]; ${c.p < a ? 'anlamlı' : 'anlamlı değil'}, ${pText(c.p)}).`);
  }
  interpretation.push("Olasılık oranı (OR), odds'un (olay / olay-değil oranı) değişimidir; olasılığın kendisinin değişimi değildir. Sonuçlar ilişkiyi tanımlar, nedensellik göstermez.");
  interpretation.push(`Ayırt etme gücü: AUC = ${noZero(r.auc)} (0,5 = şans, 1 = kusursuz). Eşik ${r.classification.threshold} için duyarlılık ${pct(r.classification.sensitivity)}, seçicilik ${pct(r.classification.specificity)}.`);

  const notes: RegressionNote[] = [];
  if (r.separation === 'complete') {
    notes.push({ level: 'danger', title: 'Tam ayrışma', text: `Model her gözlemi doğru sınıfa yerleştiriyor: yordayıcılar sonucu kusursuz ayırıyor. Bu durumda en çok olabilirlik katsayıları sonsuza gider; gösterilen katsayı, OR ve p değerleri anlamsızdır, yorumlamayın. Nedenler: sonucun kendisinden türetilmiş bir yordayıcı (veri sızıntısı), çok az gözlem ya da çok fazla yordayıcı. Yordayıcıyı çıkarın, kategorileri birleştirin ya da ceza/Firth lojistik regresyonu düşünün (bu sürümde yok). Python karşılığı bu yüzden üretilmedi.` });
  } else if (r.separation === 'possible' || !r.converged) {
    notes.push({ level: 'danger', title: 'Yakınsama sorunu / olası ayrışma', text: `Tahmin ${r.converged ? 'çok büyük katsayılar ya da standart hatalar üretti' : `${r.iterations} yinelemede yakınsamadı`}. Bu genellikle (yarı) ayrışma, aşırı küçük bir hücre ya da çok yüksek çoklu doğrusallığın işaretidir; katsayılar güvenilmez olabilir.` });
  }
  if (r.epv < 10) {
    notes.push({ level: r.epv < 5 ? 'danger' : 'warning', title: 'Olay sayısı az', text: `Yordayıcı terim başına ${num(r.epv, 1)} olay düşüyor (az olan sınıf: ${Math.min(r.events, r.nonEvents)}). Yaygın başparmak kuralı terim başına en az 10 olaydır (Peduzzi ve ark., 1996); daha azında katsayılar yanlı, güven aralıkları dar ve model aşırı uyumlu olabilir. Daha az yordayıcı kullanın ya da daha çok veri toplayın.` });
  }
  if (Number.isFinite(r.maxVif) && r.maxVif >= 5) {
    const bad = preds.filter((c) => (c.vif ?? 0) >= 5).map((c) => `${c.term} (VIF = ${num(c.vif ?? NaN, 1)})`);
    notes.push({ level: r.maxVif >= 10 ? 'danger' : 'warning', title: 'Çoklu doğrusallık', text: `${bad.join(', ')}. VIF 5 ve 10 başparmak eşikleridir; yordayıcılar birbirini büyük ölçüde açıklıyor, tek tek OR değerleri ve güven aralıkları kararsız olabilir.` });
  }
  if (r.hosmerLemeshow && r.hosmerLemeshow.p < a) {
    notes.push({ level: 'warning', title: 'Kalibrasyon', text: `Hosmer–Lemeshow testi anlamlı (χ²(${r.hosmerLemeshow.df}) = ${num(r.hosmerLemeshow.chi2)}, ${pText(r.hosmerLemeshow.p)}): yordanan olasılıklar gözlenen oranlarla iyi örtüşmüyor olabilir. Bu test büyük örneklemde küçük sapmaları da yakalar ve grup sayısı seçimine duyarlıdır; gruplara göre gözlenen/beklenen tablosuna bakın.` });
  } else if (r.hosmerLemeshow === null) {
    notes.push({ level: 'info', title: 'Hosmer–Lemeshow hesaplanamadı', text: 'Yordanan olasılıklar yeterince farklı değer almadığı için gruplar oluşturulamadı.' });
  }
  const c = r.classification;
  if (c.accuracy <= c.baseline + 0.01) {
    notes.push({ level: 'info', title: 'Doğruluk tabanı aşılmıyor', text: `Doğruluk (${pct(c.accuracy)}), her gözlemi çoğunluk sınıfına atayan basit kuralın doğruluğundan (${pct(c.baseline)}) anlamlı biçimde iyi değil. Sınıflar dengesizse doğruluk yanıltıcıdır; AUC, duyarlılık ve seçiciliğe birlikte bakın.` });
  }
  const minShare = Math.min(r.events, r.nonEvents) / r.n;
  if (minShare < 0.1) {
    notes.push({ level: 'info', title: 'Sınıflar dengesiz', text: `Az olan sınıf gözlemlerin yalnızca ${pct(minShare)}'i. 0,5 eşiği bu durumda duyarlılığı düşürür; eşik seçimi amaca bağlıdır (bu sürüm 0,5 ile raporlar).` });
  }
  if (r.droppedRows > 0) {
    notes.push({ level: 'info', title: 'Eksik değer', text: `${r.droppedRows} satır, model değişkenlerinden en az birinde eksik değer olduğu için çıkarıldı (liste bazlı silme); model ${r.n} gözlemle kuruldu. Eksiklik rastgele değilse tahminler yanlı olabilir.` });
  }
  const many = r.categories.filter((x) => x.levels.length > 12).map((x) => `“${x.name}” (${x.levels.length} düzey)`);
  if (many.length) notes.push({ level: 'warning', title: 'Çok düzeyli kategori', text: `${many.join(', ')} çok sayıda kukla değişken üretiyor; olay sayısı terim başına hızla düşer.` });

  return {
    resultLine,
    apaSummary,
    interpretation,
    notes,
    references: [REFERENCES.logit, REFERENCES.epv, REFERENCES.nagelkerke, REFERENCES.mcfadden, REFERENCES.separation, REFERENCES.sm],
  };
}

/** Katsayı tablosu: b, SH, z, p, OR ve OR güven aralığı. */
export function logitCoefficientRows(r: LogisticResult): { header: string[]; rows: string[][] } {
  const ci = `%${Math.round((1 - r.alpha) * 100)} GA`;
  return {
    header: ['Terim', 'b', 'SH', 'z', 'p', 'OR', `OR ${ci} alt`, `OR ${ci} üst`, 'VIF'],
    rows: r.coefficients.map((c) => [c.term, num(c.b, 3), num(c.se, 3), num(c.z, 2), formatP(c.p, true), num(c.or, 3), num(c.orLow, 3), num(c.orHigh, 3), c.vif === undefined ? '–' : num(c.vif, 2)]),
  };
}

export function logitModelRows(r: LogisticResult): [string, string][] {
  const hl = r.hosmerLemeshow;
  return [
    ['Gözlem sayısı (n)', String(r.n)],
    ['Olay / olay değil', `${r.events} / ${r.nonEvents}  (olay: ${r.eventLevel}; referans: ${r.referenceLevel})`],
    ['Çıkarılan satır (eksik değer)', String(r.droppedRows)],
    ['Olay sayısı / yordayıcı terim (EPV)', num(r.epv, 1)],
    [`Model testi (olabilirlik oranı) χ²(${r.lrDf})`, `${num(r.lrChi2, 2)}, ${pText(r.lrP)}`],
    ['McFadden / Cox–Snell / Nagelkerke R²', `${noZero(r.mcFadden, 3)} / ${noZero(r.coxSnell, 3)} / ${noZero(r.nagelkerke, 3)}`],
    ['Log-olabilirlik (model / yalnızca sabit)', `${num(r.logLik, 2)} / ${num(r.logLikNull, 2)}`],
    ['AIC / BIC', `${num(r.aic, 1)} / ${num(r.bic, 1)}`],
    ['AUC (ROC eğrisi altında kalan alan)', noZero(r.auc, 3)],
    ['Hosmer–Lemeshow', hl ? `χ²(${hl.df}) = ${num(hl.chi2, 2)}, ${pText(hl.p)}` : 'hesaplanamadı'],
    ['Yakınsama', `${r.converged ? 'evet' : 'hayır'} (${r.iterations} yineleme)`],
    ['En büyük VIF', num(r.maxVif, 2)],
  ];
}

export function classificationRows(r: LogisticResult): { header: string[]; rows: string[][] } {
  const c = r.classification;
  return {
    header: ['', `Yordanan: ${r.eventLevel}`, `Yordanan: ${r.referenceLevel}`],
    rows: [
      [`Gerçek: ${r.eventLevel}`, `${c.tp}`, `${c.fn}`],
      [`Gerçek: ${r.referenceLevel}`, `${c.fp}`, `${c.tn}`],
      [`Doğruluk ${pct(c.accuracy)} · duyarlılık ${pct(c.sensitivity)} · seçicilik ${pct(c.specificity)} · kesinlik ${pct(c.precision)}`, `eşik ${c.threshold}`, `taban ${pct(c.baseline)}`],
    ],
  };
}

export function hosmerLemeshowRows(r: LogisticResult): { header: string[]; rows: string[][] } | null {
  if (!r.hosmerLemeshow) return null;
  return {
    header: ['Grup', 'n', 'Gözlenen olay', 'Beklenen olay'],
    rows: r.hosmerLemeshow.groups.map((g, i) => [String(i + 1), String(g.n), String(g.observed), num(g.expected, 2)]),
  };
}

/** Konsola yazdırılacak satırlar: üretilen Python betiği bunlarla birebir aynı çıktıyı verir. */
export function logisticExpectedOutput(r: LogisticResult): string[] {
  const lines = [
    `n: ${r.n} olay: ${r.events}`,
    `LR chi2(${r.lrDf}): ${fmt(r.lrChi2, 4)} p: ${fmt(r.lrP, 6)}`,
    `McFadden R2: ${fmt(r.mcFadden, 4)} Nagelkerke R2: ${fmt(r.nagelkerke, 4)}`,
  ];
  for (const c of r.coefficients) {
    lines.push(`${c.term}: b = ${fmt(c.b, 4)} SH = ${fmt(c.se, 4)} z = ${fmt(c.z, 4)} p = ${fmt(c.p, 6)} OR = ${fmt(c.or, 4)} OR GA = [${fmt(c.orLow, 4)}, ${fmt(c.orHigh, 4)}]${c.vif === undefined ? '' : ` VIF = ${fmt(c.vif, 4)}`}`);
  }
  const k = r.classification;
  lines.push(`AUC: ${fmt(r.auc, 4)}`);
  if (r.hosmerLemeshow) lines.push(`Hosmer-Lemeshow chi2(${r.hosmerLemeshow.df}): ${fmt(r.hosmerLemeshow.chi2, 4)} p: ${fmt(r.hosmerLemeshow.p, 6)}`);
  lines.push(`Siniflandirma (esik ${k.threshold}): TP = ${k.tp} FP = ${k.fp} TN = ${k.tn} FN = ${k.fn} dogruluk = ${fmt(k.accuracy, 4)}`);
  return lines;
}

const py = (s: string) => JSON.stringify(s);
const pyList = (xs: string[]) => `[${xs.map(py).join(', ')}]`;

/** statsmodels Logit ile aynı modeli kuran Python betiği. */
export function generateLogisticCode(file: DatasetFile, spec: LogisticSpec, r: LogisticResult): GeneratedCode {
  const alpha = spec.alpha ?? 0.05;
  const numCat = new Set(spec.numericCategorical ?? []);
  const levels = Object.fromEntries(r.categories.map((c) => [c.name, c.levels]));
  const refs = Object.fromEntries(r.categories.map((c) => [c.name, c.reference]));
  const dictLit = (m: Record<string, string[] | string>) => `{${Object.entries(m).map(([k, v]) => `${py(k)}: ${Array.isArray(v) ? pyList(v) : py(v)}`).join(', ')}}`;
  const lines: string[] = [
    '# StatAdvisor tarafından üretildi. Veri dosyası betikle aynı klasörde olmalıdır.',
    '',
    'import numpy as np',
    'import pandas as pd',
    'import statsmodels.api as sm',
    'from scipy import stats',
    'from sklearn.metrics import roc_auc_score',
    'from statsmodels.stats.outliers_influence import variance_inflation_factor',
    '',
    naBlock,
    `ALPHA = ${alpha}`,
    '',
    readCsvLine(file),
    '',
    `BAGIMLI = ${py(spec.dependent)}`,
    `OLAY = ${py(r.eventLevel)}  # 1 olarak kodlanan düzey (referans: ${py(r.referenceLevel)})`,
    `SAYISAL = ${pyList(spec.numeric)}`,
    `KATEGORIK = ${pyList(spec.categorical)}`,
  ];
  if (spec.categorical.length) {
    lines.push(`DUZEYLER = ${dictLit(levels)}  # kukla kodlamada kullanılan düzeyler (sıralı)`, `REFERANS = ${dictLit(refs)}  # referans düzey: kukla değişkeni olmayan düzey`);
  }
  lines.push(
    '',
    'def etiket(v):',
    '    # sayısal kodlu düzeylerde 1.0 yerine 1 yazılır (uygulamayla aynı düzey adı)',
    '    if isinstance(v, (int, float, np.integer, np.floating)):',
    '        return str(int(v)) if float(v).is_integer() else repr(float(v))',
    '    return str(v)',
    '',
    'd = df[[BAGIMLI] + SAYISAL + KATEGORIK].copy()',
    'for s in SAYISAL:',
    '    d[s] = pd.to_numeric(d[s], errors="coerce")',
  );
  const numCats = [...spec.categorical.filter((c) => numCat.has(c)), ...(numCat.has(spec.dependent) ? [spec.dependent] : [])];
  if (numCats.length) lines.push(`for s in ${pyList(numCats)}:`, '    d[s] = pd.to_numeric(d[s], errors="coerce")');
  lines.push(
    'd = d.dropna()  # eksik değeri olan satırlar çıkarılır (liste bazlı silme)',
    'y = (d[BAGIMLI].map(etiket) == OLAY).astype(int).to_numpy()',
    'X = pd.DataFrame({"Sabit": np.ones(len(d))}, index=d.index)',
    'for s in SAYISAL:',
    '    X[s] = d[s].astype(float)',
  );
  if (spec.categorical.length) {
    lines.push('for s in KATEGORIK:', '    etiketler = d[s].map(etiket)', '    for duzey in DUZEYLER[s]:', '        if duzey != REFERANS[s]:', '            X[f"{s}[{duzey}]"] = (etiketler == duzey).astype(float)');
  }
  lines.push(
    '',
    'Xm = X.to_numpy(dtype=float)',
    'model = sm.Logit(y, Xm).fit(disp=0, maxiter=200, tol=1e-12)',
    'terimler = list(X.columns)',
    'ci = model.conf_int(ALPHA)',
    'olasilik = model.predict(Xm)',
    '',
    'print(f"n: {int(model.nobs)} olay: {int(y.sum())}")',
    'print(f"LR chi2({int(model.df_model)}): {model.llr:.4f} p: {model.llr_pvalue:.6f}")',
    'cox_snell = 1 - np.exp(2 * (model.llnull - model.llf) / model.nobs)',
    'nagelkerke = cox_snell / (1 - np.exp(2 * model.llnull / model.nobs))',
    'print(f"McFadden R2: {model.prsquared:.4f} Nagelkerke R2: {nagelkerke:.4f}")',
    'for j, ad in enumerate(terimler):',
    '    satir = f"{ad}: b = {model.params[j]:.4f} SH = {model.bse[j]:.4f} z = {model.tvalues[j]:.4f} p = {model.pvalues[j]:.6f} OR = {np.exp(model.params[j]):.4f} OR GA = [{np.exp(ci[j, 0]):.4f}, {np.exp(ci[j, 1]):.4f}]"',
    '    if j > 0:',
    '        satir += f" VIF = {variance_inflation_factor(Xm, j):.4f}"',
    '    print(satir)',
    'print(f"AUC: {roc_auc_score(y, olasilik):.4f}")',
  );
  if (r.hosmerLemeshow) {
    lines.push(
      '',
      '# Hosmer-Lemeshow: olasılığa göre kararlı sıralama, boyutları en çok bir farkla eşit 10 grup',
      'gruplar = np.array_split(np.argsort(olasilik, kind="stable"), 10)',
      'hl = 0.0',
      'for idx in gruplar:',
      '    beklenen = olasilik[idx].sum()',
      '    pbar = beklenen / len(idx)',
      '    hl += (y[idx].sum() - beklenen) ** 2 / (len(idx) * pbar * (1 - pbar))',
      'print(f"Hosmer-Lemeshow chi2({len(gruplar) - 2}): {hl:.4f} p: {stats.chi2.sf(hl, len(gruplar) - 2):.6f}")',
    );
  }
  lines.push(
    '',
    'tahmin = (olasilik >= 0.5).astype(int)',
    'tp = int(((tahmin == 1) & (y == 1)).sum())',
    'fp = int(((tahmin == 1) & (y == 0)).sum())',
    'tn = int(((tahmin == 0) & (y == 0)).sum())',
    'fn = int(((tahmin == 0) & (y == 1)).sum())',
    'print(f"Siniflandirma (esik 0.5): TP = {tp} FP = {fp} TN = {tn} FN = {fn} dogruluk = {(tp + tn) / len(y):.4f}")',
  );
  const code = lines.join('\n') + '\n';
  return { filename: 'lojistik.py', code, expectedOutput: logisticExpectedOutput(r), requirements: requirementsOf(code) };
}

export function logisticReportData(r: LogisticResult, spec: LogisticSpec, datasetName: string, date: string, audit?: [string, string][]): RegressionReportData {
  const hl = hosmerLemeshowRows(r);
  const cls = classificationRows(r);
  return {
    title: 'Lojistik regresyon raporu',
    datasetName,
    date,
    dependent: `${spec.dependent} (olay: ${r.eventLevel})`,
    predictors: [...spec.numeric, ...spec.categorical],
    model: logitModelRows(r),
    coefficients: logitCoefficientRows(r),
    coefficientNote: 'b: log-odds katsayısı; SH: standart hata; z: Wald istatistiği; OR: olasılık oranı (exp b); VIF: varyans şişirme çarpanı.',
    extraTables: [{ title: `Sınıflandırma tablosu (eşik ${r.classification.threshold})`, ...cls }, ...(hl ? [{ title: 'Hosmer–Lemeshow grupları (gözlenen ve beklenen olay sayıları)', ...hl }] : [])],
    narrative: narrateLogistic(r, spec.dependent),
    audit,
  };
}
