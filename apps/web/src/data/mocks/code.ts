import type { CodeSnippet, ReportFormat, ReportSection } from '../types';

const output = [
  'Kruskal-Wallis H-Skoru: 11.60, p-değeri: 0.0031',
  'Sonuç: Gruplar arasında istatistiksel olarak anlamlı fark var.',
];

export const snippets: CodeSnippet[] = [
  {
    id: 'scipy',
    label: 'Python (SciPy)',
    filename: 'analiz.py',
    runtime: 'Python 3.11 · SciPy 1.11',
    language: 'python',
    duration: '14.8 ms',
    output,
    code: `# analiz.py - Otomatik hipotez doğrulama ve non-parametrik test
import numpy as np
from scipy import stats

# Veri ön yükleme: Klinik_Veri_Faz3 (Grup A, B, C)
grup_a = np.array([14.2, 18.5, 12.1, 16.4, 15.0])
grup_b = np.array([22.1, 24.6, 27.3, 20.8, 26.0])
grup_c = np.array([31.4, 29.8, 35.2, 33.1, 30.5])

# Normallik sağlanmadı (Shapiro-Wilk p = 0.012) -> Kruskal-Wallis
h_stat, p_val = stats.kruskal(grup_a, grup_b, grup_c)
print(f"Kruskal-Wallis H-Skoru: {h_stat:.2f}, p-değeri: {p_val:.4f}")

if p_val < 0.05:
    print("Sonuç: Gruplar arasında istatistiksel olarak anlamlı fark var.")
else:
    print("Sonuç: Gruplar arasında anlamlı bir fark tespit edilemedi.")`,
  },
  {
    id: 'statsmodels',
    label: 'Statsmodels',
    filename: 'analiz_sm.py',
    runtime: 'Python 3.11 · Statsmodels 0.14',
    language: 'python',
    duration: '21.2 ms',
    output,
    code: `import pandas as pd
from scipy import stats
from statsmodels.stats.multitest import multipletests
import scikit_posthocs as sp

df = pd.read_csv("Klinik_Veri_Faz3.csv")
gruplar = [g["tansiyon"].values for _, g in df.groupby("grup")]

h_stat, p_val = stats.kruskal(*gruplar)
print(f"Kruskal-Wallis H-Skoru: {h_stat:.2f}, p-değeri: {p_val:.4f}")

# Post-hoc: Dunn testi + Bonferroni düzeltmesi
dunn = sp.posthoc_dunn(df, val_col="tansiyon", group_col="grup", p_adjust="bonferroni")
print(dunn.round(4))`,
  },
  {
    id: 'sklearn',
    label: 'Scikit-learn',
    filename: 'pipeline_model_auditor.py',
    runtime: 'Python 3.11 · Scikit-learn 1.5 · Imbalanced-learn',
    language: 'python',
    duration: '1.82 s',
    output: ['Sağlamlaştırılmış CV F1-Skoru: 0.871 (± 0.018)'],
    code: `from imblearn.over_sampling import SMOTE
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import StratifiedKFold, cross_val_score

# Sınıf dengesizliği: SMOTE ile azınlık sınıfını çoğalt
smote = SMOTE(sampling_strategy=0.5, random_state=42)
X_res, y_res = smote.fit_resample(X_train, y_train)

# Aşırı öğrenme: 5 katlı tabakalı çapraz doğrulama
rf_model = RandomForestClassifier(n_estimators=300, random_state=42)
cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
scores = cross_val_score(rf_model, X_res, y_res, cv=cv, scoring="f1_weighted")
print(f"Sağlamlaştırılmış CV F1-Skoru: {scores.mean():.3f} (± {scores.std():.3f})")`,
  },
  {
    id: 'r',
    label: 'R',
    filename: 'analiz.R',
    runtime: 'R 4.4 · stats',
    language: 'r',
    duration: '9.4 ms',
    output: ['Kruskal-Wallis chi-squared = 11.6, df = 2, p-value = 0.0031'],
    code: `# analiz.R - Kruskal-Wallis ve Dunn post-hoc
veri <- read.csv("Klinik_Veri_Faz3.csv")
veri$grup <- factor(veri$grup)

sonuc <- kruskal.test(tansiyon ~ grup, data = veri)
print(sonuc)

# Post-hoc
library(FSA)
dunnTest(tansiyon ~ grup, data = veri, method = "bonferroni")`,
  },
];

export const cleaningSnippet: CodeSnippet = {
  id: 'cleaning',
  label: 'Veri temizleme',
  filename: 'veri_temizleme_otomasyonu.py',
  runtime: 'SciPy & Pandas',
  language: 'python',
  duration: '38 ms',
  output: ['İşlem tamamlandı: Kalite skoru %99’a yükseltildi.'],
  code: `import pandas as pd
from sklearn.impute import KNNImputer

df = pd.read_csv("Klinik_Veri_Faz3.csv")

# 1. IQR yöntemiyle aykırı değer budama (tansiyon)
q1 = df["kan_basinci"].quantile(0.25)
q3 = df["kan_basinci"].quantile(0.75)
iqr = q3 - q1
df = df[~((df["kan_basinci"] < q1 - 1.5 * iqr) | (df["kan_basinci"] > q3 + 1.5 * iqr))]

# 2. Gelir düzeyi için {{IMPUTATION}}
{{IMPUTATION_CODE}}

print("İşlem tamamlandı: Kalite skoru %99'a yükseltildi.")`,
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
  { id: 'pdf', title: 'PDF raporu', description: 'Akademik, APA 7', fileName: 'rapor_hipotez_sonuclari.pdf', size: '1.84 MB', pages: 4 },
  { id: 'docx', title: 'Word (.docx)', description: 'Düzenlenebilir', fileName: 'rapor_hipotez_sonuclari.docx', size: '412 KB', pages: 4 },
  { id: 'html', title: 'HTML belgesi', description: 'Web / pano', fileName: 'rapor_hipotez_sonuclari.html', size: '268 KB' },
];

export const apaSummary =
  'Verilerin normallik varsayımı Shapiro-Wilk testi ile incelenmiş ve varsayımın karşılanmadığı tespit edilmiştir (p = .012). Gruplar arası farklılıkları değerlendirmek amacıyla non-parametrik Kruskal-Wallis H testi uygulanmıştır. Test sonucunda üç bağımsız grup arasında istatistiksel olarak anlamlı bir fark bulunmuştur, H(2) = 11.60, p = .003, ε² = 0.21. Post-hoc Dunn-Bonferroni ikili karşılaştırmalarında Grup A ile Grup C arasındaki farkın anlamlı olduğu saptanmıştır (p < .01).';

export const citation = 'Kruskal, W. H., & Wallis, W. A. (1952). Use of ranks in one-criterion variance analysis. JASA, 47(260), 583–621.';

export const reportSections: ReportSection[] = [
  { id: 'desc', label: 'Tanımlayıcı istatistikler ve çeyreklikler (IQR)', page: 1 },
  { id: 'assump', label: 'Varsayım test matrisi (Shapiro-Wilk ve Levene)', page: 2 },
  { id: 'plots', label: 'Grup kutu grafikleri ve dağılım eğrileri', page: 3 },
  { id: 'posthoc', label: 'Post-hoc ikili karşılaştırmalar ve etki büyüklüğü (ε²)', page: 4 },
];

export const requirements = `scipy==1.11.4
numpy>=1.24
statsmodels==0.14.2
scikit-posthocs==0.9.0`;
