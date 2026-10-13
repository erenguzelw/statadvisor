// Görsel inceleme için tüm rotaların tam sayfa ekran görüntüsünü alır.
// Kullanım: node e2e/screens.mjs <çıktı-klasörü> [genişlik]
// Önkoşul: API (3101) ve derlenmiş arayüz (4173) çalışıyor olmalı:
//   STATADVISOR_DATA=:memory: PORT=3101 node ../api/src/index.ts &
//   STATADVISOR_API=http://127.0.0.1:3101 npx vite preview --port 4173 --strictPort &
import { chromium } from '@playwright/test';

const out = process.argv[2] ?? 'screens';
const width = Number(process.argv[3] ?? 1440);
const base = 'http://127.0.0.1:4173';
const routes = ['veri', 'karar-sihirbazi', 'model-karsilastirma', 'veri-kalitesi', 'kod-rapor'];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width, height: 900 } });
page.on('console', (m) => m.type() === 'error' && console.log('console error:', m.text()));

const klinik = await (await page.request.post(`${base}/api/samples/klinik`, { data: {} })).json();
await page.request.post(`${base}/api/samples/tedavi`, { data: {} });
await page.request.post(`${base}/api/samples/anket`, { data: {} });
await page.request.post(`${base}/api/analyses`, {
  data: { datasetId: klinik.id, goal: 'compare', design: 'independent', target: 'continuous', value: 'kan_basinci', group: 'grup' },
});
await page.addInitScript((id) => localStorage.setItem('statadvisor.dataset', id), klinik.id);

for (const r of routes) {
  await page.goto(`${base}/${r}`);
  await page.waitForSelector('main h1');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/${r}-${width}.png`, fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log(r, 'yatay taşma:', overflow);
}
await browser.close();
