/**
 * Ek testler (Kendall tau, işaret testi, McNemar, Cochran Q) ve “alternatifi çalıştır” akışı: uç noktalar çalışır,
 * üretilen Python betiği ekrandaki sonuçla birebir aynı çıktıyı verir (Python bulunmayan ortamlarda atlanır).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.ts';

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const PY =
  process.env.STATADVISOR_PYTHON ??
  [join(root, 'tools/reference/.venv/Scripts/python.exe'), join(root, 'tools/reference/.venv/bin/python')].find((p) => existsSync(p)) ??
  '';
const hasPython = PY !== '' && spawnSync(PY, ['-c', 'import numpy, pandas, scipy, statsmodels'], { encoding: 'utf8' }).status === 0;
const pyIt = hasPython ? it : it.skip;

/** Aynı denekler önce–sonra “evet/hayır”: b = 13 (hayır → evet), c = 3 (evet → hayır). */
const yesNo = (() => {
  const rows: string[] = [];
  const add = (n: number, a: string, b: string, c3: string) => {
    for (let i = 0; i < n; i++) rows.push(`${a},${b},${c3}`);
  };
  add(14, 'hayır', 'hayır', 'hayır');
  add(9, 'hayır', 'evet', 'evet');
  add(3, 'evet', 'hayır', 'hayır');
  add(10, 'evet', 'evet', 'evet');
  add(4, 'hayır', 'evet', 'hayır');
  return 'once,sonra,sonra2\n' + rows.join('\n') + '\n';
})();

/** Küçük, bağsız çift: Kendall için kesin p. */
const pairsXY = 'x,y\n' + [[9, 6.6], [11, 13.2], [1, 5.9], [3, 3.8], [2, -1.7], [4, 1.1], [6, 10.8], [7, 7.6], [0, -5.2], [10, 9.7], [5, 1.5], [8, 6.1]].map((r) => r.join(',')).join('\n') + '\n';
/** Çarpık eşleşmiş sıralı ölçüm (sıfır farklar var): Wilcoxon önerilir, işaret testi alternatif. */
const ordPaired = 'a,b\n' + [[1, 2], [2, 2], [3, 5], [2, 4], [1, 3], [4, 4], [2, 5], [3, 4], [1, 2], [2, 3], [3, 3], [1, 4], [2, 3]].map((r) => r.join(',')).join('\n') + '\n';

let app: FastifyInstance;
let work: string;
beforeEach(() => {
  app = buildApp({ dataDir: ':memory:' });
  work = mkdtempSync(join(tmpdir(), 'sa-extra-'));
});
afterEach(async () => {
  await app.close();
  rmSync(work, { recursive: true, force: true });
});

async function upload(content: string, name = 'veri.csv') {
  const boundary = '----saextra';
  const payload = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: text/csv\r\n\r\n${content}\r\n--${boundary}--\r\n`);
  const r = await app.inject({ method: 'POST', url: '/api/datasets', payload, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } });
  expect(r.statusCode).toBeLessThan(300);
  return r.json().id as string;
}
const analyze = async (payload: Record<string, unknown>) => app.inject({ method: 'POST', url: '/api/analyses?save=false', payload });

/** Analizi kaydeder, kodu çalıştırır, çıktıyı beklenenle karşılaştırır. */
async function verify(datasetId: string, name: string, body: Record<string, unknown>) {
  const created = await app.inject({ method: 'POST', url: '/api/analyses', payload: { datasetId, ...body } });
  expect(created.statusCode, created.body).toBe(201);
  const id = created.json().id as string;
  const code = (await app.inject({ url: `/api/analyses/${id}/code` })).json();
  writeFileSync(join(work, name), (await app.inject({ url: `/api/datasets/${datasetId}/download` })).rawPayload);
  writeFileSync(join(work, code.filename), code.code);
  const out = execFileSync(PY, [code.filename], { cwd: work, encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, timeout: 90_000 });
  expect(out.trim().split(/\r?\n/)).toEqual(code.expectedOutput);
  return created.json().result;
}

describe('eşleşmiş kategorik testler', () => {
  it('2 koşul: ki-kare yerine McNemar önerilir', async () => {
    const id = await upload(yesNo);
    const r = await analyze({ datasetId: id, goal: 'compare', design: 'paired', target: 'categorical', conditions: ['once', 'sonra'] });
    expect(r.statusCode, r.body).toBeLessThan(300);
    const j = r.json().result;
    expect(j.decision.finalTest).toBe('McNemar testi');
    expect(j.outcome.p).toBeCloseTo(0.0213, 4); // b = 13, c = 3 (statsmodels exact)
    expect(j.binaryLevels).toEqual(['evet', 'hayır']);
  });
  it('3 koşul: Cochran Q ve ikili McNemar post-hoc', async () => {
    const id = await upload(yesNo);
    const r = await analyze({ datasetId: id, goal: 'compare', design: 'paired', target: 'categorical', conditions: ['once', 'sonra', 'sonra2'] });
    const j = r.json().result;
    expect(j.decision.finalTest).toBe('Cochran Q testi');
    expect(j.outcome.statistic.df).toEqual([2]);
    expect(j.outcome.postHoc === undefined || j.outcome.postHoc.method.includes('McNemar')).toBe(true);
  });
  it('ikiden fazla düzeyli sütunda anlaşılır hata verir', async () => {
    const id = await upload('a,b\nx,x\ny,x\nz,y\nx,z\n');
    const r = await analyze({ datasetId: id, goal: 'compare', design: 'paired', target: 'categorical', conditions: ['a', 'b'] });
    expect(r.statusCode).toBe(422);
    expect(r.json().error.message).toMatch(/ikili sonuç/);
  });
  pyIt('Python kodu McNemar çıktısını birebir yeniden üretir', { timeout: 120_000 }, async () => {
    const id = await upload(yesNo, 'evethayir.csv');
    await verify(id, 'evethayir.csv', { goal: 'compare', design: 'paired', target: 'categorical', conditions: ['once', 'sonra'] });
  });
  pyIt('Python kodu Cochran Q ve ikili McNemar çiftlerini birebir yeniden üretir', { timeout: 120_000 }, async () => {
    const id = await upload(yesNo, 'evethayir3.csv');
    await verify(id, 'evethayir3.csv', { goal: 'compare', design: 'paired', target: 'categorical', conditions: ['once', 'sonra', 'sonra2'] });
  });
});

describe('alternatifi çalıştır', () => {
  it('Kendall tau: korelasyonun alternatifi olarak çalışır ve öneri ilk alternatif olur', async () => {
    const id = await upload(pairsXY);
    const base = (await analyze({ datasetId: id, goal: 'relate', design: 'unknown', target: 'continuous', x: 'x', y: 'y' })).json().result;
    const r = (await analyze({ datasetId: id, goal: 'relate', design: 'unknown', target: 'continuous', x: 'x', y: 'y', test: 'Kendall tau' })).json().result;
    expect(r.outcome.test).toBe('Kendall tau');
    expect(r.outcome.statistic.value).toBeCloseTo(0.6364, 3);
    expect(r.outcome.p).toBeCloseTo(0.003182, 5);
    expect(r.decision.alternatives[0].test).toBe(base.decision.finalTest);
    expect(r.references.some((x: string) => x.includes('Kendall'))).toBe(true);
  });
  it('alternatif olmayan test reddedilir', async () => {
    const id = await upload(pairsXY);
    const r = await analyze({ datasetId: id, goal: 'relate', design: 'unknown', target: 'continuous', x: 'x', y: 'y', test: 'Mann-Whitney U testi' });
    expect(r.statusCode).toBe(422);
    expect(r.json().error.message).toMatch(/alternatifi değil/);
  });
  it('işaret testi: Wilcoxon’un alternatifi', async () => {
    const id = await upload(ordPaired);
    const base = (await analyze({ datasetId: id, goal: 'compare', design: 'paired', target: 'ordinal', conditions: ['a', 'b'] })).json().result;
    expect(base.decision.finalTest).toBe('Wilcoxon işaretli sıra testi');
    const r = (await analyze({ datasetId: id, goal: 'compare', design: 'paired', target: 'ordinal', conditions: ['a', 'b'], test: 'İşaret testi' })).json().result;
    expect(r.outcome.test).toBe('İşaret testi');
    expect(r.outcome.n).toBe(10); // 3 sıfır fark atılır
  });
  it('önerinin diğer alternatifleri de çalıştırılabilir (eşleştirilmiş t-testi)', async () => {
    const id = await upload(ordPaired);
    const r = (await analyze({ datasetId: id, goal: 'compare', design: 'paired', target: 'ordinal', conditions: ['a', 'b'], test: 'Eşleştirilmiş t-testi' })).json().result;
    expect(r.outcome.test).toBe('Eşleştirilmiş t-testi');
  });
  it('henüz uygulanmamış alternatif (Permütasyon ANOVA) anlaşılır hata verir', async () => {
    const skew = ['v,g', ...['a', 'b', 'c'].flatMap((g, k) => Array.from({ length: 10 }, (_, i) => `${Math.round(Math.exp(i / 2 + k) * 10) / 10},${g}`))].join('\n') + '\n';
    const id = await upload(skew, 'carpik.csv');
    const base = (await analyze({ datasetId: id, goal: 'compare', design: 'independent', target: 'continuous', value: 'v', group: 'g' })).json().result;
    expect(base.decision.finalTest).toBe('Kruskal-Wallis H testi');
    const r = await analyze({ datasetId: id, goal: 'compare', design: 'independent', target: 'continuous', value: 'v', group: 'g', test: 'Permütasyon ANOVA' });
    expect(r.statusCode).toBe(422);
    expect(r.json().error.message).toMatch(/henüz uygulamada çalıştırılamıyor/);
  });
  pyIt('Python kodu Kendall tau çıktısını birebir yeniden üretir', { timeout: 120_000 }, async () => {
    const id = await upload(pairsXY, 'xy.csv');
    await verify(id, 'xy.csv', { goal: 'relate', design: 'unknown', target: 'continuous', x: 'x', y: 'y', test: 'Kendall tau' });
  });
  pyIt('Python kodu işaret testi çıktısını birebir yeniden üretir', { timeout: 120_000 }, async () => {
    const id = await upload(ordPaired, 'ord.csv');
    await verify(id, 'ord.csv', { goal: 'compare', design: 'paired', target: 'ordinal', conditions: ['a', 'b'], test: 'İşaret testi' });
  });
});
