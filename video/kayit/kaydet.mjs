// Uygulamayı (127.0.0.1:3001) gerçekten kullanarak sahne sahne ekran kaydı alır → video/public/klipler/<sahne>.webm
// Kullanım: node kayit/kaydet.mjs [sahne ...]   (argümansız: hepsi)   Sahneler: kalite karar regresyon lojistik model kod
import { chromium } from '../../node_modules/playwright/index.mjs';
import { mkdirSync, renameSync, rmSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const cikis = resolve(dir, '../public/klipler');
const gecici = resolve(dir, '../.kayit-gecici');
mkdirSync(cikis, { recursive: true });
const BASE = 'http://127.0.0.1:3001';
const W = 1600, H = 900;
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

// Kayıtta görünmeyen imleci, izleyen bir daire olarak çizer; tıklamada halka yayar.
const imlecBetigi = () => {
  const kur = () => {
    if (document.getElementById('__imlec')) return;
    const d = document.createElement('div');
    d.id = '__imlec';
    d.style.cssText = 'position:fixed;left:0;top:0;width:26px;height:26px;margin:-4px 0 0 -4px;border-radius:50%;background:rgba(192,193,255,.85);border:3px solid #fff;box-shadow:0 2px 14px rgba(0,0,0,.6);z-index:2147483647;pointer-events:none;transition:transform .06s linear';
    document.documentElement.appendChild(d);
    addEventListener('mousemove', (e) => { d.style.transform = `translate(${e.clientX}px,${e.clientY}px)`; }, true);
    addEventListener('mousedown', (e) => {
      const r = document.createElement('div');
      r.style.cssText = `position:fixed;left:${e.clientX - 30}px;top:${e.clientY - 30}px;width:60px;height:60px;border-radius:50%;border:4px solid #6bd8cb;z-index:2147483646;pointer-events:none;transition:all .55s ease-out;opacity:1`;
      document.documentElement.appendChild(r);
      requestAnimationFrame(() => { r.style.transform = 'scale(1.9)'; r.style.opacity = '0'; });
      setTimeout(() => r.remove(), 700);
    }, true);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', kur); else kur();
};

let mx = 800, my = 450;
async function git(page, x, y, adim = 22) {
  await page.mouse.move(x, y, { steps: adim });
  mx = x; my = y;
}
async function merkez(page, loc) {
  await loc.scrollIntoViewIfNeeded();
  const b = await loc.boundingBox();
  if (!b) throw new Error('öğe görünmüyor');
  return [b.x + b.width / 2, b.y + b.height / 2];
}
async function tikla(page, loc, oncesi = 500, sonrasi = 900) {
  const [x, y] = await merkez(page, loc);
  await git(page, x, y);
  await bekle(oncesi);
  await page.mouse.down(); await page.mouse.up();
  await bekle(sonrasi);
}
async function sec(page, secim, etiket) {
  const [x, y] = await merkez(page, secim);
  await git(page, x, y);
  await bekle(400);
  await secim.selectOption({ label: etiket });
  await bekle(1200);
}
// Sayfayı yumuşak kaydırır: toplam süre içinde, belirtilen oranlar arasında.
async function kaydir(page, sureMs, baslaOran = 0, bitirOran = 1) {
  const max = await page.evaluate(() => Math.max(0, document.documentElement.scrollHeight - innerHeight));
  const sayfaKaydir = page.locator('main').first();
  const hedefA = max * baslaOran, hedefB = max * bitirOran;
  const adim = 40, n = Math.max(1, Math.round(sureMs / adim));
  for (let i = 0; i <= n; i++) {
    const t = i / n, e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // ease-in-out
    await page.evaluate((y) => window.scrollTo(0, y), hedefA + (hedefB - hedefA) * e);
    await bekle(adim);
  }
  void sayfaKaydir;
}

async function kaydetDugmesi(page, ad) {
  const d = page.getByRole('button', { name: ad }).first();
  if (await d.count()) { await tikla(page, d, 700, 2500); return true; }
  console.log('  (düğme yok: ' + ad + ')');
  return false;
}

const sahneler = {
  async kalite(page) {
    await page.goto(BASE + '/veri/kalite', { waitUntil: 'networkidle' });
    await git(page, 900, 420); await bekle(3500);
    await kaydir(page, 9000, 0, 0.42);
    await bekle(1500);
    await tikla(page, page.getByRole('radio', { name: /Sonrası/ }), 600, 2500);
    await tikla(page, page.getByRole('radio', { name: /Öncesi/ }), 400, 1500);
    await kaydir(page, 9000, 0.42, 1);
    await bekle(1500);
  },
  async karar(page) {
    await page.goto(BASE + '/karar-sihirbazi', { waitUntil: 'networkidle' });
    await git(page, 900, 400); await bekle(3000);
    await tikla(page, page.getByText('Grupları karşılaştırmak').first());
    await tikla(page, page.getByText('Evet, farklı kişiler/birimler').first());
    const secimler = page.locator('select');
    await sec(page, secimler.nth(2), 'weight_kg · Sürekli');
    await sec(page, secimler.nth(3), 'gender · Kategorik');
    await bekle(2500);
    await kaydir(page, 26000, 0, 1);
    await bekle(1500);
    await kaydetDugmesi(page, 'Kaydet ve kod/rapor oluştur');
  },
  async regresyon(page) {
    await page.goto(BASE + '/regresyon', { waitUntil: 'networkidle' });
    await git(page, 900, 420); await bekle(2500);
    await sec(page, page.locator('select').nth(2), 'body fat_% · Sürekli');
    await bekle(2500);
    const kutular = page.locator('input[type=checkbox]');
    const n = await kutular.count();
    if (n > 3) { await tikla(page, kutular.nth(3), 600, 1800); await tikla(page, kutular.nth(3), 600, 1800); }
    await kaydir(page, 14000, 0, 1);
    await bekle(1500);
    await kaydetDugmesi(page, /Rapor merkezine kaydet/);
  },
  async lojistik(page) {
    await page.goto(BASE + '/lojistik-regresyon', { waitUntil: 'networkidle' });
    await git(page, 900, 420); await bekle(2500);
    const kutular = page.locator('input[type=checkbox]');
    const n = await kutular.count();
    if (n > 3) { await tikla(page, kutular.nth(2), 600, 1800); await tikla(page, kutular.nth(2), 600, 1800); }
    await kaydir(page, 13000, 0, 1);
    await bekle(1500);
  },
  async model(page) {
    await page.goto(BASE + '/model-karsilastirma', { waitUntil: 'networkidle' });
    await git(page, 900, 420); await bekle(2500);
    await kaydir(page, 4500, 0, 0.55);
    await tikla(page, page.getByRole('button', { name: /Karşılaştırmayı başlat/ }), 700, 1500);
    // Hesap bitene kadar (ilerleme canlı gösterilir); en çok 6 dk
    await page.getByText('Çapraz doğrulama sonuçları').waitFor({ timeout: 360000 });
    await bekle(1500);
    const sonuc = page.getByText('Çapraz doğrulama sonuçları').first();
    await sonuc.scrollIntoViewIfNeeded();
    await bekle(3500);
    const y0 = await page.evaluate(() => scrollY), max = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    await kaydir(page, 14000, Math.min(1, y0 / Math.max(1, max)), 0.62);
    await bekle(1500);
  },
  async kod(page) {
    await page.goto(BASE + '/kod-rapor', { waitUntil: 'networkidle' });
    await git(page, 900, 420); await bekle(2500);
    await tikla(page, page.getByText('Word (.docx)').first(), 600, 1500);
    await tikla(page, page.getByText('A4, yazdırmaya hazır').first(), 500, 1200);
    await tikla(page, page.getByText('HTML belgesi').first(), 500, 1200);
    await kaydir(page, 11000, 0, 1);
    await bekle(1500);
  },
};

const secilen = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(sahneler);
const browser = await chromium.launch();
for (const ad of secilen) {
  if (!sahneler[ad]) { console.log('bilinmeyen sahne:', ad); continue; }
  rmSync(gecici, { recursive: true, force: true });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: gecici, size: { width: W, height: H } }, deviceScaleFactor: 1 });
  await ctx.addInitScript(imlecBetigi);
  const page = await ctx.newPage();
  page.setDefaultTimeout(90000); page.setDefaultNavigationTimeout(90000);
  const t0 = Date.now();
  try {
    await sahneler[ad](page);
    console.log(`✓ ${ad}: ${((Date.now() - t0) / 1000).toFixed(1)} sn`);
  } catch (e) {
    console.log(`✗ ${ad}: ${e.message.split('\n')[0]}`);
  }
  const video = page.video();
  await ctx.close();
  const kaynak = await video.path();
  if (existsSync(kaynak)) renameSync(kaynak, resolve(cikis, `${ad}.webm`));
}
await browser.close();
rmSync(gecici, { recursive: true, force: true });
