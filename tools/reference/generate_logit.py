"""
İkili lojistik regresyon referansları: statsmodels Logit ve scikit-learn ile tohumlu vakalar.
Kategorik yordayıcılar generate_ols.py ile aynı kodlanır (sıralı düzeylerin ilki referans).
Hosmer–Lemeshow ve Nagelkerke statsmodels'te yoktur; burada tanımlarıyla hesaplanır
(HL: olasılığa göre kararlı sıralama, np.array_split ile g=10 grup, df = g-2).
"""
from __future__ import annotations

import numpy as np
import scipy.stats as st
import statsmodels.api as sm
from sklearn.metrics import roc_auc_score
from statsmodels.stats.outliers_influence import variance_inflation_factor

SEED = 20261015


def hosmer_lemeshow(y, p, g=10):
    order = np.argsort(p, kind="stable")
    groups = np.array_split(order, g)
    chi2 = 0.0
    for idx in groups:
        n = len(idx)
        obs = y[idx].sum()
        exp = p[idx].sum()
        pbar = exp / n
        chi2 += (obs - exp) ** 2 / (n * pbar * (1 - pbar))
    return chi2, g - 2, st.chi2.sf(chi2, g - 2)


def add_all(add, f):
    rng = np.random.default_rng(SEED)
    made = 0
    case = 0
    while made < 40:
        case += 1
        n = int(rng.integers(80, 500))
        n_num = int(rng.integers(1, 5))
        n_cat = int(rng.integers(0, 3))
        Xn = rng.normal(size=(n, n_num)) * rng.uniform(0.5, 10, size=n_num) + rng.uniform(-20, 20, size=n_num)
        if case % 4 == 0:
            Xn = np.round(Xn, 1)
        cats = []
        for _ in range(n_cat):
            k = int(rng.integers(2, 5))
            labels = rng.choice([f"d{j}" for j in range(k)], size=n)
            if len(set(labels)) < 2:
                labels[0], labels[1] = "d0", "d1"
            cats.append(labels)
        cols = [np.ones(n)]
        for j in range(n_num):
            cols.append((Xn[:, j] - Xn[:, j].mean()) / Xn[:, j].std())
        # tasarım matrisi ham değerlerle kurulur; katsayılar standartlaştırılmış değişkenlerle üretilir
        raw_cols = [np.ones(n)] + [Xn[:, j] for j in range(n_num)]
        for lab in cats:
            levels = sorted(set(lab))
            for lv in levels[1:]:
                cols.append((lab == lv).astype(float))
                raw_cols.append((lab == lv).astype(float))
        Z = np.column_stack(cols)
        beta_true = rng.normal(0, 0.9, size=Z.shape[1])
        beta_true[0] = rng.normal(0, 0.5)
        eta = Z @ beta_true
        prob = 1 / (1 + np.exp(-eta))
        y = (rng.uniform(size=n) < prob).astype(int)
        if y.sum() < 15 or (n - y.sum()) < 15:
            continue
        # eksik değerler
        miss = np.zeros(n, dtype=bool)
        raw_num = [Xn[:, j].astype(object) for j in range(n_num)]
        raw_cat = [lab.astype(object) for lab in cats]
        raw_y = y.astype(object)
        if case % 3 == 2:
            for arr in [raw_y] + raw_num[:1] + raw_cat[:1]:
                idx = rng.choice(n, size=max(1, n // 15), replace=False)
                for i in idx:
                    arr[i] = None
                    miss[i] = True
        keep = ~miss
        X = np.column_stack(raw_cols)[keep]
        yk = y[keep]
        try:
            res = sm.Logit(yk, X).fit(disp=0, maxiter=200, tol=1e-12)
        except Exception:
            continue
        if not res.mle_retvals["converged"]:
            continue
        p = res.predict(X)
        ll, ll0 = res.llf, res.llnull
        n_k = len(yk)
        cs = 1 - np.exp(2 * (ll0 - ll) / n_k)
        mx = 1 - np.exp(2 * ll0 / n_k)
        ci = res.conf_int(0.05)
        hl = hosmer_lemeshow(yk, p)
        pred = (p >= 0.5).astype(int)
        tp = int(((pred == 1) & (yk == 1)).sum())
        fp = int(((pred == 1) & (yk == 0)).sum())
        tn = int(((pred == 0) & (yk == 0)).sum())
        fn = int(((pred == 0) & (yk == 1)).sum())
        names = [f"x{j}" for j in range(n_num)]
        inp_pred = [{"name": names[j], "kind": "numeric", "values": [None if v is None else float(v) for v in raw_num[j]]} for j in range(n_num)]
        for j in range(n_cat):
            inp_pred.append({"name": f"g{j}", "kind": "categorical", "values": [None if v is None else str(v) for v in raw_cat[j]]})
        add(
            "logit",
            {"y": [None if v is None else int(v) for v in raw_y], "predictors": inp_pred},
            {
                "b": [f(v) for v in res.params],
                "se": [f(v) for v in res.bse],
                "z": [f(v) for v in res.tvalues],
                "p": [f(v) for v in res.pvalues],
                "ciLow": [f(v) for v in ci[:, 0]],
                "ciHigh": [f(v) for v in ci[:, 1]],
                "vif": [f(variance_inflation_factor(X, j)) for j in range(1, X.shape[1])],
                "n": f(res.nobs),
                "logLik": f(ll),
                "logLikNull": f(ll0),
                "lrChi2": f(res.llr),
                "lrP": f(res.llr_pvalue),
                "mcFadden": f(res.prsquared),
                "coxSnell": f(cs),
                "nagelkerke": f(cs / mx),
                "aic": f(res.aic),
                "bic": f(res.bic),
                "auc": f(roc_auc_score(yk, p)),
                "hlChi2": f(hl[0]),
                "hlP": f(hl[2]),
                "tp": float(tp),
                "fp": float(fp),
                "tn": float(tn),
                "fn": float(fn),
                "probs": [f(v) for v in p],
            },
        )
        made += 1
