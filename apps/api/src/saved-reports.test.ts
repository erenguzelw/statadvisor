/**
 * Rapor merkezi: regresyon, lojistik regresyon ve model karşılaştırma sonuçlarının kaydedilmesi, listelenmesi,
 * yeniden açılması (kod ve rapor) ve silinmesi. Kayıtlar sunucu yeniden başlatıldıktan sonra da kalır.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';
import type { FastifyInstance } from 'fastify';
import { gaussian, mulberry32 } from '@statadvisor/shared';
import { buildApp } from './app.ts';

const rng = mulberry32(11);
const N = 150;
const csvText =
  'yas,gelir,grup,durum,puan\n' +
  Array.from({ length: N }, (_, i) => {
    const yas = Math.round(20 + 40 * rng());
    const gelir = Math.round((yas * 30 + 400 * gaussian(rng) + 2000) * 10) / 10;
    const grup = ['A', 'B', 'C'][i % 3]!;
    const puan = Math.round((10 + 0.3 * yas + 0.002 * gelir + (grup === 'B' ? 4 : 0) + 3 * gaussian(rng)) * 100) / 100;
    const durum = puan + 2 * gaussian(rng) > 27 ? 'var' : 'yok';
    return [yas, gelir, grup, durum, puan].join(',');
  }).join('\n') +
  '\n';

let app: FastifyInstance;
let dir: string;
let id: string;

async function upload(a: FastifyInstance) {
  const boundary = '----sasaved';
  const payload = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="kayit.csv"\r\nContent-Type: text/csv\r\n\r\n${csvText}\r\n--${boundary}--\r\n`);
  const r = await a.inject({ method: 'POST', url: '/api/datasets', payload, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } });
  expect(r.statusCode).toBeLessThan(300);
  return r.json().id as string;
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'sa-saved-'));
  app = buildApp({ dataDir: dir });
  id = await upload(app);
});
afterEach(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

const post = (url: string, payload: unknown = {}) => app.inject({ method: 'POST', url, payload: payload as object });
const regBody = { dependent: 'puan', numeric: ['yas', 'gelir'], categorical: ['grup'], alpha: 0.05 };
const logitBody = { dependent: 'durum', numeric: ['yas', 'gelir'], categorical: ['grup'], alpha: 0.05, eventLevel: 'var' };
const modelBody = { target: 'grup', numeric: ['yas', 'gelir', 'puan'], categorical: [], models: ['baseline', 'logistic', 'tree'], folds: 3, seed: 7 };

async function finishedJob() {
  const r = await post(`/api/datasets/${id}/model-runs`, modelBody);
  expect(r.statusCode, r.body).toBe(202);
  for (let i = 0; i < 600; i++) {
    const j = (await app.inject({ url: `/api/model-runs/${r.json().id}` })).json();
    if (j.status !== 'running') {
      expect(j.status, j.error).toBe('done');
      return j as { id: string };
    }
    await new Promise((res) => setTimeout(res, 20));
  }
  throw new Error('iş zamanında bitmedi');
}

describe('rapor merkezine kaydetme', () => {
  it('regresyon: kaydedilir, aynı ayarla ikinci kayıt yenisini açmaz; kod ve APA özeti canlı sonuçla aynıdır', async () => {
    const live = (await post(`/api/datasets/${id}/regression`, regBody)).json();
    const first = await post(`/api/datasets/${id}/regression/save`, regBody);
    expect(first.statusCode, first.body).toBe(201);
    const item = first.json();
    expect(item).toMatchObject({ kind: 'regression', datasetId: id, title: 'puan ← yas, gelir, grup' });
    expect(item.detail).toMatch(/^R² = \.\d{3} · p/);

    const again = await post(`/api/datasets/${id}/regression/save`, regBody);
    expect(again.statusCode).toBe(200);
    expect(again.json().id).toBe(item.id);
    // farklı ayar: yeni kayıt
    expect((await post(`/api/datasets/${id}/regression/save`, { ...regBody, alpha: 0.01 })).statusCode).toBe(201);

    const view = (await app.inject({ url: `/api/reports/${item.id}` })).json();
    expect(view.apaSummary).toBe(live.narrative.apaSummary);
    expect(view.summary).toEqual(live.narrative.interpretation);
    expect(view.highlights[0]).toEqual(['R²', live.result.r2.toFixed(3).replace(/^0/, '')]);
    expect(view.audit.slice(0, 2)).toEqual([['Rapor kimliği', item.id], ['Girdi karması (SHA-256)', item.inputHash]]);
    expect(view.codeUnavailable).toBeNull();

    const code = (await app.inject({ url: `/api/reports/${item.id}/code` })).json();
    expect(code.code).toBe(live.code.code);
    expect(code.expectedOutput).toEqual(live.code.expectedOutput);
  });

  it('regresyon raporu: HTML denetim izi içerir, Word gerçek bir paket; tarih kayıt tarihidir ve rapor değişmez', async () => {
    const item = (await post(`/api/datasets/${id}/regression/save`, regBody)).json();
    const html = await app.inject({ url: `/api/reports/${item.id}/report` });
    expect(html.headers['content-type']).toContain('text/html');
    expect(html.body).toContain('Rapor kimliği');
    expect(html.body).toContain(item.inputHash);
    expect(html.body).toContain('kayit.csv');
    expect(html.body).toContain(new Date(item.createdAt).toLocaleDateString('tr-TR'));
    expect((await app.inject({ url: `/api/reports/${item.id}/report` })).body).toBe(html.body);

    const docx = await app.inject({ url: `/api/reports/${item.id}/report?format=docx` });
    expect(docx.headers['content-disposition']).toContain('regresyon-raporu.docx');
    const zip = await JSZip.loadAsync(docx.rawPayload);
    expect(await zip.file('word/document.xml')!.async('string')).toContain('Rapor kimliği');
    expect((await app.inject({ url: `/api/reports/${item.id}/report?format=odt` })).statusCode).toBe(400);
  });

  it('lojistik regresyon: kaydedilir; kod ve rapor açılır', async () => {
    const live = (await post(`/api/datasets/${id}/logistic`, logitBody)).json();
    const r = await post(`/api/datasets/${id}/logistic/save`, logitBody);
    expect(r.statusCode, r.body).toBe(201);
    const item = r.json();
    expect(item).toMatchObject({ kind: 'logistic', title: 'durum = var ← yas, gelir, grup' });
    const view = (await app.inject({ url: `/api/reports/${item.id}` })).json();
    expect(view.apaSummary).toBe(live.narrative.apaSummary);
    expect(view.highlights.map((h: string[]) => h[0])).toContain('AUC');
    expect((await app.inject({ url: `/api/reports/${item.id}/code` })).json().code).toBe(live.code.code);
    const html = (await app.inject({ url: `/api/reports/${item.id}/report` })).body;
    expect(html).toContain('olay: var');
  });

  it('model karşılaştırma: kaydedilen sonuç sunucu yeniden başlatıldıktan sonra da açılır', async () => {
    const job = await finishedJob();
    const liveCode = (await app.inject({ url: `/api/model-runs/${job.id}/code` })).json();
    const r = await post(`/api/model-runs/${job.id}/save`);
    expect(r.statusCode, r.body).toBe(201);
    const item = r.json();
    expect(item).toMatchObject({ kind: 'model', title: 'grup ← 3 özellik · 3 katlı çapraz doğrulama' });
    expect(item.detail).toMatch(/taban %33\.3/);
    expect((await post(`/api/model-runs/${job.id}/save`)).json().id).toBe(item.id);
    const before = (await app.inject({ url: `/api/reports/${item.id}/report` })).body;
    await app.close();

    // Bellekteki iş yeniden başlatmada kaybolur; kayıt kalır.
    app = buildApp({ dataDir: dir });
    expect((await app.inject({ url: `/api/model-runs/${job.id}` })).statusCode).toBe(404);
    const view = (await app.inject({ url: `/api/reports/${item.id}` })).json();
    expect(view.highlights.find((h: string[]) => h[0] === 'Taban doğruluğu')[1]).toBe('%33.3');
    expect(view.summary.length).toBeGreaterThan(0);
    expect((await app.inject({ url: `/api/reports/${item.id}/report` })).body).toBe(before);
    expect(before).toContain('Çapraz doğrulama');
    expect((await app.inject({ url: `/api/reports/${item.id}/code` })).json().code).toBe(liveCode.code);
  });
});

describe('rapor listesi ve silme', () => {
  it('testler ve kaydedilmiş raporlar tek listede, yeniden eskiye', async () => {
    const test = (await post('/api/analyses', { datasetId: id, goal: 'compare', design: 'independent', target: 'continuous', value: 'puan', group: 'grup' })).json();
    const reg = (await post(`/api/datasets/${id}/regression/save`, regBody)).json();
    const list = (await app.inject({ url: `/api/reports?datasetId=${id}` })).json().reports;
    expect(list.map((r: { kind: string }) => r.kind)).toEqual(['regression', 'test']);
    expect(list[0].id).toBe(reg.id);
    expect(list[1]).toMatchObject({ id: test.id, title: test.result.outcome.test });
    expect(list[1].detail).toMatch(/^puan, grup · p/);
    expect((await app.inject({ url: '/api/reports?datasetId=yok' })).json().reports).toEqual([]);
  });

  it('kayıt silinir; bilinmeyen kayıt 404 verir', async () => {
    const reg = (await post(`/api/datasets/${id}/regression/save`, regBody)).json();
    expect((await app.inject({ method: 'DELETE', url: `/api/reports/${reg.id}` })).statusCode).toBe(204);
    for (const url of [`/api/reports/${reg.id}`, `/api/reports/${reg.id}/code`, `/api/reports/${reg.id}/report`]) expect((await app.inject({ url })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `/api/reports/${reg.id}` })).statusCode).toBe(404);
  });

  it('veri seti silinince ona bağlı raporlar da silinir', async () => {
    await post(`/api/datasets/${id}/regression/save`, regBody);
    await post(`/api/datasets/${id}/logistic/save`, logitBody);
    expect((await app.inject({ method: 'DELETE', url: '/api/datasets' })).json()).toEqual({ deletedDatasets: 1, deletedAnalyses: 0, deletedReports: 2 });
    expect((await app.inject({ url: '/api/reports' })).json().reports).toEqual([]);
  });

  it('geçersiz gövde kaydedilmez', async () => {
    const r = await post(`/api/datasets/${id}/regression/save`, { dependent: 'puan', numeric: [], categorical: [] });
    expect(r.statusCode).toBe(422);
    expect((await app.inject({ url: '/api/reports' })).json().reports).toEqual([]);
  });
});
