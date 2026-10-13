/**
 * Tarayıcıda çalışan küçük sınıflandırıcılar. Model karşılaştırma panelindeki ölçütler,
 * bu modellerin tohumlu (tekrarlanabilir) bir dengesiz veri setinde gerçekten eğitilmesiyle elde edilir.
 */
import { averagePrecision, rocAuc, rocCurve } from './assumptions';

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gaussian(rng: () => number) {
  const u = 1 - rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export interface Table {
  X: number[][];
  y: number[];
}

/**
 * Doğrusal olmayan ilişkiler ve bir etkileşim içeren gizli bir skora göre, en yüksek `positives` gözlemi
 * pozitif etiketleyen dengesiz veri seti.
 */
export function makeImbalancedData(n = 1775, positives = 142, seed = 7, features = 6): Table {
  const rng = mulberry32(seed);
  const X = Array.from({ length: n }, () => Array.from({ length: features }, () => gaussian(rng)));
  const score = X.map(
    (x) => 0.8 * x[0]! + 0.5 * x[1]! - 0.4 * x[2]! + 1.1 * x[3]! * x[4]! + (x[5]! > 0.8 ? 0.9 : 0) + 0.6 * Math.sin(1.5 * x[1]!) + 0.8 * gaussian(rng),
  );
  const order = score.map((_, i) => i).sort((i, j) => score[j]! - score[i]!);
  const y = new Array<number>(n).fill(0);
  for (let k = 0; k < positives; k++) y[order[k]!] = 1;
  return { X, y };
}

/** Sınıf oranlarını koruyan (tabakalı) eğitim/test ayrımı. */
export function stratifiedSplit(y: number[], testFraction: number, seed = 11) {
  const rng = mulberry32(seed);
  const train: number[] = [];
  const test: number[] = [];
  for (const cls of [0, 1]) {
    const idx = y.map((v, i) => (v === cls ? i : -1)).filter((i) => i >= 0);
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [idx[i], idx[j]] = [idx[j]!, idx[i]!];
    }
    const nTest = Math.round(idx.length * testFraction);
    test.push(...idx.slice(0, nTest));
    train.push(...idx.slice(nTest));
  }
  return { train, test };
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

/* ---------- Lojistik regresyon ---------- */

export function fitLogistic(X: number[][], y: number[], opts = { epochs: 500, lr: 0.3, l2: 1e-3 }) {
  const p = X[0]!.length;
  const n = X.length;
  const mu = Array.from({ length: p }, (_, j) => X.reduce((s, r) => s + r[j]!, 0) / n);
  const sd = Array.from({ length: p }, (_, j) => Math.sqrt(X.reduce((s, r) => s + (r[j]! - mu[j]!) ** 2, 0) / n) || 1);
  const Z = X.map((r) => r.map((v, j) => (v - mu[j]!) / sd[j]!));
  const w = new Array<number>(p).fill(0);
  let b = 0;
  for (let e = 0; e < opts.epochs; e++) {
    const gw = new Array<number>(p).fill(0);
    let gb = 0;
    for (let i = 0; i < n; i++) {
      let z = b;
      for (let j = 0; j < p; j++) z += w[j]! * Z[i]![j]!;
      const err = sigmoid(z) - y[i]!;
      gb += err;
      for (let j = 0; j < p; j++) gw[j]! += err * Z[i]![j]!;
    }
    b -= (opts.lr * gb) / n;
    for (let j = 0; j < p; j++) w[j]! -= opts.lr * (gw[j]! / n + opts.l2 * w[j]!);
  }
  return (x: number[]) => {
    let z = b;
    for (let j = 0; j < p; j++) z += (w[j]! * (x[j]! - mu[j]!)) / sd[j]!;
    return sigmoid(z);
  };
}

/* ---------- Karar ağaçları ---------- */

interface TreeNode {
  feature: number;
  threshold: number;
  value: number;
  left?: TreeNode;
  right?: TreeNode;
}

function predictTree(node: TreeNode, x: number[]): number {
  let cur = node;
  while (cur.left && cur.right) cur = x[cur.feature]! <= cur.threshold ? cur.left : cur.right;
  return cur.value;
}

function sampleFeatures(p: number, k: number, rng: () => number) {
  const all = Array.from({ length: p }, (_, i) => i);
  for (let i = p - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [all[i], all[j]] = [all[j]!, all[i]!];
  }
  return all.slice(0, k);
}

interface ClassTreeOpts {
  maxDepth: number;
  minLeaf: number;
  mtry: number;
  rng: () => number;
}

function buildClassTree(X: number[][], y: number[], idx: number[], depth: number, o: ClassTreeOpts): TreeNode {
  const n = idx.length;
  const pos = idx.reduce((s, i) => s + y[i]!, 0);
  const leaf: TreeNode = { feature: -1, threshold: 0, value: pos / n };
  if (depth >= o.maxDepth || n < 2 * o.minLeaf || pos === 0 || pos === n) return leaf;
  const parentGini = 2 * (pos / n) * (1 - pos / n);
  let best = { gain: 1e-12, f: -1, t: 0 };
  for (const f of sampleFeatures(X[0]!.length, o.mtry, o.rng)) {
    const sorted = [...idx].sort((a, b) => X[a]![f]! - X[b]![f]!);
    let leftPos = 0;
    for (let k = 0; k < n - 1; k++) {
      leftPos += y[sorted[k]!]!;
      const a = X[sorted[k]!]![f]!;
      const c = X[sorted[k + 1]!]![f]!;
      if (a === c) continue;
      const nl = k + 1;
      const nr = n - nl;
      if (nl < o.minLeaf || nr < o.minLeaf) continue;
      const lp = leftPos / nl;
      const rp = (pos - leftPos) / nr;
      const gain = parentGini - (nl * 2 * lp * (1 - lp) + nr * 2 * rp * (1 - rp)) / n;
      if (gain > best.gain) best = { gain, f, t: (a + c) / 2 };
    }
  }
  if (best.f < 0) return leaf;
  const li = idx.filter((i) => X[i]![best.f]! <= best.t);
  const ri = idx.filter((i) => X[i]![best.f]! > best.t);
  return {
    feature: best.f,
    threshold: best.t,
    value: leaf.value,
    left: buildClassTree(X, y, li, depth + 1, o),
    right: buildClassTree(X, y, ri, depth + 1, o),
  };
}

export function fitRandomForest(X: number[][], y: number[], opts = { trees: 80, maxDepth: 8, minLeaf: 3, seed: 21 }) {
  const rng = mulberry32(opts.seed);
  const p = X[0]!.length;
  const mtry = Math.max(1, Math.round(Math.sqrt(p)));
  const forest: TreeNode[] = [];
  for (let t = 0; t < opts.trees; t++) {
    const boot = Array.from({ length: X.length }, () => Math.floor(rng() * X.length));
    forest.push(buildClassTree(X, y, boot, 0, { maxDepth: opts.maxDepth, minLeaf: opts.minLeaf, mtry, rng }));
  }
  return (x: number[]) => forest.reduce((s, tree) => s + predictTree(tree, x), 0) / forest.length;
}

function buildRegTree(X: number[][], r: number[], h: number[], idx: number[], depth: number, maxDepth: number, minLeaf: number): TreeNode {
  const n = idx.length;
  const sr = idx.reduce((s, i) => s + r[i]!, 0);
  const sh = idx.reduce((s, i) => s + h[i]!, 0);
  const leaf: TreeNode = { feature: -1, threshold: 0, value: Math.max(-4, Math.min(4, sr / (sh + 1e-9))) };
  if (depth >= maxDepth || n < 2 * minLeaf) return leaf;
  let best = { gain: 1e-9, f: -1, t: 0 };
  const parent = (sr * sr) / n;
  for (let f = 0; f < X[0]!.length; f++) {
    const sorted = [...idx].sort((a, b) => X[a]![f]! - X[b]![f]!);
    let left = 0;
    for (let k = 0; k < n - 1; k++) {
      left += r[sorted[k]!]!;
      const a = X[sorted[k]!]![f]!;
      const c = X[sorted[k + 1]!]![f]!;
      if (a === c) continue;
      const nl = k + 1;
      const nr = n - nl;
      if (nl < minLeaf || nr < minLeaf) continue;
      const right = sr - left;
      const gain = (left * left) / nl + (right * right) / nr - parent;
      if (gain > best.gain) best = { gain, f, t: (a + c) / 2 };
    }
  }
  if (best.f < 0) return leaf;
  const li = idx.filter((i) => X[i]![best.f]! <= best.t);
  const ri = idx.filter((i) => X[i]![best.f]! > best.t);
  return {
    feature: best.f,
    threshold: best.t,
    value: leaf.value,
    left: buildRegTree(X, r, h, li, depth + 1, maxDepth, minLeaf),
    right: buildRegTree(X, r, h, ri, depth + 1, maxDepth, minLeaf),
  };
}

/** Gradyan artırma: mantıksal kayıp, Newton yaprak değerleri, küçük öğrenme hızı. */
export function fitGradientBoosting(X: number[][], y: number[], opts = { rounds: 80, lr: 0.1, maxDepth: 3, minLeaf: 5 }) {
  const n = X.length;
  const prior = y.reduce((s, v) => s + v, 0) / n;
  const f0 = Math.log(prior / (1 - prior));
  const F = new Array<number>(n).fill(f0);
  const trees: TreeNode[] = [];
  const all = Array.from({ length: n }, (_, i) => i);
  for (let m = 0; m < opts.rounds; m++) {
    const p = F.map(sigmoid);
    const r = p.map((pi, i) => y[i]! - pi);
    const h = p.map((pi) => pi * (1 - pi));
    const tree = buildRegTree(X, r, h, all, 0, opts.maxDepth, opts.minLeaf);
    trees.push(tree);
    for (let i = 0; i < n; i++) F[i]! += opts.lr * predictTree(tree, X[i]!);
  }
  return (x: number[]) => sigmoid(trees.reduce((s, t) => s + opts.lr * predictTree(t, x), f0));
}

/* ---------- Değerlendirme ---------- */

export interface Evaluation {
  accuracy: number;
  trainAccuracy: number;
  precision: number;
  recall: number;
  f1: number;
  rocAuc: number;
  prAuc: number;
  roc: { fpr: number; tpr: number }[];
}

/** Pozitif (azınlık) sınıf için ölçütler; sınıflandırma eşiği 0.5'tir. */
export function evaluate(predict: (x: number[]) => number, test: Table, train: Table, threshold = 0.5): Evaluation {
  const scores = test.X.map(predict);
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  scores.forEach((s, i) => {
    const pred = s >= threshold ? 1 : 0;
    if (pred === 1 && test.y[i] === 1) tp++;
    else if (pred === 1) fp++;
    else if (test.y[i] === 1) fn++;
    else tn++;
  });
  const precision = tp + fp ? tp / (tp + fp) : 0;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  const trainAcc = train.X.reduce((s, x, i) => s + ((predict(x) >= threshold ? 1 : 0) === train.y[i] ? 1 : 0), 0) / train.y.length;
  return {
    accuracy: (tp + tn) / test.y.length,
    trainAccuracy: trainAcc,
    precision,
    recall,
    f1: precision + recall ? (2 * precision * recall) / (precision + recall) : 0,
    rocAuc: rocAuc(scores, test.y),
    prAuc: averagePrecision(scores, test.y),
    roc: rocCurve(scores, test.y),
  };
}

export function subset(t: Table, idx: number[]): Table {
  return { X: idx.map((i) => t.X[i]!), y: idx.map((i) => t.y[i]!) };
}
