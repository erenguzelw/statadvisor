"""
Referans değer üreticisi.

SciPy, statsmodels, scikit-learn ve scikit-posthocs ile rastgele ama tohumlu vakalar üretir ve sonuçlarını
packages/shared/fixtures/reference.json dosyasına yazar. TypeScript testleri (packages/shared/src/reference.test.ts)
bu dosyayı okuyup kendi sonuçlarını referansla karşılaştırır.

Çalıştırma (kökten):
    tools/reference/.venv/Scripts/python.exe tools/reference/generate.py

Yalnızca referansları yenilemek istediğinizde çalıştırın; üretilen dosya depoya eklenir.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import scipy
import scipy.stats as st
import sklearn
from sklearn.metrics import average_precision_score, roc_auc_score

SEED = 20261013
OUT = Path(__file__).resolve().parents[2] / "packages" / "shared" / "fixtures" / "reference.json"
rng = np.random.default_rng(SEED)


def sample(kind: str, n: int, round_to: int | None = None) -> np.ndarray:
    if kind == "normal":
        x = rng.normal(10, 3, n)
    elif kind == "lognormal":
        x = rng.lognormal(1.0, 0.7, n)
    elif kind == "uniform":
        x = rng.uniform(0, 20, n)
    elif kind == "t3":
        x = rng.standard_t(3, n) * 2 + 5
    elif kind == "expon":
        x = rng.exponential(4, n)
    else:
        raise ValueError(kind)
    if round_to is not None:
        x = np.round(x, round_to)
    return x


KINDS = ["normal", "lognormal", "uniform", "t3", "expon"]
cases: list[dict] = []


def add(test: str, inp: dict, expected: dict) -> None:
    cases.append({"test": test, "input": inp, "expected": expected})


def f(x) -> float:
    return float(x)


def groups_case(k: int, sizes: tuple[int, int], tied: bool):
    groups = []
    for _ in range(k):
        kind = KINDS[rng.integers(len(KINDS))]
        n = int(rng.integers(sizes[0], sizes[1] + 1))
        g = sample(kind, n, round_to=0 if tied else 2) + rng.normal(0, 2)
        groups.append(g)
    return groups


# --- Dağılım fonksiyonları ---
for x in [0.1, 0.5, 1.0, 2.5, 3.84, 5.99, 7.8, 12.0, 25.0, 60.0]:
    for df in [1, 2, 3, 5, 10, 30]:
        add("chi2_sf", {"x": x, "df": df}, {"p": f(st.chi2.sf(x, df))})
for x in [0.3, 1.0, 2.0, 3.2, 4.96, 8.0, 15.0]:
    for d1, d2 in [(1, 10), (2, 12), (2, 42), (3, 20), (5, 100), (4, 7)]:
        add("f_sf", {"x": x, "d1": d1, "d2": d2}, {"p": f(st.f.sf(x, d1, d2))})
for z in [-3.5, -1.96, -0.5, 0.0, 0.7, 1.64, 2.33, 4.0]:
    add("norm_sf", {"z": z}, {"p": f(st.norm.sf(z))})
for p in [0.0005, 0.01, 0.1, 0.5, 0.9, 0.975, 0.9995]:
    add("norm_ppf", {"p": p}, {"z": f(st.norm.ppf(p))})

# --- Shapiro-Wilk ---
for i in range(60):
    kind = KINDS[i % len(KINDS)]
    n = int(rng.choice([3, 4, 5, 6, 8, 11, 12, 20, 35, 50, 100, 250, 600, 1200]))
    x = sample(kind, n, round_to=(1 if i % 4 == 0 else None))
    if len(set(x.tolist())) < 3:
        continue
    r = st.shapiro(x)
    add("shapiro", {"data": x.tolist()}, {"W": f(r.statistic), "p": f(r.pvalue)})
for n in [2000, 5000]:
    x = sample("lognormal", n)
    r = st.shapiro(x)
    add("shapiro", {"data": x.tolist()}, {"W": f(r.statistic), "p": f(r.pvalue)})

# --- Levene (medyan merkezli) ve Kruskal-Wallis ---
for i in range(50):
    k = int(rng.choice([2, 3, 4, 5]))
    groups = groups_case(k, (5, 80), tied=(i % 3 == 0))
    r = st.levene(*groups, center="median")
    add("levene", {"groups": [g.tolist() for g in groups]}, {"F": f(r.statistic), "p": f(r.pvalue)})
    r = st.kruskal(*groups)
    n = sum(len(g) for g in groups)
    add("kruskal", {"groups": [g.tolist() for g in groups]},
        {"H": f(r.statistic), "p": f(r.pvalue), "epsilon2": f(r.statistic) / (n - 1)})

# --- Betimsel istatistik ---
for i in range(30):
    n = int(rng.integers(5, 400))
    x = sample(KINDS[i % len(KINDS)], n, round_to=(1 if i % 2 else None))
    for q in (0.25, 0.5, 0.75, 0.9):
        add("quantile", {"data": x.tolist(), "q": q}, {"value": f(np.quantile(x, q))})
    q1, q3 = np.quantile(x, [0.25, 0.75])
    iqr = q3 - q1
    add("tukey", {"data": x.tolist()},
        {"q1": f(q1), "q3": f(q3), "lower": f(q1 - 1.5 * iqr), "upper": f(q3 + 1.5 * iqr)})

# --- ROC AUC ve ortalama kesinlik (scikit-learn) ---
for i in range(30):
    n = int(rng.integers(40, 600))
    prevalence = float(rng.choice([0.05, 0.1, 0.3, 0.5]))
    y = (rng.random(n) < prevalence).astype(int)
    if y.sum() in (0, n):
        continue
    score = y * rng.normal(0.8, 1, n) + (1 - y) * rng.normal(0, 1, n)
    if i % 3 == 0:
        score = np.round(score, 1)  # bağlar
    add("roc_auc", {"scores": score.tolist(), "labels": y.tolist()}, {"auc": f(roc_auc_score(y, score))})
    add("average_precision", {"scores": score.tolist(), "labels": y.tolist()},
        {"ap": f(average_precision_score(y, score))})

# --- İstatistik çekirdeği tarafından sonradan eklenen testler ---
sys.path.insert(0, str(Path(__file__).resolve().parent))
try:
    import generate_extra  # noqa: E402

    generate_extra.add_all(add, rng, sample, KINDS, groups_case, f)
except ModuleNotFoundError:
    pass

try:
    import generate_ols  # noqa: E402

    generate_ols.add_all(add, f)
except ModuleNotFoundError:
    pass

try:
    import generate_logit  # noqa: E402

    generate_logit.add_all(add, f)
except ModuleNotFoundError:
    pass

try:
    import generate_ml  # noqa: E402

    generate_ml.add_all(add, f)
except ModuleNotFoundError:
    pass

meta = {
    "seed": SEED,
    "python": sys.version.split()[0],
    "numpy": np.__version__,
    "scipy": scipy.__version__,
    "sklearn": sklearn.__version__,
    "cases": len(cases),
}
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps({"meta": meta, "cases": cases}, ensure_ascii=False), encoding="utf-8")
print(f"{len(cases)} vaka yazıldı: {OUT} ({OUT.stat().st_size / 1024:.0f} KB)")
