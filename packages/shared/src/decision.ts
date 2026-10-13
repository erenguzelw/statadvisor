/**
 * Test seçim kural motoru. Deterministiktir: aynı yanıtlar ve aynı varsayım sonuçları her zaman aynı öneriyi verir.
 *
 * Tasarım kararları (bkz. docs/risk_firsat_raporu.md):
 * - Normal dağılım varsa varsayılan Welch'tir; Levene'in anlamsız çıkması varyans eşitliğinin kanıtı değildir.
 * - Normallik, ham veriye değil grup içi kalıntılara bakılarak sınanır (çağıran taraf bunu sağlar).
 * - Ön testle test seçmenin Tip I hata oranını etkileyebileceği ve küçük/büyük n sınırlamaları her öneride uyarı olarak verilir.
 */

export type Goal = 'compare' | 'relate' | 'predict';
export type GroupCount = '2' | '3+';
export type Design = 'independent' | 'paired' | 'unknown';
export type Target = 'continuous' | 'ordinal' | 'categorical';

export interface WizardAnswers {
  goal: Goal;
  groups: GroupCount;
  design: Design;
  target: Target;
}

export interface WizardQuestion<K extends keyof WizardAnswers = keyof WizardAnswers> {
  id: K;
  question: string;
  options: { value: WizardAnswers[K]; label: string; description?: string }[];
  /** Veri setinden çıkarılabilen sorular otomatik doldurulur ve kullanıcıya onaylatılır. */
  inferable: boolean;
}

export const wizardQuestions: WizardQuestion[] = [
  {
    id: 'goal',
    question: 'Amacınız nedir?',
    inferable: false,
    options: [
      { value: 'compare', label: 'Grupları karşılaştırmak' },
      { value: 'relate', label: 'İki değişken arasındaki ilişkiye bakmak' },
      { value: 'predict', label: 'Bir sonucu tahmin etmek' },
    ],
  },
  {
    id: 'groups',
    question: 'Kaç grubu karşılaştırıyorsunuz?',
    inferable: true,
    options: [
      { value: '2', label: '2 grup' },
      { value: '3+', label: '3 veya daha fazla grup' },
    ],
  },
  {
    id: 'design',
    question: 'Gruplardaki gözlemler birbirinden bağımsız mı?',
    inferable: false,
    options: [
      { value: 'independent', label: 'Evet, farklı kişiler/birimler', description: 'Her gözlem tek bir grupta' },
      { value: 'paired', label: 'Hayır, aynı kişiler tekrar ölçüldü', description: 'Önce/sonra veya eşleştirilmiş' },
      { value: 'unknown', label: 'Bilmiyorum' },
    ],
  },
  {
    id: 'target',
    question: 'Hedef değişkeniniz nasıl bir değişken?',
    inferable: true,
    options: [
      { value: 'continuous', label: 'Sürekli (sayısal)' },
      { value: 'ordinal', label: 'Sıralı (ör. memnuniyet 1–5)' },
      { value: 'categorical', label: 'Kategorik (ör. evet/hayır)' },
    ],
  },
];

export interface AssumptionInput {
  /** Normallik testinin p değeri (grup içi kalıntılar üzerinde). */
  normalP: number;
  /** Varyans eşitliği testinin p değeri. */
  varianceP: number;
  alpha?: number;
  /** Toplam gözlem sayısı ve en küçük grubun gözlem sayısı. */
  n: number;
  minGroupN: number;
  /** Normallik ölçütü (varsayılan Shapiro-Wilk). */
  normality?: 'shapiro' | 'skewkurt-1.5' | 'skewkurt-2';
}

export interface Recommendation {
  /** Varsayımlar sağlansaydı klasik olarak seçilecek test. */
  plannedTest: string;
  finalTest: string;
  /** Nihai test planlanandan farklıysa nedeni. */
  rerouteReason?: string;
  /** Her zaman gösterilen yöntemsel uyarılar. */
  warnings: string[];
  /** Ekrandaki örnek analiz (3 bağımsız grup, sürekli hedef) bu soru setine uyuyor mu? */
  supportedByExample: boolean;
  /** Karar ağacında izlenen koşullar. */
  conditions: string[];
}

const goalLabel: Record<Goal, string> = { compare: 'Amaç: Karşılaştırma', relate: 'Amaç: İlişki', predict: 'Amaç: Tahmin' };
const targetLabel: Record<Target, string> = { continuous: 'Hedef: sürekli', ordinal: 'Hedef: sıralı', categorical: 'Hedef: kategorik' };
const groupLabel: Record<GroupCount, string> = { '2': '2 grup', '3+': '3+ grup' };
const designLabel: Record<Design, string> = { independent: 'bağımsız', paired: 'eşleşmiş', unknown: 'bağımsızlık doğrulanmadı' };

export const defaultAnswers: WizardAnswers = { goal: 'compare', groups: '3+', design: 'unknown', target: 'continuous' };

export function recommendTest(answers: WizardAnswers, a: AssumptionInput): Recommendation {
  const alpha = a.alpha ?? 0.05;
  const normal = a.normalP >= alpha;
  const equalVar = a.varianceP >= alpha;
  const warnings: string[] = [];
  const conditions = [goalLabel[answers.goal]];
  let planned: string;
  let final: string;
  let reroute: string | undefined;

  if (answers.goal === 'predict') {
    planned = final = 'Sınıflandırma / regresyon modeli karşılaştırması';
    warnings.push('Tahminde varsayım testleri yerine çapraz doğrulama ve dengesiz veriye uygun ölçütler (F1, PR-AUC) kullanılır; Model Karşılaştırma sayfasına bakın.');
    return { plannedTest: planned, finalTest: final, warnings, supportedByExample: false, conditions };
  }

  if (answers.goal === 'relate') {
    conditions.push(targetLabel[answers.target]);
    if (answers.target === 'categorical') {
      planned = final = 'Ki-kare bağımsızlık testi';
      warnings.push('Beklenen hücre sayıları 5’ten küçükse Fisher kesin testini kullanın.');
    } else if (answers.target === 'ordinal') {
      planned = final = 'Spearman sıra korelasyonu';
    } else {
      planned = 'Pearson korelasyonu';
      final = normal ? 'Pearson korelasyonu' : 'Spearman sıra korelasyonu';
      if (!normal) reroute = 'Normallik varsayımı sağlanmadı';
    }
    warnings.push(...general(a, normal, equalVar, false, answers.target === 'continuous'));
    return { plannedTest: planned, finalTest: final, rerouteReason: reroute, warnings, supportedByExample: false, conditions };
  }

  // Karşılaştırma
  conditions.push(groupLabel[answers.groups], designLabel[answers.design], targetLabel[answers.target]);
  const paired = answers.design === 'paired';
  const two = answers.groups === '2';

  if (answers.target === 'categorical') {
    planned = final = 'Ki-kare homojenlik testi';
    warnings.push('Beklenen hücre sayıları 5’ten küçükse Fisher kesin testini kullanın.');
  } else if (answers.target === 'ordinal') {
    planned = final = paired ? (two ? 'Wilcoxon işaretli sıra testi' : 'Friedman testi') : two ? 'Mann-Whitney U testi' : 'Kruskal-Wallis H testi';
  } else {
    planned = paired ? (two ? 'Eşleştirilmiş t-testi' : 'Tekrarlı ölçümler ANOVA') : two ? 'Bağımsız örneklem t-testi' : 'Tek Yönlü ANOVA';
    if (!normal) {
      final = paired ? (two ? 'Wilcoxon işaretli sıra testi' : 'Friedman testi') : two ? 'Mann-Whitney U testi' : 'Kruskal-Wallis H testi';
      reroute = 'Normallik varsayımı sağlanmadı';
    } else if (!paired) {
      final = two ? 'Welch t-testi' : 'Welch ANOVA';
      reroute = equalVar
        ? 'Welch, varyans eşitliği varsayımı gerektirmez ve varyanslar eşitken de kayıp yaratmaz'
        : 'Varyanslar eşit değil: klasik testin varsayımı bozuldu';
    } else {
      final = planned;
    }
  }

  if (answers.design === 'unknown') {
    warnings.push('Gözlemlerin bağımsızlığı doğrulanmadı. Öneri bağımsızlık varsayar; aynı kişiler tekrar ölçüldüyse eşleşmiş bir test gerekir.');
  }
  if (paired && answers.target === 'continuous') {
    warnings.push('Eşleşmiş tasarımda normallik, grupların değil farkların dağılımı için aranır; buradaki sonuç grup düzeyindedir.');
  }
  const isKruskal = final === 'Kruskal-Wallis H testi' || final === 'Mann-Whitney U testi';
  if (isKruskal && !paired) {
    warnings.push(
      equalVar
        ? 'Dağılım şekilleri benzerse sonuç medyan farkı olarak okunabilir; bu ek bir varsayımdır. Aksi halde “bir gruptan rastgele alınan değerin diğerinden büyük olma olasılığı” olarak yorumlayın.'
        : 'Yayılımlar farklı olduğundan sonuç medyan karşılaştırması olarak yorumlanamaz; yalnızca stokastik üstünlük olarak okunmalıdır.',
    );
  }
  warnings.push(...general(a, normal, equalVar, true, answers.target === 'continuous'));

  const supported = answers.groups === '3+' && !paired && answers.target === 'continuous';
  return { plannedTest: planned, finalTest: final, rerouteReason: reroute, warnings, supportedByExample: supported, conditions };
}

function general(a: AssumptionInput, normal: boolean, equalVar: boolean, usesVariance: boolean, checksNormality: boolean): string[] {
  const out: string[] = [];
  const shapiro = checksNormality && (a.normality ?? 'shapiro') === 'shapiro';
  if (shapiro && a.minGroupN < 20) {
    out.push(`En küçük grupta yalnızca ${a.minGroupN} gözlem var: Shapiro-Wilk bu n’de güçsüzdür, “normal” çıkması normalliği kanıtlamaz.`);
  }
  if (shapiro && a.n >= 100) {
    out.push(`n = ${a.n}: Shapiro-Wilk önemsiz sapmalara bile duyarlıdır. Q-Q grafiğine ve çarpıklığa da bakın.`);
  }
  if (usesVariance && normal && !equalVar) {
    out.push('Varyanslar eşit değil: post-hoc için ikili Welch t-testleri (Holm düzeltmeli) kullanın.');
  }
  if (checksNormality && !shapiro && a.minGroupN < 30) {
    out.push(`En küçük grupta ${a.minGroupN} gözlem var: küçük örneklemde çarpıklık ve basıklık kararsızdır; histogramı da inceleyin.`);
  }
  if (checksNormality) out.push('Ön testlerle test seçmek Tip I hata oranını etkileyebilir. Seçim kuralını raporunuzda belirtin.');
  return out;
}
