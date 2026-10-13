import {
  evaluate,
  fitGradientBoosting,
  fitLogistic,
  fitRandomForest,
  makeImbalancedData,
  stratifiedSplit,
  subset,
  type Evaluation,
} from '@statadvisor/shared';
import type { Interpretation, Model, ModelDataFacts, RedFlag } from '@statadvisor/shared';

/** Oturum günlüğündeki hipotez testi sayısı (örnek). Çoklu karşılaştırma uyarısı buna göre hesaplanır. */
export const SESSION_TEST_COUNT = 14;

const pct = (x: number, digits = 1) => `%${(x * 100).toFixed(digits)}`;
const num = (x: number) => x.toFixed(2);

interface Meta {
  id: string;
  name: string;
  family: string;
  summary: string;
  speedRating: number;
  interpretabilityRating: number;
  detailAction: string;
}

/** Hız ve yorumlanabilirlik puanları niteliksel değerlendirmedir (ölçüm değil). */
const meta: Meta[] = [
  {
    id: 'logreg',
    name: 'Lojistik Regresyon',
    family: 'Parametrik temel',
    summary:
      'Yüksek şeffaflık ve katsayı analizi sunar. Tıp ve regülasyona tabi araştırmalarda ilk tercihtir, ancak doğrusal olmayan ilişkilerde kapasitesi sınırlıdır.',
    speedRating: 5,
    interpretabilityRating: 5,
    detailAction: 'Katsayıları incele',
  },
  {
    id: 'rf',
    name: 'Random Forest',
    family: 'Topluluk (ensemble)',
    summary:
      'Doğrusal olmayan ilişkileri ve etkileşimleri kendiliğinden yakalar. Özellik önemi (SHAP) ile kısmen açıklanabilir; dengesiz veride varsayılan eşikte azınlık sınıfını kaçırabilir.',
    speedRating: 3,
    interpretabilityRating: 2,
    detailAction: 'Özellik önemini incele',
  },
  {
    id: 'gb',
    name: 'Gradient Boosting',
    family: 'Gradyan artırma (XGBoost benzeri)',
    summary:
      'Çoğu tablo verisinde en yüksek kestirim gücünü verir. Aşırı öğrenmeye açıktır; hiper-parametre ayarı ve düzenlileştirme gerektirir.',
    speedRating: 3,
    interpretabilityRating: 1,
    detailAction: 'Hiper-parametreler',
  },
];

export interface ModelReport {
  models: Model[];
  facts: ModelDataFacts;
  insight: Interpretation;
  redFlags: RedFlag[];
  recommendedId: string;
}

let cached: ModelReport | undefined;

/** Modelleri tohumlu veri setinde eğitir ve ölçütleri hesaplar. Sonuç bellekte tutulur. */
export function getModelReport(): ModelReport {
  if (cached) return cached;
  const data = makeImbalancedData();
  const { train: trainIdx, test: testIdx } = stratifiedSplit(data.y, 0.3);
  const train = subset(data, trainIdx);
  const test = subset(data, testIdx);

  const fits: Record<string, (x: number[]) => number> = {
    logreg: fitLogistic(train.X, train.y),
    rf: fitRandomForest(train.X, train.y),
    gb: fitGradientBoosting(train.X, train.y),
  };
  const evals: Record<string, Evaluation> = Object.fromEntries(Object.entries(fits).map(([id, fn]) => [id, evaluate(fn, test, train)]));

  const testPositives = test.y.reduce((s, v) => s + v, 0);
  const facts: ModelDataFacts = {
    rows: data.y.length,
    positives: data.y.reduce((s, v) => s + v, 0),
    features: data.X[0]!.length,
    testRows: test.y.length,
    testPositives,
    baselineAccuracy: 1 - testPositives / test.y.length,
    prevalence: testPositives / test.y.length,
  };

  // Önerilen model: eşikten bağımsız ve dengesiz veriye duyarlı ölçüt olan PR-AUC'u en yüksek olan.
  const recommendedId = Object.entries(evals).reduce((best, [id, e]) => (e.prAuc > evals[best]!.prAuc ? id : best), 'logreg');

  const models: Model[] = meta.map((m) => {
    const { roc, ...metrics } = evals[m.id]!;
    return { ...m, metrics, roc, recommended: m.id === recommendedId };
  });

  const best = models.find((m) => m.recommended)!;
  const bm = best.metrics;
  const insight: Interpretation = {
    id: 'f1-minority',
    metric: `F1 (azınlık) = ${num(bm.f1)}`,
    headline:
      bm.f1 < 0.6 ? 'Modeliniz azınlık sınıfını tahmin etmekte zorlanıyor.' : 'Model azınlık sınıfını makul düzeyde yakalıyor.',
    body: {
      novice: `Genel doğruluk yüksek görünse de (${pct(bm.accuracy)}) bu yanıltıcı: verinin yalnızca ${pct(facts.prevalence)}’i pozitif olduğu için, her zaman “negatif” diyen bir model bile ${pct(facts.baselineAccuracy)} doğruluk alır. ${best.name}, gerçek pozitif vakaların yaklaşık ${pct(bm.recall, 0)}’ini yakalıyor; kalanını kaçırıyor.`,
      expert: `Test setinde prevalans ${pct(facts.prevalence)} (n = ${facts.testRows}, pozitif = ${facts.testPositives}). Doğruluk ${pct(bm.accuracy)} iken taban çizgisi ${pct(facts.baselineAccuracy)}. ${best.name}, 0,5 eşiğinde: kesinlik = ${num(bm.precision)}, duyarlılık (recall) = ${num(bm.recall)}, F1 = ${num(bm.f1)}; ROC AUC = ${num(bm.rocAuc)}, PR-AUC = ${num(bm.prAuc)} (rastgele sıralamada ${num(facts.prevalence)}).`,
    },
  };

  const flags: RedFlag[] = [];
  const familywise = 1 - 0.95 ** SESSION_TEST_COUNT;
  flags.push({
    id: 'multiple-comparisons',
    category: 'Tip I hata riski',
    title: 'Çoklu karşılaştırma riski (p-hacking)',
    description: `Oturum kaydında ${SESSION_TEST_COUNT} hipotez testi var. Düzeltme yapılmazsa en az bir yanlış pozitif bulma olasılığı ${pct(familywise)} (1 − 0,95^${SESSION_TEST_COUNT}, testler bağımsız varsayımıyla).`,
    solution: 'Holm düzeltmesi uygulayın (Bonferroni’den eşit ya da daha güçlüdür). Keşif amaçlıysa yanlış keşif oranını (Benjamini-Hochberg) denetleyin.',
    actionLabel: 'Holm düzeltmesi uygula',
    resolvedLabel: 'Holm uygulandı',
  });
  flags.push({
    id: 'imbalance',
    category: 'Sınıf dengesizliği',
    title: `Dengesiz veri seti (${pct(1 - facts.prevalence, 0)} / ${pct(facts.prevalence, 0)})`,
    description: `Her zaman çoğunluk sınıfını tahmin eden bir model ${pct(facts.baselineAccuracy)} doğruluk alır; ${best.name} ise ${pct(bm.accuracy)}. Azınlık sınıfında F1 = ${num(bm.f1)}, duyarlılık = ${num(bm.recall)}.`,
    solution: 'SMOTE veya sınıf ağırlıklandırma kullanın; yalnızca eğitim katlarında (Pipeline içinde), çapraz doğrulamadan önce değil. Karar eşiğini ayrıca ayarlayın.',
    actionLabel: 'SMOTE ile dengele',
    resolvedLabel: 'Sınıflar dengelendi',
  });
  const gap = bm.trainAccuracy - bm.accuracy;
  if (gap >= 0.03) {
    flags.push({
      id: 'overfitting',
      category: 'Genellenebilirlik',
      title: 'Aşırı öğrenme ihtimali',
      description: `${best.name}: eğitim doğruluğu ${pct(bm.trainAccuracy)}, test doğruluğu ${pct(bm.accuracy)} (fark ${(gap * 100).toFixed(1)} puan). Tek bir ayrımdan kesin yargıya varılamaz; farkı çapraz doğrulama ile doğrulayın.`,
      solution: '5 katlı tabakalı çapraz doğrulama (Stratified K-Fold) kullanın ve öğrenme eğrisine bakın.',
      actionLabel: 'Çapraz doğrulamayı çalıştır',
      resolvedLabel: 'Çapraz doğrulama tamam',
    });
  }

  cached = { models, facts, insight, redFlags: flags, recommendedId };
  return cached;
}
