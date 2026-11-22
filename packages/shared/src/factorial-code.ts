/**
 * Faktöriyel ANOVA'nın Python karşılığı. Betik uygulamayla aynı yöntemi izler: sapma kodlu terim sütunları, rank-duyarlı en küçük
 * kareler ve (Tip II ya da Tip III) hata kareler toplamı farkı; p değerleri scipy'dan gelir. Konsol çıktısı beklenen çıktıyla aynıdır.
 */
import { fmt, naBlock, readCsvLine, requirementsOf, type DatasetFile, type GeneratedCode } from './codegen.ts';
import type { FactorialResult } from './factorial.ts';

export interface FactorialSpec {
  dependent: string;
  factors: string[];
  alpha: number;
  ssType: 'auto' | 'II' | 'III';
}

const py = (s: string) => JSON.stringify(s);
const pyList = (xs: string[]) => `[${xs.map(py).join(', ')}]`;

export function factorialExpectedOutput(r: FactorialResult): string[] {
  const out = [`n: ${r.n}`, `hata: SS = ${fmt(r.error.ss, 4)} sd = ${r.error.df} KO = ${fmt(r.error.ms, 4)}`, `R2: ${fmt(r.r2, 4)} duzeltilmis R2: ${fmt(r.adjR2, 4)}`];
  for (const t of r.terms) out.push(`${t.name}: SS = ${fmt(t.ss, 4)} sd = ${t.df} F = ${fmt(t.F, 4)} p = ${fmt(t.p, 6)} kismi eta2 = ${fmt(t.partialEta2, 4)}`);
  if (r.levene) out.push(`levene: F = ${fmt(r.levene.F, 4)} p = ${fmt(r.levene.p, 6)}`);
  if (r.residualNormality) out.push(`shapiro: W = ${fmt(r.residualNormality.W, 4)} p = ${fmt(r.residualNormality.p, 6)}`);
  return out;
}

export function generateFactorialCode(file: DatasetFile, spec: FactorialSpec, r: FactorialResult): GeneratedCode {
  const code = [
    '# StatAdvisor tarafından üretildi. Veri dosyası betikle aynı klasörde olmalıdır.',
    '',
    'import itertools',
    'import numpy as np',
    'import pandas as pd',
    'from scipy import stats',
    '',
    naBlock,
    '',
    readCsvLine(file),
    '',
    `BAGIMLI = ${py(spec.dependent)}`,
    `FAKTORLER = ${pyList(spec.factors)}`,
    `SS_TIPI = ${py(r.ssType)}  # uygulamanın kullandığı tür (boş hücre varsa otomatik Tip II)`,
    '',
    'd = df[[BAGIMLI] + FAKTORLER].copy()',
    'd[BAGIMLI] = pd.to_numeric(d[BAGIMLI], errors="coerce")',
    'd = d.dropna().reset_index(drop=True)  # eksik değeri olan satırlar çıkarılır',
    'y = d[BAGIMLI].to_numpy(dtype=float)',
    'n = len(y)',
    '',
    'def sapma_kodlari(seri):',
    '    # toplamı sıfır (sapma) kodlama: L düzey için L-1 sütun, son düzey -1',
    '    kodlar = pd.factorize(seri.astype(str), sort=True)[0]',
    '    L = kodlar.max() + 1',
    '    return kodlar, np.column_stack([(kodlar == j).astype(float) - (kodlar == L - 1).astype(float) for j in range(L - 1)])',
    '',
    'kod = {}',
    'ana = {}',
    'for f in FAKTORLER:',
    '    kod[f], ana[f] = sapma_kodlari(d[f])',
    '',
    'terimler = []  # (ad, faktörler, sütunlar)',
    'for boy in range(1, len(FAKTORLER) + 1):',
    '    for alt in itertools.combinations(range(len(FAKTORLER)), boy):',
    '        sut = np.ones((n, 1))',
    '        for j in alt:',
    '            sut = (sut[:, :, None] * ana[FAKTORLER[j]][:, None, :]).reshape(n, -1)',
    '        terimler.append((" × ".join(FAKTORLER[j] for j in alt), set(alt), sut))',
    '',
    'sabit = np.ones((n, 1))',
    '',
    'def uydur(sutunlar):',
    '    X = np.hstack(sutunlar)',
    '    beta = np.linalg.lstsq(X, y, rcond=None)[0]',
    '    kalinti = y - X @ beta',
    '    return float(kalinti @ kalinti), int(np.linalg.matrix_rank(X)), kalinti',
    '',
    'sse_tam, rank_tam, kalintilar = uydur([sabit] + [t[2] for t in terimler])',
    'sd_hata = n - rank_tam',
    'ko_hata = sse_tam / sd_hata',
    'sst = float(((y - y.mean()) ** 2).sum())',
    '',
    'print(f"n: {n}")',
    'print(f"hata: SS = {sse_tam:.4f} sd = {sd_hata} KO = {ko_hata:.4f}")',
    'print(f"R2: {1 - sse_tam / sst:.4f} duzeltilmis R2: {1 - ko_hata / (sst / (n - 1)):.4f}")',
    '',
    'for i, (ad, alt, sut) in enumerate(terimler):',
    '    # Tip III: tüm diğer terimler modelde. Tip II: bu terimi kesin kapsayan terimler modelde değil.',
    '    modelde = [k for k, t in enumerate(terimler) if k == i or SS_TIPI == "III" or not (len(t[1]) > len(alt) and alt <= t[1])]',
    '    taban = [sabit] + [terimler[k][2] for k in modelde]',
    '    sse_taban, rank_taban, _ = (sse_tam, rank_tam, None) if SS_TIPI == "III" else uydur(taban)',
    '    sse_dar, rank_dar, _ = uydur([sabit] + [terimler[k][2] for k in modelde if k != i])',
    '    ss = max(0.0, sse_dar - sse_taban)',
    '    sd = rank_taban - rank_dar',
    '    F = (ss / sd) / ko_hata if sd > 0 else float("nan")',
    '    p = stats.f.sf(F, sd, sd_hata) if sd > 0 else float("nan")',
    '    print(f"{ad}: SS = {ss:.4f} sd = {sd} F = {F:.4f} p = {p:.6f} kismi eta2 = {ss / (ss + sse_tam):.4f}")',
    '',
    'hucreler = [g[BAGIMLI].to_numpy(dtype=float) for _, g in d.groupby(FAKTORLER, sort=True)]',
    'if len(hucreler) >= 2 and n > len(hucreler):',
    '    L = stats.levene(*hucreler, center="mean")',
    '    print(f"levene: F = {L.statistic:.4f} p = {L.pvalue:.6f}")',
    'if 3 <= n <= 5000:',
    '    W, pw = stats.shapiro(kalintilar)',
    '    print(f"shapiro: W = {W:.4f} p = {pw:.6f}")',
    '',
    '# Tip III sonuçları statsmodels ile de elde edilir (boş hücre yoksa):',
    '#   import statsmodels.api as sm; from statsmodels.formula.api import ols',
    '#   model = ols("y ~ C(a, Sum) * C(b, Sum)", d).fit(); sm.stats.anova_lm(model, typ=3)',
  ].join('\n');
  return { filename: 'faktoriyel_anova.py', code, expectedOutput: factorialExpectedOutput(r), requirements: requirementsOf(code) };
}
