import type { CodeSnippet } from '@statadvisor/shared';

/** Model Karşılaştırma sayfasındaki düzeltme şablonu (sentetik örnek veri üzerindeki modeller için). */
export const comparisonSnippet: CodeSnippet = {
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
};
