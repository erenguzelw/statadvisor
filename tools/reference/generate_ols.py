"""
Doğrusal regresyon (EKK) referansları: statsmodels OLS ile tohumlu, çok değişkenli vakalar.
Kategorik yordayıcılar patsy C() ile aynı biçimde kodlanır: sıralı düzeylerin ilki referanstır.
"""
from __future__ import annotations

import numpy as np
import scipy.stats as st
import statsmodels.api as sm
from statsmodels.stats.diagnostic import het_breuschpagan
from statsmodels.stats.outliers_influence import variance_inflation_factor
from statsmodels.stats.stattools import durbin_watson

SEED = 20261014


def add_all(add, f):
    rng = np.random.default_rng(SEED)
    for case in range(40):
        n = int(rng.integers(25, 300))
        n_num = int(rng.integers(1, 5))
        n_cat = int(rng.integers(0, 3))
        base = rng.normal(size=(n, n_num))
        # yordayıcıları birbiriyle ilişkilendir (VIF anlamlı olsun)
        mix = rng.uniform(-0.8, 0.8, size=(n_num, n_num))
        Xn = base @ (np.eye(n_num) + np.triu(mix, 1))
        Xn = Xn * rng.uniform(0.5, 20, size=n_num) + rng.uniform(-30, 30, size=n_num)
        if case % 4 == 0:
            Xn = np.round(Xn, 1)
        cats = []
        for _ in range(n_cat):
            k = int(rng.integers(2, 5))
            labels = rng.choice([f"d{j}" for j in range(k)], size=n)
            if len(set(labels)) < 2:
                labels[0], labels[1] = "d0", "d1"
            cats.append(labels)
        names = [f"x{j}" for j in range(n_num)] + [f"g{j}" for j in range(n_cat)]
        # kolonlar
        cols = [np.ones(n)]
        terms = ["Sabit"]
        for j in range(n_num):
            cols.append(Xn[:, j])
            terms.append(names[j])
        for j, lab in enumerate(cats):
            levels = sorted(set(lab))
            for lv in levels[1:]:
                cols.append((lab == lv).astype(float))
                terms.append(f"g{j}[{lv}]")
        X = np.column_stack(cols)
        beta = rng.normal(0, 2, size=X.shape[1])
        noise = rng.standard_t(8, size=n) * rng.uniform(0.5, 6)
        if case % 5 == 0:  # değişen varyans
            noise = noise * (1 + np.abs(Xn[:, 0]) / (np.abs(Xn[:, 0]).max() + 1e-9) * 3)
        y = X @ beta + noise
        if case % 4 == 1:
            y = np.round(y, 1)
        # eksik değerler: yalnızca dolu satırlarla uydurulur
        miss = np.zeros(n, dtype=bool)
        raw_y = y.astype(object)
        raw_num = [Xn[:, j].astype(object) for j in range(n_num)]
        raw_cat = [lab.astype(object) for lab in cats]
        if case % 3 == 2:
            for arr in [raw_y] + raw_num[:1] + raw_cat[:1]:
                idx = rng.choice(n, size=max(1, n // 12), replace=False)
                for i in idx:
                    arr[i] = None
                    miss[i] = True
        keep = ~miss
        Xf, yf = X[keep], y[keep]
        res = sm.OLS(yf, Xf).fit()
        infl = res.get_influence()
        k = Xf.shape[1]
        stdY = np.std(yf, ddof=1)
        std_beta = [None] + [f(res.params[j] * np.std(Xf[:, j], ddof=1) / stdY) for j in range(1, k)]
        vif = [None] + [f(variance_inflation_factor(Xf, j)) for j in range(1, k)]
        ci = res.conf_int(0.05)
        lm, lm_p, _, _ = het_breuschpagan(res.resid, Xf)
        sw = st.shapiro(res.resid)
        inp_pred = []
        for j in range(n_num):
            inp_pred.append({"name": names[j], "kind": "numeric", "values": [None if v is None else float(v) for v in raw_num[j]]})
        for j in range(n_cat):
            inp_pred.append({"name": names[n_num + j], "kind": "categorical", "values": [None if v is None else str(v) for v in raw_cat[j]]})
        add(
            "ols",
            {"y": [None if v is None else float(v) for v in raw_y], "predictors": inp_pred},
            {
                "b": [f(v) for v in res.params],
                "se": [f(v) for v in res.bse],
                "t": [f(v) for v in res.tvalues],
                "p": [f(v) for v in res.pvalues],
                "ciLow": [f(v) for v in ci[:, 0]],
                "ciHigh": [f(v) for v in ci[:, 1]],
                "beta": std_beta[1:],
                "vif": vif[1:],
                "n": f(res.nobs),
                "r2": f(res.rsquared),
                "adjR2": f(res.rsquared_adj),
                "F": f(res.fvalue),
                "pF": f(res.f_pvalue),
                "sigma": f(np.sqrt(res.scale)),
                "logLik": f(res.llf),
                "aic": f(res.aic),
                "bic": f(res.bic),
                "dw": f(durbin_watson(res.resid)),
                "bpLm": f(lm),
                "bpP": f(lm_p),
                "cooks": [f(v) for v in infl.cooks_distance[0]],
                "hat": [f(v) for v in infl.hat_matrix_diag],
                "shapiroW": f(sw.statistic),
                "shapiroP": f(sw.pvalue),
            },
        )
