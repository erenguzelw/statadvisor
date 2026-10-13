import type { Interpretation, Model, RedFlag, RocPoint } from '../types';

/** AUC değerini tutturan pürüzsüz bir ROC eğrisi: tpr = fpr^k, AUC = 1/(k+1). */
function rocFor(auc: number): RocPoint[] {
  const k = 1 / auc - 1;
  return Array.from({ length: 21 }, (_, i) => {
    const fpr = i / 20;
    return { fpr, tpr: Math.pow(fpr, k) };
  });
}

export const models: Model[] = [
  {
    id: 'logreg',
    name: 'Lojistik Regresyon',
    family: 'Parametrik temel',
    summary:
      'Yüksek şeffaflık ve katsayı analizi sunar. Tıp ve regülasyona tabi araştırmalarda ilk tercihtir, ancak doğrusal olmayan ilişkilerde kapasitesi düşüktür.',
    speed: 95,
    interpretability: 95,
    accuracy: 78,
    f1: 0.74,
    rocAuc: 0.81,
    roc: rocFor(0.81),
    detailAction: 'Katsayıları incele',
  },
  {
    id: 'rf',
    name: 'Random Forest',
    family: 'Topluluk (ensemble)',
    summary:
      'Doğrusal olmayan ilişkileri ve etkileşimleri kendiliğinden yakalar, aşırı öğrenmeye karşı dirençlidir. Özellik önemi (SHAP) ile açıklanabilir kalır.',
    speed: 62,
    interpretability: 48,
    accuracy: 89,
    f1: 0.87,
    rocAuc: 0.89,
    recommended: true,
    roc: rocFor(0.89),
    detailAction: 'Özellik önemini incele',
  },
  {
    id: 'xgb',
    name: 'XGBoost',
    family: 'Gradient boosting',
    summary:
      'En yüksek kestirim gücüne sahip seçenek. Aşırı öğrenmeye açıktır; hiper-parametre ayarı ve düzenlileştirme gerektirir.',
    speed: 70,
    interpretability: 35,
    accuracy: 91,
    f1: 0.89,
    rocAuc: 0.91,
    roc: rocFor(0.91),
    detailAction: 'Hiper-parametreler',
  },
];

export const modelInsight: Interpretation = {
  id: 'f1-minority',
  metric: 'F1 (azınlık) = 0.42',
  headline: 'Modeliniz azınlık sınıfını tahmin etmekte zorlanıyor.',
  body: {
    novice:
      'Genel doğruluk yüksek (%89–%91) görünse de bu yanıltıcı. Verinin %92’si tek sınıftan oluştuğu için model, klinik açıdan önemli olan pozitif vakaları kaçırıyor.',
    expert:
      'Hedef dağılımı %92 / %8. Azınlık sınıfı için F1 = 0.42, recall = 0.31. Accuracy dengesiz veride bilgi vermiyor; ağırlıklı F1 ve PR-AUC ile değerlendirin.',
  },
};

export const minoritySupport = { minority: 142, total: 1775 };

export const redFlags: RedFlag[] = [
  {
    id: 'multiple-comparisons',
    category: 'Tip I hata riski',
    title: 'Çoklu karşılaştırma riski (p-hacking)',
    description:
      'Aynı veri seti üzerinde 14 hipotez testi yürütüldü. Düzeltme yapılmazsa en az bir yanlış pozitif bulma olasılığı %51.2’ye çıkıyor.',
    solution: 'α / k Bonferroni veya Holm-Bonferroni düzeltmesi uygulayın.',
    actionLabel: 'Bonferroni düzeltmesi uygula',
    resolvedLabel: 'Bonferroni uygulandı',
  },
  {
    id: 'imbalance',
    category: 'Sınıf dengesizliği',
    title: 'Dengesiz veri seti (%92 / %8)',
    description:
      'Sınıflar arasındaki sert dengesizlik modelin azınlık sınıfını yok saymasına yol açıyor. Azınlık sınıfı F1 skoru 0.42’de kalıyor.',
    solution: 'SMOTE veya ADASYN ile sentetik örnekleme yapın.',
    actionLabel: 'SMOTE ile dengele',
    resolvedLabel: 'Sınıflar dengelendi',
  },
  {
    id: 'overfitting',
    category: 'Genellenebilirlik',
    title: 'Aşırı öğrenme ihtimali',
    description:
      'Eğitim doğruluğu %99.1, test doğruluğu %79.4. Aradaki %19.7’lik fark, modelin gürültüyü ezberlediğini gösteriyor.',
    solution: '5 katlı tabakalı çapraz doğrulama (Stratified K-Fold) kullanın.',
    actionLabel: 'Çapraz doğrulamayı çalıştır',
    resolvedLabel: 'Çapraz doğrulama tamam',
  },
];
