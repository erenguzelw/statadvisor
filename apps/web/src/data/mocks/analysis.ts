import type { AnalysisSummary, Dataset } from '../types';

export const datasets: Dataset[] = [
  { id: 'klinik-faz3', fileName: 'Klinik_Veri_Faz3.csv', rows: 1420, columns: 8 },
  { id: 'anket-2026', fileName: 'Anket_Memnuniyet_2026.csv', rows: 864, columns: 14 },
];

/** Sağa çarpık, üç gruplu klinik örnek (ekranlardaki değerler). */
export const analysis: AnalysisSummary = {
  dataset: datasets[0]!,
  wizard: [
    { id: 'goal', question: 'Amacınız nedir?', answer: 'Grupları karşılaştırmak' },
    { id: 'groups', question: 'Kaç grubu karşılaştırıyorsunuz?', answer: '3 grup (A, B, C)' },
    { id: 'target', question: 'Hedef değişkeniniz nedir?', answer: 'Sürekli (sayısal)' },
  ],
  decision: {
    conditions: ['Amaç: Karşılaştırma', 'Grup: 3+, bağımsız'],
    plannedTest: 'Tek Yönlü ANOVA',
    finalTest: 'Kruskal-Wallis H',
    rerouteReason: 'Normallik varsayımı sağlanmadı',
  },
  assumptions: [
    { id: 'shapiro', name: 'Shapiro-Wilk', p: 0.012, alpha: 0.05, passed: false, verdict: 'Veri normal dağılmıyor.' },
    { id: 'levene', name: 'Levene', p: 0.41, alpha: 0.05, passed: true, verdict: 'Varyanslar homojen (eşit dağılımlı).' },
  ],
  distribution: {
    bins: [
      { x0: 0, x1: 1, count: 18 },
      { x0: 1, x1: 2, count: 46 },
      { x0: 2, x1: 3, count: 74 },
      { x0: 3, x1: 4, count: 80 },
      { x0: 4, x1: 5, count: 58 },
      { x0: 5, x1: 6, count: 36 },
      { x0: 6, x1: 7, count: 24 },
      { x0: 7, x1: 8, count: 14 },
      { x0: 8, x1: 9, count: 8 },
      { x0: 9, x1: 10, count: 5 },
      { x0: 10, x1: 11, count: 3 },
    ],
    mean: 5.2,
    sd: 1.6,
    skewness: 1.48,
    n: 366,
  },
  result: {
    id: 'kruskal',
    metric: 'p = 0.003',
    threshold: 'α = 0.05',
    verdict: 'H₀ reddedildi',
    headline: 'Gruplar arasında istatistiksel olarak anlamlı bir fark var.',
    body: {
      novice:
        'Üç grup arasındaki bu farkın tesadüfen ortaya çıkma olasılığı binde 3. Uygulanan yöntem gruplar üzerinde gerçek bir etki yaratıyor.',
      expert: 'Kruskal-Wallis H(2) = 11.6, p = .003, ε² = 0.21 (geniş etki). Sıra ortalamaları en az bir grup çiftinde farklılaşıyor.',
    },
    recommendation: {
      label: 'Sıradaki adım',
      text: 'Hangi iki grubun birbirinden farklı olduğunu bulmak için post-hoc test yapın:',
      link: 'Dunn-Bonferroni',
    },
  },
  testStatistic: { name: 'H', value: 11.6, df: 2, p: 0.003, effect: 'ε²', effectValue: 0.21, n: 45 },
};
