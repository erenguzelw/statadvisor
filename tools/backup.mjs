// Yedek: node tools/backup.mjs [--reset]
// Veritabanının tutarlı bir kopyasını yedekler klasörüne yazar (sunucu açıkken de güvenlidir).
// --reset: önce yedek alır, sonra veri klasörünü siler (sunucu kapalıyken kullanın).
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dataDir = resolve(process.env.STATADVISOR_DATA ?? fileURLToPath(new URL('../apps/api/.data', import.meta.url)));
const dbFile = join(dataDir, 'statadvisor.db');
if (!existsSync(dbFile)) {
  console.log(`Yedeklenecek veri yok: ${dbFile}`);
  process.exit(0);
}
const outDir = resolve(process.env.STATADVISOR_BACKUP ?? join(dataDir, '..', 'backups'));
mkdirSync(outDir, { recursive: true });
const target = join(outDir, `statadvisor-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
const db = new DatabaseSync(dbFile);
db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
db.close();
console.log(`Yedek yazıldı: ${target}`);

if (process.argv.includes('--reset')) {
  rmSync(dataDir, { recursive: true, force: true });
  console.log(`Veri klasörü silindi: ${dataDir}`);
}
