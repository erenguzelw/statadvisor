/**
 * Model karşılaştırma sonuçlarının otomatik yorumu. Her cümle sayılardan üretilir; elle yazılmış sabit yorum yoktur.
 *
 * Eşikler başparmak kurallarıdır ve metinde böyle belirtilir:
 *  - sınıf dengesi: en büyük/en küçük sınıf oranı ≤ 1,25 dengeli, ≤ 3 hafif dengesiz, üstü dengesiz
 *  - aşırı uyum: eğitim − test doğruluğu ≥ 10 puan bayrak, ≥ 5 puan işaret
 *  - modeller arası fark: Nadeau ve Bengio (2003) düzeltmeli eşleştirilmiş t testi (aynı katmanlar)
 */
import type { CvResult, ModelCv } from './ml-cv.ts';
import { corrStrength } from './ml-assoc.ts';
import { tTwoSidedP } from './tests.ts';

export type MlNoteLevel = 'info' | 'warning' | 'danger';
export interface MlNote {
  level: MlNoteLevel;
  title: string;
  text: string;
}

export type BalanceLabel = 'dengeli' | 'hafif dengesiz' | 'dengesiz';

export interface MlInterpretation {
  notes: MlNote[];
  balance: { ratio: number; label: BalanceLabel; minShare: number; maxShare: number; minClass: string; maxClass: string };
  best?: { id: string; label: string };
  /** En iyi model ile ikincisi arasındaki düzeltilmiş eşleştirilmiş t testi. */
  significance?: { a: string; b: string; meanDiff: number; t: number; p: number; k: number };
  correlations: string[];
  targetAssoc: string[];
  /** Raporun genel sonuç cümleleri. */
  summary: string[];
}

const pct = (x: number, d = 1) => `%${(x * 100).toFixed(d)}`;
const pts = (x: number, d = 1) => `${(x * 100).toFixed(d)} puan`;
const num = (x: number, d = 2) => x.toFixed(d);

export const MIN_BALANCED = 1.25;
export const MIN_MILD = 3;
export const OVERFIT_FLAG = 0.1;
export const OVERFIT_HINT = 0.05;

export function balanceOf(counts: number[], classes: string[]) {
  const n = counts.reduce((s, c) => s + c, 0);
  const max = Math.max(...counts);
  const min = Math.min(...counts);
  const ratio = max / min;
  const label: BalanceLabel = ratio <= MIN_BALANCED ? 'dengeli' : ratio <= MIN_MILD ? 'hafif dengesiz' : 'dengesiz';
  return { ratio, label, minShare: min / n, maxShare: max / n, minClass: classes[counts.indexOf(min)]!, maxClass: classes[counts.indexOf(max)]! };
}

/** Nadeau ve Bengio (2003): örtüşen eğitim kümeleri nedeniyle varyans (1/k + n_test/n_train) çarpanıyla düzeltilir. */
export function correctedPairedT(a: number[], b: number[], nTrain: number, nTest: number) {
  const k = a.length;
  const d = a.map((v, i) => v - b[i]!);
  const md = d.reduce((s, v) => s + v, 0) / k;
  const v = k > 1 ? d.reduce((s, x) => s + (x - md) ** 2, 0) / (k - 1) : 0;
  const se = Math.sqrt((1 / k + nTest / nTrain) * v);
  if (!(se > 0)) return { meanDiff: md, t: md === 0 ? 0 : Infinity, p: md === 0 ? 1 : 0, k };
  const t = md / se;
  return { meanDiff: md, t, p: tTwoSidedP(t, k - 1), k };
}

const ran = (r: CvResult) => r.models.filter((m) => !m.skipped);

function mostConfused(m: ModelCv, classes: string[]) {
  let best = { a: 0, b: 1, n: -1 };
  for (let a = 0; a < classes.length; a++) {
    for (let b = a + 1; b < classes.length; b++) {
      const n = m.confusion[a]![b]! + m.confusion[b]![a]!;
      if (n > best.n) best = { a, b, n };
    }
  }
  return { a: classes[best.a]!, b: classes[best.b]!, n: best.n };
}

export function interpretComparison(r: CvResult): MlInterpretation {
  const notes: MlNote[] = [];
  const models = ran(r);
  const real = models.filter((m) => m.id !== 'baseline');
  const balance = balanceOf(r.classCounts, r.classes);
  const K = r.classes.length;

  // 1) Sınıf dengesi
  if (balance.label === 'dengeli') {
    notes.push({
      level: 'info',
      title: 'Sınıflar dengeli',
      text: `Sınıflar dengeli dağılmış (en büyük/en küçük = ${num(balance.ratio)}; “${balance.minClass}” %${(balance.minShare * 100).toFixed(1)}, “${balance.maxClass}” %${(balance.maxShare * 100).toFixed(1)}). Bu durumda doğruluk anlamlı bir ölçüttür ve taban doğruluğu yalnızca ${pct(r.baselineAccuracy)} olduğundan, bundan yüksek her sonuç gerçek bir kazançtır. “Sınıf dengesizliği” bir sorun değildir; F1'in dengeli çıkması da dengesizlikten korunma kanıtı sayılmamalıdır (sınıflar zaten dengeli).`,
    });
  } else if (balance.label === 'hafif dengesiz') {
    notes.push({
      level: 'info',
      title: 'Sınıflar hafif dengesiz',
      text: `En büyük/en küçük sınıf oranı ${num(balance.ratio)} (“${balance.maxClass}” ${pct(balance.maxShare)}, “${balance.minClass}” ${pct(balance.minShare)}). Taban doğruluğu ${pct(r.baselineAccuracy)}; doğruluğu bununla birlikte, makro F1 ve sınıf bazında duyarlılıkla birlikte okuyun.`,
    });
  } else {
    notes.push({
      level: 'warning',
      title: 'Sınıflar dengesiz',
      text: `En büyük/en küçük sınıf oranı ${num(balance.ratio)} (“${balance.maxClass}” ${pct(balance.maxShare)}, “${balance.minClass}” ${pct(balance.minShare)}). Her gözlemi “${balance.maxClass}” diyen bir model bile ${pct(r.baselineAccuracy)} doğruluk alır; doğruluk yanıltıcıdır. Makro F1, sınıf bazında duyarlılık ve AUC'ye bakın; gerekirse sınıf ağırlıklandırma ya da örnekleme düşünün (yalnızca eğitim katlarında).`,
    });
  }

  // 2) Aşırı uyum
  // Rastgele orman tam büyütülmüş ağaçlar ve önyükleme kullandığı için eğitim doğruluğu doğası gereği ~%100'dür; fark tek başına
  // aşırı uyum kanıtı değildir (test doğruluğu ve katman SS belirleyicidir). Bu yüzden bayraktan ayrı bir bilgi notu verilir.
  const flagged = real.filter((m) => m.gap >= OVERFIT_FLAG && m.id !== 'rf').sort((a, b) => b.gap - a.gap);
  const forest = real.find((m) => m.id === 'rf' && m.gap >= OVERFIT_FLAG);
  if (flagged.length) {
    notes.push({
      level: 'warning',
      title: 'Aşırı uyum (eğitim–test farkı ≥ 10 puan)',
      text: `${flagged.map((m) => `${m.label}: eğitim ${pct(m.trainAccuracy)} → test ${pct(m.accuracy.mean)} (fark ${pts(m.gap)})`).join('; ')}. Eğitim verisinde çok yüksek, görülmemiş veride çok daha düşük doğruluk, modelin örüntüyü değil eğitim gözlemlerini ezberlediğini gösterir. Eşik (10 puan) bir başparmak kuralıdır. Çare: derinlik/yaprak sınırı gibi düzenleme, topluluk yöntemleri ya da daha basit model.`,
    });
  }
  if (forest) {
    notes.push({
      level: 'info',
      title: 'Rastgele orman: eğitim doğruluğu yanıltıcı',
      text: `${forest.label} eğitim doğruluğu ${pct(forest.trainAccuracy)}, test doğruluğu ${pct(forest.accuracy.mean)} (fark ${pts(forest.gap)}). Tam büyütülmüş ağaçlardan oluşan orman, eğitim gözlemlerini neredeyse her zaman ezbere bilir; bu fark tek başına kötü genelleme demek değildir. Genellemeyi test (çapraz doğrulama) doğruluğu ve katmanlar arası değişim (SS ${pts(forest.accuracy.sd)}) gösterir.`,
    });
  }
  const hinted = real.filter((m) => m.gap >= OVERFIT_HINT && m.gap < OVERFIT_FLAG);
  if (hinted.length) {
    notes.push({
      level: 'info',
      title: 'Hafif aşırı uyum işareti',
      text: `${hinted.map((m) => `${m.label} (fark ${pts(m.gap)})`).join(', ')}: eğitim doğruluğu test doğruluğundan 5–10 puan yüksek. Bayrak eşiğinin altında ama izlenmeli.`,
    });
  }

  // 3) En iyi model, taban ve fark anlamlılığı
  let best: ModelCv | undefined;
  let significance: MlInterpretation['significance'];
  if (real.length) {
    const sorted = [...real].sort((a, b) => b.accuracy.mean - a.accuracy.mean);
    best = sorted[0]!;
    const lift = best.accuracy.mean - r.baselineAccuracy;
    // Kıyas, raporda görünen duyarlıkta (0,1 puan) yapılır: kayan nokta artığı (0,7 − 0,65 gibi) eşiği kaydırmasın.
    const liftTenths = Math.round(lift * 1000);
    const head = `En yüksek doğruluk (${best.label}, ${pct(best.accuracy.mean)}), taban doğruluğu (${pct(r.baselineAccuracy)})`;
    if (liftTenths < 0) {
      notes.push({ level: 'warning', title: 'Taban altında', text: `${head} değerinin ${pts(-lift)} altında. Hiçbir model, her gözlem için en sık sınıfı yordayan basit kuralı geçemedi; seçilen özellikler hedefi bu modellerle öngörmüyor olabilir.` });
    } else if (liftTenths === 0) {
      notes.push({ level: 'warning', title: 'Taban aşılmıyor', text: `${head} ile aynı düzeyde (fark ${pts(lift)}, gösterilen duyarlıkta sıfır). Seçilen özellikler hedefi bu modellerle öngörmüyor olabilir.` });
    } else if (liftTenths < 50) {
      notes.push({ level: 'warning', title: 'Taban çok az aşılıyor', text: `${head} değerinin ${pts(lift)} üzerinde; bu fark 5 puanlık eşiğin altında. Bu küçük fark tek başına anlamlı bir öngörü gücü kanıtlamaz; seçilen özellikler hedefi bu modellerle belirgin biçimde öngörmüyor olabilir.` });
    } else {
      notes.push({ level: 'info', title: 'En yüksek doğruluk', text: `${best.label}: ${pct(best.accuracy.mean)} ± ${(best.accuracy.sd * 100).toFixed(1)} (taban ${pct(r.baselineAccuracy)}; kazanç ${pts(lift)}). Katmanlar arası standart sapma ${pts(best.accuracy.sd)}.` });
    }
    if (sorted.length >= 2) {
      const second = sorted[1]!;
      const nTrain = best.folds.reduce((s, f) => s + f.nTrain, 0) / best.folds.length;
      const nTest = best.folds.reduce((s, f) => s + f.nTest, 0) / best.folds.length;
      const ct = correctedPairedT(best.folds.map((f) => f.accuracy), second.folds.map((f) => f.accuracy), nTrain, nTest);
      significance = { a: best.label, b: second.label, ...ct };
      const sig = ct.p < 0.05;
      notes.push({
        level: sig ? 'info' : 'warning',
        title: sig ? 'En iyi model ikinciden ayrışıyor' : 'En iyi model ikinciden ayırt edilemiyor',
        text: `${best.label} ile ${second.label} arasındaki doğruluk farkı ${pts(ct.meanDiff)} (düzeltilmiş eşleştirilmiş t testi: t(${ct.k - 1}) = ${num(ct.t)}, p ${ct.p < 0.001 ? '< .001' : `= ${ct.p.toFixed(3).replace(/^0/, '')}`}). ${sig ? 'Fark, katmanlar arası değişimin ötesinde görünüyor.' : `Fark katmanlar arası değişim içinde kalıyor; “${best.label} kesin olarak daha iyi” demek doğru olmaz.`} ${ct.k < 5 ? `Yalnızca ${ct.k} katman olduğu için test düşük güçlüdür. ` : ''}Tek bir bölünmeden elde edilen sıralama (ör. tek %80/%20 ayrım) bu belirsizliği göstermez.`,
      });
    }
    // 4) Hangi sınıflar karışıyor
    const conf = mostConfused(best, r.classes);
    let wrong = 0;
    let adjacent = 0;
    for (let a = 0; a < K; a++) for (let b = 0; b < K; b++) if (a !== b) { wrong += best.confusion[a]![b]!; if (Math.abs(a - b) === 1) adjacent += best.confusion[a]![b]!; }
    const weakest = [...best.perClass].sort((a, b) => a.recall - b.recall)[0]!;
    const strongest = [...best.perClass].sort((a, b) => b.recall - a.recall)[0]!;
    notes.push({
      level: 'info',
      title: 'Sınıf bazında okuma',
      text: `${best.label} için en çok karışan sınıf çifti “${conf.a}” ve “${conf.b}” (${conf.n} gözlem birbirine yanlış atandı). Duyarlılık en yüksek “${strongest.cls}” (${pct(strongest.recall)}), en düşük “${weakest.cls}” (${pct(weakest.recall)}).${K > 2 && wrong > 0 ? ` Yanlışların ${pct(adjacent / wrong, 0)}'i sıra olarak komşu sınıfa gidiyor (${r.classes.join(' < ')} sıralaması varsayılırsa; sınıflar sıralıysa yüksek oran beklenir).` : ''}`,
    });
  }

  // 5) AUC
  if (best?.auc) {
    notes.push({ level: 'info', title: 'Ayırt etme gücü (AUC)', text: `${best.label} için bire-karşı-hepsi makro AUC = ${num(best.auc.mean, 3)} ± ${num(best.auc.sd, 3)} (0,5 = şans, 1 = kusursuz). Sınıf başına: ${best.perClass.map((c, i) => `${c.cls} ${num(best.aucPerClass?.[i] ?? NaN, 2)}`).join(', ')}. SVM'de AUC, olasılığa değil karar skorlarına dayanır.` });
  }

  // 6) Atlanan modeller, rastgelelik ve ayar
  for (const m of r.models.filter((x) => x.skipped)) notes.push({ level: 'warning', title: `${m.label} atlandı`, text: m.skipped! });
  if (models.some((m) => ['tree', 'rf', 'gb'].includes(m.id))) {
    notes.push({ level: 'info', title: 'Rastgelelik', text: 'Karar ağacı, rastgele orman ve gradyan artırma rastgelelik içerir: scikit-learn ile aynı katmanlarda bile doğruluk birkaç binde ayrışabilir (ölçülmüştür). Sıralamada yakın modelleri bu gürültüye karşı okuyun.' });
  }
  notes.push({ level: 'info', title: 'Hiper-parametreler ayarlanmadı', text: 'Tüm modeller scikit-learn varsayılanlarıyla çalıştı. Ayarlanmış (ör. ızgara aramalı) modeller farklı sıralanabilir; bu sonuç “en iyi algoritma” değil, “varsayılan ayarlarda karşılaştırma”dır.' });

  // İlişkiler
  const A = r.associations;
  const correlations: string[] = [];
  const shown = A.pairs.filter((p) => corrStrength(p.r) !== 'ihmal edilebilir').slice(0, 5);
  if (shown.length === 0) correlations.push('Sayısal özellikler arasında belirgin (|r| ≥ 0,1) bir doğrusal ilişki bulunamadı.');
  for (const [i, p] of shown.entries()) {
    correlations.push(`${i === 0 ? 'En güçlü ilişki: ' : ''}${p.a} ile ${p.b} arasında ${p.strength} ${p.direction} ilişki (r = ${num(p.r)}): ${p.direction === 'pozitif' ? `biri arttıkça diğeri de artıyor` : `biri arttıkça diğeri azalıyor`}.`);
  }
  const collinear = A.pairs.filter((p) => Math.abs(p.r) >= 0.8);
  if (collinear.length) correlations.push(`Dikkat: ${collinear.map((p) => `${p.a}–${p.b} (r = ${num(p.r)})`).join(', ')} çok yüksek ilişkili. Bu, lojistik regresyonun tek tek katsayılarını kararsız yapar; tahmin başarısını çoğu zaman etkilemez.`);
  const targetAssoc: string[] = [];
  for (const t of A.target.slice(0, 4)) {
    if (t.kind === 'numeric' && t.classMeans) {
      const hi = [...t.classMeans].sort((a, b) => b.mean - a.mean)[0]!;
      const lo = [...t.classMeans].sort((a, b) => a.mean - b.mean)[0]!;
      targetAssoc.push(`${t.feature}: sınıflar arası fark ${t.strength} (η² = ${num(t.effect, 3)}); ortalama en yüksek “${hi.cls}” (${num(hi.mean)}), en düşük “${lo.cls}” (${num(lo.mean)}).`);
    } else {
      targetAssoc.push(`${t.feature}: sınıflarla ilişki ${t.strength} (${t.measure} = ${num(t.effect, 3)}).`);
    }
  }

  const summary: string[] = [];
  summary.push(`${r.n.toLocaleString('tr-TR')} gözlem, ${K} sınıf (${balance.label}); tabakalı ${r.folds} katlı çapraz doğrulama; taban doğruluğu ${pct(r.baselineAccuracy)}.`);
  if (best) summary.push(`En yüksek ortalama doğruluk: ${best.label} (${pct(best.accuracy.mean)} ± ${(best.accuracy.sd * 100).toFixed(1)}).${significance && significance.p >= 0.05 ? ` İkinci model (${significance.b}) ile fark anlamlı değil.` : ''}`);
  if (flagged.length) summary.push(`Aşırı uyum bayrağı: ${flagged.map((m) => m.label).join(', ')}.`);

  return { notes, balance, ...(best ? { best: { id: best.id, label: best.label } } : {}), ...(significance ? { significance } : {}), correlations, targetAssoc, summary };
}
