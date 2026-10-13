import type { AnalysisResult } from './analysis.ts';
import { formatP, pText } from './stats.ts';
import type { AssumptionTest, DecisionPath, GroupDescriptive } from './types.ts';

export type ReportMode = 'html' | 'print' | 'word';

/** Rapora yazılan düz veri; hem gerçek analiz sonuçlarından hem örnek özetten üretilebilir. */
export interface ReportData {
  title: string;
  datasetName: string;
  /** Rapor tarihi (görüntülenecek biçimde). */
  date: string;
  descriptives: GroupDescriptive[];
  assumptions: AssumptionTest[];
  decision: DecisionPath;
  /** Sonuç satırı, ör. "H(2) = 11.70, p = .003, ε² = 0.27 (geniş etki), N = 45". */
  resultLine: string;
  apaSummary: string;
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
    assumptions: r.assumptions,
    decision: r.decision,
    resultLine: `${o.statisticText}, ${pText(o.p)}, ${o.effect.symbol} = ${o.effect.value.toFixed(2)} (${o.effect.magnitude} etki), N = ${o.n}`,
    apaSummary: r.apaSummary,
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
.warn{background:#fff7e0;border-left:4px solid #c98a00;padding:.5rem .8rem;margin:.4rem 0}li{margin:.3rem 0}@media print{body{margin:0}}`;

const table = (header: string[], cells: string[][]) =>
  `<table><thead><tr>${header.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${cells
    .map((r) => `<tr>${r.map((c, i) => `<td${i > 0 ? ' class="n"' : ''}>${esc(c)}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>`;

/** Tek dosyalık rapor üretir. Her değer HTML'e kaçırılarak yazılır. */
export function buildReport(d: ReportData, mode: ReportMode): string {
  const desc = table(['Grup', 'n', 'Medyan', 'Ortalama', 'SS'], d.descriptives.map((x) => [x.group, String(x.n), x.median.toFixed(2), x.mean.toFixed(2), Number.isFinite(x.sd) ? x.sd.toFixed(2) : '–']));
  const assump = d.assumptions.length
    ? table(['Test', 'Uygulandığı veri', 'İstatistik', 'p', 'Sonuç'], d.assumptions.map((x) => [x.name, x.subject, x.statistic, formatP(x.p, true), x.passed ? 'Sağlandı' : 'İhlal edildi']))
    : '<p class="muted">Bu test türü için ayrı bir varsayım testi uygulanmadı.</p>';
  const warnings = d.decision.warnings.map((w) => `<p class="warn">${esc(w)}</p>`).join('');
  const notes = d.notes.length ? `<ul>${d.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : '';
  const audit = d.audit ? `<section data-section="audit"><h2>Denetim izi</h2>${table(['Öğe', 'Değer'], d.audit)}</section>` : '';

  const body = `<h1>${esc(d.title)}</h1>
<p class="muted">${esc(d.datasetName)} · ${esc(d.date)} · StatAdvisor AI</p>
<section data-section="desc"><h2>Tanımlayıcı istatistikler</h2>${desc}${notes}</section>
<section data-section="assump"><h2>Varsayım testleri ve karar notları</h2>${assump}
<p>Önerilen test: <strong>${esc(d.decision.finalTest)}</strong>${d.decision.rerouteReason ? ` (${esc(d.decision.rerouteReason)})` : ''}.</p>${warnings}</section>
<section data-section="result"><h2>Test sonucu</h2><p>${esc(d.resultLine)}</p></section>
<section data-section="apa"><h2>APA 7 stilinde özet</h2><p>${esc(d.apaSummary)}</p></section>
<section data-section="refs"><h2>Kaynakça</h2>${d.references.length ? `<ul>${d.references.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : '<p class="muted">Kaynak yok.</p>'}</section>
${audit}
<p class="muted">Bu rapor bir karar destek aracı tarafından üretilmiştir; yöntem seçiminin ve yorumun sorumluluğu araştırmacıya aittir.</p>`;

  const printScript = mode === 'print' ? `<script>addEventListener('load',function(){setTimeout(function(){print()},250)})</script>` : '';
  const htmlAttrs = mode === 'word' ? ' xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"' : '';
  return `<!doctype html><html lang="tr"${htmlAttrs}><head><meta charset="utf-8"><title>${esc(d.title)}</title><style>${style}</style></head><body>${body}${printScript}</body></html>`;
}
