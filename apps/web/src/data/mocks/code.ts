import { formatP } from '@statadvisor/shared';
import type { CodeSnippet, ReportFormat, ReportSection } from '@statadvisor/shared';
import { analysis } from './analysis';
import { kruskal, median, pooled, pyList, sampleGroups } from './sample';

/**
 * Kod örneklerinin çıktıları, kodun çalıştırdığı veriden (`sample.ts`) hesaplanır; elle yazılmış sayı yoktur.
 * Çalıştırma süresi ölçülmediği için gösterilmez.
 */
const { H, df, p, n, epsilonSquared } = kruskal;
const shapiro = analysis.assumptions.find((a) => a.id === 'shapiro')!;
const levene = analysis.assumptions.find((a) => a.id === 'levene')!;
const shapiroPass = shapiro.passed;
const shapiroW = shapiro.statistic.replace('W = ', '');
const significant = p < 0.05;
const verdictLine = significant
  ? 'Sonuç: Gruplar arasında istatistiksel olarak anlamlı fark var.'
  : 'Sonuç: Gruplar arasında anlamlı bir fark tespit edilemedi.';
const scipyOutput = [
  `Kruskal-Wallis H(${df}) = ${H.toFixed(2)}, p = ${p.toFixed(4)}, ε² = ${epsilonSquared.toFixed(2)}`,
  verdictLine,
];
const rVector = (values: number[]) => `c(${values.map((v) => v.toFixed(1)).join(', ')})`;
const medians = `{'A': ${median(sampleGroups.A)}, 'B': ${median(sampleGroups.B)}, 'C': ${median(sampleGroups.C)}}`;

export const snippets: CodeSnippet[] = [
  {
    id: 'scipy',
    label: 'Python (SciPy)',
    filename: 'analiz.py',
    runtime: 'Python 3.11 · SciPy 1.11',
    language: 'python',
    output: scipyOutput,
    code: `# analiz.py - Üç grubun Kruskal-Wallis ile karşılaştırılması
import numpy as np
from scipy import stats

# Örnek veri: biyobelirteç X, her grupta 15 gözlem
grup_a = np.array(${pyList(sampleGroups.A)})
grup_b = np.array(${pyList(sampleGroups.B)})
grup_c = np.array(${pyList(sampleGroups.C)})

# Normallik varsayımı sağlanmadığı için (Shapiro-Wilk) non-parametrik test
h_stat, p_val = stats.kruskal(grup_a, grup_b, grup_c)
n = len(grup_a) + len(grup_b) + len(grup_c)
epsilon_kare = h_stat / (n - 1)  # etki büyüklüğü
print(f"Kruskal-Wallis H(2) = {h_stat:.2f}, p = {p_val:.4f}, ε² = {epsilon_kare:.2f}")

if p_val < 0.05:
    print("Sonuç: Gruplar arasında istatistiksel olarak anlamlı fark var.")
else:
    print("Sonuç: Gruplar arasında anlamlı bir fark tespit edilemedi.")`,
  },
  {
    id: 'pandas',
    label: 'Pandas + SciPy',
    filename: 'analiz_pandas.py',
    runtime: 'Python 3.11 · pandas 2.2 · SciPy 1.11',
    language: 'python',
    output: [`Medyanlar: ${medians}`, scipyOutput[0]!],
    code: `import pandas as pd
from scipy import stats

df = pd.DataFrame({
    "grup": ["A"] * 15 + ["B"] * 15 + ["C"] * 15,
    "biyobelirtec": ${pyList(pooled)},
})

medyanlar = df.groupby("grup")["biyobelirtec"].median().round(1).to_dict()
print(f"Medyanlar: {medyanlar}")

gruplar = [g["biyobelirtec"].to_numpy() for _, g in df.groupby("grup")]
h_stat, p_val = stats.kruskal(*gruplar)
epsilon_kare = h_stat / (len(df) - 1)
print(f"Kruskal-Wallis H(2) = {h_stat:.2f}, p = {p_val:.4f}, ε² = {epsilon_kare:.2f}")`,
  },
  {
    id: 'sklearn',
    label: 'Scikit-learn',
    filename: 'pipeline_model_auditor.py',
    runtime: 'Python 3.11 · Scikit-learn 1.5 · Imbalanced-learn',
    language: 'python',
    output: ['X ve y kendi veri setinizden gelir; çıktı verinize göre oluşur.'],
    code: `from imblearn.over_sampling import SMOTE
from imblearn.pipeline import Pipeline
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import StratifiedKFold, cross_val_score

# X, y: kendi veri setinizden (özellik matrisi ve hedef sınıf)

# SMOTE, Pipeline içinde olduğu için her katın yalnızca eğitim kısmına uygulanır;
# test katına sentetik örnek sızmaz.
model = Pipeline([
    ("smote", SMOTE(sampling_strategy=0.5, random_state=42)),
    ("rf", RandomForestClassifier(n_estimators=300, random_state=42)),
])

cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)

# Dengesiz veride doğruluk yanıltıcıdır: azınlık sınıfı için F1 ve PR-AUC'a bakın
for metrik in ("f1", "average_precision"):
    skorlar = cross_val_score(model, X, y, cv=cv, scoring=metrik)
    print(f"{metrik}: {skorlar.mean():.3f} (± {skorlar.std():.3f})")`,
  },
  {
    id: 'r',
    label: 'R',
    filename: 'analiz.R',
    runtime: 'R 4.4 · stats',
    language: 'r',
    output: [
      'Kruskal-Wallis rank sum test',
      'data:  biyobelirtec by grup',
      `Kruskal-Wallis chi-squared = ${H.toPrecision(5)}, df = ${df}, p-value = ${Number(p.toPrecision(4))}`,
    ],
    code: `# analiz.R - Kruskal-Wallis
veri <- data.frame(
  grup = factor(rep(c("A", "B", "C"), each = 15)),
  biyobelirtec = ${rVector(pooled)}
)

sonuc <- kruskal.test(biyobelirtec ~ grup, data = veri)
print(sonuc)`,
  },
];


export const cleaningSnippet: CodeSnippet = {
  id: 'cleaning',
  label: 'Veri temizleme',
  filename: 'veri_temizleme_otomasyonu.py',
  runtime: 'SciPy & Pandas',
  language: 'python',
  output: [],
  code: `import pandas as pd
from sklearn.impute import KNNImputer

df = pd.read_csv("Klinik_Veri_Faz3.csv")

# 1. Tukey sınırlarıyla (1.5 x IQR) aykırı değer işaretleme; sınırlar tüm veri üzerinden hesaplanır
dis = pd.Series(False, index=df.index)
for sutun in ["kan_basinci", "biyobelirtec_x"]:
    q1, q3 = df[sutun].quantile([0.25, 0.75])
    iqr = q3 - q1
    dis |= (df[sutun] < q1 - 1.5 * iqr) | (df[sutun] > q3 + 1.5 * iqr)
df = df[~dis]  # silmeden önce klinik geçerliliği kontrol edin

# 2. Gelir düzeyi için {{IMPUTATION}}
{{IMPUTATION_CODE}}

print(f"Temizlenen veri: {len(df)} satır")`,
};

export const imputationCode: Record<'median' | 'knn', { title: string; code: string }> = {
  median: {
    title: 'medyan ile doldurma',
    code: `df["gelir_duzeyi"] = df["gelir_duzeyi"].fillna(df["gelir_duzeyi"].median())`,
  },
  knn: {
    title: 'KNN imputasyonu',
    code: `sayisal = ["yas", "kan_basinci", "gelir_duzeyi", "biyobelirtec_x"]
df[sayisal] = KNNImputer(n_neighbors=5).fit_transform(df[sayisal])`,
  },
};

export const comparisonSnippet: CodeSnippet = snippets[2]!;

export const reportFormats: ReportFormat[] = [
  { id: 'html', title: 'HTML belgesi', description: 'Tarayıcıda açılır, indirilir', fileName: 'rapor_hipotez_sonuclari.html' },
  { id: 'print', title: 'PDF (yazdır)', description: 'Tarayıcının “PDF olarak kaydet” seçeneği', fileName: 'rapor_hipotez_sonuclari.pdf' },
  { id: 'word', title: 'Word (.doc)', description: 'HTML tabanlı, Word’de açılır', fileName: 'rapor_hipotez_sonuclari.doc' },
];

export const apaSummary = `Normallik varsayımı, grup içi kalıntılar üzerinde Shapiro-Wilk testiyle incelenmiş ve ${shapiroPass ? 'karşılandığı' : 'karşılanmadığı'} görülmüştür, W = ${shapiroW}, p = ${formatP(shapiro.p, true)}. Varyansların homojenliği Levene (Brown-Forsythe) testiyle sınanmıştır, ${levene.statistic}, p = ${formatP(levene.p, true)}. Gruplar arası farklılıkları değerlendirmek amacıyla non-parametrik Kruskal-Wallis H testi uygulanmıştır. Üç bağımsız grup arasında istatistiksel olarak anlamlı bir fark bulunmuştur, H(${df}) = ${H.toFixed(2)}, p = ${formatP(p, true)}, ε² = ${epsilonSquared.toFixed(2)}, N = ${n}. Hangi grupların birbirinden ayrıştığını belirlemek için Dunn testi (Holm düzeltmeli) uygulanmalıdır.`;

export const citation = 'Kruskal, W. H., & Wallis, W. A. (1952). Use of ranks in one-criterion variance analysis. JASA, 47(260), 583–621.';

export const reportSections: ReportSection[] = [
  { id: 'desc', label: 'Tanımlayıcı istatistikler (n, medyan, ortalama, standart sapma)' },
  { id: 'assump', label: 'Varsayım testleri (Shapiro-Wilk, Levene) ve karar notları' },
  { id: 'result', label: 'Test sonucu ve etki büyüklüğü (ε²)' },
  { id: 'apa', label: 'APA 7 stilinde metin özeti' },
  { id: 'refs', label: 'Kaynakça' },
];

export const requirements = `scipy==1.11.4
numpy>=1.24
pandas>=2.0
scikit-learn>=1.3
imbalanced-learn>=0.11`;
