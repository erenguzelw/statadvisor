import { existsSync } from 'node:fs';

/** PDF üretimi için Chromium gerekir; yoksa kullanıcıya nasıl kurulacağı söylenir. */
export class PdfUnavailableError extends Error {
  readonly code = 'pdf_unavailable';
}

type Chromium = typeof import('playwright-core').chromium;
let cached: Promise<Chromium | null> | undefined;

async function loadChromium(): Promise<Chromium | null> {
  try {
    const { chromium } = await import('playwright-core');
    return existsSync(chromium.executablePath()) ? chromium : null;
  } catch {
    return null;
  }
}

/** Sunucu bu makinede PDF üretebilir mi? Sonuç ilk çağrıdan sonra bellekte tutulur. */
export async function pdfAvailable(): Promise<boolean> {
  cached ??= loadChromium();
  return (await cached) !== null;
}

/** HTML'i A4 PDF'e çevirir. Sayfada betik çalıştırılmaz ve ağ erişimi gerekmez. */
export async function renderPdf(html: string): Promise<Buffer> {
  cached ??= loadChromium();
  const chromium = await cached;
  if (!chromium) {
    throw new PdfUnavailableError('PDF üretimi için Chromium gerekir. Kurmak için terminalde şunu çalıştırın: npx playwright install chromium');
  }
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ javaScriptEnabled: false, offline: true });
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '18mm', bottom: '18mm', left: '16mm', right: '16mm' } });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
