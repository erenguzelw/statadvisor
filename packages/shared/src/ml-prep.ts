/**
 * Model karşılaştırma için veri hazırlama: hedefin sınıflara çevrilmesi, tabakalı k-katlı ayrım ve katman içinde
 * uydurulan ön işleme (eksik değer doldurma, standartlaştırma, tek-sıcak kodlama).
 *
 * Veri sızıntısını önlemek için ön işleme her katmanda YALNIZCA eğitim satırlarına uydurulur; test satırları yalnızca
 * dönüştürülür. scikit-learn karşılığı: ColumnTransformer([SimpleImputer(median)+StandardScaler,
 * SimpleImputer(most_frequent)+OneHotEncoder(handle_unknown="ignore")]).
 */
import { AnalysisError } from './analysis.ts';
import { mulberry32 } from './ml.ts';

export interface MlFeature {
  name: string;
  kind: 'numeric' | 'categorical';
  values: (number | string | null)[];
}

export interface Matrix {
  n: number;
  p: number;
  /** Satır öncelikli, n × p. */
  data: Float64Array;
}

export interface PreparedData {
  /** Sınıf adları (sıralı); sınıf indeksi bu listedeki konumdur. */
  classes: string[];
  y: Int32Array;
  features: MlFeature[];
  /** Hedefi eksik olduğu için çıkarılan satır sayısı. */
  droppedRows: number;
  /** Özgün veride kullanılan satır indeksleri. */
  usedRows: number[];
  n: number;
}

const collator = new Intl.Collator('tr', { numeric: true });

/** Hedefi sınıf indekslerine çevirir; hedefi eksik satırları çıkarır, özelliklerdeki satırlar da aynı şekilde süzülür. */
export function prepareData(target: (number | string | null)[], features: MlFeature[]): PreparedData {
  if (features.length === 0) throw new AnalysisError('En az bir özellik seçin.');
  const used: number[] = [];
  target.forEach((v, i) => {
    if (v !== null && v !== undefined) used.push(i);
  });
  const classes = [...new Set(used.map((i) => String(target[i])))].sort(collator.compare);
  if (classes.length < 2) throw new AnalysisError('Hedef değişkenin en az iki sınıfı olmalı.');
  if (classes.length > 20) throw new AnalysisError(`Hedef değişkenin ${classes.length} sınıfı var; sınıflandırma için en fazla 20 sınıf desteklenir. Hedef sürekli bir ölçümse Doğrusal Regresyon sayfasını kullanın.`);
  const index = new Map(classes.map((c, i) => [c, i]));
  const y = Int32Array.from(used.map((i) => index.get(String(target[i]))!));
  return {
    classes,
    y,
    features: features.map((f) => ({ ...f, values: used.map((i) => f.values[i]!) })),
    droppedRows: target.length - used.length,
    usedRows: used,
    n: used.length,
  };
}

/**
 * Tabakalı k-katlı ayrım: her sınıf tohumlu olarak karıştırılır ve gözlemler katmanlara sırayla dağıtılır; böylece her
 * katmanda sınıf oranları (en çok bir gözlem farkla) korunur. Dönen dizi her gözlemin katman numarasıdır (0…k−1).
 */
export function stratifiedKFold(y: Int32Array, k: number, seed: number): Int32Array {
  // Math.max(...y) çok uzun dizilerde (≈ 125 bin+) yığın taşmasına yol açar; döngüyle bulunur
  let K = 0;
  for (let i = 0; i < y.length; i++) if (y[i]! + 1 > K) K = y[i]! + 1;
  const counts = new Array<number>(K).fill(0);
  y.forEach((c) => counts[c]!++);
  const minClass = Math.min(...counts);
  if (k < 2) throw new AnalysisError('Katman sayısı en az 2 olmalı.');
  if (minClass < k) throw new AnalysisError(`En küçük sınıfta yalnızca ${minClass} gözlem var; ${k} katlı çapraz doğrulama için her sınıfta en az ${k} gözlem gerekir. Katman sayısını azaltın ya da sınıfları birleştirin.`);
  const rng = mulberry32(seed);
  const fold = new Int32Array(y.length);
  let offset = 0; // katman yüklerini sınıflar arasında dengelemek için dönen başlangıç
  for (let c = 0; c < K; c++) {
    const idx: number[] = [];
    y.forEach((v, i) => v === c && idx.push(i));
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [idx[i], idx[j]] = [idx[j]!, idx[i]!];
    }
    idx.forEach((row, pos) => {
      fold[row] = (pos + offset) % k;
    });
    offset = (offset + idx.length) % k;
  }
  return fold;
}

interface FittedColumn {
  kind: 'numeric' | 'categorical';
  /** Sayısal: medyan, ortalama, standart sapma (ddof = 0). */
  median?: number;
  mean?: number;
  sd?: number;
  /** Kategorik: en sık düzey ve sıralı düzey listesi. */
  mode?: string;
  levels?: string[];
}

export interface Preprocessor {
  /** Dönüştürülen sütunların adları (sayısal adlar olduğu gibi, kategorikler "ad=düzey"). */
  columns: string[];
  transform(rows: number[]): Matrix;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** Yalnızca `trainRows` üzerinde uydurulan ön işleme. */
export function fitPreprocessor(features: MlFeature[], trainRows: number[]): Preprocessor {
  const fitted: FittedColumn[] = features.map((f) => {
    if (f.kind === 'numeric') {
      const v = trainRows.map((i) => f.values[i]).filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
      if (v.length === 0) throw new AnalysisError(`“${f.name}” sütununda eğitim katmanında hiç değer yok.`);
      const med = median(v);
      // Eksik değerler medyanla doldurulduktan sonra ortalama ve standart sapma hesaplanır (scikit-learn ile aynı sıra).
      const filled = trainRows.map((i) => {
        const x = f.values[i];
        return typeof x === 'number' && Number.isFinite(x) ? x : med;
      });
      const mean = filled.reduce((s, x) => s + x, 0) / filled.length;
      const sd = Math.sqrt(filled.reduce((s, x) => s + (x - mean) ** 2, 0) / filled.length);
      return { kind: 'numeric', median: med, mean, sd: sd > 0 ? sd : 1 };
    }
    const counts = new Map<string, number>();
    for (const i of trainRows) {
      const x = f.values[i];
      if (x !== null && x !== undefined) counts.set(String(x), (counts.get(String(x)) ?? 0) + 1);
    }
    if (counts.size === 0) throw new AnalysisError(`“${f.name}” sütununda eğitim katmanında hiç değer yok.`);
    const levels = [...counts.keys()].sort(collator.compare);
    // En sık düzey; eşitlikte sıralı listedeki ilk düzey (SimpleImputer most_frequent ile aynı)
    const mode = levels.reduce((best, l) => (counts.get(l)! > counts.get(best)! ? l : best), levels[0]!);
    return { kind: 'categorical', mode, levels };
  });
  const columns: string[] = [];
  features.forEach((f, j) => {
    if (f.kind === 'numeric') columns.push(f.name);
    else for (const l of fitted[j]!.levels!) columns.push(`${f.name}=${l}`);
  });
  const p = columns.length;
  return {
    columns,
    transform(rows) {
      const data = new Float64Array(rows.length * p);
      rows.forEach((row, r) => {
        let c = r * p;
        features.forEach((f, j) => {
          const fc = fitted[j]!;
          const x = f.values[row];
          if (fc.kind === 'numeric') {
            const v = typeof x === 'number' && Number.isFinite(x) ? x : fc.median!;
            data[c++] = (v - fc.mean!) / fc.sd!;
          } else {
            const level = x === null || x === undefined ? fc.mode! : String(x);
            // Eğitimde görülmeyen düzey: tüm kuklalar 0 (handle_unknown="ignore")
            for (const l of fc.levels!) data[c++] = l === level ? 1 : 0;
          }
        });
      });
      return { n: rows.length, p, data };
    },
  };
}
