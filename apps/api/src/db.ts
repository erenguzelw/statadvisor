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
