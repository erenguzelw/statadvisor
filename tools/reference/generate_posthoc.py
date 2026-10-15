"""
Post-hoc referansları: studentize edilmiş aralık dağılımı (SciPy), Tukey HSD (SciPy `tukey_hsd`) ve
Games-Howell (pingouin `pairwise_gameshowell`; güven aralığı SciPy kritik değeriyle).

Sonsuz serbestlik derecesi JSON'da `null` olarak yazılır.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import pingouin as pg
import scipy.stats as st

SEED = 20261017


def add_all(add, f):
    rng = np.random.default_rng(SEED)
    srd = st.studentized_range

    def df_out(df):
        return None if np.isinf(df) else df

    # --- dağılım: üst kuyruk ve kritik değer ---
    for k in (2, 3, 5, 8, 12):
        for df in (1, 2.5, 5, 10, 30, 120, 1000, np.inf):
            for q in (0.3, 1.0, 2.0, 3.5, 5.0, 8.0):
                add("srange_sf", {"q": q, "k": k, "df": df_out(df)}, {"p": f(srd.sf(q, k, df))})
    for k in (2, 3, 4, 6, 10):
        for df in (2, 5, 10.5, 20, 60, np.inf):
            for p in (0.01, 0.05, 0.1):
                add("srange_ppf", {"p": p, "k": k, "df": df_out(df)}, {"q": f(srd.ppf(1 - p, k, df))})

    # --- Tukey HSD ve Games-Howell: aynı grup kümeleri ---
    for i in range(20):
        k = int(rng.integers(3, 7))
        equal = i % 4 == 0
        n0 = int(rng.integers(5, 30))
        sizes = [n0] * k if equal else [int(rng.integers(4, 40)) for _ in range(k)]
        shifts = rng.normal(0, 1.2, k)
        scales = rng.uniform(0.5, 2.5, k) if i % 2 else np.ones(k)
        groups = [np.round(rng.normal(10 + shifts[j], 2 * scales[j], sizes[j]), 3) for j in range(k)]
        idx = [(a, b) for a in range(k) for b in range(a + 1, k)]

        r = st.tukey_hsd(*groups)
        ci = r.confidence_interval(0.95)
        add("tukey_hsd", {"groups": [g.tolist() for g in groups]}, {
            "diff": [f(r.statistic[a, b]) for a, b in idx],
            "p": [f(r.pvalue[a, b]) for a, b in idx],
            "ciLow": [f(ci.low[a, b]) for a, b in idx],
            "ciHigh": [f(ci.high[a, b]) for a, b in idx],
        })

        df = pd.DataFrame({"y": np.concatenate(groups), "g": np.repeat([f"G{j}" for j in range(k)], sizes)})
        gh = pg.pairwise_gameshowell(data=df, dv="y", between="g", effsize="hedges")
        gh = gh.set_index(["A", "B"])
        rows = [gh.loc[(f"G{a}", f"G{b}")] for a, b in idx]
        crit = [srd.ppf(0.95, k, row["df"]) / np.sqrt(2) for row in rows]
        se = [row["se"] for row in rows]
        diff = [row["diff"] for row in rows]
        add("games_howell", {"groups": [g.tolist() for g in groups]}, {
            "diff": [f(d) for d in diff],
            "t": [f(row["T"]) for row in rows],
            "se": [f(x) for x in se],
            "df": [f(row["df"]) for row in rows],
            "p": [f(row["pval"]) for row in rows],
            "g": [f(row["hedges"]) for row in rows],
            "ciLow": [f(d - c * s) for d, c, s in zip(diff, crit, se)],
            "ciHigh": [f(d + c * s) for d, c, s in zip(diff, crit, se)],
        })
