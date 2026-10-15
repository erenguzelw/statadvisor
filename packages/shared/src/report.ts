import type { AnalysisResult } from './analysis.ts';
import type { PostHocResult } from './inference.ts';
import { boxPlotSvg, crosstabSvg, histogramSvg, scatterSvg } from './chart-svg.ts';
import { formatP, pText } from './stats.ts';
import type { AssumptionTest, BoxStats, DecisionPath, DistributionSample, GroupDescriptive, ScatterSample } from './types.ts';

/** Rapora yazılan düz veri; hem gerçek analiz sonuçlarından hem örnek özetten üretilebilir. */
export interface ReportData {
  title: string;
  datasetName: string;
  /** Rapor tarihi (görüntülenecek biçimde). */
  date: string;
  descriptives: GroupDescriptive[];
  /** Grup/koşul başına kutu grafiği özeti; verilirse tanımlayıcı istatistiklerin altına grafik eklenir. */
  boxes?: BoxStats[];
  /** İlişki analizlerinde saçılım grafiği için örnek noktalar. */
  scatter?: ScatterSample;
  /** Kategorik analizlerde çapraz tablo; verilirse tablo ve yığılmış çubuk grafiği eklenir. */
  table?: { rowNames: string[]; colNames: string[]; table: number[][] };
  /** Sayısal hedeflerde grup içi kalıntıların dağılımı (rapora grafik olarak eklenir). */
  distribution?: DistributionSample;
  assumptions: AssumptionTest[];
  decision: DecisionPath;
  /** Sonuç satırı, ör. "H(2) = 11.70, p = .003, ε² = 0.27 (geniş etki), N = 45". */
  resultLine: string;
  apaSummary: string;
  /** Post-hoc karşılaştırmalar (varsa): ikili tablo ve anlamlılık harfleri. */
  postHoc?: PostHocResult;
  references: string[];
  /** Veri hazırlama ve yöntem notları. */
  notes: string[];
  /** Denetim izi satırları (etiket, değer); verilirse "audit" bölümü eklenir. */
  audit?: [string, string][];
}

/** Raporda yer alan bölümlerin kimlikleri (denetim izi isteğe bağlı olarak eklenir). */
export const REPORT_SECTION_IDS = ['desc', 'assump', 'result', 'apa', 'refs'] as const;

export function reportFromResult(r: AnalysisResult, date: string, audit?: [string, string][]): ReportData {
  const o = r.outcome;
  return {
    title: 'Hipotez testi raporu',
    datasetName: r.datasetName,
    date,
    descriptives: r.descriptives,
    boxes: r.boxes,
    scatter: r.scatter,
    table: r.table,
    distribution: r.distribution,
    assumptions: r.assumptions,
    decision: r.decision,
    resultLine: `${o.statisticText}, ${pText(o.p)}, ${o.effect.symbol} = ${o.effect.value.toFixed(2)} (${o.effect.magnitude} etki), N = ${o.n}`,
    apaSummary: r.apaSummary,
    postHoc: o.postHoc,
    references: r.references,
    notes: r.notes,
    audit,
  };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const style = `body{font-family:Georgia,'Times New Roman',serif;max-width:44rem;margin:2.5rem auto;padding:0 1.25rem;line-height:1.65;color:#111}
h1{font-size:1.6rem;margin-bottom:.25rem}h2{font-size:1.15rem;margin-top:2rem;border-bottom:1px solid #bbb;padding-bottom:.25rem}
table{border-collapse:collapse;width:100%;margin:.75rem 0;font-size:.95rem}th,td{border:1px solid #bbb;padding:.35rem .6rem;text-align:left}
th{background:#f2f2f2}td.n{text-align:right;font-variant-numeric:tabular-nums}.muted{color:#555;font-size:.9rem}
.warn{background:#fff7e0;border-left:4px solid #c98a00;padding:.5rem .8rem;margin:.4rem 0}li{margin:.3rem 0}figure{margin:1rem 0}svg{max-width:100%}@media print{body{margin:0}section{break-inside:avoid}}`;

const table = (header: string[], cells: string[][]) =>
  `<table><thead><tr>${header.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${cells
    .map((r) => `<tr>${r.map((c, i) => `<td${i > 0 ? ' class="n"' : ''}>${esc(c)}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>`;

/** Tanımlayıcı istatistikler iki tablo olarak yazılır (tek tablo A4'e sığmaz): konum/yayılım ve ortalama/şekil. */
export function descriptiveTables(descriptives: GroupDescriptive[]): { title: string; header: string[]; rows: string[][] }[] {
  const f2 = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : '–');
  if (!descriptives.length) return [];
  return [
    { title: 'Konum ve yayılım', header: ['Grup', 'n', 'Min', 'Q1', 'Medyan', 'Q3', 'Maks'], rows: descriptives.map((x) => [x.group, String(x.n), f2(x.min), f2(x.q1), f2(x.median), f2(x.q3), f2(x.max)]) },
    { title: 'Ortalama ve dağılım şekli', header: ['Grup', 'Ortalama', 'SS', 'SH', 'Çarpıklık', 'Basıklık'], rows: descriptives.map((x) => [x.group, f2(x.mean), f2(x.sd), f2(x.se), f2(x.skewness), f2(x.kurtosis)]) },
  ];
}

/** Çapraz tablo: satır başına gözlenen sayılar ve satır yüzdeleri, son sütunda toplam. */
export function crosstabRows(t: { rowNames: string[]; colNames: string[]; table: number[][] }): { header: string[]; rows: string[][] } {
  return {
    header: ['', ...t.colNames, 'Toplam'],
    rows: t.rowNames.map((name, r) => {
      const counts = t.table[r] ?? [];
      const total = counts.reduce((s, v) => s + v, 0);
      return [name, ...counts.map((v) => `${v} (%${total ? Math.round((v / total) * 100) : 0})`), String(total)];
    }),
  };
}

/** Post-hoc tabloları: ikili karşılaştırmalar ve anlamlılık harfleri (HTML ve DOCX aynı satırları kullanır). */
export function postHocTables(ph: PostHocResult): { title: string; header: string[]; rows: string[][] }[] {
  const f2 = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : '–');
  const sig = (b: boolean) => (b ? 'Anlamlı' : 'Anlamlı değil');
  const range = ph.pairs.some((x) => x.diff !== undefined);
  const pairs = range
    ? {
        title: `İkili karşılaştırmalar: ${ph.method} (p değerleri aile bazında düzeltilmiştir; %95 eşzamanlı güven aralığı)`,
        header: ['Çift', 'Fark', '%95 GA', 'p', 'Hedges g', 'Sonuç'],
        rows: ph.pairs.map((x) => [`${x.a} – ${x.b}`, f2(x.diff!), `[${f2(x.ciLow!)}, ${f2(x.ciHigh!)}]`, formatP(x.pAdj, true), f2(x.hedgesG!), sig(x.significant)]),
      }
    : {
        title: `İkili karşılaştırmalar: ${ph.method}`,
        header: ['Çift', 'Ham p', 'Düzeltilmiş p', 'Sonuç'],
        rows: ph.pairs.map((x) => [`${x.a} – ${x.b}`, formatP(x.p, true), formatP(x.pAdj, true), sig(x.significant)]),
      };
  const letters = {
    title: `Anlamlılık harfleri (aynı harfi paylaşan gruplar arasındaki fark anlamlı değildir; ${ph.centerLabel.toLocaleLowerCase('tr')} büyükten küçüğe)`,
    header: ['Grup', ph.centerLabel, 'Harf'],
    rows: ph.letters.map((l) => [l.group, f2(l.center), l.letters]),
  };
  return [pairs, letters];
}

/** Rapordaki bir grafik: HTML ve DOCX aynı SVG'yi kullanır. */
export interface ReportFigure {
  id: 'box' | 'scatter' | 'crosstab' | 'histogram';
  /** Grafiğin yer aldığı bölüm. */
  section: 'desc' | 'assump';
  caption: string;
  title: string;
  svg: string;
}

/** Rapora giren tüm grafikler (veri türüne göre bazıları yoktur). */
export function reportFigures(d: ReportData): ReportFigure[] {
  const out: ReportFigure[] = [];
  const add = (f: ReportFigure) => {
    if (f.svg) out.push(f);
  };
  if (d.boxes?.length) {
    const title = 'Gruplara göre kutu grafiği';
    add({ id: 'box', section: 'desc', title, caption: 'Grup başına kutu grafiği (kutu: Q1–Q3, kalın çizgi: medyan, bıyık: Tukey sınırları içindeki uç gözlemler, halka: sınır dışı gözlem)', svg: boxPlotSvg(d.boxes, title) });
  }
  if (d.scatter) {
    const s = d.scatter;
    const title = `${s.xName} ile ${s.yName} saçılım grafiği`;
    const shown = s.points.length < s.n ? `${s.n} gözlemden ${s.points.length} nokta gösteriliyor; ` : '';
    add({ id: 'scatter', section: 'desc', title, caption: `Saçılım grafiği (${shown}turuncu çizgi: tüm gözlemlerden hesaplanan en küçük kareler doğrusu, y = ${s.intercept.toFixed(2)} ${s.slope < 0 ? '−' : '+'} ${Math.abs(s.slope).toFixed(2)}x)`, svg: scatterSvg(s, title) });
  }
  if (d.table) {
    const title = 'Çapraz tablonun satır yüzdeleri';
    add({ id: 'crosstab', section: 'desc', title, caption: 'Satır içi dağılım (her satır %100)', svg: crosstabSvg(d.table, title) });
  }
  if (d.distribution) {
    const title = 'Kalıntıların histogramı ve kuramsal normal eğri';
    add({ id: 'histogram', section: 'assump', title, caption: `Kalıntıların histogramı ve kuramsal normal eğri (n = ${d.distribution.n}, çarpıklık = ${d.distribution.skewness})`, svg: histogramSvg(d.distribution, title) });
  }
  return out;
}

/** Tek dosyalık rapor üretir. Her değer HTML'e kaçırılarak yazılır. */
export function buildReport(d: ReportData): string {
  const desc = descriptiveTables(d.descriptives)
    .map((t) => `<p class="muted">${esc(t.title)}</p>${table(t.header, t.rows)}`)
    .join('');
  const figures = reportFigures(d);
  const figure = (id: ReportFigure['id']) => {
    const f = figures.find((x) => x.id === id);
    return f ? `<figure><figcaption class="muted">${esc(f.caption)}</figcaption>${f.svg}</figure>` : '';
  };
  let crosstab = '';
  if (d.table) {
    const ct = crosstabRows(d.table);
    crosstab = `<p class="muted">Çapraz tablo (gözlenen sayı ve satır yüzdesi)</p>${table(ct.header, ct.rows)}`;
  }
  const assump = d.assumptions.length
    ? table(['Test', 'Uygulandığı veri', 'İstatistik', 'p', 'Sonuç'], d.assumptions.map((x) => [x.name, x.subject, x.statistic, x.shape ? `sınır ±${x.shape.limit}` : formatP(x.p, true), x.passed ? 'Sağlandı' : 'İhlal edildi']))
    : '<p class="muted">Bu test türü için ayrı bir varsayım testi uygulanmadı.</p>';
  const warnings = d.decision.warnings.map((w) => `<p class="warn">${esc(w)}</p>`).join('');
  const alts = d.decision.alternatives?.length ? `<p>Alternatif yöntemler:</p><ul>${d.decision.alternatives.map((a) => `<li><strong>${esc(a.test)}</strong>: ${esc(a.when)}</li>`).join('')}</ul>` : '';
  const notes = d.notes.length ? `<ul>${d.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : '';
  const postHoc = d.postHoc
    ? postHocTables(d.postHoc)
        .map((t) => `<p class="muted">${esc(t.title)}</p>${table(t.header, t.rows)}`)
        .join('')
    : '';
  const audit = d.audit ? `<section data-section="audit"><h2>Denetim izi</h2>${table(['Öğe', 'Değer'], d.audit)}</section>` : '';

  const body = `<h1>${esc(d.title)}</h1>
<p class="muted">${esc(d.datasetName)} · ${esc(d.date)} · StatAdvisor AI</p>
<section data-section="desc"><h2>Tanımlayıcı istatistikler</h2>${desc}${figure('box')}${figure('scatter')}${crosstab}${figure('crosstab')}${notes}</section>
<section data-section="assump"><h2>Varsayım testleri ve karar notları</h2>${assump}${figure('histogram')}
<p>Önerilen test: <strong>${esc(d.decision.finalTest)}</strong>${d.decision.rerouteReason ? ` (${esc(d.decision.rerouteReason)})` : ''}.</p>${warnings}${alts}</section>
<section data-section="result"><h2>Test sonucu</h2><p>${esc(d.resultLine)}</p>${postHoc}</section>
<section data-section="apa"><h2>APA 7 stilinde özet</h2><p>${esc(d.apaSummary)}</p></section>
<section data-section="refs"><h2>Kaynakça</h2>${d.references.length ? `<ul>${d.references.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : '<p class="muted">Kaynak yok.</p>'}</section>
${audit}
<p class="muted">Bu rapor bir karar destek aracı tarafından üretilmiştir; yöntem seçiminin ve yorumun sorumluluğu araştırmacıya aittir.</p>`;

  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${esc(d.title)}</title><style>${style}</style></head><body>${body}</body></html>`;
}
