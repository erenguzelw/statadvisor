/**
 * Üretilen Python/R betiklerinde kod enjeksiyonu denetimi: veri dosyasından gelen sütun adları ve kategori
 * değerleri (satır sonu, tırnak, yorum işareti içerse bile) yalnızca dize sabiti olarak betiğe girmelidir.
 * Kötü niyetli bir veri dosyası, kullanıcının çalıştırdığı betiğe kendi satırında komut ekleyememelidir.
 */
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.ts';

const MARK = 'ENJEKSIYON()';
const evil = (s: string) => `"${s}\n${MARK}\n#'"" ${MARK}"`;

const rows: string[] = [];
for (let i = 0; i < 90; i++) {
  const x = (i * 37) % 23;
  const y = x * 0.5 + ((i * 13) % 7);
  const grp = i % 3 === 0 ? evil('A') : i % 3 === 1 ? '"B"' : evil('C');
  const event = x + (i % 5) > 13 ? '"olay"' : evil('aref'); // alfabetik olarak önce gelir: referans düzeyi olur
  rows.push(`${y},${grp},${x},${event}`);
}
const COLS = { y: 'y\nENJEKSIYON()', g: 'g"); ENJEKSIYON(); ("', x: "x'] + ENJEKSIYON() + ['", b: 'b # ENJEKSIYON()' };
const header = Object.values(COLS)
  .map((c) => `"${c.replace(/"/g, '""')}"`)
  .join(',');
const csvText = `${header}\n${rows.join('\n')}\n`;

let app: FastifyInstance;
let id: string;
beforeEach(async () => {
  app = buildApp({ dataDir: ':memory:' });
  const bd = '----inj';
  const payload = Buffer.from(`--${bd}\r\nContent-Disposition: form-data; name="file"; filename="inj.csv"\r\nContent-Type: text/csv\r\n\r\n${csvText}\r\n--${bd}--\r\n`);
  const r = await app.inject({ method: 'POST', url: '/api/datasets', payload, headers: { 'content-type': `multipart/form-data; boundary=${bd}` } });
  expect(r.statusCode, r.body).toBeLessThan(300);
  id = r.json().id as string;
});
afterEach(async () => {
  await app.close();
});

/** İşaret, bir dize sabitinin dışında (satır başında ya da tırnak dengesi bozulmuş halde) görünmemelidir. */
function expectNoInjection(label: string, code: string) {
  expect(code.length, label).toBeGreaterThan(100);
  for (const line of code.split('\n')) {
    if (!line.includes(MARK)) continue;
    expect(line.trimStart().startsWith(MARK), `${label}: ${line}`).toBe(false);
    // Satırdaki tüm işaretler JSON tarzı bir dize sabitinin içinde kalmalıdır.
    const outside = line.replace(/"(?:[^"\\]|\\.)*"/g, '""');
    expect(outside.includes(MARK), `${label}: ${line}`).toBe(false);
  }
}

describe('üretilen kodda enjeksiyon yok', () => {
  it('lojistik regresyon (Python ve R): referans düzeyi yorumda bile tırnaklı', async () => {
    const r = await app.inject({ method: 'POST', url: `/api/datasets/${id}/logistic`, payload: { dependent: COLS.b, numeric: [COLS.x], categorical: [COLS.g] } });
    expect(r.statusCode, r.body).toBe(200);
    const j = r.json();
    expect(j.result.referenceLevel).toContain(MARK);
    expectNoInjection('lojistik.py', j.code.code);
    expectNoInjection('lojistik.R', j.codeR.code);
  });

  it('doğrusal regresyon (Python ve R)', async () => {
    const r = await app.inject({ method: 'POST', url: `/api/datasets/${id}/regression`, payload: { dependent: COLS.y, numeric: [COLS.x], categorical: [COLS.g] } });
    expect(r.statusCode, r.body).toBe(200);
    expectNoInjection('regresyon.py', r.json().code.code);
    expectNoInjection('regresyon.R', r.json().codeR.code);
  });

  it('grup karşılaştırması (Python ve R)', async () => {
    const a = await app.inject({ method: 'POST', url: '/api/analyses', payload: { datasetId: id, goal: 'compare', design: 'independent', target: 'continuous', value: COLS.y, group: COLS.g } });
    expect(a.statusCode, a.body).toBe(201);
    const aid = a.json().id as string;
    for (const lang of ['python', 'r']) {
      const c = await app.inject({ url: `/api/analyses/${aid}/code${lang === 'r' ? '?lang=r' : ''}` });
      expect(c.statusCode, c.body).toBe(200);
      expectNoInjection(`analiz.${lang}`, c.json().code);
    }
  });
});
