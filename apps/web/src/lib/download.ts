/** Tarayıcıda metin içeriğini dosya olarak indirir. */
export function downloadText(fileName: string, content: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([content], { type: `${type};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

/** Tek hücreli, çalıştırılabilir bir Jupyter defteri üretir. */
export function toNotebook(code: string, title: string) {
  const lines = (s: string) => s.split('\n').map((l, i, all) => (i < all.length - 1 ? `${l}\n` : l));
  return JSON.stringify(
    {
      cells: [
        { cell_type: 'markdown', metadata: {}, source: lines(`# ${title}\nStatAdvisor AI tarafından üretildi.`) },
        { cell_type: 'code', metadata: {}, execution_count: null, outputs: [], source: lines(code) },
      ],
      metadata: { kernelspec: { display_name: 'Python 3', language: 'python', name: 'python3' }, language_info: { name: 'python' } },
      nbformat: 4,
      nbformat_minor: 5,
    },
    null,
    1,
  );
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Basit, bağımsız bir HTML raporu üretir. */
export function htmlReport(title: string, summary: string, citation: string) {
  return `<!doctype html><html lang="tr"><meta charset="utf-8"><title>${escapeHtml(title)}</title><body style="font-family:Georgia,serif;max-width:42rem;margin:3rem auto;padding:0 1rem;line-height:1.7"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(summary)}</p><h2>Kaynakça</h2><p>${escapeHtml(citation)}</p></body></html>`;
}

/** HTML içeriği yeni sekmede açar. */
export function openHtml(content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/html;charset=utf-8' }));
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
