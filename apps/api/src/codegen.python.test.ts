/**
 * "Kod = ekrandaki sonuç" garantisi: üretilen Python betiği gerçekten çalıştırılır ve çıktısı, arayüzde
 * gösterilen beklenen çıktıyla birebir karşılaştırılır. Python (numpy, pandas, scipy, statsmodels,
 * scikit-posthocs, scikit-learn) bulunmayan ortamlarda bu testler atlanır; atlandığı çıktıda görünür.
 *
 * Python yolu: STATADVISOR_PYTHON ortam değişkeni ya da tools/reference/.venv.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
const hasPython =
  PY !== '' && spawnSync(PY, ['-c', 'import numpy, pandas, scipy, statsmodels, scikit_posthocs, sklearn'], { encoding: 'utf8' }).status === 0;
if (!hasPython) console.warn('UYARI: Python ortamı bulunamadı; üretilen kodun doğrulama testleri atlanıyor.');
const suite = hasPython ? describe : describe.skip;

const rng = mulberry32(11);
const g = (n: number, mu: number, s = 1) => Array.from({ length: n }, () => Math.round((mu + s * gaussian(rng)) * 100) / 100);
const csv = (header: string[], rows: (string | number)[][], sep = ',') => [header.join(sep), ...rows.map((r) => r.join(sep))].join('\n') + '\n';
const twoGroups = (a: number[], b: number[], sep = ',', dec = '.') =>
  csv(['grup', 'deger'], [...a.map((v) => ['kontrol', String(v).replace('.', dec)]), ...b.map((v) => ['tedavi', String(v).replace('.', dec)])], sep);

let app: FastifyInstance;
let work: string;
beforeEach(() => {
  app = buildApp({ dataDir: ':memory:' });
  work = mkdtempSync(join(tmpdir(), 'sa-py-'));
});
afterEach(async () => {
  await app.close();
  rmSync(work, { recursive: true, force: true });
});

async function sample(kind: string) {
  return (await app.inject({ method: 'POST', url: `/api/samples/${kind}` })).json().id as string;
}
async function uploadCsv(content: string, name = 'veri.csv') {
  const boundary = '----sapy';
  const payload = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: text/csv\r\n\r\n${content}\r\n--${boundary}--\r\n`);
  const r = await app.inject({ method: 'POST', url: '/api/datasets', payload, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } });
  expect(r.statusCode).toBeLessThan(300);
  return r.json().id as string;
}

/** Analizi kaydeder, kodu alır, dosyayı yazar, Python'da çalıştırır; çıktıyı beklenenle karşılaştırır. */
async function verify(datasetId: string, body: Record<string, unknown>) {
  const created = await app.inject({ method: 'POST', url: '/api/analyses', payload: { datasetId, ...body } });
  expect(created.statusCode, created.body).toBe(201);
  const analysis = created.json();
  const code = (await app.inject({ url: `/api/analyses/${analysis.id}/code` })).json();
  const ds = (await app.inject({ url: `/api/datasets/${datasetId}` })).json();
  writeFileSync(join(work, ds.name), (await app.inject({ url: `/api/datasets/${datasetId}/download` })).rawPayload);
  writeFileSync(join(work, code.filename), code.code);
  const out = execFileSync(PY, [code.filename], { cwd: work, encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, timeout: 90_000 });
  expect(out.trim().split(/\r?\n/)).toEqual(code.expectedOutput);
  return { analysis: analysis.result, code };
}

const cmp = (extra: Record<string, unknown>) => ({ goal: 'compare', design: 'independent', target: 'continuous', ...extra });

suite('üretilen Python kodu, ekrandaki sonucu birebir yeniden üretir', () => {
  const T = 120_000;

  it('3 grup, sürekli: klinik örnek (kan basıncı, biyobelirteç, yaş)', { timeout: T }, async () => {
    const id = await sample('klinik');
    for (const value of ['kan_basinci', 'biyobelirtec_x', 'yas']) {
      const { analysis } = await verify(id, cmp({ value, group: 'grup' }));
      expect(analysis.assumptions.length).toBe(2);
    }
  });

  it('2 grup normal: Welch t-testi', { timeout: T }, async () => {
    const id = await uploadCsv(twoGroups(g(40, 10, 2), g(55, 12, 3)));
    const { analysis } = await verify(id, cmp({ value: 'deger', group: 'grup' }));
    expect(analysis.outcome.test).toBe('Welch t-testi');
  });

  it('2 grup çarpık: Mann-Whitney U', { timeout: T }, async () => {
    const skew = (n: number, mu: number) => g(n, mu, 0.7).map((v) => Math.round(Math.exp(v) * 100) / 100);
    const id = await uploadCsv(twoGroups(skew(40, 1), skew(35, 1.5)));
    const { analysis } = await verify(id, cmp({ value: 'deger', group: 'grup' }));
    expect(analysis.outcome.test).toBe('Mann-Whitney U testi');
  });

  it('noktalı virgül ayraç ve ondalık virgül', { timeout: T }, async () => {
    const id = await uploadCsv(twoGroups(g(30, 5), g(30, 6), ';', ','), 'virgullu.csv');
    const { code } = await verify(id, cmp({ value: 'deger', group: 'grup' }));
    expect(code.code).toContain('decimal=","');
    expect(code.code).toContain('sep=";"');
  });

  it('3 grup normal, eşit olmayan varyans: Welch ANOVA ve ikili Welch post-hoc', { timeout: T }, async () => {
    const rows = [...g(40, 0, 1).map((v) => ['a', v]), ...g(50, 1.5, 1.5).map((v) => ['b', v]), ...g(45, 3, 0.8).map((v) => ['c', v])];
    const id = await uploadCsv(csv(['grup', 'y'], rows));
    const { analysis } = await verify(id, cmp({ value: 'y', group: 'grup' }));
    expect(analysis.outcome.test).toBe('Welch ANOVA');
    expect(analysis.outcome.postHoc?.pairs).toHaveLength(3);
  });

  it('ilişki: Pearson ve Spearman', { timeout: T }, async () => {
    const id = await sample('klinik');
    await verify(id, { goal: 'relate', design: 'independent', target: 'continuous', x: 'yas', y: 'kan_basinci' });
    await verify(id, { goal: 'relate', design: 'independent', target: 'continuous', x: 'kan_basinci', y: 'biyobelirtec_x' });
  });

  it('eşleşmiş 2 ve 3 koşul (tedavi örneği)', { timeout: T }, async () => {
    const id = await sample('tedavi');
    await verify(id, { goal: 'compare', design: 'paired', target: 'continuous', conditions: ['baslangic', 'ay_3'] });
    await verify(id, { goal: 'compare', design: 'paired', target: 'continuous', conditions: ['baslangic', 'ay_1', 'ay_3'] });
  });

  it('eşleşmiş çarpık veri: Wilcoxon ve Friedman', { timeout: T }, async () => {
    const base = g(35, 0, 0.8).map((v) => Math.exp(v));
    const rows = base.map((b, i) => [i + 1, +(b).toFixed(3), +(b * 1.4 * Math.exp(gaussian(rng) * 0.5)).toFixed(3), +(b * 1.9 * Math.exp(gaussian(rng) * 0.5)).toFixed(3)]);
    const id = await uploadCsv(csv(['id', 't0', 't1', 't2'], rows));
    const w = await verify(id, { goal: 'compare', design: 'paired', target: 'continuous', conditions: ['t0', 't1'] });
    expect(['Wilcoxon işaretli sıra testi', 'Eşleştirilmiş t-testi']).toContain(w.analysis.outcome.test);
    const f = await verify(id, { goal: 'compare', design: 'paired', target: 'continuous', conditions: ['t0', 't1', 't2'] });
    expect(['Friedman testi', 'Tekrarlı ölçümler ANOVA']).toContain(f.analysis.outcome.test);
  });

  it('sıralı hedef ve kategorik tablolar (anket örneği)', { timeout: T }, async () => {
    const id = await sample('anket');
    const ord = await verify(id, cmp({ target: 'ordinal', value: 'memnuniyet', group: 'bolum' }));
    expect(ord.analysis.outcome.test).toBe('Kruskal-Wallis H testi');
    await verify(id, cmp({ target: 'categorical', group: 'bolum', value: 'tavsiye' }));
  });

  it('kodlu Likert etiketleri ("2:Bazen katılıyorum") sıralı sayıya çevrilir ve kod aynısını yapar', { timeout: T }, async () => {
    const labels = ['Hiç katılmıyorum', 'Çok az katılıyorum', 'Bazen katılıyorum', 'Genellikle katılıyorum', 'Tamamen katılıyorum'];
    const rows = Array.from({ length: 90 }, (_, i) => {
      const grup = ['kadın', 'erkek'][i % 2]!;
      const k = Math.min(4, Math.max(0, Math.round(2 + (grup === 'erkek' ? 0.8 : 0) + gaussian(rng))));
      return [grup, `${k}:${labels[k]}`];
    });
    const id = await uploadCsv(csv(['cinsiyet', 'madde'], rows), 'likert.csv');
    const ds = (await app.inject({ url: `/api/datasets/${id}` })).json();
    expect(ds.columns.find((c: { name: string }) => c.name === 'madde')).toMatchObject({ type: 'ordinal', numeric: true, prefixCoded: true });
    const { code } = await verify(id, cmp({ target: 'ordinal', value: 'madde', group: 'cinsiyet' }));
    expect(code.code).toContain('KODLU');
  });

  it('aralık etiketleri ("18-23", "1 saatten az", "7 ve üzeri") sıralanır ve kod aynısını yapar', { timeout: T }, async () => {
    const sure = ['4-6', '1 saatten az', '7 ve üzeri', '1-3 saat'];
    const yas = ['30-35', '18-23', '24-29'];
    const rows = Array.from({ length: 120 }, (_, i) => {
      const k = Math.min(3, Math.max(0, Math.round(1.5 + (i % 2) * 0.9 + gaussian(rng))));
      return [['kadın', 'erkek'][i % 2]!, sure[[1, 3, 0, 2][k]!]!, yas[i % 3]!];
    });
    const id = await uploadCsv(csv(['cinsiyet', 'sure', 'yas'], rows), 'araliklar.csv');
    const ds = (await app.inject({ url: `/api/datasets/${id}` })).json();
    expect(ds.columns.find((c: { name: string }) => c.name === 'sure')).toMatchObject({ type: 'ordinal', numeric: true, rankLabels: ['1 saatten az', '1-3 saat', '4-6', '7 ve üzeri'] });
    expect(ds.columns.find((c: { name: string }) => c.name === 'yas')).toMatchObject({ type: 'ordinal', rankLabels: ['18-23', '24-29', '30-35'] });
    expect(ds.columns.find((c: { name: string }) => c.name === 'cinsiyet')).toMatchObject({ type: 'categorical' });
    const { code } = await verify(id, cmp({ target: 'ordinal', value: 'sure', group: 'cinsiyet' }));
    expect(code.code).toContain('SIRALI');
  });

  it('ölçek puanları: ters madde, toplam/ortalama, eksik kuralı ve Cronbach alfa Python ile eşleşir; sonuç sütunu analiz edilebilir', { timeout: T }, async () => {
    const rows = Array.from({ length: 80 }, (_, i) => {
      const latent = gaussian(rng);
      const item = (rev = false) => {
        const v = Math.min(4, Math.max(0, Math.round(2 + latent + 0.7 * gaussian(rng))));
        return rev ? 4 - v : v;
      };
      const cell = (v: number, miss: boolean) => (miss ? '' : v);
      return [['kadın', 'erkek'][i % 2]!, item(), item(), cell(item(), i % 11 === 0), item(true), item(), cell(item(), i % 7 === 0), item()];
    });
    const header = ['cinsiyet', 'a1', 'a2', 'a3', 'a4', 'b1', 'b2', 'b3'];
    const id = await uploadCsv(csv(header, rows), 'olcek.csv');
    const scales = [
      { name: 'A_puan', items: ['a1', 'a2', 'a3', 'a4'], reverse: ['a4'], method: 'mean', min: 0, max: 4, minValidShare: 0.75 },
      { name: 'B_toplam', items: ['b1', 'b2', 'b3'], reverse: [], method: 'sum', min: 0, max: 4, minValidShare: 1 },
    ];
    const made = await app.inject({ method: 'POST', url: `/api/datasets/${id}/scales`, payload: { scales } });
    expect(made.statusCode, made.body).toBe(201);
    const child = made.json();
    expect(child.columns.find((c: { name: string }) => c.name === 'A_puan')).toMatchObject({ type: 'continuous', numeric: true });
    const code = (await app.inject({ method: 'POST', url: `/api/datasets/${id}/scales-code`, payload: { scales } })).json();
    const ds = (await app.inject({ url: `/api/datasets/${id}` })).json();
    writeFileSync(join(work, ds.name), (await app.inject({ url: `/api/datasets/${id}/download` })).rawPayload);
    writeFileSync(join(work, code.filename), code.code);
    const out = execFileSync(PY, [code.filename], { cwd: work, encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, timeout: 90_000 });
    expect(out.trim().split(/\r?\n/)).toEqual(code.expectedOutput);
    expect(code.expectedOutput[0]).toMatch(/alfa: 0\.\d{4} n_alfa: \d+/);
    const { analysis } = await verify(child.id, cmp({ value: 'A_puan', group: 'cinsiyet' }));
    expect(['Welch t-testi', 'Mann-Whitney U testi']).toContain(analysis.outcome.test);
    const bad = await app.inject({ method: 'POST', url: `/api/datasets/${id}/scales`, payload: { scales: [{ ...scales[0], max: 3 }] } });
    expect(bad.statusCode).toBe(422);
  });

  it('normallik çarpıklık-basıklık ölçütüyle (±1.5 ve ±2) değerlendirilir; Python aynı değerleri üretir', { timeout: T }, async () => {
    const skew = (n: number, mu: number) => g(n, mu, 0.9).map((v) => Math.round(Math.exp(v) * 100) / 100);
    const id = await uploadCsv(twoGroups(skew(60, 1), skew(55, 1.3)));
    const a = await verify(id, cmp({ value: 'deger', group: 'grup', normality: 'skewkurt-1.5' }));
    const card = a.analysis.assumptions.find((x: { name: string }) => x.name === 'Çarpıklık-Basıklık');
    expect(card).toBeDefined();
    expect(a.analysis.assumptions.some((x: { name: string }) => x.name === 'Shapiro-Wilk')).toBe(false);
    expect(a.analysis.outcome.test).toBe(card.passed ? 'Welch t-testi' : 'Mann-Whitney U testi');
    expect(a.analysis.references.join(' ')).toContain('Tabachnick');
    expect(a.code.code).toContain('stats.kurtosis');
    const normalId = await uploadCsv(twoGroups(g(50, 10, 2), g(50, 11, 2)), 'normal.csv');
    const b = await verify(normalId, cmp({ value: 'deger', group: 'grup', normality: 'skewkurt-2' }));
    expect(b.analysis.outcome.test).toBe('Welch t-testi');
    expect(b.analysis.descriptives[0]).toHaveProperty('kurtosis');
  });

  it('anket taraması: düz çizgi ve Mahalanobis Python ile eşleşir; uygulama işaretli satırları çıkarır', { timeout: T }, async () => {
    const items = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'];
    const rows = Array.from({ length: 150 }, (_, i) => {
      if (i % 25 === 3) return [`k${i}`, ...items.map(() => 2)]; // düz çizgi
      if (i === 40) return [`k${i}`, 4, 0, 4, 0, 4, 0]; // tutarsız örüntü
      const latent = gaussian(rng);
      return [`k${i}`, ...items.map(() => Math.min(4, Math.max(0, Math.round(2 + latent + 0.6 * gaussian(rng)))))];
    });
    rows[7]![3] = '';
    const id = await uploadCsv(csv(['kisi', ...items], rows), 'tarama.csv');
    const body = { items, straightLine: true, mahalanobis: true };
    const res = (await app.inject({ method: 'POST', url: `/api/datasets/${id}/screen`, payload: body })).json();
    expect(res.complete).toBe(149);
    expect(res.straightLiners).toEqual(expect.arrayContaining([3, 28, 53, 78, 103, 128]));
    expect(res.straightLiners).not.toContain(7);
    expect(res.mahalanobis.map((m: { row: number }) => m.row)).toContain(40);
    const code = (await app.inject({ method: 'POST', url: `/api/datasets/${id}/screen-code`, payload: body })).json();
    const ds = (await app.inject({ url: `/api/datasets/${id}` })).json();
    writeFileSync(join(work, ds.name), (await app.inject({ url: `/api/datasets/${id}/download` })).rawPayload);
    writeFileSync(join(work, code.filename), code.code);
    const out = execFileSync(PY, [code.filename], { cwd: work, encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, timeout: 90_000 });
    expect(out.trim().split(/\r?\n/)).toEqual(code.expectedOutput);
    const applied = await app.inject({ method: 'POST', url: `/api/datasets/${id}/screen/apply`, payload: body });
    expect(applied.statusCode, applied.body).toBe(201);
    expect(applied.json().rows).toBe(150 - res.flagged.length);
    const bad = await app.inject({ method: 'POST', url: `/api/datasets/${id}/screen`, payload: { items: ['m1', 'kisi'], straightLine: true, mahalanobis: false } });
    expect(bad.statusCode).toBe(422);
  });

  it('küçük 2×2 tablo: Fisher kesin testi', { timeout: T }, async () => {
    const rows = [...Array(7).fill(['a', 'evet']), ...Array(2).fill(['a', 'hayir']), ...Array(1).fill(['b', 'evet']), ...Array(8).fill(['b', 'hayir'])];
    const id = await uploadCsv(csv(['grup', 'sonuc'], rows));
    const { analysis } = await verify(id, cmp({ target: 'categorical', group: 'grup', value: 'sonuc' }));
    expect(analysis.outcome.test).toBe('Fisher kesin testi');
  });

  it('eksik değerli satırlar kodla aynı şekilde atılır', { timeout: T }, async () => {
    const rows = [...g(30, 5).map((v, i) => ['a', i % 9 === 0 ? 'NA' : v]), ...g(30, 7).map((v, i) => ['b', i % 7 === 0 ? '' : v])];
    const id = await uploadCsv(csv(['grup', 'y'], rows));
    const { analysis } = await verify(id, cmp({ value: 'y', group: 'grup' }));
    expect(analysis.notes.join(' ')).toContain('eksik değer');
  });

  const hasOpenpyxl = hasPython && spawnSync(PY, ['-c', 'import openpyxl'], { encoding: 'utf8' }).status === 0;
  it.skipIf(!hasOpenpyxl)('Excel (.xlsx): dönüştürülen CSV pandas.read_excel ile birebir aynı; analiz kodu bu CSV üzerinde ekranla eşleşir', { timeout: T }, async () => {
    // openpyxl ile Google Forms dışa aktarımına benzer bir dosya: zaman damgası, Türkçe etiketler, kodlu Likert, eksik hücre.
    const make = `
import openpyxl, datetime, random
random.seed(5)
wb = openpyxl.Workbook(); ws = wb.active; ws.title = 'Form Yanıtları 1'
ws.append(['Zaman damgası', 'Cinsiyetiniz', 'Günlük kullanım süresi', 'Madde 1: Başkalarını incitmek bazen haklıdır', 'Puan'])
labels = ['Hiç katılmıyorum', 'Katılmıyorum', 'Bazen katılıyorum', 'Katılıyorum', 'Tamamen katılıyorum']
sure = ['1 saatten az', '1-3 saat', '4-6 saat', '7 saat ve üzeri']
for i in range(80):
    g = 'Kadın' if i % 2 else 'Erkek'
    k = max(0, min(4, round(2 + (0.8 if g == 'Erkek' else 0) + random.gauss(0, 1))))
    ws.append([datetime.datetime(2026, 3, 1, 9, 0, 0) + datetime.timedelta(minutes=37 * i, seconds=i), g, sure[i % 4], f'{k}:{labels[k]}', None if i % 17 == 0 else round(random.gauss(50 + (4 if g == 'Erkek' else 0), 10), 2)])
wb.save('anket.xlsx')
`;
    execFileSync(PY, ['-c', make], { cwd: work, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
    const boundary = '----sapyx';
    const payload = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="anket.xlsx"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`),
      readFileSync(join(work, 'anket.xlsx')),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const up = await app.inject({ method: 'POST', url: '/api/datasets', payload, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } });
    expect(up.statusCode, up.body).toBe(201);
    const ds = up.json();
    expect(ds.name).toBe('anket.csv');
    const type = (n: string) => ds.columns.find((c: { name: string }) => c.name === n)?.type;
    expect([type('Cinsiyetiniz'), type('Günlük kullanım süresi'), type('Madde 1: Başkalarını incitmek bazen haklıdır'), type('Puan')]).toEqual(['categorical', 'ordinal', 'ordinal', 'continuous']);

    writeFileSync(join(work, 'anket.csv'), (await app.inject({ url: `/api/datasets/${ds.id}/download` })).rawPayload);
    const compare = `
import pandas as pd, numpy as np
x = pd.read_excel('anket.xlsx')
c = pd.read_csv('anket.csv')
assert list(x.columns) == list(c.columns), (list(x.columns), list(c.columns))
assert len(x) == len(c), (len(x), len(c))
for col in x.columns:
    a, b = x[col], c[col]
    if pd.api.types.is_datetime64_any_dtype(a):
        assert (a.dt.strftime('%Y-%m-%d %H:%M:%S') == b).all(), col
    elif pd.api.types.is_numeric_dtype(a):
        assert np.allclose(a.to_numpy(float), b.to_numpy(float), equal_nan=True), col
    else:
        assert (a.fillna('') == b.fillna('')).all(), col
print('AYNI')
`;
    expect(execFileSync(PY, ['-c', compare], { cwd: work, encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } }).trim()).toBe('AYNI');

    await verify(ds.id, cmp({ target: 'ordinal', value: 'Madde 1: Başkalarını incitmek bazen haklıdır', group: 'Cinsiyetiniz' }));
    await verify(ds.id, cmp({ value: 'Puan', group: 'Cinsiyetiniz' }));
  });
});

suite('üretilen temizleme kodu, uygulamanın temizlediği veriyi yeniden üretir', () => {
  async function runCleaning(datasetId: string, query: string) {
    const code = (await app.inject({ url: `/api/datasets/${datasetId}/cleaning-code?${query}` })).json();
    const ds = (await app.inject({ url: `/api/datasets/${datasetId}` })).json();
    writeFileSync(join(work, ds.name), (await app.inject({ url: `/api/datasets/${datasetId}/download` })).rawPayload);
    writeFileSync(join(work, code.filename), code.code);
    execFileSync(PY, [code.filename], { cwd: work, encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, timeout: 90_000 });
    return readFileSync(join(work, 'temizlenmis.csv'), 'utf8');
  }
  const table = (text: string) => text.trim().split(/\r?\n/).map((l) => l.split(','));

  for (const impute of ['median', 'knn'] as const) {
    it(`aykırı satırları çıkarma + ${impute} doldurma`, { timeout: 120_000 }, async () => {
      const id = await sample('klinik');
      const clean = (await app.inject({ method: 'POST', url: `/api/datasets/${id}/clean`, payload: { outlierColumns: ['kan_basinci', 'biyobelirtec_x'], impute } })).json();
      const appCsv = table((await app.inject({ url: `/api/datasets/${clean.id}/download` })).body);
      const pyCsv = table(await runCleaning(id, `clean=kan_basinci,biyobelirtec_x&impute=${impute}`));
      expect(pyCsv[0]).toEqual(appCsv[0]);
      expect(pyCsv.length).toBe(appCsv.length);
      expect(clean.rows).toBe(appCsv.length - 1);
      let maxDiff = 0;
      for (let i = 1; i < appCsv.length; i++) {
        for (let j = 0; j < appCsv[i]!.length; j++) {
          const a = appCsv[i]![j]!;
          const b = pyCsv[i]![j]!;
          const na = Number(a);
          const nb = Number(b);
          if (a === '' || b === '' || Number.isNaN(na) || Number.isNaN(nb)) expect(b).toBe(a);
          else maxDiff = Math.max(maxDiff, Math.abs(na - nb));
        }
      }
      expect(maxDiff).toBeLessThan(1e-6);
    });
  }

  /** Karma kurallı veri: sıralı madde, sayısal kodlu ve metin kategorik, sürekli ölçümler; eksik değerler dağınık. */
  function mixedCsv() {
    const lines = ['id,grup,m1,kod,sehir,puan,olcum'];
    for (let i = 0; i < 120; i++) {
      const m1 = i === 6 ? 9 : i === 17 ? 0 : i % 13 === 0 ? '' : 1 + (i % 5);
      const kod = i === 4 ? 3 : i % 17 === 0 ? '' : 1 + (i % 2);
      const sehir = i === 8 ? 'X' : i % 19 === 0 ? '' : ['A', 'B', 'C'][i % 3];
      const puan = i === 10 ? 999 : i === 11 ? 99 : i % 23 === 0 ? '' : (50 + (i % 9) * 1.3 + (i % 4) * 0.2 + i * 0.00731).toFixed(4);
      const olcum = i === 20 ? 250 : i === 21 ? 300 : i % 29 === 0 ? '' : (80 + (i % 7) * 1.1 + (i % 3) * 0.3 + i * 0.00917).toFixed(4);
      lines.push(`${i + 1},${['K', 'T'][i % 2]},${m1},${kod},${sehir},${puan},${olcum}`);
    }
    return lines.join('\n') + '\n';
  }

  for (const impute of ['none', 'median', 'knn'] as const) {
    it(`karma kurallar (geçersiz hücre + uç değer; eksik işaretle + satır sil) + ${impute === 'none' ? 'doldurma yok' : impute + ' doldurma'}`, { timeout: 120_000 }, async () => {
      const id = await uploadCsv(mixedCsv());
      const prof = await app.inject({
        method: 'PUT',
        url: `/api/datasets/${id}/profile`,
        payload: { columns: { m1: { validRange: { min: 1, max: 5 } }, kod: { type: 'categorical', validCategories: ['1', '2'] }, sehir: { validCategories: ['A', 'B', 'C'] }, puan: { validRange: { min: 0, max: 100 } } } },
      });
      expect(prof.statusCode, prof.body).toBe(200);
      const rules = [
        { column: 'm1', issue: 'invalid', action: 'setMissing' },
        { column: 'kod', issue: 'invalid', action: 'removeRow' },
        { column: 'sehir', issue: 'invalid', action: 'setMissing' },
        { column: 'puan', issue: 'invalid', action: 'setMissing' },
        { column: 'puan', issue: 'extreme', action: 'removeRow' },
        { column: 'olcum', issue: 'extreme', action: 'setMissing' },
      ];
      const clean = await app.inject({ method: 'POST', url: `/api/datasets/${id}/clean`, payload: { rules, impute } });
      expect(clean.statusCode, clean.body).toBe(201);
      const op = clean.json().operations;
      expect(op.removedRows).toBeGreaterThanOrEqual(2); // kod = 3 ve puan = 99 (geçerli ama uç)
      expect(op.setMissingCells).toBeGreaterThanOrEqual(3); // m1 = 9 ve 0, sehir = X, puan = 999, olcum uçları
      const appCsv = table((await app.inject({ url: `/api/datasets/${clean.json().id}/download` })).body);
      const pyCsv = table(await runCleaning(id, `rulesJson=${encodeURIComponent(JSON.stringify(rules))}&impute=${impute}`));
      expect(pyCsv[0]).toEqual(appCsv[0]);
      expect(pyCsv.length).toBe(appCsv.length);
      let maxDiff = 0;
      let worst = '';
      for (let i = 1; i < appCsv.length; i++) {
        for (let j = 0; j < appCsv[i]!.length; j++) {
          const a = appCsv[i]![j]!;
          const b = pyCsv[i]![j]!;
          const na = Number(a);
          const nb = Number(b);
          if (a === '' || b === '' || Number.isNaN(na) || Number.isNaN(nb)) expect(b, `satır ${i}, sütun ${appCsv[0]![j]}`).toBe(a);
          else if (Math.abs(na - nb) > maxDiff) {
            maxDiff = Math.abs(na - nb);
            worst = `satır ${i}, sütun ${appCsv[0]![j]}: uygulama ${a}, python ${b}`;
          }
        }
      }
      expect(maxDiff, worst).toBeLessThan(1e-6);
      if (impute === 'none') expect(appCsv.slice(1).some((r) => r.includes(''))).toBe(true); // doldurma yok: eksikler kaldı
      else expect(appCsv.slice(1).flat().filter((c) => c === '').length).toBeLessThan(5);
    });
  }
});
