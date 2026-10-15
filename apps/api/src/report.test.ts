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
  it('post-hoc: ikili karşılaştırma tablosu ve anlamlılık harfleri HTML ve Word raporunda yer alır', async () => {
    let found: { id: string; result: { outcome: { postHoc?: { method: string; letters: { letters: string }[] } } } } | undefined;
    for (const value of ['kan_basinci', 'biyobelirtec_x', 'yas']) {
      const a = await analysis({ value });
      if (a.result.outcome.postHoc) {
        found = a;
        break;
      }
    }
    expect(found, 'klinik örnekte post-hoc üreten bir analiz bulunmalı').toBeDefined();
    const ph = found!.result.outcome.postHoc!;
    const html = (await app.inject({ url: `/api/analyses/${found!.id}/report` })).body;
    expect(html).toContain('Anlamlılık harfleri');
    expect(html).toContain(ph.method);
    // Tukey / Games–Howell'de fark ve güven aralığı, Holm düzeltmeli yöntemlerde ham ve düzeltilmiş p
    expect(html).toContain(/^(Tukey|Games)/.test(ph.method) ? '%95 GA' : 'Düzeltilmiş p');
    const zip = await JSZip.loadAsync((await app.inject({ url: `/api/analyses/${found!.id}/report?format=docx` })).rawPayload);
    const xml = await zip.file('word/document.xml')!.async('string');
    expect(xml).toContain('Anlamlılık harfleri');
    expect(xml).toContain(ph.letters[0]!.letters);
  });

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

  it('HTML: özet istatistik tabloları ve grup kutu grafiği', async () => {
    const a = await analysis();
    const html = (await app.inject({ url: `/api/analyses/${a.id}/report` })).body;
    for (const text of ['Konum ve yayılım', 'Ortalama ve dağılım şekli', 'Min', 'Q1', 'Q3', 'Maks', 'SH', 'Gruplara göre kutu grafiği']) expect(html).toContain(text);
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('undefined');
  });

  it('HTML ve DOCX: kategorik analizde çapraz tablo ve satır yüzdeleri; grafik yalnızca HTML\'de', async () => {
    const rows = ['grup,sonuc', ...Array.from({ length: 60 }, (_, i) => `${i % 2 ? 'a' : 'b'},${i % 3 === 0 ? 'evet' : 'hayır'}`)].join('\n');
    const boundary = '----ct';
    const payload = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="k.csv"\r\nContent-Type: text/csv\r\n\r\n${rows}\r\n--${boundary}--\r\n`);
    const up = (await app.inject({ method: 'POST', url: '/api/datasets', payload, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } })).json();
    const a = (await app.inject({ method: 'POST', url: '/api/analyses', payload: { datasetId: up.id, goal: 'compare', design: 'independent', target: 'categorical', group: 'grup', value: 'sonuc' } })).json();
    const html = (await app.inject({ url: `/api/analyses/${a.id}/report` })).body;
    expect(html).toContain('Çapraz tablo');
    expect(html).toContain('Satır içi dağılım');
    expect(html).toContain('Toplam');
    expect(html).toMatch(/\d+ \(%\d+\)/);
    const zip = await JSZip.loadAsync((await app.inject({ url: `/api/analyses/${a.id}/report?format=docx` })).rawPayload);
    const xml = await zip.file('word/document.xml')!.async('string');
    expect(xml).toContain('Çapraz tablo');
    expect(xml).toContain('Toplam');
  });

  it('HTML: korelasyon raporunda saçılım grafiği, en çok 500 nokta ve regresyon doğrusu', async () => {
    const a = await analysis({ goal: 'relate', group: undefined, value: undefined, x: 'yas', y: 'kan_basinci' });
    expect(a.result.scatter.n).toBe(1420);
    expect(a.result.scatter.points.length).toBeLessThanOrEqual(500);
    const html = (await app.inject({ url: `/api/analyses/${a.id}/report` })).body;
    expect(html).toContain('Saçılım grafiği');
    expect(html).toContain('yas ile kan_basinci saçılım grafiği');
    expect(html).toMatch(/1420 gözlemden \d+ nokta gösteriliyor/);
    expect(html).toMatch(/y = -?\d+\.\d\d [+−] \d+\.\d\dx/);
    expect((html.match(/<circle/g) ?? []).length).toBe(a.result.scatter.points.length);
    expect(html).not.toContain('NaN');
    // grup karşılaştırmasında saçılım grafiği yoktur
    const g = await analysis();
    expect((await app.inject({ url: `/api/analyses/${g.id}/report` })).body).not.toContain('Saçılım grafiği');
  });

  it('DOCX: grafikler gerçek PNG olarak gömülür (kutu + histogram, saçılım, çapraz tablo)', async () => {
    const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const images = async (id: string) => {
      const zip = await JSZip.loadAsync((await app.inject({ url: `/api/analyses/${id}/report?format=docx` })).rawPayload);
      const names = Object.keys(zip.files).filter((n) => n.startsWith('word/media/') && !zip.files[n]!.dir);
      const heads = await Promise.all(names.map(async (n) => (await zip.file(n)!.async('nodebuffer')).subarray(0, 8)));
      return { names, heads, xml: await zip.file('word/document.xml')!.async('string') };
    };
    const group = await images((await analysis()).id);
    expect(group.names).toHaveLength(2);
    for (const h of group.heads) expect(h.equals(PNG)).toBe(true);
    expect(group.xml).toContain('Gruplara göre kutu grafiği');
    expect(group.xml).toContain('Kalıntıların histogramı');
    const rel = await images((await analysis({ goal: 'relate', group: undefined, value: undefined, x: 'yas', y: 'kan_basinci' })).id);
    expect(rel.names).toHaveLength(1);
    expect(rel.xml).toContain('yas ile kan_basinci saçılım grafiği');
  });

  it('DOCX: özet istatistik tabloları', async () => {
    const a = await analysis();
    const zip = await JSZip.loadAsync((await app.inject({ url: `/api/analyses/${a.id}/report?format=docx` })).rawPayload);
    const xml = await zip.file('word/document.xml')!.async('string');
    for (const text of ['Konum ve yayılım', 'Ortalama ve dağılım şekli', 'Maks']) expect(xml).toContain(text);
  });

  it('denetim izi: kurallar, satır kaybı, kullanıcı gerekçesi ve önceki işlemler rapora yazılır', async () => {
    const lines = ['g,v'];
    for (let i = 0; i < 100; i++) lines.push(`${i < 50 ? 'A' : 'B'},${i === 3 ? '' : i >= 80 && i < 92 ? 500 : (10 + (i % 5) * 0.7).toFixed(1)}`);
    const boundary = '----r';
    const payload = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="r.csv"\r\nContent-Type: text/csv\r\n\r\n${lines.join('\n')}\n\r\n--${boundary}--\r\n`);
    const raw = (await app.inject({ method: 'POST', url: '/api/datasets', payload, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } })).json();
    const first = (await app.inject({ method: 'POST', url: `/api/datasets/${raw.id}/clean`, payload: { rules: [{ column: 'v', issue: 'extreme', action: 'removeRow' }], acknowledgement: { reason: 'Veri girişi hatası olduğu doğrulandı.' } } })).json();
    expect(first.rows).toBe(88);
    const second = (await app.inject({ method: 'POST', url: `/api/datasets/${first.id}/clean`, payload: { impute: 'median' } })).json();
    expect(second.id).not.toBe(first.id);
    const a = (await app.inject({ method: 'POST', url: '/api/analyses', payload: { datasetId: second.id, goal: 'compare', design: 'independent', target: 'continuous', value: 'v', group: 'g' } })).json();
    const html = (await app.inject({ url: `/api/analyses/${a.id}/report` })).body;
    for (const text of ['Önceki işlem', 'Temizlik işlemi', 'Tukey sınırları', 'medyan']) expect(html).toContain(text);
    const firstReport = (await app.inject({ url: `/api/analyses/${(await (await app.inject({ method: 'POST', url: '/api/analyses', payload: { datasetId: first.id, goal: 'compare', design: 'independent', target: 'continuous', value: 'v', group: 'g' } })).json()).id}/report` })).body;
    expect(firstReport).toContain('Satır kaybı');
    expect(firstReport).toContain('%12.0');
    expect(firstReport).toContain('Kullanıcı gerekçesi');
    expect(firstReport).toContain('koruyucu tasarım eşikleridir');
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
