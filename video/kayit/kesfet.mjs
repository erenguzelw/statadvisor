// Sayfadaki etkileşimli öğeleri listeler (kayıt betiği yazmak için keşif).  Kullanım: node kayit/kesfet.mjs /karar-sihirbazi
import { chromium } from '../../node_modules/playwright/index.mjs';
const yol = process.argv[2] ?? '/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto('http://127.0.0.1:3001' + yol, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const out = await page.evaluate(() => {
  const t = (e) => (e.innerText || e.getAttribute('aria-label') || e.value || '').replace(/\s+/g, ' ').trim().slice(0, 70);
  const r = {};
  r.basliklar = [...document.querySelectorAll('h1,h2,h3')].map(t).filter(Boolean);
  r.butonlar = [...document.querySelectorAll('button,[role=button],a[href]')].map((e) => `${e.tagName.toLowerCase()}[${e.getAttribute('role') ?? ''}] ${t(e)}`).filter((s) => s.length > 6);
  r.secimler = [...document.querySelectorAll('select')].map((e) => `${e.getAttribute('aria-label') ?? e.id ?? ''}: ${[...e.options].slice(0, 6).map((o) => o.text).join(' | ')}`);
  r.radyo = [...document.querySelectorAll('[role=radio],input[type=radio]')].map(t).filter(Boolean);
  r.onay = [...document.querySelectorAll('input[type=checkbox],[role=checkbox]')].length;
  return r;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
