/**
 * Model karşılaştırmasının scikit-learn karşılığı. Betik:
 *  - katman atamasını uygulamayla AYNI tohumlu karıştırmayla yeniden üretir (mulberry32 Python'da yeniden yazılmıştır),
 *  - ön işlemeyi her katmanın eğitim satırlarında uydurulan bir ColumnTransformer ile yapar (veri sızıntısı yok),
 *  - her model için test katmanlarının doğruluk ve makro F1 ortalamasını yazdırır.
 * Taban, lojistik, k-NN ve SVM scikit-learn ile birebir aynı sonucu verir; ağaç, orman ve gradyan artırmada
 * rastgele sayı dizisi farklı olduğundan sonuçlar birkaç binde ayrışabilir.
 */
import { fmt, naBlock, readCsvLine, requirementsOf, type DatasetFile, type GeneratedCode } from './codegen.ts';
import { MODEL_INFO, type CvResult, type ModelId } from './ml-cv.ts';

export interface ModelCompareSpec {
  target: string;
  numeric: string[];
  categorical: string[];
  /** Sayısal kodlu kategorik özellikler (ör. 1, 2, 3): düzey adı sayıdan üretilir. */
  numericCategorical: string[];
  /** Hedef sayısal kodluysa (ör. 1–4 sınıf). */
  targetNumeric: boolean;
  folds: number;
  seed: number;
  models: ModelId[];
}

const py = (s: string) => JSON.stringify(s);
const pyList = (xs: string[]) => `[${xs.map(py).join(', ')}]`;

const IMPORTS: Record<ModelId, string> = {
  baseline: 'from sklearn.dummy import DummyClassifier',
  logistic: 'from sklearn.linear_model import LogisticRegression',
  tree: 'from sklearn.tree import DecisionTreeClassifier',
  knn: 'from sklearn.neighbors import KNeighborsClassifier',
  svm: 'from sklearn.svm import SVC',
  rf: 'from sklearn.ensemble import RandomForestClassifier',
  gb: 'from sklearn.ensemble import GradientBoostingClassifier',
};

export function modelCompareExpectedOutput(r: CvResult): string[] {
  return r.models.filter((m) => !m.skipped).map((m) => `${m.id}: dogruluk = ${fmt(m.accuracy.mean, 4)} (SS ${fmt(m.accuracy.sd, 4)}) makro F1 = ${fmt(m.macroF1.mean, 4)} (SS ${fmt(m.macroF1.sd, 4)})`);
}

export function generateModelCompareCode(file: DatasetFile, spec: ModelCompareSpec, r: CvResult): GeneratedCode {
  const ran = r.models.filter((m) => !m.skipped).map((m) => m.id);
  const numCat = spec.numericCategorical;
  const lines: string[] = [
    '# StatAdvisor AI tarafından üretildi. Veri dosyası betikle aynı klasörde olmalıdır.',
    '',
    'import numpy as np',
    'import pandas as pd',
    'from sklearn.base import clone',
    'from sklearn.compose import ColumnTransformer',
    'from sklearn.impute import SimpleImputer',
    ...[...new Set(ran.map((id) => IMPORTS[id]))],
    'from sklearn.metrics import accuracy_score, f1_score',
    'from sklearn.pipeline import Pipeline',
    'from sklearn.preprocessing import OneHotEncoder, StandardScaler',
    '',
    naBlock,
    '',
    readCsvLine(file),
    '',
    `HEDEF = ${py(spec.target)}`,
    `SAYISAL = ${pyList(spec.numeric)}`,
    `KATEGORIK = ${pyList(spec.categorical)}`,
    `SINIFLAR = ${pyList(r.classes)}  # sıralı sınıf adları (sınıf indeksi bu listedeki konumdur)`,
    `KATMAN_SAYISI = ${spec.folds}`,
    `TOHUM = ${spec.seed}`,
    '',
    'def etiket(v):',
    '    # sayısal kodlu düzeylerde 1.0 yerine 1 yazılır (uygulamayla aynı düzey adı); eksik değer eksik kalır',
    '    if pd.isna(v):',
    '        return np.nan',
    '    if isinstance(v, (int, float, np.integer, np.floating)):',
    '        return str(int(v)) if float(v).is_integer() else repr(float(v))',
    '    return str(v)',
    '',
    'def mulberry32(seed):',
    '    # uygulamadaki tohumlu rastgele sayı üreticisinin aynısı',
    '    durum = [seed & 0xFFFFFFFF]',
    '    def rastgele():',
    '        durum[0] = (durum[0] + 0x6D2B79F5) & 0xFFFFFFFF',
    '        t = durum[0]',
    '        t = ((t ^ (t >> 15)) * (t | 1)) & 0xFFFFFFFF',
    '        t = t ^ ((t + (((t ^ (t >> 7)) * (t | 61)) & 0xFFFFFFFF)) & 0xFFFFFFFF)',
    '        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296',
    '    return rastgele',
    '',
    'def tabakali_katmanlar(y, k, tohum):',
    '    # her sınıf karıştırılır ve gözlemler katmanlara sırayla dağıtılır (uygulamayla aynı ayrım)',
    '    rng = mulberry32(tohum)',
    '    katman = np.zeros(len(y), dtype=int)',
    '    kayma = 0',
    '    for c in range(len(SINIFLAR)):',
    '        idx = [i for i, v in enumerate(y) if v == c]',
    '        for i in range(len(idx) - 1, 0, -1):',
    '            j = int(rng() * (i + 1))',
    '            idx[i], idx[j] = idx[j], idx[i]',
    '        for konum, satir in enumerate(idx):',
    '            katman[satir] = (konum + kayma) % k',
    '        kayma = (kayma + len(idx)) % k',
    '    return katman',
    '',
    'd = df[[HEDEF] + SAYISAL + KATEGORIK].copy()',
  ];
  const numericLike = [...(spec.targetNumeric ? [spec.target] : []), ...numCat];
  if (numericLike.length) lines.push(`for s in ${pyList(numericLike)}:`, '    d[s] = pd.to_numeric(d[s], errors="coerce")');
  lines.push(
    'd = d[d[HEDEF].notna()].reset_index(drop=True)  # hedefi eksik satırlar çıkarılır',
    'for s in SAYISAL:',
    '    d[s] = pd.to_numeric(d[s], errors="coerce")',
    'for s in KATEGORIK:',
    '    d[s] = d[s].map(etiket).astype(object)',
    'etiketler = d[HEDEF].map(etiket)',
    'y_idx = etiketler.map({s: i for i, s in enumerate(SINIFLAR)}).to_numpy(dtype=int)',
    'X = d[SAYISAL + KATEGORIK]',
    'KATMAN = tabakali_katmanlar(y_idx, KATMAN_SAYISI, TOHUM)',
    '',
    '# Ön işleme her katmanda YALNIZCA eğitim satırlarına uydurulur (Pipeline içinde): veri sızıntısı olmaz',
    'adimlar = []',
    'if SAYISAL:',
    '    adimlar.append(("sayisal", Pipeline([("doldur", SimpleImputer(strategy="median")), ("olcekle", StandardScaler())]), SAYISAL))',
    'if KATEGORIK:',
    '    adimlar.append(("kategorik", Pipeline([("doldur", SimpleImputer(strategy="most_frequent")), ("kodla", OneHotEncoder(handle_unknown="ignore"))]), KATEGORIK))',
    'on_isleme = ColumnTransformer(adimlar)',
    '',
    'MODELLER = {',
    ...ran.map((id) => {
      const sk = MODEL_INFO[id].sklearn;
      return `    ${py(id)}: ${id === 'logistic' ? 'LogisticRegression(max_iter=5000)' : id === 'tree' || id === 'rf' || id === 'gb' ? sk.replace(/random_state=\d+/, 'random_state=42') : sk},`;
    }),
    '}',
    '',
    'for ad, model in MODELLER.items():',
    '    dogruluk, makro_f1 = [], []',
    '    for k in range(KATMAN_SAYISI):',
    '        egitim, test = np.where(KATMAN != k)[0], np.where(KATMAN == k)[0]',
    '        boru = clone(Pipeline([("on", on_isleme), ("model", model)]))',
    '        boru.fit(X.iloc[egitim], etiketler.iloc[egitim])',
    '        tahmin = boru.predict(X.iloc[test])',
    '        dogruluk.append(accuracy_score(etiketler.iloc[test], tahmin))',
    '        makro_f1.append(f1_score(etiketler.iloc[test], tahmin, average="macro", zero_division=0))',
    '    print(f"{ad}: dogruluk = {np.mean(dogruluk):.4f} (SS {np.std(dogruluk, ddof=1):.4f}) makro F1 = {np.mean(makro_f1):.4f} (SS {np.std(makro_f1, ddof=1):.4f})")',
  );
  const code = lines.join('\n') + '\n';
  return { filename: 'model_karsilastirma.py', code, expectedOutput: modelCompareExpectedOutput(r), requirements: requirementsOf(code) };
}
