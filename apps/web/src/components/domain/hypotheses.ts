export interface Hypotheses {
  null: string;
  alternative: string;
  note?: string;
}

/** Hipotezler önerilen değil, gerçekten çalıştırılan testin adına göre seçilir. */
export function hypothesesFor(test: string): Hypotheses | undefined {
  switch (test) {
    case 'Bağımsız örneklem t-testi':
    case 'Welch t-testi':
      return {
        null: 'İki grubun anakütle ortalamaları eşittir (μ₁ = μ₂).',
        alternative: 'İki grubun anakütle ortalamaları farklıdır (μ₁ ≠ μ₂).',
        note: 'İki yönlü karşılaştırma: fark her iki yönde de olabilir. μ, örneklem ortalamasını değil anakütle ortalamasını gösterir.',
      };
    case 'Eşleştirilmiş t-testi':
      return {
        null: 'Eşleştirilmiş ölçümlerin anakütledeki ortalama farkı sıfırdır (μd = 0).',
        alternative: 'Eşleştirilmiş ölçümlerin anakütledeki ortalama farkı sıfırdan farklıdır (μd ≠ 0).',
      };
    case 'Tek Yönlü ANOVA':
    case 'Welch ANOVA':
    case 'Tekrarlı ölçümler ANOVA':
      return {
        null: 'Tüm grup veya koşulların anakütle ortalamaları eşittir.',
        alternative: 'En az bir grup veya koşulun anakütle ortalaması farklıdır.',
        note: 'Anlamlı sonuç, bütün grupların birbirinden farklı olduğunu göstermez.',
      };
    case 'Mann-Whitney U testi':
    case 'Kruskal-Wallis H testi':
      return {
        null: 'Grupların anakütle dağılımları aynıdır.',
        alternative: 'Grupların anakütle dağılımları arasında fark vardır.',
        note: 'Bu test doğrudan ortalama farkını sınamaz. Medyan farkı yorumu, dağılımların benzer biçim ve yayılıma sahip olmasını gerektirir.',
      };
    case 'Wilcoxon işaretli sıra testi':
      return {
        null: 'Eşleştirilmiş farkların dağılımı sıfır etrafında simetriktir.',
        alternative: 'Eşleştirilmiş farkların dağılımı sıfır etrafında simetrik değildir.',
        note: 'Bir konum farkı olarak yorumlamak için fark dağılımının simetri varsayımı dikkate alınmalıdır.',
      };
    case 'Friedman testi':
      return {
        null: 'Aynı bireylerde ölçülen koşulların dağılımları aynıdır.',
        alternative: 'En az bir koşulun dağılımı farklıdır.',
      };
    case 'Pearson korelasyonu':
      return {
        null: 'Anakütlede doğrusal korelasyon sıfırdır (ρ = 0).',
        alternative: 'Anakütlede doğrusal korelasyon sıfırdan farklıdır (ρ ≠ 0).',
        note: 'Doğrusal korelasyonun sıfır olması, her tür ilişkinin yokluğu anlamına gelmez.',
      };
    case 'Spearman sıra korelasyonu':
      return {
        null: 'Anakütlede Spearman sıra korelasyonu sıfırdır (ρs = 0).',
        alternative: 'Anakütlede Spearman sıra korelasyonu sıfırdan farklıdır (ρs ≠ 0).',
      };
    case 'Ki-kare homojenlik testi':
      return {
        null: 'Kategorilerin anakütle oranları tüm gruplarda aynıdır.',
        alternative: 'En az bir grubun kategori oranları farklıdır.',
      };
    case 'Ki-kare bağımsızlık testi':
    case 'Fisher kesin testi':
      return {
        null: 'İki kategorik değişken anakütlede bağımsızdır.',
        alternative: 'İki kategorik değişken anakütlede bağımsız değildir; aralarında ilişki vardır.',
      };
    default:
      return undefined;
  }
}
