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
  /** Çarpıklık-basıklık ölçütünde en büyük |çarpıklık| ya da |basıklık| (sınırda uyarısı için). */
  maxShape?: number;
  /** false ise normallik/varyans veriden ölçülmemiştir (varsayılan değerler); koşul rozetleri "bilinmiyor" olur. */
  measured?: boolean;
  /**
   * Bağımsız gruplarda varyans yaklaşımı. welch (varsayılan): normal dağılımda her zaman Welch t / Welch ANOVA
   * (+ Games–Howell). levene: Levene p ≥ α ise klasik Student t / tek yönlü ANOVA (+ Tukey HSD), değilse Welch.
   */
  variancePolicy?: 'welch' | 'levene';
}

/** Seçilen teste yakın, belirli koşullarda düşünülebilecek bir yöntem. */
export interface Alternative {
  test: string;
  when: string;
}

/** Bir koşulun nasıl bilindiği: veriden ölçüldü, kullanıcı beyan etti ya da bilinmiyor. */
export type CheckStatus = 'verified' | 'declared' | 'unknown';

export interface ConditionCheck {
  label: string;
  status: CheckStatus;
  detail: string;
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
  /** Seçilen teste alternatifler ve hangi koşulda düşünülebilecekleri. */
  alternatives: Alternative[];
  /** Kararı etkileyen koşulların kaynağı (doğrulandı / beyan / bilinmiyor). */
  checks: ConditionCheck[];
  /** Normallik kararı eşiğe çok yakın: iki yolun da raporlanması önerilir. */
  borderline: boolean;
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
    return { plannedTest: planned, finalTest: final, warnings, supportedByExample: false, conditions, alternatives: [], checks: [], borderline: false };
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
    const continuous = answers.target === 'continuous';
    const border = continuous && isBorderline(a, alpha);
    if (border) warnings.unshift(borderlineWarning(normal ? 'Spearman sıra korelasyonu' : 'Pearson korelasyonu'));
    warnings.push(...general(a, normal, equalVar, false, continuous));
    return {
      plannedTest: planned,
      finalTest: final,
      rerouteReason: reroute,
      warnings,
      supportedByExample: false,
      conditions,
      alternatives: alternativesFor(final),
      checks: checksFor(answers, a, normal, equalVar, false),
      borderline: border,
    };
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
      if (a.variancePolicy === 'levene' && equalVar) {
        // Kullanıcı tercihi: Levene anlamsızsa klasik test (SPSS alışkanlığı)
        final = planned;
        warnings.push('Levene testinin anlamsız çıkması varyansların eşit olduğunu kanıtlamaz; klasik test bu tercihle seçildi. Grup büyüklükleri belirgin farklıysa Welch daha güvenlidir.');
      } else {
        final = two ? 'Welch t-testi' : 'Welch ANOVA';
        reroute = equalVar
          ? 'Welch, varyans eşitliği varsayımı gerektirmez ve varyanslar eşitken de kayıp yaratmaz'
          : 'Varyanslar eşit değil: klasik testin varsayımı bozuldu';
      }
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
  const continuous = answers.target === 'continuous';
  const border = continuous && isBorderline(a, alpha);
  if (border) {
    // Normallik kararı tersine dönseydi seçilecek test
    const other = paired
      ? two ? (normal ? 'Wilcoxon işaretli sıra testi' : 'Eşleştirilmiş t-testi') : normal ? 'Friedman testi' : 'Tekrarlı ölçümler ANOVA'
      : two ? (normal ? 'Mann-Whitney U testi' : 'Welch t-testi') : normal ? 'Kruskal-Wallis H testi' : 'Welch ANOVA';
    warnings.unshift(borderlineWarning(other));
  }
  warnings.push(...general(a, normal, equalVar, true, continuous));

  const supported = answers.groups === '3+' && !paired && continuous;
  return {
    plannedTest: planned,
    finalTest: final,
    rerouteReason: reroute,
    warnings,
    supportedByExample: supported,
    conditions,
    alternatives: alternativesFor(final),
    checks: checksFor(answers, a, normal, equalVar, !paired),
    borderline: border,
  };
}

/** Shapiro-Wilk p değeri α/2 ile 2α arasında ya da çarpıklık/basıklık sınırın ±%20'sinde ise normallik kararı kırılgandır. */
export function isBorderline(a: AssumptionInput, alpha: number): boolean {
  if (a.measured === false) return false;
  const method = a.normality ?? 'shapiro';
  if (method === 'shapiro') return a.normalP >= alpha / 2 && a.normalP < alpha * 2;
  if (a.maxShape === undefined) return false;
  const limit = method === 'skewkurt-2' ? 2 : 1.5;
  return Math.abs(a.maxShape - limit) <= limit * 0.2;
}

function borderlineWarning(other: string): string {
  return `Normallik kararı sınırda: küçük bir veri değişikliği seçimi tersine çevirebilir. Sonucun sağlamlığını göstermek için ${other} sonucunu da raporlamanız önerilir.`;
}

const ALTERNATIVES: Record<string, Alternative[]> = {
  'Welch t-testi': [
    { test: 'Bağımsız örneklem t-testi (Student)', when: 'Varyansların eşit olduğuna dair güçlü önsel bilgi varsa; aksi halde Welch kayıpsızdır.' },
    { test: 'Mann-Whitney U testi', when: 'Dağılım belirgin çarpık ya da uç değerli ise; sonuç stokastik üstünlük olarak okunur.' },
  ],
  'Welch ANOVA': [
    { test: 'Tek Yönlü ANOVA', when: 'Varyansların eşit olduğuna dair güçlü önsel bilgi varsa.' },
    { test: 'Kruskal-Wallis H testi', when: 'Dağılım belirgin çarpık ya da uç değerli ise.' },
  ],
  'Mann-Whitney U testi': [
    { test: 'Welch t-testi', when: 'Gruplar büyükse (her biri ≳ 30) ortalama farkı merkezi limit teoremiyle sağlam biçimde sınanabilir.' },
    { test: 'Permütasyon / bootstrap testi', when: 'Ortalama farkını varsayımsız sınamak istiyorsanız.' },
  ],
  'Kruskal-Wallis H testi': [
    { test: 'Welch ANOVA', when: 'Gruplar büyükse (her biri ≳ 30) ortalamalar sağlam biçimde karşılaştırılabilir.' },
    { test: 'Permütasyon ANOVA', when: 'Ortalamaları varsayımsız karşılaştırmak istiyorsanız.' },
  ],
  'Eşleştirilmiş t-testi': [{ test: 'Wilcoxon işaretli sıra testi', when: 'Farklar belirgin çarpık ya da uç değerli ise.' }],
  'Wilcoxon işaretli sıra testi': [
    { test: 'Eşleştirilmiş t-testi', when: 'Denek sayısı büyükse (≳ 30) ortalama fark sağlam biçimde sınanabilir.' },
    { test: 'İşaret testi', when: 'Farkların dağılımı simetrik değilse.' },
  ],
  'Tekrarlı ölçümler ANOVA': [
    { test: 'Friedman testi', when: 'Kalıntılar belirgin çarpık ya da uç değerli ise.' },
    { test: 'Doğrusal karma model', when: 'Eksik ölçümler varsa ya da küresellik varsayımı bozuksa.' },
  ],
  'Friedman testi': [{ test: 'Tekrarlı ölçümler ANOVA', when: 'Kalıntılar yaklaşık normalse; daha güçlüdür.' }],
  'Pearson korelasyonu': [{ test: 'Spearman sıra korelasyonu', when: 'İlişki monoton ama doğrusal değilse ya da uç değer varsa.' }],
  'Spearman sıra korelasyonu': [
    { test: 'Pearson korelasyonu', when: 'Saçılım grafiği doğrusal ve uç değersizse.' },
    { test: 'Kendall tau', when: 'Örneklem küçükse ya da çok sayıda bağ (eşit değer) varsa.' },
  ],
  'Ki-kare homojenlik testi': [{ test: 'Fisher kesin testi', when: 'Beklenen hücre sayılarından biri 5’ten küçükse.' }],
  'Ki-kare bağımsızlık testi': [{ test: 'Fisher kesin testi', when: 'Beklenen hücre sayılarından biri 5’ten küçükse.' }],
  'Fisher kesin testi': [{ test: 'Ki-kare testi', when: 'Tüm beklenen hücre sayıları 5 ve üzerindeyse.' }],
};

export function alternativesFor(test: string): Alternative[] {
  return ALTERNATIVES[test] ?? [];
}

function checksFor(answers: WizardAnswers, a: AssumptionInput, normal: boolean, equalVar: boolean, usesVariance: boolean): ConditionCheck[] {
  const measured = a.measured !== false;
  const out: ConditionCheck[] = [];
  if (answers.goal === 'compare') {
    out.push(
      answers.design === 'unknown'
        ? { label: 'Bağımsızlık', status: 'unknown', detail: 'Doğrulanmadı; öneri bağımsızlık varsayar.' }
        : { label: answers.design === 'paired' ? 'Eşleşmiş tasarım' : 'Bağımsızlık', status: 'declared', detail: 'Kullanıcı beyanı; veriden sınanamaz.' },
    );
  }
  out.push({ label: 'Ölçek türü', status: 'declared', detail: 'Hedef değişkenin türü kullanıcı tarafından seçildi.' });
  if (answers.target === 'continuous') {
    out.push(
      measured
        ? { label: 'Normallik', status: 'verified', detail: normal ? 'Veriden ölçüldü: sapma saptanmadı.' : 'Veriden ölçüldü: varsayım reddedildi.' }
        : { label: 'Normallik', status: 'unknown', detail: 'Veri yüklenmedi; ölçülemedi.' },
    );
    if (usesVariance) {
      out.push(
        measured
          ? { label: 'Varyans eşitliği', status: 'verified', detail: equalVar ? 'Veriden ölçüldü: fark saptanmadı.' : 'Veriden ölçüldü: varyanslar farklı.' }
          : { label: 'Varyans eşitliği', status: 'unknown', detail: 'Veri yüklenmedi; ölçülemedi.' },
      );
    }
  }
  return out;
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
    out.push('Varyanslar eşit değil: post-hoc karşılaştırmalar her çift için ayrı varyans kullanan Games–Howell testiyle yapılır.');
  }
  if (checksNormality && !shapiro && a.minGroupN < 30) {
    out.push(`En küçük grupta ${a.minGroupN} gözlem var: küçük örneklemde çarpıklık ve basıklık kararsızdır; histogramı da inceleyin.`);
  }
  if (checksNormality) out.push('Ön testlerle test seçmek Tip I hata oranını etkileyebilir. Seçim kuralını raporunuzda belirtin.');
  return out;
}
