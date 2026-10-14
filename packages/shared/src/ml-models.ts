/**
 * Sınıflandırıcılar (çok sınıflı). Her modelin varsayılanları scikit-learn'ün varsayılanlarıyla aynıdır; böylece
 * üretilen Python kodu aynı modelleri kurar:
 *  - Lojistik: LogisticRegression(C=1, lbfgs) — K > 2 için çok terimli (softmax), K = 2 için tek katsayı vektörü
 *  - Karar ağacı: DecisionTreeClassifier() — gini, derinlik sınırı yok, min_samples_leaf=1
 *  - k-NN: KNeighborsClassifier(n_neighbors=5), öklid
 *  - SVM: SVC(kernel="rbf", C=1, gamma="scale"), bire-bir (OvO) çok sınıflı
 *  - Rastgele orman: RandomForestClassifier(n_estimators=100), max_features=sqrt
 *  - Gradyan artırma: GradientBoostingClassifier(n_estimators=100, learning_rate=0.1, max_depth=3)
 * Rastgelelik içeren modellerde (ağaç, orman) tohum sabittir ama scikit-learn ile aynı sayı dizisini üretmez;
 * bu yüzden sonuçlar aynı katmanlarda bile birkaç binde farklı çıkabilir.
 */
import { mulberry32 } from './ml.ts';
import type { Matrix } from './ml-prep.ts';

export interface Classifier {
  predict(X: Matrix): Int32Array;
  /** Sınıf olasılıkları (n × K, satır öncelikli); SVM gibi olasılık üretmeyen modellerde yoktur. */
  proba?(X: Matrix): Float64Array;
}
export type Fit = (X: Matrix, y: Int32Array, K: number) => Classifier;

const argmaxRows = (P: Float64Array, n: number, K: number): Int32Array => {
  const out = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    let best = 0;
    for (let k = 1; k < K; k++) if (P[i * K + k]! > P[i * K + best]!) best = k;
    out[i] = best;
  }
  return out;
};

/* ------------------------------------------------------------------ */
/* L-BFGS                                                              */
/* ------------------------------------------------------------------ */

type Objective = (x: Float64Array, g: Float64Array) => number;

function lbfgs(f: Objective, x0: Float64Array, opts: { m?: number; maxIter?: number; gtol?: number } = {}): Float64Array {
  const m = opts.m ?? 10;
  const maxIter = opts.maxIter ?? 1000;
  const gtol = opts.gtol ?? 1e-7;
  const d = x0.length;
  let x = Float64Array.from(x0);
  let g = new Float64Array(d);
  let fx = f(x, g);
  const S: Float64Array[] = [];
  const Y: Float64Array[] = [];
  const rho: number[] = [];
  const dot = (a: Float64Array, b: Float64Array) => {
    let s = 0;
    for (let i = 0; i < d; i++) s += a[i]! * b[i]!;
    return s;
  };
  for (let iter = 0; iter < maxIter; iter++) {
    let gmax = 0;
    for (let i = 0; i < d; i++) gmax = Math.max(gmax, Math.abs(g[i]!));
    if (gmax < gtol) break;
    // iki döngülü özyineleme
    const q = Float64Array.from(g);
    const alpha: number[] = new Array(S.length);
    for (let i = S.length - 1; i >= 0; i--) {
      alpha[i] = rho[i]! * dot(S[i]!, q);
      for (let j = 0; j < d; j++) q[j]! -= alpha[i]! * Y[i]![j]!;
    }
    if (S.length) {
      const gamma = dot(S[S.length - 1]!, Y[Y.length - 1]!) / dot(Y[Y.length - 1]!, Y[Y.length - 1]!);
      for (let j = 0; j < d; j++) q[j]! *= gamma;
    } else {
      const gn = Math.sqrt(dot(g, g));
      for (let j = 0; j < d; j++) q[j]! /= Math.max(1, gn);
    }
    for (let i = 0; i < S.length; i++) {
      const beta = rho[i]! * dot(Y[i]!, q);
      for (let j = 0; j < d; j++) q[j]! += S[i]![j]! * (alpha[i]! - beta);
    }
    const dir = q.map((v) => -v);
    let slope = dot(g, dir);
    if (slope >= 0) {
      // yön iniş yönü değil: gradyana dön, geçmişi sıfırla
      for (let j = 0; j < d; j++) dir[j] = -g[j]!;
      slope = dot(g, dir);
      S.length = 0;
      Y.length = 0;
      rho.length = 0;
    }
    // geri izlemeli (Armijo) doğrusal arama
    let step = 1;
    const xNew = new Float64Array(d);
    const gNew = new Float64Array(d);
    let fNew = fx;
    let ok = false;
    for (let t = 0; t < 40; t++) {
      for (let j = 0; j < d; j++) xNew[j] = x[j]! + step * dir[j]!;
      fNew = f(xNew, gNew);
      if (Number.isFinite(fNew) && fNew <= fx + 1e-4 * step * slope) {
        ok = true;
        break;
      }
      step *= 0.5;
    }
    if (!ok) break;
    const s = new Float64Array(d);
    const y = new Float64Array(d);
    for (let j = 0; j < d; j++) {
      s[j] = xNew[j]! - x[j]!;
      y[j] = gNew[j]! - g[j]!;
    }
    const sy = dot(s, y);
    if (sy > 1e-12) {
      S.push(s);
      Y.push(y);
      rho.push(1 / sy);
      if (S.length > m) {
        S.shift();
        Y.shift();
        rho.shift();
      }
    }
    const fOld = fx;
    x = Float64Array.from(xNew);
    g = Float64Array.from(gNew);
    fx = fNew;
    if (Math.abs(fOld - fx) <= 1e-15 * Math.max(1, Math.abs(fx))) break;
  }
  return x;
}

/* ------------------------------------------------------------------ */
/* Lojistik regresyon (L2, C = 1)                                      */
/* ------------------------------------------------------------------ */

export function fitLogisticClassifier(X: Matrix, y: Int32Array, K: number, C = 1): Classifier {
  const { n, p, data } = X;
  const binary = K === 2;
  const rows = binary ? 1 : K;
  // θ = [W (rows × p), b (rows)]; hedef: ortalama kayıp + ‖W‖² / (2·C·n)  (scikit-learn ile aynı)
  const objective: Objective = (theta, grad) => {
    grad.fill(0);
    let loss = 0;
    const z = new Float64Array(rows);
    for (let i = 0; i < n; i++) {
      const off = i * p;
      for (let r = 0; r < rows; r++) {
        let s = theta[rows * p + r]!;
        const w = r * p;
        for (let j = 0; j < p; j++) s += theta[w + j]! * data[off + j]!;
        z[r] = s;
      }
      if (binary) {
        const t = y[i] === 1 ? 1 : 0;
        const s = z[0]!;
        // log(1 + e^s) − t·s, kararlı biçim
        loss += (s > 0 ? s + Math.log1p(Math.exp(-s)) : Math.log1p(Math.exp(s))) - t * s;
        const pr = s >= 0 ? 1 / (1 + Math.exp(-s)) : Math.exp(s) / (1 + Math.exp(s));
        const e = pr - t;
        for (let j = 0; j < p; j++) grad[j]! += e * data[off + j]!;
        grad[p]! += e;
      } else {
        let zmax = -Infinity;
        for (let r = 0; r < K; r++) zmax = Math.max(zmax, z[r]!);
        const zy = z[y[i]!]!;
        let sum = 0;
        for (let r = 0; r < K; r++) {
          z[r] = Math.exp(z[r]! - zmax);
          sum += z[r]!;
        }
        loss += Math.log(sum) + zmax - zy; // −log p(doğru sınıf)
        for (let r = 0; r < K; r++) {
          const e = z[r]! / sum - (y[i] === r ? 1 : 0);
          const w = r * p;
          for (let j = 0; j < p; j++) grad[w + j]! += e * data[off + j]!;
          grad[rows * p + r]! += e;
        }
      }
    }
    let reg = 0;
    for (let j = 0; j < rows * p; j++) {
      reg += theta[j]! * theta[j]!;
      grad[j]! = grad[j]! / n + theta[j]! / (C * n);
    }
    for (let r = 0; r < rows; r++) grad[rows * p + r]! /= n;
    return loss / n + reg / (2 * C * n);
  };
  const theta = lbfgs(objective, new Float64Array(rows * p + rows), { maxIter: 2000, gtol: 1e-8 });
  const proba = (T: Matrix): Float64Array => {
    const out = new Float64Array(T.n * K);
    const z = new Float64Array(rows);
    for (let i = 0; i < T.n; i++) {
      const off = i * p;
      for (let r = 0; r < rows; r++) {
        let s = theta[rows * p + r]!;
        const w = r * p;
        for (let j = 0; j < p; j++) s += theta[w + j]! * T.data[off + j]!;
        z[r] = s;
      }
      if (binary) {
        const pr = z[0]! >= 0 ? 1 / (1 + Math.exp(-z[0]!)) : Math.exp(z[0]!) / (1 + Math.exp(z[0]!));
        out[i * 2] = 1 - pr;
        out[i * 2 + 1] = pr;
      } else {
        let zmax = -Infinity;
        for (let r = 0; r < K; r++) zmax = Math.max(zmax, z[r]!);
        let sum = 0;
        for (let r = 0; r < K; r++) {
          z[r] = Math.exp(z[r]! - zmax);
          sum += z[r]!;
        }
        for (let r = 0; r < K; r++) out[i * K + r] = z[r]! / sum;
      }
    }
    return out;
  };
  return { proba, predict: (T) => argmaxRows(proba(T), T.n, K) };
}

/* ------------------------------------------------------------------ */
/* Karar ağacı (CART, gini) — sıralı listeleri bölerek                 */
/* ------------------------------------------------------------------ */

interface TreeArrays {
  feature: number[];
  threshold: number[];
  left: number[];
  right: number[];
  /** Yaprak için sınıf dağılımı (ağırlıklı, toplamı 1). */
  dist: (Float64Array | null)[];
}

function newTree(): TreeArrays {
  return { feature: [], threshold: [], left: [], right: [], dist: [] };
}

/** Her özellik için, verilen satırları değere göre sıralı döndürür (bir kez). */
function presort(X: Matrix, rows: Int32Array): Int32Array[] {
  const { p, data } = X;
  return Array.from({ length: p }, (_, f) => {
    const idx = Int32Array.from(rows);
    return idx.sort((a, b) => data[a * p + f]! - data[b * p + f]! || a - b);
  });
}

interface ClassTreeOpts {
  maxDepth: number;
  minLeaf: number;
  /** Her bölünmede denenecek özellik sayısı (null: hepsi). */
  mtry: number | null;
  rng: () => number;
}

/**
 * Sınıflandırma ağacı. `w` satır ağırlıklarıdır (önyükleme sayıları); ağırlığı 0 olan satırlar ağaca girmez.
 * `sorted`, tüm eğitim satırlarının özellik başına sıralı listesidir (yalnızca ağırlığı > 0 olanlar süzülür).
 */
function growClassTree(X: Matrix, y: Int32Array, K: number, w: Float64Array, sorted: Int32Array[], o: ClassTreeOpts): TreeArrays {
  const { p, data } = X;
  const tree = newTree();
  const goesLeft = new Uint8Array(X.n);
  const lists0 = sorted.map((s) => s.filter((r) => w[r]! > 0));

  const build = (lists: Int32Array[], depth: number): number => {
    const rows = lists[0]!;
    const m = rows.length;
    const counts = new Float64Array(K);
    let W = 0;
    for (let i = 0; i < m; i++) {
      counts[y[rows[i]!]!]! += w[rows[i]!]!;
      W += w[rows[i]!]!;
    }
    const make = (): number => {
      const id = tree.feature.length;
      tree.feature.push(-1);
      tree.threshold.push(0);
      tree.left.push(-1);
      tree.right.push(-1);
      tree.dist.push(counts.map((c) => c / W));
      return id;
    };
    const pure = counts.some((c) => c === W);
    if (pure || m < 2 || depth >= o.maxDepth || m < 2 * o.minLeaf) return make();

    let bestScore = -Infinity;
    let bestF = -1;
    let bestPos = -1;
    let bestThr = 0;
    const order: number[] = [];
    if (o.mtry === null || o.mtry >= p) for (let f = 0; f < p; f++) order.push(f);
    else {
      const all = Array.from({ length: p }, (_, i) => i);
      for (let i = p - 1; i > 0; i--) {
        const j = Math.floor(o.rng() * (i + 1));
        [all[i], all[j]] = [all[j]!, all[i]!];
      }
      order.push(...all);
    }
    const left = new Float64Array(K);
    let tried = 0;
    for (const f of order) {
      // mtry kadar özellik denendikten sonra, geçerli bir bölünme bulunduysa dur (scikit-learn ile aynı)
      if (o.mtry !== null && tried >= o.mtry && bestF >= 0) break;
      tried++;
      const list = lists[f]!;
      left.fill(0);
      let Wl = 0;
      for (let k = 0; k < m - 1; k++) {
        const r = list[k]!;
        left[y[r]!]! += w[r]!;
        Wl += w[r]!;
        const a = data[r * p + f]!;
        const b = data[list[k + 1]! * p + f]!;
        if (a === b) continue;
        const nl = k + 1;
        if (nl < o.minLeaf || m - nl < o.minLeaf) continue;
        const Wr = W - Wl;
        let sl = 0;
        let sr = 0;
        for (let c = 0; c < K; c++) {
          sl += left[c]! * left[c]!;
          const rc = counts[c]! - left[c]!;
          sr += rc * rc;
        }
        const score = sl / Wl + sr / Wr;
        if (score > bestScore + 1e-12) {
          bestScore = score;
          bestF = f;
          bestPos = k;
          let t = (a + b) / 2;
          if (t === b) t = a;
          bestThr = t;
        }
      }
    }
    if (bestF < 0) return make();

    // sıralı listeleri kararlı biçimde ikiye böl
    const best = lists[bestF]!;
    for (let k = 0; k < m; k++) goesLeft[best[k]!] = k <= bestPos ? 1 : 0;
    const nl = bestPos + 1;
    const lLists: Int32Array[] = [];
    const rLists: Int32Array[] = [];
    for (let f = 0; f < p; f++) {
      const src = lists[f]!;
      const l = new Int32Array(nl);
      const r = new Int32Array(m - nl);
      let li = 0;
      let ri = 0;
      for (let k = 0; k < m; k++) {
        const row = src[k]!;
        if (goesLeft[row]) l[li++] = row;
        else r[ri++] = row;
      }
      lLists.push(l);
      rLists.push(r);
    }
    const id = tree.feature.length;
    tree.feature.push(bestF);
    tree.threshold.push(bestThr);
    tree.left.push(-1);
    tree.right.push(-1);
    tree.dist.push(null);
    const li = build(lLists, depth + 1);
    const ri = build(rLists, depth + 1);
    tree.left[id] = li;
    tree.right[id] = ri;
    return id;
  };
  build(lists0, 0);
  return tree;
}

function treeLeaf(t: TreeArrays, data: Float64Array, p: number, row: number): Float64Array {
  let node = 0;
  while (t.feature[node]! >= 0) node = data[row * p + t.feature[node]!]! <= t.threshold[node]! ? t.left[node]! : t.right[node]!;
  return t.dist[node]!;
}

export interface TreeOptions {
  maxDepth?: number;
  minLeaf?: number;
}

export function fitDecisionTree(X: Matrix, y: Int32Array, K: number, opts: TreeOptions = {}): Classifier {
  const w = new Float64Array(X.n).fill(1);
  const all = Int32Array.from({ length: X.n }, (_, i) => i);
  const tree = growClassTree(X, y, K, w, presort(X, all), { maxDepth: opts.maxDepth ?? Infinity, minLeaf: opts.minLeaf ?? 1, mtry: null, rng: mulberry32(0) });
  const proba = (T: Matrix) => {
    const out = new Float64Array(T.n * K);
    for (let i = 0; i < T.n; i++) out.set(treeLeaf(tree, T.data, T.p, i), i * K);
    return out;
  };
  return { proba, predict: (T) => argmaxRows(proba(T), T.n, K) };
}

export interface ForestOptions extends TreeOptions {
  trees?: number;
  seed?: number;
}

export function fitRandomForestClassifier(X: Matrix, y: Int32Array, K: number, opts: ForestOptions = {}): Classifier {
  const trees = opts.trees ?? 100;
  const rng = mulberry32(opts.seed ?? 42);
  const mtry = Math.max(1, Math.floor(Math.sqrt(X.p)));
  const all = Int32Array.from({ length: X.n }, (_, i) => i);
  const sorted = presort(X, all);
  const forest: TreeArrays[] = [];
  for (let t = 0; t < trees; t++) {
    const w = new Float64Array(X.n);
    for (let i = 0; i < X.n; i++) w[Math.floor(rng() * X.n)]! += 1;
    forest.push(growClassTree(X, y, K, w, sorted, { maxDepth: opts.maxDepth ?? Infinity, minLeaf: opts.minLeaf ?? 1, mtry, rng }));
  }
  const proba = (T: Matrix) => {
    const out = new Float64Array(T.n * K);
    for (const tree of forest) {
      for (let i = 0; i < T.n; i++) {
        const d = treeLeaf(tree, T.data, T.p, i);
        for (let c = 0; c < K; c++) out[i * K + c]! += d[c]! / trees;
      }
    }
    return out;
  };
  return { proba, predict: (T) => argmaxRows(proba(T), T.n, K) };
}

/* ------------------------------------------------------------------ */
/* k-en yakın komşu                                                    */
/* ------------------------------------------------------------------ */

export function fitKnn(X: Matrix, y: Int32Array, K: number, k = 5): Classifier {
  const { n, p, data } = X;
  const kk = Math.min(k, n);
  const proba = (T: Matrix): Float64Array => {
    const out = new Float64Array(T.n * K);
    const bestD = new Float64Array(kk);
    const bestI = new Int32Array(kk);
    for (let i = 0; i < T.n; i++) {
      const off = i * p;
      let filled = 0;
      for (let t = 0; t < n; t++) {
        let d = 0;
        const to = t * p;
        for (let j = 0; j < p; j++) {
          const diff = T.data[off + j]! - data[to + j]!;
          d += diff * diff;
        }
        if (filled < kk) {
          let pos = filled++;
          while (pos > 0 && bestD[pos - 1]! > d) {
            bestD[pos] = bestD[pos - 1]!;
            bestI[pos] = bestI[pos - 1]!;
            pos--;
          }
          bestD[pos] = d;
          bestI[pos] = t;
        } else if (d < bestD[kk - 1]!) {
          let pos = kk - 1;
          while (pos > 0 && bestD[pos - 1]! > d) {
            bestD[pos] = bestD[pos - 1]!;
            bestI[pos] = bestI[pos - 1]!;
            pos--;
          }
          bestD[pos] = d;
          bestI[pos] = t;
        }
      }
      for (let q = 0; q < kk; q++) out[i * K + y[bestI[q]!]!]! += 1 / kk;
    }
    return out;
  };
  return { proba, predict: (T) => argmaxRows(proba(T), T.n, K) };
}

/* ------------------------------------------------------------------ */
/* SVM (RBF çekirdek, SMO; libsvm'in çalışan küme seçimi)              */
/* ------------------------------------------------------------------ */

interface BinarySvm {
  sv: Int32Array;
  coef: Float64Array;
  rho: number;
}

function trainBinarySvm(X: Matrix, rows: Int32Array, sign: Int8Array, gamma: number, C: number, cacheBytes: number): BinarySvm {
  const m = rows.length;
  const { p, data } = X;
  const alpha = new Float64Array(m);
  const G = new Float64Array(m).fill(-1);
  const cacheRows = Math.max(2, Math.min(m, Math.floor(cacheBytes / (8 * m))));
  const cache = new Map<number, Float64Array>();
  const kernelRow = (i: number): Float64Array => {
    const hit = cache.get(i);
    if (hit) {
      cache.delete(i);
      cache.set(i, hit);
      return hit;
    }
    const row = new Float64Array(m);
    const io = rows[i]! * p;
    for (let t = 0; t < m; t++) {
      const to = rows[t]! * p;
      let d = 0;
      for (let j = 0; j < p; j++) {
        const diff = data[io + j]! - data[to + j]!;
        d += diff * diff;
      }
      row[t] = Math.exp(-gamma * d);
    }
    if (cache.size >= cacheRows) cache.delete(cache.keys().next().value!);
    cache.set(i, row);
    return row;
  };
  const EPS = 1e-3;
  const TAU = 1e-12;
  const maxIter = Math.max(10_000_000, 100 * m);
  for (let iter = 0; iter < maxIter; iter++) {
    // i: I_up üzerinde −y·G'nin en büyüğü
    let gmax = -Infinity;
    let i = -1;
    for (let t = 0; t < m; t++) {
      const up = sign[t] === 1 ? alpha[t]! < C : alpha[t]! > 0;
      if (up) {
        const v = -sign[t]! * G[t]!;
        if (v >= gmax) {
          gmax = v;
          i = t;
        }
      }
    }
    if (i < 0) break;
    const Ki = kernelRow(i);
    let gmax2 = -Infinity;
    let j = -1;
    let bestObj = Infinity;
    for (let t = 0; t < m; t++) {
      const low = sign[t] === 1 ? alpha[t]! > 0 : alpha[t]! < C;
      if (!low) continue;
      const yg = sign[t]! * G[t]!;
      if (yg >= gmax2) gmax2 = yg;
      const gradDiff = gmax + yg;
      if (gradDiff > 0) {
        let a = 1 + 1 - 2 * Ki[t]!;
        if (a <= 0) a = TAU;
        const obj = -(gradDiff * gradDiff) / a;
        if (obj <= bestObj) {
          bestObj = obj;
          j = t;
        }
      }
    }
    if (gmax + gmax2 < EPS || j < 0) break;
    const Kj = kernelRow(j);
    const oldAi = alpha[i]!;
    const oldAj = alpha[j]!;
    let quad = 2 - 2 * Ki[j]!;
    if (quad <= 0) quad = TAU;
    if (sign[i] !== sign[j]) {
      const delta = (-G[i]! - G[j]!) / quad;
      const diff = alpha[i]! - alpha[j]!;
      alpha[i]! += delta;
      alpha[j]! += delta;
      if (diff > 0) {
        if (alpha[j]! < 0) {
          alpha[j] = 0;
          alpha[i] = diff;
        }
      } else if (alpha[i]! < 0) {
        alpha[i] = 0;
        alpha[j] = -diff;
      }
      if (diff > 0) {
        if (alpha[i]! > C) {
          alpha[i] = C;
          alpha[j] = C - diff;
        }
      } else if (alpha[j]! > C) {
        alpha[j] = C;
        alpha[i] = C + diff;
      }
    } else {
      const delta = (G[i]! - G[j]!) / quad;
      const sum = alpha[i]! + alpha[j]!;
      alpha[i]! -= delta;
      alpha[j]! += delta;
      if (sum > C) {
        if (alpha[i]! > C) {
          alpha[i] = C;
          alpha[j] = sum - C;
        }
      } else if (alpha[j]! < 0) {
        alpha[j] = 0;
        alpha[i] = sum;
      }
      if (sum > C) {
        if (alpha[j]! > C) {
          alpha[j] = C;
          alpha[i] = sum - C;
        }
      } else if (alpha[i]! < 0) {
        alpha[i] = 0;
        alpha[j] = sum;
      }
    }
    const dAi = alpha[i]! - oldAi;
    const dAj = alpha[j]! - oldAj;
    const yi = sign[i]!;
    const yj = sign[j]!;
    for (let t = 0; t < m; t++) G[t]! += sign[t]! * (yi * Ki[t]! * dAi + yj * Kj[t]! * dAj);
  }
  // ρ
  let ub = Infinity;
  let lb = -Infinity;
  let sumFree = 0;
  let nFree = 0;
  for (let t = 0; t < m; t++) {
    const yG = sign[t]! * G[t]!;
    if (alpha[t]! >= C) {
      if (sign[t] === -1) ub = Math.min(ub, yG);
      else lb = Math.max(lb, yG);
    } else if (alpha[t]! <= 0) {
      if (sign[t] === 1) ub = Math.min(ub, yG);
      else lb = Math.max(lb, yG);
    } else {
      nFree++;
      sumFree += yG;
    }
  }
  const rho = nFree > 0 ? sumFree / nFree : (ub + lb) / 2;
  const svIdx: number[] = [];
  for (let t = 0; t < m; t++) if (alpha[t]! > 0) svIdx.push(t);
  return { sv: Int32Array.from(svIdx.map((t) => rows[t]!)), coef: Float64Array.from(svIdx.map((t) => alpha[t]! * sign[t]!)), rho };
}

export interface SvmOptions {
  C?: number;
  /** Çekirdek önbelleği (bayt). */
  cacheBytes?: number;
}

export function fitSvm(X: Matrix, y: Int32Array, K: number, opts: SvmOptions = {}): Classifier {
  const C = opts.C ?? 1;
  // gamma="scale": 1 / (p · Var(X)), varyans tüm matrisin elemanları üzerindendir
  let mean = 0;
  for (let i = 0; i < X.data.length; i++) mean += X.data[i]!;
  mean /= X.data.length;
  let v = 0;
  for (let i = 0; i < X.data.length; i++) v += (X.data[i]! - mean) ** 2;
  v /= X.data.length;
  const gamma = v > 0 ? 1 / (X.p * v) : 1;
  const byClass: number[][] = Array.from({ length: K }, () => []);
  y.forEach((c, i) => byClass[c]!.push(i));
  const pairs: { a: number; b: number; model: BinarySvm }[] = [];
  for (let a = 0; a < K; a++) {
    for (let b = a + 1; b < K; b++) {
      const rows = Int32Array.from([...byClass[a]!, ...byClass[b]!]);
      const sign = Int8Array.from(rows, (_, t) => (t < byClass[a]!.length ? 1 : -1));
      pairs.push({ a, b, model: trainBinarySvm(X, rows, sign, gamma, C, opts.cacheBytes ?? 200 * 1024 * 1024) });
    }
  }
  const predict = (T: Matrix): Int32Array => {
    const out = new Int32Array(T.n);
    const votes = new Int32Array(K);
    const { p, data } = X;
    for (let i = 0; i < T.n; i++) {
      votes.fill(0);
      const off = i * p;
      for (const { a, b, model } of pairs) {
        let s = -model.rho;
        for (let q = 0; q < model.sv.length; q++) {
          const so = model.sv[q]! * p;
          let d = 0;
          for (let j = 0; j < p; j++) {
            const diff = T.data[off + j]! - data[so + j]!;
            d += diff * diff;
          }
          s += model.coef[q]! * Math.exp(-gamma * d);
        }
        votes[s > 0 ? a : b]!++;
      }
      let best = 0;
      for (let c = 1; c < K; c++) if (votes[c]! > votes[best]!) best = c;
      out[i] = best;
    }
    return out;
  };
  return { predict };
}

/* ------------------------------------------------------------------ */
/* Gradyan artırma (mantıksal/çok terimli kayıp)                       */
/* ------------------------------------------------------------------ */

interface RegTree {
  feature: number[];
  threshold: number[];
  left: number[];
  right: number[];
  value: number[];
}

/** Regresyon ağacı (kare hata azalması), `leafOf` her eğitim satırının yaprağını verir. */
function growRegTree(X: Matrix, r: Float64Array, sorted: Int32Array[], maxDepth: number): { tree: RegTree; leafOf: Int32Array } {
  const { p, data } = X;
  const tree: RegTree = { feature: [], threshold: [], left: [], right: [], value: [] };
  const leafOf = new Int32Array(X.n);
  const goesLeft = new Uint8Array(X.n);
  const build = (lists: Int32Array[], depth: number): number => {
    const rows = lists[0]!;
    const m = rows.length;
    const id = tree.feature.length;
    tree.feature.push(-1);
    tree.threshold.push(0);
    tree.left.push(-1);
    tree.right.push(-1);
    tree.value.push(0);
    const leaf = () => {
      for (let i = 0; i < m; i++) leafOf[rows[i]!] = id;
      return id;
    };
    if (depth >= maxDepth || m < 2) return leaf();
    let total = 0;
    for (let i = 0; i < m; i++) total += r[rows[i]!]!;
    let bestScore = -Infinity;
    let bestF = -1;
    let bestPos = -1;
    let bestThr = 0;
    for (let f = 0; f < p; f++) {
      const list = lists[f]!;
      let left = 0;
      for (let k = 0; k < m - 1; k++) {
        left += r[list[k]!]!;
        const a = data[list[k]! * p + f]!;
        const b = data[list[k + 1]! * p + f]!;
        if (a === b) continue;
        const nl = k + 1;
        const right = total - left;
        const score = (left * left) / nl + (right * right) / (m - nl);
        if (score > bestScore + 1e-12) {
          bestScore = score;
          bestF = f;
          bestPos = k;
          let t = (a + b) / 2;
          if (t === b) t = a;
          bestThr = t;
        }
      }
    }
    if (bestF < 0) return leaf();
    const best = lists[bestF]!;
    for (let k = 0; k < m; k++) goesLeft[best[k]!] = k <= bestPos ? 1 : 0;
    const nl = bestPos + 1;
    const lLists: Int32Array[] = [];
    const rLists: Int32Array[] = [];
    for (let f = 0; f < p; f++) {
      const src = lists[f]!;
      const l = new Int32Array(nl);
      const rr = new Int32Array(m - nl);
      let li = 0;
      let ri = 0;
      for (let k = 0; k < m; k++) {
        const row = src[k]!;
        if (goesLeft[row]) l[li++] = row;
        else rr[ri++] = row;
      }
      lLists.push(l);
      rLists.push(rr);
    }
    tree.feature[id] = bestF;
    tree.threshold[id] = bestThr;
    tree.left[id] = build(lLists, depth + 1);
    tree.right[id] = build(rLists, depth + 1);
    return id;
  };
  build(sorted, 0);
  return { tree, leafOf };
}

const regPredict = (t: RegTree, data: Float64Array, p: number, row: number): number => {
  let node = 0;
  while (t.feature[node]! >= 0) node = data[row * p + t.feature[node]!]! <= t.threshold[node]! ? t.left[node]! : t.right[node]!;
  return t.value[node]!;
};

export interface BoostOptions {
  rounds?: number;
  learningRate?: number;
  maxDepth?: number;
}

export function fitGradientBoostingClassifier(X: Matrix, y: Int32Array, K: number, opts: BoostOptions = {}): Classifier {
  const rounds = opts.rounds ?? 100;
  const lr = opts.learningRate ?? 0.1;
  const depth = opts.maxDepth ?? 3;
  const { n, p } = X;
  const rowsK = K === 2 ? 1 : K;
  const prior = new Float64Array(K);
  y.forEach((c) => prior[c]!++);
  const F = new Float64Array(n * rowsK);
  const f0 = new Float64Array(rowsK);
  if (K === 2) f0[0] = Math.log(prior[1]! / prior[0]!);
  else for (let k = 0; k < K; k++) f0[k] = Math.log(prior[k]! / n);
  for (let i = 0; i < n; i++) for (let k = 0; k < rowsK; k++) F[i * rowsK + k] = f0[k]!;
  const all = Int32Array.from({ length: n }, (_, i) => i);
  const sorted = presort(X, all);
  const stages: RegTree[][] = [];
  const probs = new Float64Array(n * K);
  const softmaxInto = (Fm: Float64Array, out: Float64Array, count: number) => {
    for (let i = 0; i < count; i++) {
      if (K === 2) {
        const pr = 1 / (1 + Math.exp(-Fm[i]!));
        out[i * 2] = 1 - pr;
        out[i * 2 + 1] = pr;
      } else {
        let mx = -Infinity;
        for (let k = 0; k < K; k++) mx = Math.max(mx, Fm[i * K + k]!);
        let s = 0;
        for (let k = 0; k < K; k++) {
          const e = Math.exp(Fm[i * K + k]! - mx);
          out[i * K + k] = e;
          s += e;
        }
        for (let k = 0; k < K; k++) out[i * K + k]! /= s;
      }
    }
  };
  for (let m = 0; m < rounds; m++) {
    softmaxInto(F, probs, n); // tüm sınıflar aynı olasılıklardan ilerler (scikit-learn ile aynı)
    const trees: RegTree[] = [];
    for (let k = 0; k < rowsK; k++) {
      const cls = K === 2 ? 1 : k;
      const resid = new Float64Array(n);
      for (let i = 0; i < n; i++) resid[i] = (y[i] === cls ? 1 : 0) - probs[i * K + cls]!;
      const { tree, leafOf } = growRegTree(X, resid, sorted, depth);
      // Newton yaprak değerleri
      const num = new Float64Array(tree.feature.length);
      const den = new Float64Array(tree.feature.length);
      for (let i = 0; i < n; i++) {
        const l = leafOf[i]!;
        num[l]! += resid[i]!;
        den[l]! += K === 2 ? probs[i * K + 1]! * (1 - probs[i * K + 1]!) : Math.abs(resid[i]!) * (1 - Math.abs(resid[i]!));
      }
      for (let l = 0; l < tree.feature.length; l++) {
        if (tree.feature[l]! >= 0) continue;
        tree.value[l] = Math.abs(den[l]!) < 1e-150 ? 0 : (K === 2 ? 1 : (K - 1) / K) * (num[l]! / den[l]!);
      }
      trees.push(tree);
    }
    for (let k = 0; k < rowsK; k++) for (let i = 0; i < n; i++) F[i * rowsK + k]! += lr * regPredict(trees[k]!, X.data, p, i);
    stages.push(trees);
  }
  const proba = (T: Matrix): Float64Array => {
    const Fm = new Float64Array(T.n * rowsK);
    for (let i = 0; i < T.n; i++) {
      for (let k = 0; k < rowsK; k++) {
        let s = f0[k]!;
        for (const trees of stages) s += lr * regPredict(trees[k]!, T.data, T.p, i);
        Fm[i * rowsK + k] = s;
      }
    }
    const out = new Float64Array(T.n * K);
    softmaxInto(Fm, out, T.n);
    return out;
  };
  return { proba, predict: (T) => argmaxRows(proba(T), T.n, K) };
}

/** Çoğunluk sınıfını öngören taban model. */
export function fitMajority(_X: Matrix, y: Int32Array, K: number): Classifier {
  const counts = new Array<number>(K).fill(0);
  y.forEach((c) => counts[c]!++);
  const best = counts.indexOf(Math.max(...counts));
  const proba = (T: Matrix) => {
    const out = new Float64Array(T.n * K);
    for (let i = 0; i < T.n; i++) out[i * K + best] = 1;
    return out;
  };
  return { proba, predict: (T) => new Int32Array(T.n).fill(best) };
}
