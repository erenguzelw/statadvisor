"""
Model karşılaştırma referansları: scikit-learn ile, TypeScript'in kullanacağı AYNI katman atamalarıyla.

Her vaka karma (sayısal + kategorik, eksik değerli) bir veri seti, Python'da üretilen tabakalı katman numaraları ve
her model için katman başına test doğruluğu / makro F1 içerir. Ön işleme her katmanda yalnızca eğitim satırlarına
uydurulan bir Pipeline ile yapılır: SimpleImputer(median)+StandardScaler ve SimpleImputer(most_frequent)+OneHotEncoder.
Ek olarak lojistik regresyonun ilk katmandaki test olasılıkları (sıkı yakınsama) saklanır.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score, roc_auc_score
from sklearn.model_selection import StratifiedKFold
from sklearn.neighbors import KNeighborsClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.svm import SVC
from sklearn.tree import DecisionTreeClassifier

SEED = 20261016


def make_models():
    return {
        "baseline": DummyClassifier(strategy="most_frequent"),
        "logistic": LogisticRegression(max_iter=10000, tol=1e-9),
        "tree": DecisionTreeClassifier(random_state=0),
        "knn": KNeighborsClassifier(n_neighbors=5),
        "svm": SVC(kernel="rbf", C=1.0, gamma="scale"),
        "rf": RandomForestClassifier(n_estimators=100, random_state=0),
        "gb": GradientBoostingClassifier(random_state=0),
    }


def alt_models():
    """Rastgelelik içeren modellerin başka bir tohumla sonuçları: scikit-learn'ün kendi tohumlar arası değişimi."""
    return {
        "tree": DecisionTreeClassifier(random_state=1),
        "rf": RandomForestClassifier(n_estimators=100, random_state=1),
        "gb": GradientBoostingClassifier(random_state=1),
    }


def add_all(add, f):
    rng = np.random.default_rng(SEED)
    for case in range(24):
        n = int(rng.integers(160, 520))
        K = int(rng.integers(2, 5))
        n_num = int(rng.integers(3, 8))
        n_cat = int(rng.integers(0, 3))
        y = rng.choice(K, size=n, p=rng.dirichlet(np.ones(K) * 3))
        # her sınıfta en az 12 gözlem olsun
        for c in range(K):
            if (y == c).sum() < 12:
                y[rng.choice(n, size=12, replace=False)] = c
        centers = rng.normal(0, 1.2, size=(K, n_num))
        scale = rng.uniform(0.6, 2.0, size=n_num)
        Xn = centers[y] * rng.uniform(0.4, 1.4, size=n_num) + rng.normal(0, 1, size=(n, n_num)) * scale
        Xn = Xn * rng.uniform(1, 30, size=n_num) + rng.uniform(-50, 50, size=n_num)
        if case % 4 == 0:
            Xn = np.round(Xn, 1)
        cats = []
        for j in range(n_cat):
            lv = int(rng.integers(2, 5))
            probs = rng.dirichlet(np.ones(lv), size=K)
            cats.append(np.array([f"d{rng.choice(lv, p=probs[c])}" for c in y], dtype=object))
        X = pd.DataFrame({f"x{j}": Xn[:, j] for j in range(n_num)})
        for j, col in enumerate(cats):
            X[f"g{j}"] = col
        # eksik değerler (özelliklerde %3) ve birkaç eksik hedef
        mask = rng.random(X.shape) < 0.03
        Xm = X.astype(object).mask(mask)
        target = np.array([f"c{c}" for c in y], dtype=object)
        miss_t = rng.choice(n, size=max(1, n // 40), replace=False)
        keep = np.ones(n, dtype=bool)
        keep[miss_t] = False
        Xk = Xm[keep].reset_index(drop=True)
        yk = target[keep]
        classes = sorted(set(yk))
        k_folds = int(rng.choice([3, 4, 5]))
        skf = StratifiedKFold(n_splits=k_folds, shuffle=True, random_state=int(rng.integers(1_000_000)))
        fold_of = np.zeros(len(yk), dtype=int)
        for f_i, (_, te) in enumerate(skf.split(Xk, yk)):
            fold_of[te] = f_i
        num_cols = [c for c in Xk.columns if c.startswith("x")]
        cat_cols = [c for c in Xk.columns if c.startswith("g")]
        Xk[num_cols] = Xk[num_cols].astype(float)
        pre = ColumnTransformer(
            [
                ("num", Pipeline([("imp", SimpleImputer(strategy="median")), ("sc", StandardScaler())]), num_cols),
                *([("cat", Pipeline([("imp", SimpleImputer(strategy="most_frequent")), ("oh", OneHotEncoder(handle_unknown="ignore"))]), cat_cols)] if cat_cols else []),
            ]
        )
        expected: dict = {}
        lr_proba = None
        for name, model in make_models().items():
            accs, f1s, aucs = [], [], []
            for fold in range(k_folds):
                tr, te = np.where(fold_of != fold)[0], np.where(fold_of == fold)[0]
                pipe = Pipeline([("pre", pre), ("m", model)])
                pipe.fit(Xk.iloc[tr], yk[tr])
                pred = pipe.predict(Xk.iloc[te])
                accs.append(accuracy_score(yk[te], pred))
                f1s.append(f1_score(yk[te], pred, average="macro", zero_division=0))
                # bire-karşı-hepsi makro AUC: olasılık varsa olasılıkla, yoksa (SVM) karar fonksiyonuyla
                if hasattr(pipe, "predict_proba") and name != "svm":
                    sc = pipe.predict_proba(Xk.iloc[te])
                else:
                    sc = pipe.decision_function(Xk.iloc[te])
                if len(classes) == 2 and sc.ndim == 2:
                    sc = sc[:, 1]
                if len(classes) == 2:
                    aucs.append(roc_auc_score(yk[te], sc))
                else:
                    # sınıf başına ikili (bire-karşı-hepsi) AUC'lerin ağırlıksız ortalaması
                    aucs.append(np.mean([roc_auc_score(yk[te] == c, sc[:, i]) for i, c in enumerate(classes)]))
                if name == "logistic" and fold == 0:
                    lr_proba = pipe.predict_proba(Xk.iloc[te])
            expected[f"{name}_acc"] = [f(v) for v in accs]
            expected[f"{name}_f1"] = [f(v) for v in f1s]
            expected[f"{name}_auc"] = [f(v) for v in aucs]
        for name, model in alt_models().items():
            accs = []
            for fold in range(k_folds):
                tr, te = np.where(fold_of != fold)[0], np.where(fold_of == fold)[0]
                pipe = Pipeline([("pre", pre), ("m", model)])
                pipe.fit(Xk.iloc[tr], yk[tr])
                accs.append(accuracy_score(yk[te], pipe.predict(Xk.iloc[te])))
            expected[f"{name}_acc_alt"] = [f(v) for v in accs]
        expected["lr_proba0"] = [f(v) for v in lr_proba.ravel()]
        features = []
        for c in num_cols:
            features.append({"name": c, "kind": "numeric", "values": [None if pd.isna(v) else float(v) for v in Xm[c]]})
        for c in cat_cols:
            features.append({"name": c, "kind": "categorical", "values": [None if pd.isna(v) else str(v) for v in Xm[c]]})
        target_full = [None if not keep[i] else str(target[i]) for i in range(n)]
        # TypeScript hedefi eksik satırları çıkarır; katman numaraları yalnızca kalan satırlar içindir
        add(
            "ml_cv",
            {"target": target_full, "features": features, "foldOf": fold_of.tolist(), "classes": classes},
            expected,
        )
