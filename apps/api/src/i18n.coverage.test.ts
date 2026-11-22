/**
 * Çeviri kapsamı (sunucu çıktıları): gerçek uç noktaların döndürdüğü kullanıcıya dönük her metin İngilizceye
 * çevrildiğinde Türkçe harf kalmamalıdır. Kullanıcı verisinden gelen metinler (sütun adı, düzey) bilerek ASCII tutulur.
 */
import type { FastifyInstance } from 'fastify';
import { gaussian, mulberry32, translate, translateCode, codeComments } from '@statadvisor/shared';
import { buildApp } from './app.ts';
import { unzip } from './xlsx.ts';

let app: FastifyInstance;
beforeEach(() => {
  app = buildApp({ dataDir: ':memory:' });
});
afterEach(async () => {
  await app.close();
});

const turkish = /[çğıöşüÇĞİÖŞÜ]/;

/** Yanıttaki tüm kelime içeren metin değerlerini toplar. */
function strings(x: unknown, out: Set<string> = new Set()): Set<string> {
  if (typeof x === 'string') {
    if (/[A-Za-zÇĞİÖŞÜçğıöşü]{3,}/.test(x) && turkish.test(x)) out.add(x);
  } else if (Array.isArray(x)) x.forEach((v) => strings(v, out));
  else if (x && typeof x === 'object') Object.values(x).forEach((v) => strings(v, out));
  return out;
}
const untranslated = (payload: unknown) => [...strings(payload)].filter((s) => turkish.test(translate('en', s)));

async function sample(kind: string) {
  return (await app.inject({ method: 'POST', url: `/api/samples/${kind}` })).json().id as string;
}
async function upload(content: string, name = 'veri.csv') {
  const boundary = '----sacov';
  const payload = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: text/csv\r\n\r\n${content}\r\n--${boundary}--\r\n`);
  const r = await app.inject({ method: 'POST', url: '/api/datasets', payload, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } });
  return r.json().id as string;
}
const body = (r: { body: string }) => JSON.parse(r.body) as unknown;

describe('çeviri kapsamı: sunucu çıktıları', () => {
  it('örnek veri setleri listesi', async () => {
    expect(untranslated(body(await app.inject({ url: '/api/samples' })))).toEqual([]);
  });

  it('doğrusal regresyon', async () => {
    const id = await sample('klinik');
    const r = await app.inject({ method: 'POST', url: `/api/datasets/${id}/regression`, payload: { dependent: 'kan_basinci', numeric: ['yas', 'biyobelirtec_x'], categorical: ['grup'] } });
    expect(r.statusCode, r.body).toBe(200);
    const j = body(r) as { narrative: unknown; model: unknown; coefficients: unknown };
    expect(untranslated({ n: j.narrative, m: j.model, c: j.coefficients })).toEqual([]);
  });

  it('lojistik regresyon', async () => {
    const rng = mulberry32(4);
    const rows = Array.from({ length: 200 }, (_, i) => {
      const x = gaussian(rng);
      return `${i + 1},${(x * 10 + 50).toFixed(2)},${i % 3 === 0 ? 'A' : i % 3 === 1 ? 'B' : 'C'},${rng() < 1 / (1 + Math.exp(-x)) ? 1 : 0}`;
    });
    const id = await upload('id,skor,grup,sonuc\n' + rows.join('\n') + '\n');
    const r = await app.inject({ method: 'POST', url: `/api/datasets/${id}/logistic`, payload: { dependent: 'sonuc', numeric: ['skor'], categorical: ['grup'] } });
    expect(r.statusCode, r.body).toBe(200);
    const j = body(r) as Record<string, unknown>;
    expect(untranslated({ n: j.narrative, m: j.model, c: j.coefficients, cl: j.classification, h: j.hosmerLemeshow })).toEqual([]);
  });

  it('veri kalitesi ve eksiklik tanılaması', async () => {
    const id = await sample('klinik');
    const r = await app.inject({ url: `/api/datasets/${id}/quality?value=kan_basinci&group=grup` });
    expect(r.statusCode, r.body).toBe(200);
    expect(untranslated(body(r))).toEqual([]);
  });

  it('ölçek puanı ve anket taraması', async () => {
    const rng = mulberry32(2);
    const items = ['a1', 'a2', 'a3', 'a4'];
    const rows = Array.from({ length: 80 }, (_, i) => {
      const latent = gaussian(rng);
      const cells = items.map((_, k) => (i % 17 === 3 && k === 1 ? '' : Math.min(4, Math.max(0, Math.round(2 + latent + 0.7 * gaussian(rng))))));
      return [i % 2 ? 'k' : 'e', ...cells].join(',');
    });
    const id = await upload('cinsiyet,' + items.join(',') + '\n' + rows.join('\n') + '\n');
    const scales = [{ name: 'A_puan', items, reverse: ['a4'], method: 'mean', min: 0, max: 4, minValidShare: 0.75 }];
    const made = await app.inject({ method: 'POST', url: `/api/datasets/${id}/scales`, payload: { scales } });
    expect(made.statusCode, made.body).toBe(201);
    expect(untranslated(body(made))).toEqual([]);
    const screen = await app.inject({ method: 'POST', url: `/api/datasets/${id}/screen`, payload: { items, straightLine: true, mahalanobis: true } });
    expect(untranslated(body(screen))).toEqual([]);
  });

  it('hata iletileri', async () => {
    const id = await sample('klinik');
    const probes = [
      app.inject({ method: 'POST', url: `/api/datasets/${id}/regression`, payload: { dependent: 'yok', numeric: ['yas'], categorical: [] } }),
      app.inject({ method: 'POST', url: `/api/datasets/${id}/logistic`, payload: { dependent: 'yas', numeric: ['kan_basinci'], categorical: [] } }),
      app.inject({ method: 'POST', url: '/api/analyses?save=false', payload: { datasetId: id, goal: 'compare', design: 'independent', target: 'continuous', value: 'yas', group: 'yas' } }),
      app.inject({ url: '/api/datasets/yok-boyle-bir-id' }),
      app.inject({ url: `/api/datasets/${id}/quality?value=olmayan_sutun` }),
    ];
    const msgs = (await Promise.all(probes)).map((r) => (JSON.parse(r.body) as { error?: { message?: string } }).error?.message ?? '');
    expect(untranslated(msgs)).toEqual([]);
  });


  /** HTML raporundaki metin düğümleri (etiketler ve stil hariç) içinden Türkçe harf içerenler. */
  const turkishTextNodes = (html: string) =>
    [...html.replace(/<style>[\s\S]*?<\/style>/g, '').matchAll(/>([^<>]+)</g)]
      .map((m) => m[1]!.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim())
      .filter((x) => turkish.test(x));

  it('HTML raporları: test, regresyon ve lojistik (lang=en)', async () => {
    const id = await sample('klinik');
    const created = await app.inject({ method: 'POST', url: '/api/analyses', payload: { datasetId: id, goal: 'compare', design: 'independent', target: 'continuous', value: 'kan_basinci', group: 'grup' } });
    const rep = await app.inject({ url: `/api/analyses/${created.json().id}/report?format=html&lang=en` });
    expect(rep.statusCode).toBe(200);
    expect(rep.body).toContain('lang="en"');
    expect(turkishTextNodes(rep.body)).toEqual([]);
    const reg = await app.inject({ method: 'POST', url: `/api/datasets/${id}/regression/report?format=html&lang=en`, payload: { dependent: 'kan_basinci', numeric: ['yas'], categorical: ['grup'] } });
    expect(reg.statusCode, reg.body).toBe(200);
    expect(turkishTextNodes(reg.body)).toEqual([]);
  });
});

describe('çeviri kapsamı: üretilen kod yorumları', () => {
  const comments = (code: string) => codeComments(translateCode('en', code)).filter((c) => turkish.test(c));

  it('test, regresyon, lojistik, ölçek, tarama ve temizleme kodları (Python ve R)', async () => {
    const codes: string[] = [];
    const langs = ['', '?lang=r'];
    const id = await sample('klinik');
    const analyze = async (datasetId: string, spec: Record<string, unknown>) => {
      const r = await app.inject({ method: 'POST', url: '/api/analyses', payload: { datasetId, ...spec } });
      for (const lang of langs) codes.push((await app.inject({ url: `/api/analyses/${r.json().id}/code${lang}` })).json().code);
    };
    await analyze(id, { goal: 'compare', design: 'independent', target: 'continuous', value: 'kan_basinci', group: 'grup' });
    await analyze(id, { goal: 'compare', design: 'independent', target: 'continuous', value: 'biyobelirtec_x', group: 'grup', normality: 'skewkurt-1.5' });
    await analyze(id, { goal: 'relate', design: 'independent', target: 'continuous', x: 'yas', y: 'kan_basinci' });
    await analyze(id, { goal: 'relate', design: 'independent', target: 'continuous', x: 'kan_basinci', y: 'biyobelirtec_x' });
    const tedavi = await sample('tedavi');
    await analyze(tedavi, { goal: 'compare', design: 'paired', target: 'continuous', conditions: ['baslangic', 'ay_3'] });
    await analyze(tedavi, { goal: 'compare', design: 'paired', target: 'continuous', conditions: ['baslangic', 'ay_1', 'ay_3'] });
    for (const lang of ['python', 'r']) {
      codes.push((await app.inject({ url: `/api/datasets/${id}/cleaning-code?clean=kan_basinci&impute=knn${lang === 'r' ? '&lang=r' : ''}` })).json().code);
      codes.push((await app.inject({ url: `/api/datasets/${id}/cleaning-code?clean=kan_basinci&impute=median${lang === 'r' ? '&lang=r' : ''}` })).json().code);
    }
    const reg = (await app.inject({ method: 'POST', url: `/api/datasets/${id}/regression`, payload: { dependent: 'kan_basinci', numeric: ['yas'], categorical: ['grup'] } })).json();
    codes.push(reg.code.code, reg.codeR.code);

    const rng = mulberry32(8);
    const items = ['a1', 'a2', 'a3', 'a4'];
    const rows = Array.from({ length: 120 }, (_, i) => {
      const l = gaussian(rng);
      return [i % 2 ? 'k' : 'e', ...items.map(() => Math.min(4, Math.max(0, Math.round(2 + l + 0.7 * gaussian(rng))))), rng() < 1 / (1 + Math.exp(-l)) ? 1 : 0].join(',');
    });
    const sid = await upload('cinsiyet,' + items.join(',') + ',sonuc\n' + rows.join('\n') + '\n');
    for (const lang of langs) {
      codes.push((await app.inject({ method: 'POST', url: `/api/datasets/${sid}/scales-code${lang}`, payload: { scales: [{ name: 'A', items, reverse: ['a4'], method: 'mean', min: 0, max: 4, minValidShare: 0.75 }] } })).json().code);
      codes.push((await app.inject({ method: 'POST', url: `/api/datasets/${sid}/screen-code${lang}`, payload: { items, straightLine: true, mahalanobis: true } })).json().code);
    }
    const log = (await app.inject({ method: 'POST', url: `/api/datasets/${sid}/logistic`, payload: { dependent: 'sonuc', numeric: ['a1', 'a2'], categorical: ['cinsiyet'] } })).json();
    codes.push(log.code.code, log.codeR.code);

    expect([...new Set(codes.flatMap(comments))]).toEqual([]);
  });

  it('Word (.docx) raporları İngilizce üretilir', async () => {
    const id = await sample('klinik');
    const created = await app.inject({ method: 'POST', url: '/api/analyses', payload: { datasetId: id, goal: 'compare', design: 'independent', target: 'continuous', value: 'kan_basinci', group: 'grup' } });
    const docx = await app.inject({ url: `/api/analyses/${created.json().id}/report?format=docx&lang=en` });
    expect(docx.statusCode).toBe(200);
    const xml = unzip(docx.rawPayload).get('word/document.xml')!().toString('utf8');
    const texts = [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]!.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')).filter((x) => turkish.test(x));
    expect(texts).toEqual([]);
    expect(xml).toContain('Descriptive statistics');
  });
});
