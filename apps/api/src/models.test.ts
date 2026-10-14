/**
 * Gerçek veride model karşılaştırma: iş akışı (başlat, ilerleme, sonuç), doğrulama hataları ve üretilen scikit-learn
 * betiğinin çalıştırılıp uygulamadaki sonuçlarla karşılaştırılması (Python yoksa o test atlanır).
 *
 * Karşılaştırma beklentisi: taban, lojistik, k-NN, SVM birebir; ağaç, orman, gradyan artırma rastgele sayı dizisi
 * yüzünden birkaç binde farklı olabilir (bkz. packages/shared/src/ml-cv.test.ts).
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
const hasPython = PY !== '' && spawnSync(PY, ['-c', 'import numpy, pandas, sklearn'], { encoding: 'utf8' }).status === 0;
if (!hasPython) console.warn('UYARI: Python ortamı bulunamadı; model karşılaştırma kodunun doğrulama testi atlanıyor.');

const rng = mulberry32(21);
const N = 270;
const classes = ['dusuk', 'orta', 'yuksek'];
const rows = Array.from({ length: N }, (_, i) => {
  const c = i % 3;
  const x1 = Math.round((c * 1.2 + gaussian(rng) * 1.5) * 100) / 100;
  const x2 = Math.round((10 + gaussian(rng) * 3 - c * 0.8) * 100) / 100;
  const x3 = Math.round((gaussian(rng) * 2) * 100) / 100;
  const cins = rng() < 0.4 + 0.1 * c ? 'K' : 'E';
  const kod = 1 + Math.floor(rng() * 3);
  return { x1, x2, x3, cins, kod, sinif: classes[c]!, sayi: c + 1, nadir: i < 3 ? 'b' : 'a' };
});
const csvText =
  'id,x1,x2,x3,cins,kod,sinif,sayi,nadir\n' +
  rows.map((r, i) => [i + 1, i === 6 ? '' : r.x1, r.x2, i === 13 ? 'NA' : r.x3, i === 20 ? '' : r.cins, r.kod, i === 40 ? '' : r.sinif, r.sayi, r.nadir].join(',')).join('\n') +
  '\n';

let app: FastifyInstance;
let work: string;
let id: string;
beforeEach(async () => {
  app = buildApp({ dataDir: ':memory:' });
  work = mkdtempSync(join(tmpdir(), 'sa-ml-'));
  const boundary = '----saml';
  const payload = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="ml.csv"\r\nContent-Type: text/csv\r\n\r\n${csvText}\r\n--${boundary}--\r\n`);
  const r = await app.inject({ method: 'POST', url: '/api/datasets', payload, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } });
  expect(r.statusCode).toBeLessThan(300);
  id = r.json().id as string;
});
afterEach(async () => {
  await app.close();
  rmSync(work, { recursive: true, force: true });
});

const start = (payload: unknown) => app.inject({ method: 'POST', url: `/api/datasets/${id}/model-runs`, payload: payload as object });
async function finish(jobId: string) {
  for (let i = 0; i < 600; i++) {
    const j = (await app.inject({ url: `/api/model-runs/${jobId}` })).json();
    if (j.status !== 'running') return j;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('iş zamanında bitmedi');
}
const body = { target: 'sinif', numeric: ['x1', 'x2', 'x3'], categorical: ['cins', 'kod'], models: ['baseline', 'logistic', 'tree', 'knn', 'svm', 'rf', 'gb'], folds: 5, seed: 42 };

describe('model karşılaştırma işi', () => {
  it('işi başlatır, ilerlemeyi bildirir ve sonuç döndürür', async () => {
    const r = await start(body);
    expect(r.statusCode, r.body).toBe(202);
    const job = await finish(r.json().id);
    expect(job.status, job.error).toBe('done');
    const res = job.result;
    expect(res.classes).toEqual(classes);
    expect(res.n).toBe(N - 1);
    expect(res.droppedRows).toBe(1);
    expect(res.folds).toBe(5);
    expect(res.foldOf).toBeUndefined();
    expect(res.models.map((m: { id: string }) => m.id)).toEqual(body.models);
    const byId = Object.fromEntries(res.models.map((m: { id: string }) => [m.id, m]));
    expect(byId.baseline.accuracy.mean).toBeCloseTo(res.baselineAccuracy, 1);
    expect(byId.logistic.accuracy.mean).toBeGreaterThan(res.baselineAccuracy + 0.1);
    expect(byId.tree.trainAccuracy).toBeGreaterThan(0.99); // derinlik sınırı yok: eğitim verisini ezberler
    expect(byId.tree.gap).toBeGreaterThan(0.1);
    expect(byId.logistic.confusion).toHaveLength(3);
    expect(byId.svm.hasProba).toBe(false);
    expect(job.progress.done).toBe(job.progress.total);
    expect(res.featureColumns).toContain('cins=K');
  }, 120_000);

  it.each([
    [{ ...body, target: 'x1', numeric: ['x2', 'x3'] }, /sürekli bir ölçüm/],
    [{ ...body, numeric: [], categorical: [] }, /en az bir özellik/i],
    [{ ...body, numeric: ['sinif'] }, /Hedef değişken aynı zamanda özellik olamaz/],
    [{ ...body, numeric: ['id'] }, /kimlik sütunu/],
    [{ ...body, numeric: ['cins'], categorical: ['kod'] }, /sayısal değil/],
    [{ ...body, folds: 11 }, /Geçersiz istek/],
    [{ ...body, target: 'nadir', numeric: ['x1'], categorical: [] }, /çapraz doğrulama/],
    [{ ...body, numeric: ['yok'] }, /bulunamadı/],
  ])('hatalı isteği iş başlamadan reddeder: %j', async (b, msg) => {
    const r = await start(b);
    expect([400, 422]).toContain(r.statusCode);
    expect(r.json().error.message).toMatch(msg);
  });

  it('aynı anda ikinci işi 409 ile reddeder', async () => {
    const a = await start(body);
    expect(a.statusCode).toBe(202);
    const b = await start(body);
    expect(b.statusCode).toBe(409);
    await finish(a.json().id);
  }, 120_000);

  it('yorum, ilişki, AUC ve rapor üretir', async () => {
    const job = await finish((await start({ ...body, models: ['baseline', 'logistic', 'tree'] })).json().id);
    expect(job.status, job.error).toBe('done');
    const ip = job.interpretation;
    expect(ip.balance.label).toBe('dengeli');
    expect(ip.notes.some((n: { title: string }) => n.title === 'Sınıflar dengeli')).toBe(true);
    expect(ip.notes.some((n: { title: string }) => n.title.startsWith('Aşırı uyum'))).toBe(true);
    expect(ip.best.id).toBeTruthy();
    expect(ip.correlations.length).toBeGreaterThan(0);
    const lr = job.result.models.find((m: { id: string }) => m.id === 'logistic');
    expect(lr.auc.mean).toBeGreaterThan(0.5);
    expect(lr.aucPerClass).toHaveLength(3);
    expect(lr.roc).toHaveLength(3);
    expect(job.result.associations.pairs.length).toBeGreaterThan(0);

    const html = await app.inject({ url: `/api/model-runs/${job.id}/report?format=html` });
    expect(html.statusCode).toBe(200);
    for (const t of ['Model karşılaştırma raporu', 'Karışıklık matrisi', 'Yorum ve uyarılar', 'Denetim izi', 'Değişkenler arası ilişkiler']) expect(html.body).toContain(t);
    const docx = await app.inject({ url: `/api/model-runs/${job.id}/report?format=docx` });
    expect(docx.statusCode).toBe(200);
    expect(docx.rawPayload.subarray(0, 2).toString()).toBe('PK');
  }, 120_000);

  it('bitmemiş işin raporu 409 döndürür', async () => {
    const a = await start(body);
    const r = await app.inject({ url: `/api/model-runs/${a.json().id}/report` });
    expect(r.statusCode).toBe(409);
    await finish(a.json().id);
  }, 120_000);

  it('bilinmeyen iş 404 döndürür', async () => {
    expect((await app.inject({ url: '/api/model-runs/yok' })).statusCode).toBe(404);
  });
});

(hasPython ? describe : describe.skip)('model karşılaştırma: üretilen scikit-learn betiği uygulamayla uyumludur', () => {
  async function verify(b: unknown) {
    const job = await finish((await start(b)).json().id);
    expect(job.status, job.error).toBe('done');
    const code = (await app.inject({ url: `/api/model-runs/${job.id}/code` })).json();
    const ds = await app.inject({ url: `/api/datasets/${id}` });
    writeFileSync(join(work, ds.json().name), (await app.inject({ url: `/api/datasets/${id}/download` })).rawPayload);
    writeFileSync(join(work, code.filename), code.code);
    const out = execFileSync(PY, [code.filename], { cwd: work, encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, timeout: 300_000 });
    const parse = (line: string) => {
      const m = /^(\w+): dogruluk = ([\d.]+) \(SS ([\d.]+)\) makro F1 = ([\d.]+) \(SS [\d.]+\) AUC = ([\d.]+)/.exec(line)!;
      return { id: m[1]!, acc: Number(m[2]), f1: Number(m[4]), auc: Number(m[5]) };
    };
    const got = out.trim().split(/\r?\n/).map(parse);
    const exp = (code.expectedOutput as string[]).map(parse);
    expect(got.map((g) => g.id)).toEqual(exp.map((e) => e.id));
    const exact = new Set(['baseline', 'logistic', 'knn', 'svm']);
    got.forEach((g, i) => {
      const tol = exact.has(g.id) ? 0.0006 : 0.03;
      expect(Math.abs(g.acc - exp[i]!.acc), `${g.id} doğruluk`).toBeLessThanOrEqual(tol);
      expect(Math.abs(g.f1 - exp[i]!.f1), `${g.id} makro F1`).toBeLessThanOrEqual(exact.has(g.id) ? 0.0006 : 0.04);
      expect(Math.abs(g.auc - exp[i]!.auc), `${g.id} AUC`).toBeLessThanOrEqual(exact.has(g.id) ? 0.0006 : 0.03);
    });
  }

  it('sayısal + kategorik özellikler, metin hedef, eksik değerler', () => verify(body), 400_000);
  it('sayısal kodlu hedef ve sayısal kodlu kategorik özellik', () => verify({ ...body, target: 'sayi', numeric: ['x1', 'x2'], categorical: ['kod', 'cins'], models: ['baseline', 'logistic', 'knn', 'svm'], folds: 4, seed: 7 }), 400_000);
});
