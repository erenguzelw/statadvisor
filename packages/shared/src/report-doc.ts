/**
 * Blok tabanlı genel rapor belgesi: içerik bir kez blok listesi olarak yazılır, HTML ve Word aynı bloklardan üretilir.
 * (Hipotez testi ve regresyon raporları kendi biçimlerini korur; yeni raporlar bu yapıyı kullanır.)
 */
export type DocNoteLevel = 'info' | 'warning' | 'danger';

export type DocBlock =
  | { type: 'heading'; text: string }
  | { type: 'p'; text: string; muted?: boolean }
  | { type: 'list'; items: string[] }
  | { type: 'note'; level: DocNoteLevel; title: string; text: string }
  | { type: 'table'; caption?: string; header: string[]; rows: string[][] }
  /** Ad–değer çiftleri (iki sütunlu tablo). */
  | { type: 'kv'; caption?: string; rows: [string, string][] };

export interface ReportDoc {
  title: string;
  /** Başlığın altındaki satır (veri seti · tarih · uygulama). */
  subtitle: string;
  blocks: DocBlock[];
  /** En altta italik uyarı satırı. */
  footer?: string;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const style = `body{font-family:Georgia,'Times New Roman',serif;max-width:46rem;margin:2.5rem auto;padding:0 1.25rem;line-height:1.65;color:#111}
h1{font-size:1.6rem;margin-bottom:.25rem}h2{font-size:1.15rem;margin-top:2rem;border-bottom:1px solid #bbb;padding-bottom:.25rem}
table{border-collapse:collapse;width:100%;margin:.5rem 0 .25rem;font-size:.9rem}th,td{border:1px solid #bbb;padding:.3rem .5rem;text-align:left}
th{background:#f2f2f2}td.n{text-align:right;font-variant-numeric:tabular-nums}.muted{color:#555;font-size:.9rem}
.warn{background:#fff7e0;border-left:4px solid #c98a00;padding:.5rem .8rem;margin:.4rem 0}.bad{background:#fde8e8;border-left-color:#b91c1c}.info{background:#eef3fb;border-left-color:#3b6fb5}
li{margin:.3rem 0}.cap{color:#555;font-size:.9rem;margin:.75rem 0 0}@media print{body{margin:0}table,.warn{break-inside:avoid}}`;

function table(header: string[], rows: string[][]): string {
  return `<table><thead><tr>${header.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td${i > 0 ? ' class="n"' : ''}>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

export function renderReportHtml(doc: ReportDoc): string {
  const parts = doc.blocks.map((b) => {
    switch (b.type) {
      case 'heading':
        return `<h2>${esc(b.text)}</h2>`;
      case 'p':
        return `<p${b.muted ? ' class="muted"' : ''}>${esc(b.text)}</p>`;
      case 'list':
        return `<ul>${b.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
      case 'note':
        return `<p class="warn ${b.level === 'danger' ? 'bad' : b.level === 'info' ? 'info' : ''}"><strong>${esc(b.title)}.</strong> ${esc(b.text)}</p>`;
      case 'table':
        return `${b.caption ? `<p class="cap">${esc(b.caption)}</p>` : ''}${table(b.header, b.rows)}`;
      case 'kv':
        return `${b.caption ? `<p class="cap">${esc(b.caption)}</p>` : ''}${table(['Öğe', 'Değer'], b.rows)}`;
    }
  });
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${esc(doc.title)}</title><style>${style}</style></head><body><h1>${esc(doc.title)}</h1><p class="muted">${esc(doc.subtitle)}</p>${parts.join('\n')}${doc.footer ? `<p class="muted"><em>${esc(doc.footer)}</em></p>` : ''}</body></html>`;
}
