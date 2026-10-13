// Görsel inceleme için tüm rotaların tam sayfa ekran görüntüsünü alır.
// Kullanım: node e2e/screens.mjs <çıktı-klasörü> [genişlik]
import { chromium } from '@playwright/test';

const out = process.argv[2] ?? 'screens';
const width = Number(process.argv[3] ?? 1440);
const routes = ['karar-sihirbazi', 'model-karsilastirma', 'veri-kalitesi', 'kod-rapor'];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width, height: 900 } });
page.on('console', (m) => m.type() === 'error' && console.log('console error:', m.text()));
for (const r of routes) {
  await page.goto(`http://127.0.0.1:4173/${r}`);
  await page.waitForSelector('main h1');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/${r}-${width}.png`, fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log(r, 'yatay taşma:', overflow);
  if (overflow > 0) {
    const culprits = await page.evaluate(() => [...document.querySelectorAll('main *')].filter((el) => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1 && !el.closest("pre, [class*=overflow-x-auto], [class*=overflow-auto]")).slice(0, 4).map((el) => el.tagName + '.' + String(el.className).slice(0, 80)));
    console.log('  taşanlar:', culprits);
  }
}
await browser.close();
