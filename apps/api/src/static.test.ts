import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from './app.ts';

describe('arayüz sunumu', () => {
  it('derlenmiş arayüzü sunar; bilinmeyen sayfalar arayüze, bilinmeyen API yolları 404\'e gider', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sa-web-'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>x</title><div id="root"></div>');
    const app = buildApp({ dataDir: ':memory:', webDir: dir });
    try {
      expect((await app.inject({ url: '/' })).body).toContain('id="root"');
      expect((await app.inject({ url: '/karar-sihirbazi' })).body).toContain('id="root"');
      expect((await app.inject({ url: '/api/yok' })).statusCode).toBe(404);
      expect((await app.inject({ url: '/api/health' })).statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});
