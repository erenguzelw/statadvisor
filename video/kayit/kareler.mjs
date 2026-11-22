// Kullanım: node kayit/kareler.mjs <klip> <aralık_sn> → .kontrol/<klip>_sheet.png (zaman damgalı kare dizisi)
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { chromium } from '../../node_modules/playwright/index.mjs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const dir = dirname(fileURLToPath(import.meta.url));
const [klip, aralik = '5'] = process.argv.slice(2);
const adim = Number(aralik);
const kok = resolve(dir, '..');
const sure = Number(execFileSync('npx', ['remotion', 'ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', `public/klipler/${klip}.webm`], { cwd: kok, shell: true }).toString().trim().split('\n').pop());
mkdirSync(resolve(kok, '.kontrol', klip), { recursive: true });
const kareler = [];
for (let t = 0; t < sure; t += adim) {
  const out = `.kontrol/${klip}/${String(Math.round(t)).padStart(3, '0')}.png`;
  execFileSync('npx', ['remotion', 'ffmpeg', '-y', '-ss', String(t), '-i', `public/klipler/${klip}.webm`, '-frames:v', '1', '-vf', 'scale=480:-1', out], { cwd: kok, shell: true, stdio: 'ignore' });
  kareler.push([t, out]);
}
const html = `<body style="margin:0;background:#111;color:#fff;font:14px sans-serif;display:grid;grid-template-columns:repeat(5,480px);gap:4px">${kareler.map(([t, o]) => `<div style="position:relative"><img src="../${o}" width=480><b style="position:absolute;left:4px;top:4px;background:#000c;padding:2px 6px">${t}s</b></div>`).join('')}</body>`;
const h = resolve(kok, '.kontrol', `${klip}_sheet.html`);
writeFileSync(h, html);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 2416, height: 100 } });
await p.goto(pathToFileURL(h).href);
await p.waitForTimeout(500);
await p.screenshot({ path: resolve(kok, '.kontrol', `${klip}_sheet.png`), fullPage: true });
await b.close();
console.log(klip, 'süre', sure, 'kare', kareler.length);
