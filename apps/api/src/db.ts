import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/** Sürümlü şema değişiklikleri; PRAGMA user_version ile izlenir. Yeni değişiklikler listenin sonuna eklenir. */
const MIGRATIONS: string[] = [
  `CREATE TABLE datasets (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     sha256 TEXT NOT NULL UNIQUE,
     size INTEGER NOT NULL,
     rows INTEGER NOT NULL,
     columns_json TEXT NOT NULL,
     created_at TEXT NOT NULL
   );
   CREATE TABLE analyses (
     id TEXT PRIMARY KEY,
     dataset_id TEXT NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
     created_at TEXT NOT NULL,
     request_json TEXT NOT NULL,
     result_json TEXT NOT NULL,
     input_hash TEXT NOT NULL,
     engine_json TEXT NOT NULL,
     test TEXT NOT NULL,
     p REAL,
     significant INTEGER NOT NULL
   );
   CREATE INDEX analyses_dataset ON analyses(dataset_id, created_at DESC);`,
  // Temizleme ile türetilen veri sürümlerinin kaynağı ve uygulanan işlemler
  `ALTER TABLE datasets ADD COLUMN parent_id TEXT REFERENCES datasets(id) ON DELETE SET NULL;
   ALTER TABLE datasets ADD COLUMN operations_json TEXT;`,
  // Sütun profili: kullanıcının düzelttiği türler ve doğruladığı geçerli değerler
  `ALTER TABLE datasets ADD COLUMN profile_json TEXT;`,
  // Rapor merkezine kaydedilen regresyon, lojistik regresyon ve model karşılaştırma sonuçları
  `CREATE TABLE saved_reports (
     id TEXT PRIMARY KEY,
     dataset_id TEXT NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
     kind TEXT NOT NULL CHECK (kind IN ('regression', 'logistic', 'model')),
     created_at TEXT NOT NULL,
     title TEXT NOT NULL,
     detail TEXT NOT NULL,
     spec_json TEXT NOT NULL,
     result_json TEXT NOT NULL,
     input_hash TEXT NOT NULL,
     engine_json TEXT NOT NULL
   );
   CREATE INDEX saved_reports_dataset ON saved_reports(dataset_id, created_at DESC);`,
  // Rapor merkezine faktöriyel ANOVA da kaydedilir: SQLite CHECK kısıtı değiştirilemediğinden tablo yeniden kurulur
  `CREATE TABLE saved_reports_new (
     id TEXT PRIMARY KEY,
     dataset_id TEXT NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
     kind TEXT NOT NULL CHECK (kind IN ('regression', 'logistic', 'model', 'factorial')),
     created_at TEXT NOT NULL,
     title TEXT NOT NULL,
     detail TEXT NOT NULL,
     spec_json TEXT NOT NULL,
     result_json TEXT NOT NULL,
     input_hash TEXT NOT NULL,
     engine_json TEXT NOT NULL
   );
   INSERT INTO saved_reports_new SELECT id, dataset_id, kind, created_at, title, detail, spec_json, result_json, input_hash, engine_json FROM saved_reports;
   DROP TABLE saved_reports;
   ALTER TABLE saved_reports_new RENAME TO saved_reports;
   CREATE INDEX saved_reports_dataset ON saved_reports(dataset_id, created_at DESC);`,
];

export function openDb(path: string): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number };
  for (let v = row.user_version; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[v]!);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
  return db;
}
