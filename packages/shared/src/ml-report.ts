/**
 * Model karşılaştırma raporu (blok belgesi): sonuçlar, yorum ve uyarılar, sınıf bazında rapor, karışıklık matrisi,
 * ilişkiler, yöntem notları, kaynakça ve denetim izi.
 */
import type { CvResult, ModelCv } from './ml-cv.ts';
import type { ModelCompareSpec } from './ml-code.ts';
import { interpretComparison, type MlInterpretation } from './ml-interpret.ts';
import type { MlFeature } from './ml-prep.ts';
import { classSplitBlocks, comparisonFigures, descriptiveBlocks, normalityBlocks, outlierBlocks, purposeBlocks } from './ml-profile.ts';
import type { DocBlock, ReportDoc } from './report-doc.ts';

const pct = (x: number, d = 1) => (Number.isFinite(x) ? `%${(x * 100).toFixed(d)}` : '–');
const n3 = (x: number | undefined) => (x !== undefined && Number.isFinite(x) ? x.toFixed(3) : '–');

const REFERENCES = [
  'Pedregosa, F., Varoquaux, G., Gramfort, A., Michel, V., Thirion, B., Grisel, O., … Duchesnay, É. (2011). Scikit-learn: Machine learning in Python. Journal of Machine Learning Research, 12, 2825–2830.',
  'Kohavi, R. (1995). A study of cross-validation and bootstrap for accuracy estimation and model selection. Proceedings of the 14th International Joint Conference on Artificial Intelligence, 2, 1137–1143.',
  'Nadeau, C., & Bengio, Y. (2003). Inference for the generalization error. Machine Learning, 52(3), 239–281.',
  'Hastie, T., Tibshirani, R., & Friedman, J. (2009). The elements of statistical learning (2nd ed.). Springer.',
  'Cohen, J. (1988). Statistical power analysis for the behavioral sciences (2nd ed.). Lawrence Erlbaum Associates.',
];

export interface ModelReportOptions {
  datasetName: string;
  date: string;
  audit?: [string, string][];
  /** Modelde kullanılan özelliklerin değerleri (hedefi eksik satırlar çıkarılmış); verilirse betimleyici, aykırı değer ve normallik bölümleri eklenir. */
  features?: MlFeature[];
  /** features ile aynı sırada her gözlemin hedef sınıf adı; verilirse sınıflara göre dağılım bölümü eklenir. */
  classOf?: string[];
}

export function confusionTable(m: ModelCv, classes: string[]): { header: string[]; rows: string[][] } {
  return {
    header: ['Gerçek \\ Yordanan', ...classes, 'Toplam'],
    rows: classes.map((c, i) => [c, ...m.confusion[i]!.map(String), String(m.confusion[i]!.reduce((s, v) => s + v, 0))]),
  };
}

export function perClassTable(m: ModelCv): { header: string[]; rows: string[][] } {
  return {
    header: ['Sınıf', 'Kesinlik', 'Duyarlılık', 'F1', 'Destek', 'AUC (bire-karşı-hepsi)'],
    rows: m.perClass.map((c, i) => [c.cls, n3(c.precision), n3(c.recall), n3(c.f1), String(c.support), n3(m.aucPerClass?.[i])]),
  };
}

export function resultsTable(r: CvResult): { header: string[]; rows: string[][] } {
  return {
    header: ['Model', 'Test doğruluğu', 'Makro F1', 'AUC', 'Eğitim doğruluğu', 'Eğitim − test', 'Süre'],
    rows: r.models
      .filter((m) => !m.skipped)
      .map((m) => [m.label, `${pct(m.accuracy.mean)} ± ${(m.accuracy.sd * 100).toFixed(1)}`, `${n3(m.macroF1.mean)} ± ${n3(m.macroF1.sd)}`, m.auc ? `${n3(m.auc.mean)} ± ${n3(m.auc.sd)}` : '–', pct(m.trainAccuracy), `${(m.gap * 100).toFixed(1)} puan`, `${m.seconds.toFixed(1)} s`]),
  };
}

export function buildModelCompareDoc(r: CvResult, spec: ModelCompareSpec, opts: ModelReportOptions, interp: MlInterpretation = interpretComparison(r)): ReportDoc {
  const blocks: DocBlock[] = [];
  const best = interp.best ? r.models.find((m) => m.id === interp.best!.id) : undefined;
  blocks.push(...purposeBlocks(r, spec, opts.datasetName));
  blocks.push(
    { type: 'heading', text: 'Veri ve yöntem' },
    {
      type: 'kv',
      rows: [
        ['Hedef değişken', `${spec.target} (${r.classes.length} sınıf)`],
        ['Sınıf dağılımı', r.classes.map((c, i) => `${c}: ${r.classCounts[i]}`).join(' · ')],
        ['Gözlem sayısı', `${r.n}${r.droppedRows ? ` (hedefi eksik ${r.droppedRows} satır çıkarıldı)` : ''}`],
        ['Taban doğruluğu (çoğunluk sınıfı)', pct(r.baselineAccuracy)],
        ['Çapraz doğrulama', `tabakalı ${r.folds} katlı, tohum ${r.seed}`],
        ['Sayısal özellikler', spec.numeric.join(', ') || '–'],
        ['Kategorik özellikler', spec.categorical.join(', ') || '–'],
        ['Modelde kullanılan sütun sayısı', `${r.featureColumns.length} (kodlama sonrası)`],
      ],
    },
    { type: 'p', text: 'Eksik değer doldurma, standartlaştırma ve tek-sıcak kodlama her katmanda yalnızca eğitim satırlarına uydurulmuştur; test satırlarından eğitime bilgi sızmaz.', muted: true },
  );
  if (opts.features?.length) blocks.push(...descriptiveBlocks(r, opts.features), ...(opts.classOf ? classSplitBlocks(r, opts.features, opts.classOf) : []), ...outlierBlocks(opts.features), ...normalityBlocks(opts.features));
  blocks.push({ type: 'heading', text: 'Özet' }, { type: 'list', items: interp.summary });
  const res = resultsTable(r);
  blocks.push({ type: 'heading', text: 'Sonuçlar' }, { type: 'table', caption: 'Test katmanlarının ortalaması ± standart sapma. Eğitim doğruluğu en çok 3000 gözlemlik tohumlu bir alt örnekte hesaplanmıştır.', header: res.header, rows: res.rows }, ...comparisonFigures(r));
  blocks.push({ type: 'heading', text: 'Yorum ve uyarılar' }, ...interp.notes.map((n): DocBlock => ({ type: 'note', level: n.level, title: n.title, text: n.text })));
  if (best) {
    const pc = perClassTable(best);
    const cm = confusionTable(best, r.classes);
    blocks.push(
      { type: 'heading', text: `Sınıf bazında sonuçlar (${best.label})` },
      { type: 'table', caption: 'Tüm test katmanlarının birleşik tahminlerinden.', header: pc.header, rows: pc.rows },
      { type: 'table', caption: 'Karışıklık matrisi (satır: gerçek sınıf, sütun: yordanan sınıf).', header: cm.header, rows: cm.rows },
    );
  }
  blocks.push({ type: 'heading', text: 'Değişkenler arası ilişkiler' }, { type: 'list', items: interp.correlations });
  if (r.associations.pairs.length) {
    blocks.push({
      type: 'table',
      caption: 'En güçlü sayısal özellik çiftleri (Pearson r; büyüklük etiketleri Cohen başparmak kuralıdır).',
      header: ['Özellik A', 'Özellik B', 'r', 'Yön', 'Büyüklük'],
      rows: r.associations.pairs.slice(0, 10).map((p) => [p.a, p.b, p.r.toFixed(2), p.direction, p.strength]),
    });
  }
  if (interp.targetAssoc.length) blocks.push({ type: 'p', text: 'Hedef sınıflarla ilişki (tek tek özellikler):' }, { type: 'list', items: interp.targetAssoc });
  blocks.push(
    { type: 'heading', text: 'Modeller' },
    { type: 'list', items: r.models.filter((m) => !m.skipped).map((m) => `${m.label} (${m.family}): ${m.note} [${m.sklearn}]`) },
    { type: 'heading', text: 'Kaynakça' },
    { type: 'list', items: REFERENCES },
  );
  if (opts.audit) blocks.push({ type: 'heading', text: 'Denetim izi' }, { type: 'kv', rows: opts.audit });
  return {
    title: 'Model karşılaştırma raporu',
    subtitle: `${opts.datasetName} · ${opts.date} · StatAdvisor AI`,
    blocks,
    footer: 'Bu rapor bir karar destek aracı tarafından üretilmiştir; yöntem seçiminin ve yorumun sorumluluğu araştırmacıya aittir.',
  };
}
