// README görsellerini üretir: node tools/readme-screens.mjs
// Önkoşul: `npm run build` yapılmış olmalı; sunucu bu betik tarafından geçici portta başlatılır (bellek içi veri).
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const PORT = 3191;
const base = `http://127.0.0.1:${PORT}`;
const server = spawn(process.execPath, ['apps/api/src/index.ts'], { env: { ...process.env, PORT: String(PORT), STATADVISOR_DATA: ':memory:' }, stdio: 'ignore' });
const up = async () => {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${base}/api/samples`)).ok) return;
    } catch {
      /* henüz açılmadı */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('sunucu açılmadı');
};

try {
  await up();
  mkdirSync('docs/img', { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const klinik = await (await page.request.post(`${base}/api/samples/klinik`, { data: {} })).json();
  const analysis = await (await page.request.post(`${base}/api/analyses`, { data: { datasetId: klinik.id, goal: 'compare', design: 'independent', target: 'continuous', value: 'kan_basinci', group: 'grup' } })).json();
  await page.addInitScript((id) => {
    localStorage.setItem('statadvisor.dataset', id);
    localStorage.setItem('statadvisor.lang', 'en');
  }, klinik.id);

  const shot = async (path, file, prep) => {
    await page.goto(`${base}${path}`);
    await page.waitForSelector('main h1');
    await page.waitForLoadState('networkidle');
    if (prep) await prep();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `docs/img/${file}`, fullPage: false });
  };
  await shot('/karar-sihirbazi', 'wizard-en.png');
  await shot(`/kod-rapor?analiz=${analysis.id}`, 'code-r-en.png', async () => {
    await page.getByRole('radio', { name: 'R', exact: true }).check();
    await page.getByText('analiz.R', { exact: true }).waitFor();
  });
  await shot('/regresyon', 'regression-en.png');
  await browser.close();
  console.log('görseller docs/img/ altına yazıldı');
} finally {
  server.kill();
}
