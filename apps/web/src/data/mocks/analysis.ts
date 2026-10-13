import { groupResiduals, levene, mean, median, shapiroWilk } from '@statadvisor/shared';
import { defaultAnswers, recommendTest } from '@statadvisor/shared';
import { effectLabel, formatP, meanSd } from '@statadvisor/shared';
import type { AnalysisSummary, Dataset, GroupDescriptive } from '@statadvisor/shared';
import { groupList, kruskal, sampleBins, sampleGroups, sampleStats } from './sample';

export const datasets: Dataset[] = [{ id: 'klinik-faz3', fileName: 'Klinik_Veri_Faz3.csv', rows: 1420, columns: 6 }];

/*
 * Üç gruplu örnek analiz. Buradaki her sayı `sample.ts` içindeki veriden hesaplanır:
 * Shapiro-Wilk (grup içi kalıntılar), Levene, Kruskal-Wallis H, p, ε², histogram ve çarpıklık.
 */
const alpha = 0.05;
const shapiro = shapiroWilk(groupResiduals(groupList));
const lev = levene(groupList);
const eps = kruskal.epsilonSquared;
const pText = formatP(kruskal.p);
const pApa = formatP(kruskal.p, true);
const significant = kruskal.p < alpha;
const oneInThousand = kruskal.p < 0.001 ? 'binde birden az' : `yaklaşık binde ${Math.round(kruskal.p * 1000)}`;
const minGroupN = Math.min(...groupList.map((g) => g.length));

const assumptionInput = { normalP: shapiro.p, varianceP: lev.p, alpha, n: kruskal.n, minGroupN };
const recommendation = recommendTest(defaultAnswers, assumptionInput);

const descriptives: GroupDescriptive[] = Object.entries(sampleGroups).map(([group, values]) => ({
  group: `Grup ${group}`,
  n: values.length,
  median: median(values),
  mean: mean(values),
  sd: meanSd(values).sd,
}));

export const analysis: AnalysisSummary = {
  dataset: datasets[0]!,
  defaultAnswers,
  // Grup sayısı ve değişken tipi veriden çıkarılır; amaç ve bağımsızlık kullanıcıdan alınır.
  inferred: ['groups', 'target'],
  decision: {
    conditions: recommendation.conditions,
    plannedTest: recommendation.plannedTest,
    finalTest: recommendation.finalTest,
    rerouteReason: recommendation.rerouteReason,
    warnings: recommendation.warnings,
  },
  assumptionInput,
  assumptions: [
    {
      id: 'shapiro',
      name: 'Shapiro-Wilk',
      subject: `grup içi kalıntılar, n = ${shapiro.n}`,
      statistic: `W = ${shapiro.W.toFixed(3)}`,
      p: shapiro.p,
      alpha,
      passed: shapiro.p >= alpha,
      verdict:
        shapiro.p >= alpha
          ? 'Normallikten sapma saptanmadı (bu, normalliğin kanıtı değildir).'
          : 'Normallik varsayımı reddedildi: kalıntılar normal dağılımdan sapıyor.',
      explain: {
        novice:
          'Bu test, değerlerin çan eğrisine benzeyip benzemediğine bakar. p küçükse veri çan eğrisinden belirgin biçimde sapıyor demektir. Küçük örneklemde güçsüzdür; büyük örneklemde ise çok küçük sapmalara bile uyarı verir.',
        expert: `H₀: grup içi kalıntılar normal dağılımdan gelir. W = ${shapiro.W.toFixed(3)}, p = ${formatP(shapiro.p, true)} (Royston, 1995). Ön test sonrası test seçimi koşullu Tip I hatayı etkileyebilir; Q-Q grafiği ve çarpıklık/basıklık ile birlikte değerlendirin.`,
      },
    },
    {
      id: 'levene',
      name: 'Levene',
      subject: `medyan merkezli (Brown-Forsythe), ${groupList.length} grup`,
      statistic: `F(${lev.df1}, ${lev.df2}) = ${lev.F.toFixed(2)}`,
      p: lev.p,
      alpha,
      passed: lev.p >= alpha,
      verdict:
        lev.p >= alpha
          ? 'Varyans eşitliğine karşı kanıt bulunamadı (bu, eşitliğin kanıtı değildir).'
          : 'Varyanslar eşit değil: gruplar arasında yayılım farkı var.',
      explain: {
        novice:
          'Bu test, grupların ne kadar yayıldığının benzer olup olmadığına bakar. p küçükse yayılımlar belirgin biçimde farklıdır. Büyük p, “eşit” demek değil, “fark gösteremedik” demektir.',
        expert: `H₀: grup varyansları eşit. Brown-Forsythe, F(${lev.df1}, ${lev.df2}) = ${lev.F.toFixed(2)}, p = ${formatP(lev.p, true)}. Anlamsız sonuç eşitliği kanıtlamaz; bu yüzden Welch yaklaşımı varsayılan olarak daha güvenlidir.`,
      },
    },
  ],
  distribution: {
    bins: sampleBins,
    mean: sampleStats.mean,
    sd: sampleStats.sd,
    skewness: Number(sampleStats.skewness.toFixed(2)),
    n: sampleStats.n,
  },
  descriptives,
  result: {
    id: 'kruskal',
    metric: `p = ${pText}`,
    threshold: 'α = 0.05',
    verdict: significant ? 'H₀ reddedildi' : 'H₀ reddedilemedi',
    significant,
    headline: significant ? 'Gruplar arasında istatistiksel olarak anlamlı bir fark var.' : 'Gruplar arasında anlamlı bir fark bulunamadı.',
    body: {
      novice: `Gruplar gerçekte aynı olsaydı, örneğimizdeki kadar büyük bir fark görme ihtimali ${oneInThousand} olurdu. Bu yüzden gruplar arasında gerçek bir fark olduğunu düşünmek için güçlü bir neden var. Farkın büyüklüğü ${effectLabel(eps)} (ε² = ${eps.toFixed(2)}). Bu sonuç, farkın nedenini göstermez.`,
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
