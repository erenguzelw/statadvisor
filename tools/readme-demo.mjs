// README demo GIF'ini üretir: node tools/readme-demo.mjs   → docs/img/demo.gif
// Önkoşullar: `npm run build` yapılmış olmalı ve ffmpeg PATH'te olmalı. Sunucu bu betik tarafından geçici portta,
// bellek içi veriyle başlatılır; arayüz gerçek kullanıcı gibi (imleç görünür) sürülür ve Playwright ile kaydedilir.
// Sahneler: ölçek puanı + madde analizi → karar sihirbazı (test önerisi ve sonuç) → üretilen R kodu.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const PORT = 3192;
const base = `http://127.0.0.1:${PORT}`;
const W = 1280;
const H = 800;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Örnek anket: 6 madde (1–5), k4 ters kodlu, k6 ölçeğe uymayan madde; kadınlarda kaygı biraz daha yüksek.
function surveyCsv() {
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const lines = ['gender,k1,k2,k3,k4,k5,k6'];
  for (let i = 0; i < 160; i++) {
    const female = i % 2 === 0;
    const base = rnd() * 3 + (female ? 0.9 : 0.2);
    const it = () => Math.min(5, Math.max(1, Math.round(1 + base + (rnd() - 0.5) * 1.6)));
    lines.push([female ? 'female' : 'male', it(), it(), it(), 6 - it(), it(), 1 + Math.floor(rnd() * 5)].join(','));
  }
  return lines.join('\n') + '\n';
}

// Kayıtta görünmeyen imleci izleyen bir daire olarak çizer; tıklamada halka yayar.
const cursorScript = () => {
  const setup = () => {
    if (document.getElementById('__cursor')) return;
    const d = document.createElement('div');
    d.id = '__cursor';
    d.style.cssText = 'position:fixed;left:0;top:0;width:22px;height:22px;margin:-4px 0 0 -4px;border-radius:50%;background:rgba(192,193,255,.85);border:3px solid #fff;box-shadow:0 2px 14px rgba(0,0,0,.6);z-index:2147483647;pointer-events:none;transform:translate(640px,400px)';
    document.documentElement.appendChild(d);
    addEventListener('mousemove', (e) => (d.style.transform = `translate(${e.clientX}px,${e.clientY}px)`), true);
    addEventListener(
      'mousedown',
      (e) => {
        const r = document.createElement('div');
        r.style.cssText = `position:fixed;left:${e.clientX - 26}px;top:${e.clientY - 26}px;width:52px;height:52px;border-radius:50%;border:4px solid #6bd8cb;z-index:2147483646;pointer-events:none;transition:all .5s ease-out`;
        document.documentElement.appendChild(r);
        requestAnimationFrame(() => {
          r.style.transform = 'scale(1.8)';
          r.style.opacity = '0';
        });
        setTimeout(() => r.remove(), 600);
      },
      true,
    );
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
  else setup();
};

async function center(loc) {
  const b = await loc.boundingBox();
  if (!b) throw new Error('öğe görünmüyor');
  return [b.x + b.width / 2, b.y + b.height / 2];
}
async function click(page, loc, before = 250, after = 450) {
  const [x, y] = await center(loc);
  await page.mouse.move(x, y, { steps: 14 });
  await wait(before);
  await page.mouse.down();
  await page.mouse.up();
  await wait(after);
}
async function select(page, loc, label) {
  const [x, y] = await center(loc);
  await page.mouse.move(x, y, { steps: 14 });
  await wait(300);
  await loc.selectOption(label);
  await wait(700);
}
async function smoothScrollTo(page, loc, block = 'start') {
  await loc.evaluate((el, b) => el.scrollIntoView({ behavior: 'smooth', block: b }), block);
  await wait(900);
}

const server = spawn(process.execPath, ['apps/api/src/index.ts'], { env: { ...process.env, PORT: String(PORT), STATADVISOR_DATA: ':memory:' }, stdio: 'ignore' });
const videoDir = mkdtempSync(join(tmpdir(), 'sa-demo-'));
try {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) break;
    } catch {
      /* henüz açılmadı */
    }
    await wait(500);
  }
  const browser = await chromium.launch();
  const setup = await browser.newPage();
  const up = await setup.request.post(`${base}/api/datasets`, { multipart: { file: { name: 'anxiety_survey.csv', mimeType: 'text/csv', buffer: Buffer.from(surveyCsv()) } } });
  if (!up.ok()) throw new Error(await up.text());
  const dataset = await up.json();
  await setup.close();

  const context = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: videoDir, size: { width: W, height: H } } });
  const t0 = Date.now();
  // Yalnızca ilk açılışta: ölçek puanı yeni bir veri sürümünü etkin yapar, sonraki sayfalar onu korumalı.
  await context.addInitScript((id) => {
    if (localStorage.getItem('statadvisor.dataset')) return;
    localStorage.setItem('statadvisor.dataset', id);
    localStorage.setItem('statadvisor.lang', 'en');
  }, dataset.id);
  await context.addInitScript(cursorScript);
  const page = await context.newPage();

  // 1) Ölçek puanı ve madde analizi
  await page.goto(`${base}/veri`);
  await page.waitForSelector('main h1');
  await page.waitForLoadState('networkidle');
  const start = (Date.now() - t0) / 1000;
  await wait(900);
  const box = page.getByRole('group', { name: 'Scale 1' });
  await smoothScrollTo(page, box);
  const name = box.getByLabel('Scale name');
  await click(page, name, 150, 150);
  await page.keyboard.type('Anxiety', { delay: 55 });
  await click(page, box.getByLabel('Lowest response'), 100, 100);
  await page.keyboard.type('1');
  await click(page, box.getByLabel('Highest response'), 100, 100);
  await page.keyboard.type('5');
  for (const m of ['k1', 'k2', 'k3', 'k4', 'k5', 'k6']) await click(page, box.getByRole('checkbox', { name: m, exact: true }), 80, 120);
  await click(page, box.locator('li', { hasText: 'k4' }).getByRole('checkbox').nth(1), 200, 300);
  await click(page, page.getByRole('button', { name: 'Compute scores' }), 250, 300);
  const table = page.getByRole('region', { name: 'Item analysis for “Anxiety”' });
  await table.waitFor();
  await smoothScrollTo(page, table, 'center');
  await page.mouse.move(...(await center(table.getByRole('row').last())), { steps: 18 });
  await wait(2600);

  // 2) Karar sihirbazı: yeni ölçek puanı ile grup karşılaştırması
  await page.goto(`${base}/karar-sihirbazi`);
  await page.waitForSelector('main h1');
  await wait(700);
  await select(page, page.getByLabel('Outcome column (numeric)'), 'Anxiety');
  await select(page, page.getByLabel('Group column'), 'gender');
  const save = page.getByRole('button', { name: 'Save and generate code/report' });
  await save.waitFor();
  await page.waitForFunction((el) => !el.disabled, await save.elementHandle());
  await page.waitForLoadState('networkidle');
  await page.mouse.move(W * 0.72, H * 0.45, { steps: 16 });
  await wait(2800);
  await click(page, save, 300, 300);

  // 3) Üretilen R kodu
  await page.waitForURL(/kod-rapor/);
  await page.waitForLoadState('networkidle');
  await wait(500);
  await smoothScrollTo(page, page.getByRole('heading', { name: 'Ready-made code generation' }));
  await click(page, page.getByRole('radio', { name: 'R', exact: true }), 250, 300);
  await page.getByText('analiz.R', { exact: true }).waitFor();
  await wait(1200);
  await page.mouse.wheel(0, 300);
  await wait(2400);
  const end = (Date.now() - t0) / 1000;

  const video = page.video();
  await context.close();
  await browser.close();
  const webm = await video.path();

  mkdirSync('docs/img', { recursive: true });
  // 1,25× hız, 7 fps, 820 px: README'de hızlı açılması için ~5 MB altı hedeflenir.
  const filter = `setpts=PTS/1.25,fps=7,scale=820:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=80:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`;
  const ff = spawnSync('ffmpeg', ['-y', '-v', 'error', '-ss', start.toFixed(2), '-to', end.toFixed(2), '-i', webm, '-vf', filter, '-loop', '0', 'docs/img/demo.gif'], { stdio: 'inherit' });
  if (ff.status !== 0) throw new Error('ffmpeg başarısız');
  console.log(`docs/img/demo.gif yazıldı (${((end - start) / 1.25).toFixed(1)} sn)`);
} finally {
  server.kill();
  try {
    rmSync(videoDir, { recursive: true, force: true });
  } catch {
    /* Windows'ta video dosyası kısa süre kilitli kalabilir */
  }
}
