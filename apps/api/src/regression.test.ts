/**
 * Regresyon uç noktaları: doğrulama hataları, rapor biçimleri ve "kod = ekrandaki sonuç" garantisi
 * (üretilen Python betiği gerçekten çalıştırılır; Python yoksa o testler atlanır).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { gaussian, mulberry32 } from '@statadvisor/shared';
import { buildApp } from './app.ts';

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const PY =
  process.env.STATADVISOR_PYTHON ??
  [join(root, 'tools/reference/.venv/Scripts/python.exe'), join(root, 'tools/reference/.venv/bin/python')].find((p) => existsSync(p)) ??
  '';
const hasPython = PY !== '' && spawnSync(PY, ['-c', 'import numpy, pandas, scipy, statsmodels'], { encoding: 'utf8' }).status === 0;
if (!hasPython) console.warn('UYARI: Python ortamı bulunamadı; regresyon kodunun doğrulama testi atlanıyor.');

const rng = mulberry32(5);
const N = 120;
const rows = Array.from({ length: N }, (_, i) => {
  const yas = Math.round(20 + 40 * rng());
  const gelir = Math.round((yas * 30 + 400 * gaussian(rng) + 2000) * 10) / 10;
  const grup = ['A', 'B', 'C'][i % 3]!;
  const cins = (i * 7) % 5 < 2 ? 1 : 2;
  const puan = Math.round((10 + 0.3 * yas + 0.002 * gelir + (grup === 'B' ? 4 : grup === 'C' ? -3 : 0) + (cins === 2 ? 2 : 0) + 3 * gaussian(rng)) * 100) / 100;
  return { yas, gelir, grup, cins, puan };
});
// birkaç eksik değer
const csvText =
  'yas,gelir,grup,cinsiyet,puan\n' +
  rows.map((r, i) => [i === 4 ? '' : r.yas, r.gelir, r.grup, i === 9 ? '' : r.cins, i === 14 ? 'NA' : r.puan].join(',')).join('\n') +
  '\n';

let app: FastifyInstance;
let work: string;
let id: string;
beforeEach(async () => {
  app = buildApp({ dataDir: ':memory:' });
  work = mkdtempSync(join(tmpdir(), 'sa-reg-'));
  const boundary = '----sareg';
  const payload = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="reg.csv"\r\nContent-Type: text/csv\r\n\r\n${csvText}\r\n--${boundary}--\r\n`);
  const r = await app.inject({ method: 'POST', url: '/api/datasets', payload, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } });
  expect(r.statusCode).toBeLessThan(300);
  id = r.json().id as string;
});
afterEach(async () => {
  await app.close();
  rmSync(work, { recursive: true, force: true });
});

const post = (payload: unknown, url = `/api/datasets/${id}/regression`) => app.inject({ method: 'POST', url, payload: payload as object });
const body = { dependent: 'puan', numeric: ['yas', 'gelir'], categorical: ['grup', 'cinsiyet'] };

describe('regresyon uç noktası', () => {
  it('modeli kurar; eksik değerli satırları çıkarır ve sayar', async () => {
    const r = await post(body);
    expect(r.statusCode, r.body).toBe(200);
    const j = r.json();
    expect(j.result.n).toBe(N - 3);
    expect(j.result.droppedRows).toBe(3);
    expect(j.result.coefficients.map((c: { term: string }) => c.term)).toEqual(['Sabit', 'yas', 'gelir', 'grup[B]', 'grup[C]', 'cinsiyet[2]']);
    expect(j.result.r2).toBeGreaterThan(0.3);
    expect(j.narrative.apaSummary).toContain('doğrusal regresyon');
    expect(j.code.filename).toBe('regresyon.py');
    expect(j.result.fitted).toBeUndefined();
    expect(j.plot.fitted.length).toBe(j.plot.residuals.length);
  });

  it.each([
    [{ ...body, dependent: 'grup' }, /sayısal değil/],
    [{ dependent: 'puan', numeric: [], categorical: [] }, /yordayıcı/],
    [{ ...body, numeric: ['puan', 'yas'] }, /yordayıcı olamaz/],
    [{ ...body, numeric: ['grup'], categorical: ['cinsiyet'] }, /kategorik yordayıcı olarak ekleyin/],
    [{ ...body, numeric: ['yas', 'yas'] }, /birden fazla/],
    [{ ...body, numeric: ['yok'] }, /bulunamadı/],
  ])('hatalı seçimi anlaşılır hatayla reddeder: %j', async (b, msg) => {
    const r = await post(b);
    expect(r.statusCode).toBe(422);
    expect(r.json().error.message).toMatch(msg);
  });

  it('referans düzey seçilebilir', async () => {
    const r = await post({ ...body, reference: { grup: 'C' } });
    expect(r.json().result.coefficients.map((c: { term: string }) => c.term)).toContain('grup[A]');
    expect(r.json().result.categories.find((c: { name: string }) => c.name === 'grup').reference).toBe('C');
  });

  it('HTML ve DOCX raporu üretir', async () => {
    const html = await post(body, `/api/datasets/${id}/regression/report?format=html`);
    expect(html.statusCode).toBe(200);
    expect(html.body).toContain('Katsayılar');
    expect(html.body).toContain('Denetim izi');
    const docx = await post(body, `/api/datasets/${id}/regression/report?format=docx`);
    expect(docx.statusCode).toBe(200);
    expect(docx.rawPayload.subarray(0, 2).toString()).toBe('PK');
  });
});

(hasPython ? describe : describe.skip)('regresyon: üretilen Python kodu ekrandaki sonuçla birebir aynıdır', () => {
  async function verify(b: unknown) {
    const j = (await post(b)).json();
    const ds = await app.inject({ url: `/api/datasets/${id}` });
    writeFileSync(join(work, ds.json().name), (await app.inject({ url: `/api/datasets/${id}/download` })).rawPayload);
    writeFileSync(join(work, j.code.filename), j.code.code);
    const out = execFileSync(PY, [j.code.filename], { cwd: work, encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, timeout: 90_000 });
    expect(out.trim().split(/\r?\n/)).toEqual(j.code.expectedOutput);
  }

  it('sayısal + kategorik yordayıcılar, eksik değerler', () => verify(body));
  it('yalnızca sayısal yordayıcı', () => verify({ dependent: 'puan', numeric: ['yas'], categorical: [] }));
  it('farklı referans düzey ve sayısal kodlu kategorik', () => verify({ ...body, reference: { grup: 'B', cinsiyet: '2' } }));
});
