/**
 * Tabakalı k-katlı çapraz doğrulama ile model karşılaştırma.
 *
 * Her katmanda ön işleme (doldurma, standartlaştırma, kodlama) yalnızca o katmanın eğitim satırlarına uydurulur;
 * böylece test katmanından eğitime bilgi sızmaz. Metrikler test katmanlarından, "eğitim doğruluğu" ise eğitim
 * satırlarının (en çok `trainEvalMax` gözlemlik tohumlu bir alt örneğinde) hesaplanır.
 */
import { mulberry32 } from './ml.ts';
import {
  fitDecisionTree,
  fitGradientBoostingClassifier,
  fitKnn,
  fitLogisticClassifier,
  fitMajority,
  fitRandomForestClassifier,
  fitSvm,
  type Classifier,
  type Fit,
} from './ml-models.ts';
import { fitPreprocessor, stratifiedKFold, type Matrix, type PreparedData } from './ml-prep.ts';

export type ModelId = 'baseline' | 'logistic' | 'tree' | 'knn' | 'svm' | 'rf' | 'gb';

export interface ModelInfo {
  id: ModelId;
  label: string;
  family: string;
  /** scikit-learn karşılığı (Python kodunda kullanılır). */
  sklearn: string;
  /** Niteliksel değerlendirme (ölçüm değildir). */
  note: string;
  fit: Fit;
}

export const MODEL_INFO: Record<ModelId, ModelInfo> = {
  baseline: {
    id: 'baseline',
    label: 'Taban (çoğunluk sınıfı)',
    family: 'Karşılaştırma tabanı',
    sklearn: 'DummyClassifier(strategy="most_frequent")',
    note: 'Her gözlemi en sık sınıfa atar. Diğer modeller bunun üzerine ne kattıklarıyla okunmalıdır.',
    fit: fitMajority,
  },
  logistic: {
    id: 'logistic',
    label: 'Lojistik Regresyon',
    family: 'Doğrusal (L2 düzenlemeli)',
    sklearn: 'LogisticRegression(max_iter=5000)',
    note: 'Hızlı ve yorumlanabilir; doğrusal olmayan ilişkileri ve etkileşimleri kendiliğinden yakalamaz.',
    fit: (X, y, K) => fitLogisticClassifier(X, y, K),
  },
  tree: {
    id: 'tree',
    label: 'Karar Ağacı',
    family: 'Ağaç (tek)',
    sklearn: 'DecisionTreeClassifier(random_state=42)',
    note: 'Kolay okunur ama derinlik sınırı yoksa eğitim verisini ezberler; eğitim–test farkına dikkat.',
    fit: (X, y, K) => fitDecisionTree(X, y, K),
  },
  knn: {
    id: 'knn',
    label: 'k-En Yakın Komşu',
    family: 'Örnek tabanlı (k = 5)',
    sklearn: 'KNeighborsClassifier(n_neighbors=5)',
    note: 'Eğitimi yoktur ama tahmini yavaştır ve ölçeklemeye duyarlıdır; çok sayıda ilgisiz özellik performansı düşürür.',
    fit: (X, y, K) => fitKnn(X, y, K, 5),
  },
  svm: {
    id: 'svm',
    label: 'Destek Vektör Makinesi',
    family: 'RBF çekirdek (C = 1)',
    sklearn: 'SVC(kernel="rbf", C=1.0, gamma="scale")',
    note: 'Doğrusal olmayan sınırları yakalar; gözlem sayısıyla hızla yavaşlar ve sınıf olasılığı üretmez.',
    fit: (X, y, K) => fitSvm(X, y, K),
  },
  rf: {
    id: 'rf',
    label: 'Rastgele Orman',
    family: 'Topluluk (100 ağaç)',
    sklearn: 'RandomForestClassifier(n_estimators=100, random_state=42)',
    note: 'Doğrusal olmayan ilişkileri ve etkileşimleri yakalar; tek ağaca göre çok daha az aşırı uyar.',
    fit: (X, y, K) => fitRandomForestClassifier(X, y, K),
  },
  gb: {
    id: 'gb',
    label: 'Gradyan Artırma',
    family: 'Topluluk (100 tur, derinlik 3)',
    sklearn: 'GradientBoostingClassifier(random_state=42)',
    note: 'Tablo verisinde çoğu zaman en güçlü modellerdendir; ayarsız varsayılanlarla bile iyidir ama yavaş eğitilir.',
    fit: (X, y, K) => fitGradientBoostingClassifier(X, y, K),
  },
};

export const ALL_MODELS: ModelId[] = ['baseline', 'logistic', 'tree', 'knn', 'svm', 'rf', 'gb'];

export interface CvOptions {
  folds?: number;
  seed?: number;
  models?: ModelId[];
  /** SVM bu eğitim büyüklüğünün üzerinde atlanır (O(n²) süre). */
  svmMaxTrain?: number;
  /** Eğitim doğruluğunun hesaplandığı en çok gözlem sayısı. */
  trainEvalMax?: number;
  /** Dışarıdan verilen katman numaraları (verilirse `folds` ve `seed` ile üretilen ayrım kullanılmaz). */
  foldOf?: ArrayLike<number>;
}

export interface FoldResult {
  fold: number;
  nTrain: number;
  nTest: number;
  accuracy: number;
  macroF1: number;
  trainAccuracy: number;
  seconds: number;
}

export interface ClassReport {
  cls: string;
  precision: number;
  recall: number;
  f1: number;
  support: number;
}

export interface ModelCv {
  id: ModelId;
  label: string;
  family: string;
  sklearn: string;
  note: string;
  /** Atlandıysa nedeni; sonuç alanları boştur. */
  skipped?: string;
  folds: FoldResult[];
  accuracy: { mean: number; sd: number };
  macroF1: { mean: number; sd: number };
  trainAccuracy: number;
  /** Eğitim doğruluğu − test doğruluğu (puan olarak değil, oran farkı). */
  gap: number;
  /** Tüm test katmanlarının toplamı: satır = gerçek, sütun = yordanan. */
  confusion: number[][];
  perClass: ClassReport[];
  seconds: number;
  hasProba: boolean;
}

export interface CvResult {
  classes: string[];
  n: number;
  droppedRows: number;
  featureColumns: string[];
  folds: number;
  seed: number;
  /** Her gözlemin katman numarası (Python kodu ve yeniden üretim için). */
  foldOf: number[];
  classCounts: number[];
  /** En sık sınıfın oranı (taban doğruluğu). */
  baselineAccuracy: number;
  models: ModelCv[];
}

export interface CvHooks {
  progress?: (p: { done: number; total: number; model: string; fold: number }) => void;
  /** Olay döngüsüne nefes aldırmak için katmanlar arasında çağrılır. */
  yield?: () => Promise<void>;
}

function meanSd(v: number[]): { mean: number; sd: number } {
  const mean = v.reduce((s, x) => s + x, 0) / v.length;
  const sd = v.length > 1 ? Math.sqrt(v.reduce((s, x) => s + (x - mean) ** 2, 0) / (v.length - 1)) : 0;
  return { mean, sd };
}

/** Makro F1: sınıf başına F1'in ağırlıksız ortalaması (hiç yordanmayan/olmayan sınıf için 0, scikit-learn zero_division=0). */
export function macroF1Of(confusion: number[][]): number {
  const K = confusion.length;
  let sum = 0;
  for (let c = 0; c < K; c++) {
    const tp = confusion[c]![c]!;
    const row = confusion[c]!.reduce((s, v) => s + v, 0);
    const col = confusion.reduce((s, r) => s + r[c]!, 0);
    sum += row + col ? (2 * tp) / (row + col) : 0;
  }
  return sum / K;
}

function confusionOf(y: Int32Array, pred: Int32Array, K: number, rows: number[]): number[][] {
  const m = Array.from({ length: K }, () => new Array<number>(K).fill(0));
  rows.forEach((r, i) => m[y[r]!]![pred[i]!]!++);
  return m;
}

export async function runCrossValidation(data: PreparedData, opts: CvOptions = {}, hooks: CvHooks = {}): Promise<CvResult> {
  const k = opts.foldOf ? Math.max(...Array.from(opts.foldOf)) + 1 : (opts.folds ?? 5);
  const seed = opts.seed ?? 42;
  const ids = opts.models ?? ALL_MODELS;
  const svmMaxTrain = opts.svmMaxTrain ?? 15000;
  const trainEvalMax = opts.trainEvalMax ?? 3000;
  const K = data.classes.length;
  const foldOf = opts.foldOf ? Int32Array.from(opts.foldOf) : stratifiedKFold(data.y, k, seed);
  if (foldOf.length !== data.n) throw new Error('foldOf uzunluğu gözlem sayısıyla aynı olmalı.');
  const rowsOf = (pred: (f: number) => boolean) => Array.from({ length: data.n }, (_, i) => i).filter((i) => pred(foldOf[i]!));
  const classCounts = new Array<number>(K).fill(0);
  data.y.forEach((c) => classCounts[c]!++);

  const results: ModelCv[] = ids.map((id) => {
    const info = MODEL_INFO[id];
    const skip =
      id === 'svm' && Math.round((data.n * (k - 1)) / k) > svmMaxTrain
        ? `Eğitim katmanı yaklaşık ${Math.round((data.n * (k - 1)) / k).toLocaleString('tr-TR')} gözlem; destek vektör makinesinin süresi gözlem sayısının karesiyle büyür, bu yüzden ${svmMaxTrain.toLocaleString('tr-TR')} gözlemin üzerinde atlanır. Daha küçük bir örneklemle deneyin.`
        : undefined;
    return {
      id,
      label: info.label,
      family: info.family,
      sklearn: info.sklearn,
      note: info.note,
      ...(skip ? { skipped: skip } : {}),
      folds: [],
      accuracy: { mean: NaN, sd: NaN },
      macroF1: { mean: NaN, sd: NaN },
      trainAccuracy: NaN,
      gap: NaN,
      confusion: Array.from({ length: K }, () => new Array<number>(K).fill(0)),
      perClass: [],
      seconds: 0,
      hasProba: id !== 'svm',
    };
  });
  const active = results.filter((r) => !r.skipped);
  const total = k * active.length;
  let done = 0;
  const featureColumns: string[] = [];
  const trainAccs = new Map<ModelId, number[]>();

  for (let fold = 0; fold < k; fold++) {
    const trainRows = rowsOf((f) => f !== fold);
    const testRows = rowsOf((f) => f === fold);
    const prep = fitPreprocessor(data.features, trainRows); // yalnızca eğitim satırlarına uydurulur
    if (fold === 0) featureColumns.push(...prep.columns);
    const Xtr: Matrix = prep.transform(trainRows);
    const Xte: Matrix = prep.transform(testRows);
    const ytr = Int32Array.from(trainRows, (r) => data.y[r]!);
    // eğitim doğruluğu için tohumlu alt örnek
    const rng = mulberry32(seed + 7919 + fold);
    const pick = Array.from({ length: trainRows.length }, (_, i) => i);
    for (let i = pick.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [pick[i], pick[j]] = [pick[j]!, pick[i]!];
    }
    const evalIdx = pick.slice(0, Math.min(trainEvalMax, pick.length));
    const Xev: Matrix = { n: evalIdx.length, p: Xtr.p, data: new Float64Array(evalIdx.length * Xtr.p) };
    evalIdx.forEach((s, r) => Xev.data.set(Xtr.data.subarray(s * Xtr.p, (s + 1) * Xtr.p), r * Xtr.p));
    const yev = Int32Array.from(evalIdx, (s) => ytr[s]!);

    for (const res of active) {
      await hooks.yield?.();
      const t0 = Date.now();
      // rastgelelik içeren modeller katmana göre farklı ama tekrarlanabilir tohum kullanır
      const model: Classifier =
        res.id === 'rf'
          ? fitRandomForestClassifier(Xtr, ytr, K, { seed: seed + fold })
          : MODEL_INFO[res.id].fit(Xtr, ytr, K);
      const pred = model.predict(Xte);
      const predTrain = model.predict(Xev);
      const cm = confusionOf(data.y, pred, K, testRows);
      let correct = 0;
      for (let c = 0; c < K; c++) correct += cm[c]![c]!;
      let trainCorrect = 0;
      for (let i = 0; i < yev.length; i++) if (predTrain[i] === yev[i]) trainCorrect++;
      for (let a = 0; a < K; a++) for (let b = 0; b < K; b++) res.confusion[a]![b]! += cm[a]![b]!;
      const seconds = (Date.now() - t0) / 1000;
      res.seconds += seconds;
      res.folds.push({ fold, nTrain: trainRows.length, nTest: testRows.length, accuracy: correct / testRows.length, macroF1: macroF1Of(cm), trainAccuracy: trainCorrect / yev.length, seconds });
      const arr = trainAccs.get(res.id) ?? [];
      arr.push(trainCorrect / yev.length);
      trainAccs.set(res.id, arr);
      done++;
      hooks.progress?.({ done, total, model: res.label, fold: fold + 1 });
    }
  }

  for (const res of active) {
    res.accuracy = meanSd(res.folds.map((f) => f.accuracy));
    res.macroF1 = meanSd(res.folds.map((f) => f.macroF1));
    res.trainAccuracy = meanSd(trainAccs.get(res.id) ?? []).mean;
    res.gap = res.trainAccuracy - res.accuracy.mean;
    res.perClass = data.classes.map((cls, c) => {
      const tp = res.confusion[c]![c]!;
      const row = res.confusion[c]!.reduce((s, v) => s + v, 0);
      const col = res.confusion.reduce((s, r) => s + r[c]!, 0);
      return { cls, precision: col ? tp / col : 0, recall: row ? tp / row : 0, f1: row + col ? (2 * tp) / (row + col) : 0, support: row };
    });
  }

  return {
    classes: data.classes,
    n: data.n,
    droppedRows: data.droppedRows,
    featureColumns,
    folds: k,
    seed,
    foldOf: Array.from(foldOf),
    classCounts,
    baselineAccuracy: Math.max(...classCounts) / data.n,
    models: results,
  };
}
