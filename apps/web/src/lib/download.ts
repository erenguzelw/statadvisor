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


/** HTML içeriği yeni sekmede açar. */
export function openHtml(content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/html;charset=utf-8' }));
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** POST ile üretilen bir dosyayı (rapor) indirir ya da yeni sekmede açar; hata olursa sunucunun mesajını fırlatır. */
export async function fetchReport(url: string, body: unknown, fileName: string | null) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) {
    let message = `Rapor üretilemedi (${res.status}).`;
    try {
      message = ((await res.json()) as { error?: { message?: string } }).error?.message ?? message;
    } catch {
      /* yanıt JSON değil */
    }
    throw new Error(message);
  }
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  if (fileName === null) {
    window.open(href, '_blank', 'noopener');
  } else {
    const a = document.createElement('a');
    a.href = href;
    a.download = fileName;
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(href), 60_000);
}
