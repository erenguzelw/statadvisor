// node tools/i18n-merge.mjs <hedef-sözlük.ts> <değerler.json...>
// Bekleyen anahtarları (tools/.i18n-pending.json) sırayla İngilizce değerlerle birleştirip sözlüğe ekler.
import { readFileSync, writeFileSync } from 'node:fs';

const [dict, ...files] = process.argv.slice(2);
const pending = JSON.parse(readFileSync('tools/.i18n-pending.json', 'utf8')).map((k) => k.replace(/&lt;/g, '<'));
const values = files.flatMap((f) => JSON.parse(readFileSync(f, 'utf8')));
if (values.length !== pending.length) {
  console.error(`SAYI UYUŞMUYOR: ${pending.length} anahtar, ${values.length} değer`);
  process.exit(1);
}
const BS = String.fromCharCode(92);
const q = (s) => "'" + s.split(BS).join(BS + BS).split("'").join(BS + "'") + "'";
const lines = pending.map((k, i) => `  ${q(k)}: ${q(values[i])},`);
let s = readFileSync(dict, 'utf8');
const crlf = s.includes('\r\n');
s = s.replace(/\r\n/g, '\n');
const end = s.lastIndexOf('};');
s = s.slice(0, end).replace(/\s+$/, '\n') + '\n  // Sayfalar (otomatik çıkarıldı)\n' + lines.join('\n') + '\n};\n';
if (crlf) s = s.replace(/\n/g, '\r\n');
writeFileSync(dict, s);
console.log(lines.length, 'girdi eklendi');
