// Sözlükte karşılığı olmayan, dönüştürücünün bulduğu anahtarları numaralı listeler ve tools/.i18n-pending.json'a yazar.
// Kullanım: node tools/i18n-pending.mjs [başlangıç] [bitiş]
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const load = async (f) => Object.values(await import(pathToFileURL(resolve('packages/shared/src/i18n', f)).href))[0];
const dict = { ...(await load('en-ui.ts')), ...(await load('en-stats.ts')) };
const keys = JSON.parse(readFileSync('tools/.i18n-keys.json', 'utf8')).map((k) => k.replace(/&lt;/g, '<'));
const pending = [...new Set(keys.filter((k) => !(k in dict)))];
writeFileSync('tools/.i18n-pending.json', JSON.stringify(pending));
const [from = 0, to = pending.length] = process.argv.slice(2).map(Number);
console.log('toplam', pending.length);
pending.slice(from, to).forEach((k, i) => console.log(`${from + i}|${k}`));
