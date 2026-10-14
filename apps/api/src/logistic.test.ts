/**
 * Lojistik regresyon uç noktaları: doğrulama hataları, rapor biçimleri ve "kod = ekrandaki sonuç" garantisi
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
const hasPython = PY !== '' && spawnSync(PY, ['-c', 'import numpy, pandas, scipy, statsmodels, sklearn'], { encoding: 'utf8' }).status === 0;
if (!hasPython) console.warn('UYARI: Python ortamı bulunamadı; lojistik kodunun doğrulama testi atlanıyor.');

const rng = mulberry32(9);
const N = 240;
const rows = Array.from({ length: N }, (_, i) => {
  const yas = Math.round(20 + 45 * rng());
  const skor = Math.round((50 + 10 * gaussian(rng)) * 10) / 10;
  const grup = ['A', 'B', 'C'][i % 3]!;
  const eta = -4 + 0.06 * yas + 0.03 * (skor - 50) + (grup === 'B' ? 0.9 : grup === 'C' ? -0.6 : 0);
  const basari = rng() < 1 / (1 + Math.exp(-eta)) ? 1 : 0;
  return { yas, skor, grup, basari, durum: basari ? 'evet' : 'hayır', sizinti: basari ? 10 + rng() : 1 + rng() };
});
const csvText =
  'yas,skor,grup,basari,durum,sizinti\n' +
  rows.map((r, i) => [i === 5 ? '' : r.yas, r.skor, r.grup, i === 11 ? 'NA' : r.basari, r.durum, r.sizinti.toFixed(3)].join(',')).join('\n') +
  '\n';

let app: FastifyInstance;
let work: string;
let id: string;
beforeEach(async () => {
  app = buildApp({ dataDir: ':memory:' });
  work = mkdtempSync(join(tmpdir(), 'sa-logit-'));
  const boundary = '----salogit';
  const payload = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="logit.csv"\r\nContent-Type: text/csv\r\n\r\n${csvText}\r\n--${boundary}--\r\n`);
  const r = await app.inject({ method: 'POST', url: '/api/datasets', payload, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } });
  expect(r.statusCode).toBeLessThan(300);
  id = r.json().id as string;
});
afterEach(async () => {
  await app.close();
  rmSync(work, { recursive: true, force: true });
});

const post = (payload: unknown, url = `/api/datasets/${id}/logistic`) => app.inject({ method: 'POST', url, payload: payload as object });
const body = { dependent: 'basari', numeric: ['yas', 'skor'], categorical: ['grup'] };

describe('lojistik uç noktası', () => {
  it('modeli kurar; OR, AUC, sınıflandırma ve Hosmer–Lemeshow döndürür', async () => {
    const r = await post(body);
    expect(r.statusCode, r.body).toBe(200);
    const j = r.json();
    expect(j.result.n).toBe(N - 2);
    expect(j.result.coefficients.map((c: { term: string }) => c.term)).toEqual(['Sabit', 'yas', 'skor', 'grup[B]', 'grup[C]']);
    expect(j.result.coefficients[1].or).toBeCloseTo(Math.exp(j.result.coefficients[1].b), 8);
    expect(j.result.auc).toBeGreaterThan(0.6);
    expect(j.result.separation).toBe('none');
    expect(j.classification.rows).toHaveLength(3);
    expect(j.hosmerLemeshow.rows).toHaveLength(10);
    expect(j.narrative.apaSummary).toContain('Lojistik regresyon');
    expect(j.code.filename).toBe('lojistik.py');
    expect(j.result.probs).toBeUndefined();
  });

  it('metin etiketli sonuç ve olay düzeyi seçimi', async () => {
    const a = (await post({ ...body, dependent: 'durum', eventLevel: 'evet' })).json();
    const b = (await post(body)).json();
    expect(a.result.eventLevel).toBe('evet');
    expect(a.result.n).toBe(b.result.n + 1); // durum sütununda 'NA' yok, basari sütununda 1 eksik var
    expect(a.result.coefficients[1].b).toBeCloseTo(b.result.coefficients[1].b, 2);
  });

  it('tam ayrışmada uyarır ve kod üretmez', async () => {
    const r = await post({ dependent: 'basari', numeric: ['sizinti'], categorical: [] });
    expect(r.statusCode).toBe(200);
    const j = r.json();
    expect(j.result.separation).toBe('complete');
    expect(j.code).toBeNull();
    expect(j.narrative.notes.some((n: { title: string }) => n.title === 'Tam ayrışma')).toBe(true);
  });

  it.each([
    [{ ...body, dependent: 'yas', numeric: ['skor'] }, /iki düzey/],
    [{ dependent: 'basari', numeric: [], categorical: [] }, /yordayıcı/],
    [{ ...body, numeric: ['basari', 'yas'] }, /yordayıcı olamaz/],
    [{ ...body, eventLevel: 'yok' }, /Olay düzeyi/],
    [{ ...body, numeric: ['yok'] }, /bulunamadı/],
  ])('hatalı seçimi anlaşılır hatayla reddeder: %j', async (b, msg) => {
    const r = await post(b);
    expect(r.statusCode).toBe(422);
    expect(r.json().error.message).toMatch(msg);
  });

  it('HTML ve DOCX raporu üretir', async () => {
    const html = await post(body, `/api/datasets/${id}/logistic/report?format=html`);
    expect(html.statusCode).toBe(200);
    expect(html.body).toContain('Sınıflandırma tablosu');
    expect(html.body).toContain('Hosmer–Lemeshow');
    expect(html.body).toContain('Denetim izi');
    const docx = await post(body, `/api/datasets/${id}/logistic/report?format=docx`);
    expect(docx.statusCode).toBe(200);
    expect(docx.rawPayload.subarray(0, 2).toString()).toBe('PK');
  });
});

(hasPython ? describe : describe.skip)('lojistik: üretilen Python kodu ekrandaki sonuçla birebir aynıdır', () => {
  async function verify(b: unknown) {
    const j = (await post(b)).json();
    expect(j.code).not.toBeNull();
    const ds = await app.inject({ url: `/api/datasets/${id}` });
    writeFileSync(join(work, ds.json().name), (await app.inject({ url: `/api/datasets/${id}/download` })).rawPayload);
    writeFileSync(join(work, j.code.filename), j.code.code);
    const out = execFileSync(PY, [j.code.filename], { cwd: work, encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, timeout: 90_000 });
    expect(out.trim().split(/\r?\n/)).toEqual(j.code.expectedOutput);
  }

  it('sayısal 0/1 sonuç, sayısal + kategorik yordayıcı, eksik değerler', () => verify(body));
  it('metin etiketli sonuç ve seçilen olay düzeyi', () => verify({ ...body, dependent: 'durum', eventLevel: 'evet' }));
  it('yalnızca sayısal yordayıcı ve farklı referans düzey', () => verify({ dependent: 'basari', numeric: ['skor'], categorical: ['grup'], reference: { grup: 'B' } }));
});
