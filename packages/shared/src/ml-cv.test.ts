/**
 * Model karşılaştırma motoru, scikit-learn ile AYNI katman atamaları kullanılarak karşılaştırılır
 * (tools/reference/generate_ml.py). Eşleşme beklentisi modele göre farklıdır:
 *  - taban, lojistik regresyon, k-NN: deterministiktir, doğruluk neredeyse birebir eşleşmelidir
 *  - SVM: libsvm ile aynı algoritma, durdurma toleransı yüzünden birkaç gözlem fark edebilir
 *  - karar ağacı, rastgele orman, gradyan artırma: eşit kazançlı bölünmelerde ve rastgele sayı dizisinde
 *    scikit-learn'den ayrılır; yalnızca ortalama doğruluk bandı sınanır
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { fitLogisticClassifier, fitPreprocessor, prepareData, runCrossValidation, type MlFeature, type ModelId } from './index.ts';

interface MlCase {
  test: string;
  input: { target: (string | null)[]; features: MlFeature[]; foldOf: number[]; classes: string[] };
  expected: Record<string, number[]>;
}
const fixture = JSON.parse(readFileSync(fileURLToPath(new URL('../fixtures/reference.json', import.meta.url)), 'utf8')) as { cases: { test: string }[] };
const cases = fixture.cases.filter((c) => c.test === 'ml_cv') as MlCase[];

const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;

describe('model karşılaştırma ↔ scikit-learn (aynı katmanlar)', () => {
  it('vaka sayısı beklenen kadar', () => {
    expect(cases.length).toBe(24);
  });

  const results = new Map<string, Awaited<ReturnType<typeof runCrossValidation>>>();
  const run = async (i: number) => {
    const key = String(i);
    if (!results.has(key)) {
      const c = cases[i]!;
      results.set(key, await runCrossValidation(prepareData(c.input.target, c.input.features), { foldOf: c.input.foldOf }));
    }
    return results.get(key)!;
  };

  // Eşikler, 24 vakada ölçülen sapmaların üzerine küçük pay bırakılarak seçildi:
  //  - taban, lojistik, k-NN, SVM: ölçülen sapma 0,000 puan (birebir)
  //  - ağaç / orman / gradyan artırma: scikit-learn'ün kendi tohumları arası sapması (random_state 0 ↔ 1) ölçülmüş ve
  //    karşılaştırma için kullanılmıştır: ağaç 1,03, orman 0,62, gradyan artırma 0,22 puan (ortalama |Δ ortalama doğruluk|)
  const tol: Record<ModelId, { meanDiff: number; maxCaseDiff: number }> = {
    baseline: { meanDiff: 1e-9, maxCaseDiff: 1e-9 },
    logistic: { meanDiff: 0.002, maxCaseDiff: 0.01 },
    knn: { meanDiff: 0.002, maxCaseDiff: 0.01 },
    svm: { meanDiff: 0.002, maxCaseDiff: 0.01 },
    tree: { meanDiff: 0.015, maxCaseDiff: 0.045 },
    rf: { meanDiff: 0.008, maxCaseDiff: 0.035 },
    gb: { meanDiff: 0.005, maxCaseDiff: 0.016 },
  };

  for (const id of Object.keys(tol) as ModelId[]) {
    it(`${id}: katman doğrulukları scikit-learn ile uyumlu`, async () => {
      const diffs: number[] = [];
      const maxPerCase: number[] = [];
      for (let i = 0; i < cases.length; i++) {
        const r = await run(i);
        const m = r.models.find((x) => x.id === id)!;
        const exp = cases[i]!.expected[`${id}_acc`]!;
        expect(m.folds.length).toBe(exp.length);
        const d = m.folds.map((f, k) => Math.abs(f.accuracy - exp[k]!));
        maxPerCase.push(Math.max(...d));
        diffs.push(Math.abs(mean(m.folds.map((f) => f.accuracy)) - mean(exp)));
      }
      // rastgelelik içeren modellerde ölçüt: scikit-learn'ün kendi tohumlar arası değişimi (random_state 0 ↔ 1)
      const alt = cases.map((c) => (c.expected[`${id}_acc_alt`] ? Math.abs(mean(c.expected[`${id}_acc_alt`]!) - mean(c.expected[`${id}_acc`]!)) : null)).filter((v): v is number => v !== null);
      if (alt.length) console.log(`${id}: scikit-learn kendi içinde (tohum 0 ↔ 1) ortalama |Δ| = ${(mean(alt) * 100).toFixed(3)} puan, en kötü vaka = ${(Math.max(...alt) * 100).toFixed(2)} puan`);
      const meanDiff = mean(diffs);
      const worst = Math.max(...maxPerCase);
      console.log(`${id}: ortalama |Δ ortalama doğruluk| = ${(meanDiff * 100).toFixed(3)} puan, en kötü tek katman = ${(worst * 100).toFixed(2)} puan, en kötü vaka ortalaması = ${(Math.max(...diffs) * 100).toFixed(2)} puan`);
      expect(meanDiff).toBeLessThanOrEqual(tol[id].meanDiff);
      expect(Math.max(...diffs)).toBeLessThanOrEqual(tol[id].maxCaseDiff);
    }, 600_000);
  }

  it('lojistik regresyon olasılıkları scikit-learn ile 1e-5 içinde eşleşir (ilk katman)', () => {
    let worst = 0;
    for (const c of cases) {
      const data = prepareData(c.input.target, c.input.features);
      const all = Array.from({ length: data.n }, (_, i) => i);
      const train = all.filter((i) => c.input.foldOf[i] !== 0);
      const test = all.filter((i) => c.input.foldOf[i] === 0);
      const prep = fitPreprocessor(data.features, train);
      const K = data.classes.length;
      const model = fitLogisticClassifier(prep.transform(train), Int32Array.from(train, (i) => data.y[i]!), K);
      const P = model.proba!(prep.transform(test));
      const exp = c.expected.lr_proba0!;
      expect(P.length).toBe(exp.length);
      for (let i = 0; i < exp.length; i++) worst = Math.max(worst, Math.abs(P[i]! - exp[i]!));
    }
    console.log(`lojistik olasılık en büyük sapma: ${worst.toExponential(2)}`);
    expect(worst).toBeLessThan(1e-5);
  });
});
