/**
 * "Kod = ekrandaki sonuç" garantisi (R, modeller ve temizleme): üretilen R betiği gerçekten çalıştırılır;
 * regresyon ve lojistikte çıktısı beklenen çıktıyla birebir, temizlemede yazdığı CSV uygulamanın temizlediği
 * veriyle (sayılarda 1e-6 toleransla) karşılaştırılır. R bulunmayan ortamlarda atlanır.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { gaussian, mulberry32 } from '@statadvisor/shared';
import { buildApp } from './app.ts';

function findRscript(): string {
  if (process.env.STATADVISOR_RSCRIPT) return process.env.STATADVISOR_RSCRIPT;
  if (spawnSync('Rscript', ['--version']).status === 0) return 'Rscript';
  const base = 'C:/Program Files/R';
  if (existsSync(base)) {
    const v = readdirSync(base).filter((d) => d.startsWith('R-')).sort().reverse()[0];
    if (v && existsSync(join(base, v, 'bin', 'Rscript.exe'))) return join(base, v, 'bin', 'Rscript.exe');
  }
  return '';
}
const RS = findRscript();
const hasR = RS !== '' && spawnSync(RS, ['-e', '1'], { encoding: 'utf8' }).status === 0;
if (!hasR) console.warn('UYARI: R bulunamadı; regresyon/lojistik/temizleme R kodunun doğrulama testleri atlanıyor.');
const suite = hasR ? describe : describe.skip;

const rng = mulberry32(5);
const regRows = Array.from({ length: 120 }, (_, i) => {
  const yas = Math.round(20 + 40 * rng());
  const gelir = Math.round((yas * 30 + 400 * gaussian(rng) + 2000) * 10) / 10;
  const grup = ['A', 'B', 'C'][i % 3]!;
  const cins = (i * 7) % 5 < 2 ? 1 : 2;
  const puan = Math.round((10 + 0.3 * yas + 0.002 * gelir + (grup === 'B' ? 4 : grup === 'C' ? -3 : 0) + (cins === 2 ? 2 : 0) + 3 * gaussian(rng)) * 100) / 100;
  return { yas, gelir, grup, cins, puan };
});
const regCsv =
  'yas,gelir,grup,cinsiyet,puan\n' +
  regRows.map((r, i) => [i === 4 ? '' : r.yas, r.gelir, r.grup, i === 9 ? '' : r.cins, i === 14 ? 'NA' : r.puan].join(',')).join('\n') +
  '\n';

const rng2 = mulberry32(9);
const logRows = Array.from({ length: 240 }, (_, i) => {
  const yas = Math.round(20 + 45 * rng2());
  const skor = Math.round((50 + 10 * gaussian(rng2)) * 10) / 10;
  const grup = ['A', 'B', 'C'][i % 3]!;
  const eta = -4 + 0.06 * yas + 0.03 * (skor - 50) + (grup === 'B' ? 0.9 : grup === 'C' ? -0.6 : 0);
  const basari = rng2() < 1 / (1 + Math.exp(-eta)) ? 1 : 0;
  return { yas, skor, grup, basari, durum: basari ? 'evet' : 'hayır' };
});
const logCsv =
  'yas,skor,grup,basari,durum\n' + logRows.map((r, i) => [i === 5 ? '' : r.yas, r.skor, r.grup, i === 11 ? 'NA' : r.basari, r.durum].join(',')).join('\n') + '\n';

let app: FastifyInstance;
let work: string;
beforeEach(() => {
  app = buildApp({ dataDir: ':memory:' });
  work = mkdtempSync(join(tmpdir(), 'sa-rm-'));
});
afterEach(async () => {
  await app.close();
  rmSync(work, { recursive: true, force: true });
});

async function upload(content: string, name: string) {
  const boundary = '----sarm';
  const payload = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: text/csv\r\n\r\n${content}\r\n--${boundary}--\r\n`);
  const r = await app.inject({ method: 'POST', url: '/api/datasets', payload, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } });
  expect(r.statusCode).toBeLessThan(300);
  return r.json().id as string;
}

async function stage(id: string, code: { filename: string; code: string }) {
  const ds = (await app.inject({ url: `/api/datasets/${id}` })).json();
  writeFileSync(join(work, ds.name), (await app.inject({ url: `/api/datasets/${id}/download` })).rawPayload);
  writeFileSync(join(work, code.filename), code.code);
}
const runR = (filename: string) => execFileSync(RS, [filename], { cwd: work, encoding: 'utf8', timeout: 90_000 });

suite('regresyon: üretilen R kodu ekrandaki sonuçla birebir aynıdır', () => {
  async function verify(b: Record<string, unknown>) {
    const id = await upload(regCsv, 'reg.csv');
    const j = (await app.inject({ method: 'POST', url: `/api/datasets/${id}/regression`, payload: b })).json();
    expect(j.codeR).toBeTruthy();
    await stage(id, j.codeR);
    expect(runR(j.codeR.filename).trim().split(/\r?\n/)).toEqual(j.codeR.expectedOutput);
  }
  const body = { dependent: 'puan', numeric: ['yas', 'gelir'], categorical: ['grup', 'cinsiyet'] };
  it('sayısal + kategorik yordayıcılar, eksik değerler', { timeout: 120_000 }, () => verify(body));
  it('yalnızca sayısal yordayıcı', { timeout: 120_000 }, () => verify({ dependent: 'puan', numeric: ['yas'], categorical: [] }));
  it('farklı referans düzey ve sayısal kodlu kategorik', { timeout: 120_000 }, () => verify({ ...body, reference: { grup: 'B', cinsiyet: '2' } }));
});

suite('lojistik regresyon: üretilen R kodu ekrandaki sonuçla birebir aynıdır', () => {
  async function verify(b: Record<string, unknown>) {
    const id = await upload(logCsv, 'logit.csv');
    const j = (await app.inject({ method: 'POST', url: `/api/datasets/${id}/logistic`, payload: b })).json();
    expect(j.codeR).toBeTruthy();
    await stage(id, j.codeR);
    expect(runR(j.codeR.filename).trim().split(/\r?\n/)).toEqual(j.codeR.expectedOutput);
  }
  const body = { dependent: 'basari', numeric: ['yas', 'skor'], categorical: ['grup'] };
  it('sayısal 0/1 sonuç, sayısal + kategorik yordayıcı, eksik değerler', { timeout: 120_000 }, () => verify(body));
  it('metin etiketli sonuç ve seçilen olay düzeyi', { timeout: 120_000 }, () => verify({ ...body, dependent: 'durum', eventLevel: 'evet' }));
  it('yalnızca sayısal yordayıcı ve farklı referans düzey', { timeout: 120_000 }, () => verify({ dependent: 'basari', numeric: ['skor'], categorical: ['grup'], reference: { grup: 'B' } }));
});

suite('temizleme: üretilen R kodu, uygulamanın temizlediği veriyi yeniden üretir', () => {
  const table = (text: string) => text.trim().split(/\r?\n/).map((l) => l.split(','));

  async function runCleaning(datasetId: string, query: string) {
    const code = (await app.inject({ url: `/api/datasets/${datasetId}/cleaning-code?${query}&lang=r` })).json();
    await stage(datasetId, code);
    runR(code.filename);
    return readFileSync(join(work, 'temizlenmis.csv'), 'utf8');
  }
  function compare(appCsv: string[][], rCsv: string[][]) {
    expect(rCsv[0]).toEqual(appCsv[0]);
    expect(rCsv.length).toBe(appCsv.length);
    let maxDiff = 0;
    for (let i = 1; i < appCsv.length; i++) {
      for (let j = 0; j < appCsv[i]!.length; j++) {
        const a = appCsv[i]![j]!;
        const b = rCsv[i]![j]!;
        const na = Number(a);
        const nb = Number(b);
        if (a === '' || b === '' || Number.isNaN(na) || Number.isNaN(nb)) expect(b, `satır ${i}, sütun ${appCsv[0]![j]}`).toBe(a);
        else maxDiff = Math.max(maxDiff, Math.abs(na - nb));
      }
    }
    expect(maxDiff).toBeLessThan(1e-6);
  }

  for (const impute of ['median', 'knn'] as const) {
    it(`aykırı satırları çıkarma + ${impute} doldurma (klinik örnek)`, { timeout: 120_000 }, async () => {
      const id = (await app.inject({ method: 'POST', url: '/api/samples/klinik' })).json().id as string;
      const clean = (await app.inject({ method: 'POST', url: `/api/datasets/${id}/clean`, payload: { outlierColumns: ['kan_basinci', 'biyobelirtec_x'], impute } })).json();
      const appCsv = table((await app.inject({ url: `/api/datasets/${clean.id}/download` })).body);
      compare(appCsv, table(await runCleaning(id, `clean=kan_basinci,biyobelirtec_x&impute=${impute}`)));
    });
  }

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
    it(`karma kurallar (geçersiz hücre + uç değer; eksik işaretle + satır sil) + ${impute}`, { timeout: 120_000 }, async () => {
      const id = await upload(mixedCsv(), 'karma.csv');
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
      const appCsv = table((await app.inject({ url: `/api/datasets/${clean.json().id}/download` })).body);
      compare(appCsv, table(await runCleaning(id, `rulesJson=${encodeURIComponent(JSON.stringify(rules))}&impute=${impute}`)));
    });
  }
});
