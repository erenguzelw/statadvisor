"""
generate.py tarafından çağrılan ek referanslar: t-testleri, ANOVA, sıra testleri, korelasyon, kategorik testler,
çoklu karşılaştırma ve post-hoc testler. Her vaka SciPy / statsmodels / scikit-posthocs ile hesaplanır.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import scikit_posthocs as sp
import scipy.stats as st
from scipy.stats.contingency import association
from statsmodels.stats.anova import AnovaRM
from statsmodels.stats.multitest import multipletests
from statsmodels.stats.oneway import anova_oneway


def add_all(add, rng, sample, KINDS, groups_case, f):
    def lst(a):
        return np.asarray(a, dtype=float).tolist()

    def pair(n, tied=False):
        kind = KINDS[rng.integers(len(KINDS))]
        x = sample(kind, n, round_to=(0 if tied else None)) + rng.normal(0, 1.5)
        y = sample(KINDS[rng.integers(len(KINDS))], n, round_to=(0 if tied else None)) * rng.uniform(0.7, 1.4)
        return x, y

    # --- t dağılımı ---
    for t in [-3.1, -1.0, 0.0, 0.8, 2.0, 4.5]:
        for df in [1, 2, 5, 10.5, 30, 120]:
            add("t_sf", {"t": t, "df": df}, {"p": f(st.t.sf(t, df)), "p2": f(2 * st.t.sf(abs(t), df))})
    for p in [0.005, 0.025, 0.1, 0.5, 0.9, 0.975, 0.995]:
        for df in [1, 2, 5, 10.5, 30, 120]:
            add("t_ppf", {"p": p, "df": df}, {"t": f(st.t.ppf(p, df))})

    # --- t-testleri ---
    for i in range(30):
        n1, n2 = int(rng.integers(4, 70)), int(rng.integers(4, 70))
        x = sample(KINDS[i % 5], n1) + rng.normal(0, 2)
        y = sample(KINDS[(i + 2) % 5], n2) * rng.uniform(0.6, 1.6)
        for eq in (True, False):
            r = st.ttest_ind(x, y, equal_var=eq)
            ci = r.confidence_interval(0.95)
            sp2 = ((n1 - 1) * np.var(x, ddof=1) + (n2 - 1) * np.var(y, ddof=1)) / (n1 + n2 - 2)
            d = (np.mean(x) - np.mean(y)) / np.sqrt(sp2)
            g = d * (1 - 3 / (4 * (n1 + n2) - 9))
            add("t_ind", {"x": lst(x), "y": lst(y), "equalVar": eq},
                {"t": f(r.statistic), "df": f(r.df), "p": f(r.pvalue), "ciLow": f(ci.low), "ciHigh": f(ci.high),
                 "meanDiff": f(np.mean(x) - np.mean(y)), "d": f(d), "g": f(g)})
    for i in range(20):
        n = int(rng.integers(4, 80))
        x, y = pair(n)
        r = st.ttest_rel(x, y)
        ci = r.confidence_interval(0.95)
        diff = x - y
        dz = np.mean(diff) / np.std(diff, ddof=1)
        add("t_paired", {"x": lst(x), "y": lst(y)},
            {"t": f(r.statistic), "df": f(r.df), "p": f(r.pvalue), "ciLow": f(ci.low), "ciHigh": f(ci.high),
             "meanDiff": f(np.mean(diff)), "d": f(dz), "g": f(dz * (1 - 3 / (4 * (n - 1) - 1)))})

    # --- ANOVA, Welch ANOVA ---
    for i in range(30):
        k = int(rng.choice([2, 3, 4, 5]))
        groups = groups_case(k, (4, 60), tied=False)
        r = st.f_oneway(*groups)
        allv = np.concatenate(groups)
        ssb = sum(len(g) * (np.mean(g) - np.mean(allv)) ** 2 for g in groups)
        ssw = sum(((g - np.mean(g)) ** 2).sum() for g in groups)
        add("anova", {"groups": [lst(g) for g in groups]},
            {"F": f(r.statistic), "p": f(r.pvalue), "eta2": f(ssb / (ssb + ssw))})
        w = anova_oneway(groups, use_var="unequal", welch_correction=True)
        df = w.df if hasattr(w, "df") else (w.df_num, w.df_denom)
        add("welch_anova", {"groups": [lst(g) for g in groups]},
            {"F": f(w.statistic), "p": f(w.pvalue), "df1": f(df[0]), "df2": f(df[1]),
             "eta2": f(ssb / (ssb + ssw))})

    # --- Tekrarlı ölçümler ANOVA ---
    for i in range(15):
        k, n = int(rng.integers(3, 6)), int(rng.integers(5, 40))
        subj = rng.normal(0, 3, n)
        conds = [subj + rng.normal(m, 1.5, n) for m in np.linspace(0, rng.uniform(0, 2), k)]
        df = pd.DataFrame({"subject": np.tile(np.arange(n), k), "cond": np.repeat(np.arange(k), n),
                           "value": np.concatenate(conds)})
        tab = AnovaRM(df, "value", "subject", within=["cond"]).fit().anova_table
        row = tab.iloc[0]
        grand = np.mean(np.concatenate(conds))
        ss_cond = n * sum((np.mean(c) - grand) ** 2 for c in conds)
        subj_means = np.mean(np.vstack(conds), axis=0)
        ss_subj = k * ((subj_means - grand) ** 2).sum()
        ss_tot = ((np.concatenate(conds) - grand) ** 2).sum()
        ss_err = ss_tot - ss_cond - ss_subj
        add("anova_rm", {"conditions": [lst(c) for c in conds]},
            {"F": f(row["F Value"]), "df1": f(row["Num DF"]), "df2": f(row["Den DF"]), "p": f(row["Pr > F"]),
             "partialEta2": f(ss_cond / (ss_cond + ss_err))})

    # --- Mann-Whitney U ---
    for i in range(30):
        small = i % 3 == 0
        n1, n2 = (int(rng.integers(3, 9)), int(rng.integers(3, 9))) if small else (int(rng.integers(5, 60)), int(rng.integers(5, 60)))
        tied = i % 4 == 1
        x = sample(KINDS[i % 5], n1, round_to=(0 if tied else None)) + rng.normal(0, 1)
        y = sample(KINDS[(i + 1) % 5], n2, round_to=(0 if tied else None))
        for method in ("auto", "asymptotic") + (("exact",) if (not tied and n1 <= 12 and n2 <= 12) else ()):
            r = st.mannwhitneyu(x, y, alternative="two-sided", method=method)
            add("mannwhitney", {"x": lst(x), "y": lst(y), "method": method},
                {"U": f(r.statistic), "p": f(r.pvalue), "rankBiserial": f(2 * r.statistic / (n1 * n2) - 1)})

    # --- Wilcoxon işaretli sıra ---
    for i in range(30):
        n = int(rng.integers(5, 70)) if i % 5 else int(rng.integers(5, 25))
        x, y = pair(n, tied=(i % 3 == 0))
        d = x - y
        nz = d[d != 0]
        if len(nz) < 3:
            continue
        r = st.wilcoxon(x, y, alternative="two-sided", method="auto")
        ranks = st.rankdata(np.abs(nz))
        wp, wm = ranks[nz > 0].sum(), ranks[nz < 0].sum()
        add("wilcoxon", {"x": lst(x), "y": lst(y), "method": "auto"},
            {"W": f(r.statistic), "p": f(r.pvalue), "rankBiserial": f((wp - wm) / (wp + wm))})
        if len(set(np.abs(nz).tolist())) == len(nz) and len(nz) == len(d) and n <= 40:
            r2 = st.wilcoxon(x, y, alternative="two-sided", method="exact")
            add("wilcoxon", {"x": lst(x), "y": lst(y), "method": "exact"}, {"W": f(r2.statistic), "p": f(r2.pvalue)})
        r3 = st.wilcoxon(x, y, alternative="two-sided", method="approx")
        add("wilcoxon", {"x": lst(x), "y": lst(y), "method": "approx"}, {"W": f(r3.statistic), "p": f(r3.pvalue)})

    # --- Friedman ---
    for i in range(20):
        k, n = int(rng.integers(3, 6)), int(rng.integers(5, 50))
        subj = rng.normal(0, 2, n)
        conds = [subj + rng.normal(m, 1.2, n) for m in np.linspace(0, rng.uniform(0, 1.5), k)]
        if i % 3 == 0:
            conds = [np.round(c) for c in conds]
        r = st.friedmanchisquare(*conds)
        add("friedman", {"conditions": [lst(c) for c in conds]},
            {"chi2": f(r.statistic), "p": f(r.pvalue), "kendallW": f(r.statistic / (n * (k - 1)))})

    # --- Korelasyon ---
    for i in range(30):
        n = int(rng.integers(6, 250))
        x = sample(KINDS[i % 5], n, round_to=(1 if i % 4 == 0 else None))
        y = rng.uniform(-0.8, 0.9) * (x - x.mean()) / (x.std() + 1e-9) + rng.normal(0, 1, n)
        if i % 4 == 0:
            y = np.round(y, 1)
        rp = st.pearsonr(x, y)
        ci = rp.confidence_interval(0.95)
        add("pearson", {"x": lst(x), "y": lst(y)}, {"r": f(rp.statistic), "p": f(rp.pvalue), "ciLow": f(ci.low), "ciHigh": f(ci.high)})
        rs = st.spearmanr(x, y)
        z = np.arctanh(rs.statistic)
        se = 1 / np.sqrt(n - 3)
        crit = st.norm.ppf(0.975)
        add("spearman", {"x": lst(x), "y": lst(y)},
            {"r": f(rs.statistic), "p": f(rs.pvalue), "ciLow": f(np.tanh(z - crit * se)), "ciHigh": f(np.tanh(z + crit * se))})

    # --- Ki-kare ve Fisher ---
    for i in range(30):
        r_, c_ = int(rng.integers(2, 5)), int(rng.integers(2, 6))
        if i % 3 == 0:
            r_, c_ = 2, 2
        base = rng.integers(3, 80, size=(r_, c_))
        table = base.astype(float)
        res = st.chi2_contingency(table, correction=True)
        low = float((res.expected_freq < 5).mean())
        add("chi2_table", {"table": table.tolist()},
            {"chi2": f(res.statistic), "df": f(res.dof), "p": f(res.pvalue), "cramersV": f(association(base, method="cramer", correction=False)),
             "lowShare": low})
    for i in range(30):
        t = rng.integers(0, 25, size=(2, 2))
        if t.sum() == 0 or (t.sum(axis=0) == 0).any() or (t.sum(axis=1) == 0).any():
            continue
        r = st.fisher_exact(t.tolist(), alternative="two-sided")
        odds = f(r.statistic)
        if not np.isfinite(odds):
            odds = None
        add("fisher", {"table": t.tolist()}, {"p": f(r.pvalue), **({"oddsRatio": odds} if odds is not None else {})})

    # --- Çoklu karşılaştırma düzeltmeleri ---
    for i in range(20):
        m = int(rng.integers(2, 30))
        p = np.sort(rng.beta(0.5, 3, m)) if i % 2 else rng.beta(0.5, 3, m)
        for ours, theirs in (("holm", "holm"), ("bonferroni", "bonferroni"), ("fdr_bh", "fdr_bh")):
            adj = multipletests(p, method=theirs)[1]
            add("adjust", {"p": lst(p), "method": ours}, {"adj": lst(adj)})

    # --- Post-hoc ---
    for i in range(15):
        k = int(rng.choice([3, 4, 5]))
        groups = groups_case(k, (5, 40), tied=(i % 3 == 0))
        raw = sp.posthoc_dunn([g for g in groups], p_adjust=None).to_numpy()
        holm = sp.posthoc_dunn([g for g in groups], p_adjust="holm").to_numpy()
        idx = [(a, b) for a in range(k) for b in range(a + 1, k)]
        add("dunn", {"groups": [lst(g) for g in groups]},
            {"p": [f(raw[a, b]) for a, b in idx], "pAdj": [f(holm[a, b]) for a, b in idx]})
        ps = [f(st.ttest_ind(groups[a], groups[b], equal_var=False).pvalue) for a, b in idx]
        add("pairwise_welch", {"groups": [lst(g) for g in groups]},
            {"p": ps, "pAdj": lst(multipletests(ps, method="holm")[1])})
