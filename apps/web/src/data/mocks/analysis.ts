import { effectLabel, formatP } from '@/lib/stats';
import type { AnalysisSummary, Dataset } from '../types';
import { kruskal, sampleBins, sampleStats } from './sample';

export const datasets: Dataset[] = [
  { id: 'klinik-faz3', fileName: 'Klinik_Veri_Faz3.csv', rows: 1420, columns: 8 },
  { id: 'anket-2026', fileName: 'Anket_Memnuniyet_2026.csv', rows: 864, columns: 14 },
];

const eps = kruskal.epsilonSquared;
const pText = formatP(kruskal.p);
const pApa = formatP(kruskal.p, true);
const significant = kruskal.p < 0.05;
const oneInThousand = kruskal.p < 0.001 ? 'binde birden az' : `yaklaşık binde ${Math.round(kruskal.p * 1000)}`;

/**
 * Üç gruplu örnek analiz. H, p, ε², n, histogram ve çarpıklık `sample.ts` içindeki veriden hesaplanır.
 * Varsayım testlerinin (Shapiro-Wilk, Levene) değerleri örnek olarak verilmiştir, hesaplanmaz.
 */
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
    bins: sampleBins,
    mean: sampleStats.mean,
    sd: sampleStats.sd,
    skewness: Number(sampleStats.skewness.toFixed(2)),
    n: sampleStats.n,
  },
  result: {
    id: 'kruskal',
    metric: `p = ${pText}`,
    threshold: 'α = 0.05',
    verdict: significant ? 'H₀ reddedildi' : 'H₀ reddedilemedi',
    significant,
    headline: significant
      ? 'Gruplar arasında istatistiksel olarak anlamlı bir fark var.'
      : 'Gruplar arasında anlamlı bir fark bulunamadı.',
    body: {
      novice:
        `Gruplar gerçekte aynı olsaydı, örneğimizdeki kadar büyük bir fark görme ihtimali ${oneInThousand} olurdu. Bu yüzden gruplar arasında gerçek bir fark olduğunu düşünmek için güçlü bir neden var. Farkın büyüklüğü ${effectLabel(eps)} (ε² = ${eps.toFixed(2)}). Bu sonuç, farkın nedenini göstermez.`,
      expert: `Kruskal-Wallis H(${kruskal.df}) = ${kruskal.H.toFixed(2)}, p = ${pApa}, ε² = ${eps.toFixed(2)} (${effectLabel(eps)}), N = ${kruskal.n}. Gruplardan en az biri, diğerlerine göre sistematik olarak büyük (ya da küçük) değerler üretiyor (stokastik üstünlük). Hangi çiftlerin ayrıştığı post-hoc testle belirlenmeli.`,
    },
    recommendation: {
      label: 'Sıradaki adım',
      text: 'Hangi iki grubun birbirinden farklı olduğunu bulmak için post-hoc test yapın:',
      link: 'Dunn testi (Holm düzeltmeli)',
    },
  },
  testStatistic: {
    name: 'H',
    value: kruskal.H,
    df: kruskal.df,
    p: kruskal.p,
    effect: 'ε²',
    effectValue: eps,
    n: kruskal.n,
  },
};
