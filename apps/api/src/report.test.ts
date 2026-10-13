import type { FastifyInstance } from 'fastify';
import JSZip from 'jszip';
import { buildApp } from './app.ts';
import { pdfAvailable } from './pdf.ts';

let app: FastifyInstance;
beforeEach(() => {
  app = buildApp({ dataDir: ':memory:' });
});
afterEach(async () => {
  await app.close();
});

async function analysis(overrides: Record<string, unknown> = {}) {
  const klinik = (await app.inject({ method: 'POST', url: '/api/samples/klinik' })).json();
  const r = await app.inject({
    method: 'POST',
    url: '/api/analyses',
    payload: { datasetId: klinik.id, goal: 'compare', design: 'independent', target: 'continuous', value: 'kan_basinci', group: 'grup', ...overrides },
  });
  expect(r.statusCode).toBe(201);
  return r.json();
}

describe('rapor biçimleri', () => {
  it('HTML: bölümler, grafik, kaynakça ve denetim izi; betik yok', async () => {
    const a = await analysis();
    const res = await app.inject({ url: `/api/analyses/${a.id}/report` });
    expect(res.headers['content-type']).toContain('text/html');
    for (const id of ['desc', 'assump', 'result', 'apa', 'refs', 'audit']) expect(res.body).toContain(`data-section="${id}"`);
    expect(res.body).toContain('<svg');
    expect(res.body).toContain('Kalıntıların histogramı');
    expect(res.body).toContain('Kruskal, W. H.');
    expect(res.body).not.toContain('<script');
    expect(res.headers['content-security-policy']).not.toContain('script-src');
    expect(res.body).not.toMatch(/p = < /);
  });

  it('aynı analiz iki kez raporlanınca denetim izi dışında aynı çıktı üretilir', async () => {
    const first = await analysis();
    const second = await analysis();
    expect(second.id).not.toBe(first.id);
    const strip = (html: string) => html.replace(/<section data-section="audit">[\s\S]*?<\/section>/, '');
    const a = (await app.inject({ url: `/api/analyses/${first.id}/report` })).body;
    const b = (await app.inject({ url: `/api/analyses/${second.id}/report` })).body;
    expect(strip(a)).toBe(strip(b));
    // aynı analiz tekrar istenirse tamamen aynıdır
    expect((await app.inject({ url: `/api/analyses/${first.id}/report` })).body).toBe(a);
  });

  it('DOCX: gerçek bir Office Open XML paketidir ve bölümleri içerir', async () => {
    const a = await analysis();
    const res = await app.inject({ url: `/api/analyses/${a.id}/report?format=docx` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(res.headers['content-disposition']).toContain('rapor.docx');
    const zip = await JSZip.loadAsync(res.rawPayload);
    expect(Object.keys(zip.files)).toEqual(expect.arrayContaining(['[Content_Types].xml', 'word/document.xml']));
    const xml = await zip.file('word/document.xml')!.async('string');
    for (const text of ['Hipotez testi raporu', 'Tanımlayıcı istatistikler', 'Kruskal-Wallis H testi', 'Denetim izi', 'Girdi karması', a.inputHash, 'Kaynakça']) {
      expect(xml).toContain(text);
    }
  });

  it('DOCX: kullanıcı metni XML olarak kaçırılır', async () => {
    const boundary = '----x';
    const csv = 'g,v\n' + Array.from({ length: 20 }, (_, i) => `${i % 2 ? 'a<b' : 'c&d'},${i + (i % 2) * 5}`).join('\n') + '\n';
    const payload = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="x.csv"\r\nContent-Type: text/csv\r\n\r\n${csv}\r\n--${boundary}--\r\n`);
    const up = (await app.inject({ method: 'POST', url: '/api/datasets', payload, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } })).json();
    const a = (await app.inject({ method: 'POST', url: '/api/analyses', payload: { datasetId: up.id, goal: 'compare', design: 'independent', target: 'continuous', value: 'v', group: 'g' } })).json();
    const zip = await JSZip.loadAsync((await app.inject({ url: `/api/analyses/${a.id}/report?format=docx` })).rawPayload);
    const xml = await zip.file('word/document.xml')!.async('string');
    expect(xml).toContain('a&lt;b');
    expect(xml).toContain('c&amp;d');
    const html = (await app.inject({ url: `/api/analyses/${a.id}/report` })).body;
    expect(html).toContain('a&lt;b');
    expect(html).not.toContain('a<b');
  });

  it('desteklenmeyen biçim ve olmayan analiz için anlaşılır hata verir', async () => {
    const a = await analysis();
    expect((await app.inject({ url: `/api/analyses/${a.id}/report?format=odt` })).statusCode).toBe(400);
    expect((await app.inject({ url: '/api/analyses/yok/report' })).statusCode).toBe(404);
  });

  it('yetenekler uç noktası PDF desteğini bildirir', async () => {
    const cap = (await app.inject({ url: '/api/capabilities' })).json();
    expect(cap).toMatchObject({ docx: true, html: true });
    expect(typeof cap.pdf).toBe('boolean');
    expect(cap.pdf).toBe(await pdfAvailable());
  });

  it('PDF: Chromium varsa gerçek bir PDF üretir; yoksa 501 ve kurulum yönergesi verir', { timeout: 60_000 }, async () => {
    const a = await analysis();
    const res = await app.inject({ url: `/api/analyses/${a.id}/report?format=pdf` });
    if (await pdfAvailable()) {
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
      expect(res.rawPayload.length).toBeGreaterThan(5_000);
    } else {
      expect(res.statusCode).toBe(501);
      expect(res.json().error.message).toContain('playwright install chromium');
    }
  });
});
