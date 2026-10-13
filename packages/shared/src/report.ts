import type { AnalysisSummary } from './types.ts';
import { effectLabel, formatP } from './stats.ts';

export type ReportMode = 'html' | 'print' | 'word';

export interface ReportInput {
  analysis: AnalysisSummary;
  apaSummary: string;
  citation: string;
  /** Rapor tarihi (görüntülenecek biçimde). */
  date: string;
}

/** Raporda yer alan bölümlerin kimlikleri; arayüzdeki içerik listesiyle aynıdır. */
export const REPORT_SECTION_IDS = ['desc', 'assump', 'result', 'apa', 'refs'] as const;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const style = `body{font-family:Georgia,'Times New Roman',serif;max-width:44rem;margin:2.5rem auto;padding:0 1.25rem;line-height:1.65;color:#111}
h1{font-size:1.6rem;margin-bottom:.25rem}h2{font-size:1.15rem;margin-top:2rem;border-bottom:1px solid #bbb;padding-bottom:.25rem}
table{border-collapse:collapse;width:100%;margin:.75rem 0;font-size:.95rem}th,td{border:1px solid #bbb;padding:.35rem .6rem;text-align:left}
th{background:#f2f2f2}td.n{text-align:right;font-variant-numeric:tabular-nums}.muted{color:#555;font-size:.9rem}
.warn{background:#fff7e0;border-left:4px solid #c98a00;padding:.5rem .8rem;margin:.4rem 0}@media print{body{margin:0}}`;

/** Analiz özetinden bağımsız, tek dosyalık bir rapor üretir. Her değer HTML'e kaçırılarak yazılır. */
export function buildReport({ analysis: a, apaSummary, citation, date }: ReportInput, mode: ReportMode): string {
  const t = a.testStatistic;
  const rows = (cells: string[][], header: string[]) =>
    `<table><thead><tr>${header.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${cells
      .map((r) => `<tr>${r.map((c, i) => `<td${i > 0 ? ' class="n"' : ''}>${esc(c)}</td>`).join('')}</tr>`)
      .join('')}</tbody></table>`;

  const desc = rows(
    a.descriptives.map((d) => [d.group, String(d.n), d.median.toFixed(2), d.mean.toFixed(2), d.sd.toFixed(2)]),
    ['Grup', 'n', 'Medyan', 'Ortalama', 'SS'],
  );
  const assump = rows(
    a.assumptions.map((x) => [x.name, x.statistic, formatP(x.p, true), x.passed ? 'Sağlandı' : 'İhlal edildi']),
    ['Test', 'İstatistik', 'p', 'Sonuç'],
  );
  const notes = a.decision.warnings.map((w) => `<p class="warn">${esc(w)}</p>`).join('');

  const body = `<h1>Hipotez testi raporu</h1>
<p class="muted">${esc(a.dataset.fileName)} · ${esc(date)} · StatAdvisor AI</p>
<section data-section="desc"><h2>Tanımlayıcı istatistikler</h2>${desc}</section>
<section data-section="assump"><h2>Varsayım testleri ve karar notları</h2>${assump}
<p>Önerilen test: <strong>${esc(a.decision.finalTest)}</strong>${a.decision.rerouteReason ? ` (${esc(a.decision.rerouteReason)})` : ''}.</p>${notes}</section>
<section data-section="result"><h2>Test sonucu</h2>
<p>${esc(`${t.name}(${t.df}) = ${t.value.toFixed(2)}, p = ${formatP(t.p, true)}, ${t.effect} = ${t.effectValue.toFixed(2)} (${effectLabel(t.effectValue)} etki), N = ${t.n}`)}</p></section>
<section data-section="apa"><h2>APA 7 stilinde özet</h2><p>${esc(apaSummary)}</p></section>
<section data-section="refs"><h2>Kaynakça</h2><p>${esc(citation)}</p></section>
<p class="muted">Bu rapor bir karar destek aracı tarafından üretilmiştir; yöntem seçiminin ve yorumun sorumluluğu araştırmacıya aittir.</p>`;

  const printScript = mode === 'print' ? `<script>addEventListener('load',function(){setTimeout(function(){print()},250)})</script>` : '';
  const htmlAttrs = mode === 'word' ? ' xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"' : '';
  return `<!doctype html><html lang="tr"${htmlAttrs}><head><meta charset="utf-8"><title>Hipotez testi raporu</title><style>${style}</style></head><body>${body}${printScript}</body></html>`;
}
