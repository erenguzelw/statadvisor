/**
 * Model karşılaştırma raporunun veri bölümleri: araştırmanın amacı, betimleyici istatistikler, aykırı değer ve normallik
 * incelemeleri ile model karşılaştırma grafikleri. Hepsi blok belgesi (DocBlock) üretir; HTML ve Word aynı bloklardan çıkar.
 */
import { shapiroWilk, tukeyFences } from './assumptions.ts';
import { barsSvg, boxPlotSvg, normalityPanelSvg } from './chart-svg.ts';
import { boxStatsFor, describeGroups } from './inference.ts';
import type { ModelCompareSpec } from './ml-code.ts';
import type { CvResult } from './ml-cv.ts';
import type { MlFeature } from './ml-prep.ts';
import type { DocBlock } from './report-doc.ts';
import { descriptiveTables } from './report.ts';

const pct = (x: number, d = 1) => (Number.isFinite(x) ? `%${(x * 100).toFixed(d)}` : '–');
const n3 = (x: number) => (Number.isFinite(x) ? x.toFixed(3) : '–');
const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : '–');
const trList = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} ve ${xs[xs.length - 1]}`);

/** Bir grafikte en çok bu kadar kutu; raporda en çok bu kadar normallik paneli ve kategorik düzey. */
const BOXES_PER_FIGURE = 6;
const MAX_NORMALITY_PANELS = 12;
const MAX_LEVELS_SHOWN = 8;
const SHAPIRO_MAX = 5000;

const isMissing = (v: number | string | null | undefined) => v === null || v === undefined || v === '' || (typeof v === 'number' && !Number.isFinite(v));

function numericColumns(features: MlFeature[], min: number) {
  return features
    .filter((f) => f.kind === 'numeric')
    .map((f) => ({ name: f.name, values: f.values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v)) }))
    .filter((f) => f.values.length >= min);
}

/** Araştırmanın amacı ve soruları: raporun en başında yer alır. */
export function purposeBlocks(r: CvResult, spec: ModelCompareSpec, datasetName: string): DocBlock[] {
  const compared = r.models.filter((m) => !m.skipped && m.id !== 'baseline').map((m) => m.label);
  const nFeat = spec.numeric.length + spec.categorical.length;
  return [
    { type: 'heading', text: 'Araştırmanın amacı' },
    {
      type: 'p',
      text: `Bu çalışmanın amacı, “${datasetName}” veri setindeki ${r.n} gözlemde “${spec.target}” değişkeninin ${r.classes.length} sınıfını (${r.classes.join(', ')}) ${nFeat} özellik aracılığıyla en iyi yordayan sınıflandırma modelini belirlemektir. Bu amaçla ${trList(compared)} modelleri, aynı ${r.folds} katlı tabakalı çapraz doğrulama bölünmeleri üzerinde, çoğunluk sınıfını yordayan bir taban modelle birlikte karşılaştırılmıştır.`,
    },
    {
      type: 'list',
      items: [
        `Araştırma sorusu 1: Modeller, her gözlem için en sık sınıfı yordayan taban modelin doğruluğunun (${pct(r.baselineAccuracy)}) belirgin biçimde üzerinde bir başarı gösteriyor mu?`,
        'Araştırma sorusu 2: Test doğruluğu, makro F1 ve AUC ölçütlerine göre hangi model en iyi genelleme başarısını gösteriyor ve modeller arasındaki fark, katmanlar arası değişkenliğe göre anlamlı büyüklükte mi?',
        'Araştırma sorusu 3: Modellerde aşırı uyum (eğitim ile test doğruluğu arasındaki fark) var mı?',
        'Araştırma sorusu 4: Hangi özellikler hedef sınıflarla en güçlü ilişkiyi gösteriyor?',
      ],
    },
  ];
}

/** Sınıf dağılımı, eksik değerler, sayısal özelliklerin betimleyici istatistikleri ve kategorik özelliklerin sıklıkları. */
export function descriptiveBlocks(r: CvResult, features: MlFeature[]): DocBlock[] {
  const blocks: DocBlock[] = [{ type: 'heading', text: 'Betimleyici istatistikler' }];
  const classTitle = 'Hedef sınıf dağılımı';
  blocks.push({
    type: 'figure',
    title: classTitle,
    caption: `Hedef sınıfların gözlem sayıları (taban doğruluğu = en sık sınıfın oranı = ${pct(r.baselineAccuracy)}).`,
    svg: barsSvg(r.classes.map((c, i) => ({ label: c, value: r.classCounts[i]!, text: `${r.classCounts[i]} (${pct(r.classCounts[i]! / r.n)})` })), classTitle),
  });
  blocks.push({
    type: 'table',
    caption: 'Özelliklerde eksik değerler (modelde eksik değerler her katmanın eğitim satırlarından doldurulur).',
    header: ['Özellik', 'Tür', 'Geçerli n', 'Eksik n', 'Eksik %'],
    rows: features.map((f) => {
      const miss = f.values.filter(isMissing).length;
      return [f.name, f.kind === 'numeric' ? 'Sayısal' : 'Kategorik', String(f.values.length - miss), String(miss), pct(miss / (f.values.length || 1))];
    }),
  });
  const numeric = numericColumns(features, 1);
  if (numeric.length) {
    for (const t of descriptiveTables(describeGroups(numeric.map((f) => f.name), numeric.map((f) => f.values)))) {
      blocks.push({ type: 'table', caption: `Sayısal özellikler: ${t.title.toLocaleLowerCase('tr')}`, header: t.header.map((h, i) => (i === 0 ? 'Özellik' : h)), rows: t.rows });
    }
    blocks.push({ type: 'p', text: 'SH: ortalamanın standart hatası. Çarpıklık ve basıklık düzeltilmiş (SPSS/scipy ile aynı) tahminlerdir; normal dağılımda ikisi de 0’dır.', muted: true });
  }
  const rows: string[][] = [];
  for (const f of features.filter((x) => x.kind === 'categorical')) {
    const valid = f.values.filter((v) => !isMissing(v)).map(String);
    const counts = new Map<string, number>();
    for (const v of valid) counts.set(v, (counts.get(v) ?? 0) + 1);
    const sorted = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'tr'));
    for (const [level, c] of sorted.slice(0, MAX_LEVELS_SHOWN)) rows.push([f.name, level, String(c), pct(c / (valid.length || 1))]);
    if (sorted.length > MAX_LEVELS_SHOWN) {
      const rest = sorted.slice(MAX_LEVELS_SHOWN).reduce((s, [, c]) => s + c, 0);
      rows.push([f.name, `Diğer (${sorted.length - MAX_LEVELS_SHOWN} düzey)`, String(rest), pct(rest / (valid.length || 1))]);
    }
  }
  if (rows.length) blocks.push({ type: 'table', caption: `Kategorik özellikler: düzey sıklıkları (en sık ${MAX_LEVELS_SHOWN} düzey).`, header: ['Özellik', 'Düzey', 'n', '%'], rows });
  return blocks;
}

/** Tukey (1,5 × EAG) ölçütüyle aykırı değer incelemesi: tablo ve standartlaştırılmış kutu grafikleri. */
export function outlierBlocks(features: MlFeature[]): DocBlock[] {
  const numeric = numericColumns(features, 4);
  if (!numeric.length) return [];
  const blocks: DocBlock[] = [{ type: 'heading', text: 'Aykırı değer incelemesi' }];
  const rows = numeric.map((f) => {
    const fe = tukeyFences(f.values);
    const out = f.values.filter((v) => v < fe.lower || v > fe.upper).length;
    const far = f.values.filter((v) => v < fe.q1 - 3 * fe.iqr || v > fe.q3 + 3 * fe.iqr).length;
    return { name: f.name, n: f.values.length, fe, out, far };
  });
  blocks.push({
    type: 'table',
    caption: 'Tukey sınırlarına göre aykırı değerler (alt sınır = Q1 − 1,5·EAG, üst sınır = Q3 + 1,5·EAG; “uç” = 3·EAG dışı).',
    header: ['Özellik', 'n', 'Alt sınır', 'Üst sınır', 'Aykırı n', 'Aykırı %', 'Uç n'],
    rows: rows.map((x) => [x.name, String(x.n), f2(x.fe.lower), f2(x.fe.upper), String(x.out), pct(x.out / x.n), String(x.far)]),
  });
  // ölçekler farklı olduğundan kutular z puanlarıyla çizilir (aykırılık z dönüşümünde korunur)
  const z = numeric.map((f) => {
    const m = f.values.reduce((s, v) => s + v, 0) / f.values.length;
    const sd = Math.sqrt(f.values.reduce((s, v) => s + (v - m) ** 2, 0) / (f.values.length - 1)) || 1;
    return f.values.map((v) => (v - m) / sd);
  });
  for (let i = 0; i < numeric.length; i += BOXES_PER_FIGURE) {
    const names = numeric.slice(i, i + BOXES_PER_FIGURE).map((f) => f.name);
    const title = 'Özelliklerin kutu grafiği (standartlaştırılmış)';
    blocks.push({
      type: 'figure',
      title,
      caption: `Standartlaştırılmış (z puanı) kutu grafiği: ${names.join(', ')}. Kutu: Q1–Q3, kalın çizgi: medyan, bıyık: Tukey sınırları içindeki uç gözlemler, halka: aykırı değer (her özellik için en uzak 40 gözlem çizilir).`,
      svg: boxPlotSvg(boxStatsFor(names, z.slice(i, i + BOXES_PER_FIGURE)), title),
    });
  }
  const withOut = rows.filter((x) => x.out > 0);
  const heavy = rows.filter((x) => x.out / x.n > 0.05);
  blocks.push({
    type: 'p',
    text: withOut.length
      ? `${rows.length} sayısal özelliğin ${withOut.length} tanesinde Tukey sınırı dışında gözlem vardır${heavy.length ? ` (aykırı oranı %5’i aşanlar: ${heavy.map((x) => x.name).join(', ')})` : ''}. Aykırı değerler veriden çıkarılmamıştır; bunlar gerçek ölçümler de olabilir. Standartlaştırmaya dayanan modeller (lojistik regresyon, k-NN, SVM) aykırı değerlere duyarlıdır; ağaç tabanlı modeller (karar ağacı, rastgele orman, gradyan artırma) bölünme eşiklerine dayandığı için daha dayanıklıdır.`
      : 'Hiçbir sayısal özellikte Tukey sınırı dışında gözlem bulunmamıştır.',
  });
  return blocks;
}

/** Normallik incelemesi: Shapiro-Wilk, çarpıklık/basıklık, histogram ve normal Q-Q grafiği. */
export function normalityBlocks(features: MlFeature[]): DocBlock[] {
  const numeric = numericColumns(features, 5);
  if (!numeric.length) return [];
  const blocks: DocBlock[] = [{ type: 'heading', text: 'Normallik incelemesi' }];
  const stats = describeGroups(numeric.map((f) => f.name), numeric.map((f) => f.values));
  let sampled = false;
  const rows = numeric.map((f, i) => {
    let v = f.values;
    if (v.length > SHAPIRO_MAX) {
      sampled = true;
      const stride = v.length / SHAPIRO_MAX;
      v = Array.from({ length: SHAPIRO_MAX }, (_, k) => f.values[Math.floor(k * stride)]!);
    }
    const s = stats[i]!;
    let w = '–';
    let p = '–';
    let verdict = 'Hesaplanamadı';
    if (s.sd > 0) {
      const sw = shapiroWilk(v);
      w = sw.W.toFixed(3);
      p = sw.p < 0.001 ? '< .001' : sw.p.toFixed(3).replace(/^0/, '');
      verdict = sw.p >= 0.05 ? 'Normal dağılıma uygun' : 'Normalden sapıyor';
    }
    return [f.name, String(f.values.length), w, p, f2(s.skewness), f2(s.kurtosis), verdict];
  });
  blocks.push({
    type: 'table',
    caption: `Shapiro-Wilk normallik testi (H0: değişken normal dağılır; α = .05).${sampled ? ` n > ${SHAPIRO_MAX} olan özelliklerde test, sabit aralıkla seçilmiş ${SHAPIRO_MAX} gözlemde yapılmıştır.` : ''}`,
    header: ['Özellik', 'n', 'W', 'p', 'Çarpıklık', 'Basıklık', 'Sonuç'],
    rows,
  });
  const shown = numeric.slice(0, MAX_NORMALITY_PANELS);
  for (const f of shown) {
    const svg = normalityPanelSvg(f.values, f.name);
    if (svg) blocks.push({ type: 'figure', title: `${f.name}: histogram ve normal Q-Q grafiği`, caption: `${f.name} (n = ${f.values.length}). Sol: histogram ve aynı ortalama/SS’li kuramsal normal eğri (kesikli); sağ: normal Q-Q grafiği — noktalar kesikli doğruya yakınsa dağılım normale yakındır.`, svg });
  }
  if (numeric.length > shown.length) blocks.push({ type: 'p', text: `Rapor uzamasın diye ilk ${shown.length} özelliğin grafiği gösterilmiştir; tüm özelliklerin Shapiro-Wilk sonuçları yukarıdaki tablodadır.`, muted: true });
  const bad = rows.filter((x) => x[6] === 'Normalden sapıyor').length;
  blocks.push({
    type: 'p',
    text: `${rows.length} özelliğin ${bad} tanesinde Shapiro-Wilk testi normallikten sapma göstermiştir. Büyük örneklemlerde test küçük sapmalara bile duyarlı olduğundan karar yalnızca p değerine değil, Q-Q grafiğine ve çarpıklık/basıklık değerlerine birlikte bakılarak verilmelidir. Sınıflandırma modelleri normallik varsayımı gerektirmez; yine de lojistik regresyon, k-NN ve SVM gibi uzaklık/doğrusal modeller çok çarpık özelliklerde daha az kararlı çalışabilir.`,
  });
  return blocks;
}

/** Modellerin test doğruluğu ve makro F1 çubuk grafikleri (± katmanlar arası SS), doğrulukta taban çizgisiyle. */
export function comparisonFigures(r: CvResult): DocBlock[] {
  const used = r.models.filter((m) => !m.skipped);
  if (!used.length) return [];
  const accTitle = 'Modellerin test doğruluğu';
  const f1Title = 'Modellerin makro F1 değeri';
  return [
    { type: 'figure', title: accTitle, caption: `Test doğruluğu (katmanların ortalaması ± SS; kesikli çizgi: taban doğruluğu ${pct(r.baselineAccuracy)}).`, svg: barsSvg(used.map((m) => ({ label: m.label, value: m.accuracy.mean, err: m.accuracy.sd, text: pct(m.accuracy.mean) })), accTitle, { max: 1, baseline: { value: r.baselineAccuracy, label: 'taban' } }) },
    { type: 'figure', title: f1Title, caption: 'Makro F1 (katmanların ortalaması ± SS); sınıflar eşit ağırlıklıdır, dengesiz sınıflarda doğruluktan daha dürüst bir ölçüdür.', svg: barsSvg(used.map((m) => ({ label: m.label, value: m.macroF1.mean, err: m.macroF1.sd, text: n3(m.macroF1.mean) })), f1Title, { max: 1 }) },
  ];
}

const MAX_CLASS_FIGURES = 8;

/** Sayısal özelliklerin hedef sınıflara göre dağılımı: sınıf başına kutu grafiği ve ortalama/SS tablosu (özellik sınıfları ayırıyor mu?). */
export function classSplitBlocks(r: CvResult, features: MlFeature[], classOf: string[]): DocBlock[] {
  const cols = features.filter((f) => f.kind === 'numeric');
  if (!cols.length || classOf.length !== (cols[0]?.values.length ?? -1)) return [];
  const blocks: DocBlock[] = [{ type: 'heading', text: 'Özelliklerin hedef sınıflara göre dağılımı' }];
  const rows: string[][] = [];
  let shown = 0;
  for (const f of cols) {
    const groups = r.classes.map((c) => f.values.flatMap((v, i) => (classOf[i] === c && typeof v === 'number' && Number.isFinite(v) ? [v] : [])));
    const keep = groups.map((g, i) => ({ g, name: r.classes[i]! })).filter((x) => x.g.length >= 2);
    if (keep.length < 2) continue;
    const d = describeGroups(keep.map((x) => x.name), keep.map((x) => x.g));
    for (const x of d) rows.push([f.name, x.group, String(x.n), f2(x.mean), f2(x.sd), f2(x.median)]);
    if (shown < MAX_CLASS_FIGURES) {
      shown++;
      const title = `${f.name}: sınıflara göre kutu grafiği`;
      blocks.push({ type: 'figure', title, caption: `${f.name} değerlerinin hedef sınıflara göre dağılımı. Kutuların birbirinden ayrışması özelliğin sınıfları ayırt etmeye yardım ettiğini, büyük örtüşme ise sınırlı bilgi taşıdığını gösterir.`, svg: boxPlotSvg(boxStatsFor(keep.map((x) => x.name), keep.map((x) => x.g)), title) });
    }
  }
  if (!rows.length) return [];
  blocks.push({ type: 'table', caption: 'Sınıf başına ortalama, standart sapma ve medyan.', header: ['Özellik', 'Sınıf', 'n', 'Ortalama', 'SS', 'Medyan'], rows });
  return blocks;
}
