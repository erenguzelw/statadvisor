/**
 * Faktöriyel ANOVA uç noktaları: sonuç, rapor, rapor merkezine kaydetme ve Python kodunun ekrandaki sonuçla birebir aynı çıktıyı vermesi.
 * Python (numpy, pandas, scipy) bulunmayan ortamlarda kod doğrulaması atlanır.
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
const hasPython = PY !== '' && spawnSync(PY, ['-c', 'import numpy, pandas, scipy'], { encoding: 'utf8' }).status === 0;

/** 2 × 3 faktöriyel, hücre başına 3 gözlem (statsmodels referansı: Cinsiyet F = 20.9126, Doz F = 6.0437). */
const complete = 'a,b,y\n' + 'a1,b1,80;a1,b1,55;a1,b1,60;a1,b2,40;a1,b2,50;a1,b2,55;a1,b3,60;a1,b3,80;a1,b3,75;a2,b1,65;a2,b1,35;a2,b1,40;a2,b2,30;a2,b2,25;a2,b2,29;a2,b3,50;a2,b3,35;a2,b3,42'.split(';').join('\n') + '\n';
/** Bir hücre (a2, b3) boş; bir değer eksik. */
const gaps = 'a,b,y\n' + 'a1,b1,5;a1,b1,6;a1,b2,9;a1,b2,;a1,b3,14;a1,b3,16;a2,b1,7;a2,b1,8;a2,b2,12;a2,b2,13;a2,b2,11'.split(';').join('\n') + '\n';

let app: FastifyInstance;
let work: string;
beforeEach(() => {
  app = buildApp({ dataDir: ':memory:' });
  work = mkdtempSync(join(tmpdir(), 'sa-fx-'));
});
afterEach(async () => {
  await app.close();
  rmSync(work, { recursive: true, force: true });
});

async function upload(content: string, name = 'veri.csv') {
  const boundary = '----safx';
  const payload = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: text/csv\r\n\r\n${content}\r\n--${boundary}--\r\n`);
  const r = await app.inject({ method: 'POST', url: '/api/datasets', payload, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } });
  expect(r.statusCode).toBeLessThan(300);
  return r.json().id as string;
}
const body = { dependent: 'y', factors: ['a', 'b'] };

describe('faktöriyel ANOVA uç noktaları', () => {
  it('sonucu, yorumu ve kodu döndürür (statsmodels referansı)', async () => {
    const id = await upload(complete);
    const r = await app.inject({ method: 'POST', url: `/api/datasets/${id}/factorial`, payload: body });
    expect(r.statusCode, r.body).toBe(200);
    const j = r.json();
    expect(j.result.ssType).toBe('III');
    expect(j.result.terms[0].F).toBeCloseTo(20.9126, 3);
    expect(j.result.terms[1].F).toBeCloseTo(6.0437, 3);
    expect(j.result.residuals).toBeUndefined();
    expect(j.interpretation.length).toBeGreaterThan(3);
    expect(j.code.filename).toBe('faktoriyel_anova.py');
    expect(j.result.postHoc[0].factor).toBe('b');
  });

  it('geçersiz isteklerde anlaşılır hata verir', async () => {
    const id = await upload(complete);
    const same = await app.inject({ method: 'POST', url: `/api/datasets/${id}/factorial`, payload: { dependent: 'y', factors: ['a', 'a'] } });
    expect(same.statusCode).toBe(422);
    const dep = await app.inject({ method: 'POST', url: `/api/datasets/${id}/factorial`, payload: { dependent: 'a', factors: ['b'] } });
    expect(dep.statusCode).toBe(422);
    expect(dep.json().error.message).toMatch(/sayısal değil/);
  });

  it('raporu HTML ve Word olarak üretir; grafikler gömülür', async () => {
    const id = await upload(complete);
    const html = await app.inject({ method: 'POST', url: `/api/datasets/${id}/factorial/report?format=html`, payload: body });
    expect(html.statusCode).toBe(200);
    expect(html.body).toContain('Araştırmanın amacı');
    expect(html.body).toContain('ANOVA tablosu');
    expect(html.body).toContain('İkili karşılaştırmalar (Tukey HSD)');
    expect(html.body).toContain('<svg');
    const docx = await app.inject({ method: 'POST', url: `/api/datasets/${id}/factorial/report?format=docx`, payload: body });
    expect(docx.statusCode).toBe(200);
    expect(docx.rawPayload.subarray(0, 2).toString()).toBe('PK');
  });

  it('rapor merkezine kaydeder, yeniden açar ve aynı kaydı tekrar eklemez', async () => {
    const id = await upload(complete);
    const first = await app.inject({ method: 'POST', url: `/api/datasets/${id}/factorial/save`, payload: body });
    expect(first.statusCode).toBe(201);
    const again = await app.inject({ method: 'POST', url: `/api/datasets/${id}/factorial/save`, payload: body });
    expect(again.statusCode).toBe(200);
    expect(again.json().id).toBe(first.json().id);
    const list = (await app.inject({ url: '/api/reports' })).json().reports as { kind: string }[];
    expect(list.filter((x) => x.kind === 'factorial')).toHaveLength(1);
    const rid = first.json().id as string;
    const view = (await app.inject({ url: `/api/reports/${rid}` })).json();
    expect(view.kind).toBe('factorial');
    expect(view.highlights.map((h: string[]) => h[0])).toContain('Anlamlı etkiler');
    const html = await app.inject({ url: `/api/reports/${rid}/report?format=html` });
    expect(html.body).toContain('Faktöriyel ANOVA raporu');
    expect(html.body).toContain('<svg');
    const code = (await app.inject({ url: `/api/reports/${rid}/code` })).json();
    expect(code.filename).toBe('faktoriyel_anova.py');
  });

  it('boş hücrede Tip II kullanır ve eksik değeri atar', async () => {
    const id = await upload(gaps);
    const r = (await app.inject({ method: 'POST', url: `/api/datasets/${id}/factorial`, payload: body })).json();
    expect(r.result.ssType).toBe('II');
    expect(r.result.ssTypeSwitched).toBe(true);
    expect(r.result.dropped).toBe(1);
    expect(r.result.emptyCells).toBe(1);
  });

  (hasPython ? it : it.skip)('Python kodu ekrandaki sonuçla birebir aynı çıktıyı verir (tam tasarım ve boş hücre)', { timeout: 120_000 }, async () => {
    for (const [content, name] of [[complete, 'tam.csv'], [gaps, 'bos.csv']] as const) {
      const id = await upload(content, name);
      const j = (await app.inject({ method: 'POST', url: `/api/datasets/${id}/factorial`, payload: body })).json();
      writeFileSync(join(work, name), (await app.inject({ url: `/api/datasets/${id}/download` })).rawPayload);
      writeFileSync(join(work, j.code.filename), j.code.code);
      const out = execFileSync(PY, [j.code.filename], { cwd: work, encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, timeout: 90_000 });
      expect(out.trim().split(/\r?\n/)).toEqual(j.code.expectedOutput);
    }
  });
});
