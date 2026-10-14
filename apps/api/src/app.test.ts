import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { analyze } from '@statadvisor/shared';
import { buildApp } from './app.ts';
import { CsvError, parseCsv } from './csv.ts';

const A = [2.6, 4.3, 3.2, 2.3, 3, 5.6, 6.1, 3.4, 4.5, 2.1, 2.9, 4.2, 2.4, 4.3, 5.3];
const B = [4.3, 4.4, 4.6, 3.1, 5.8, 6.4, 3.1, 5.9, 7.7, 3.2, 6, 2.5, 5.2, 3.6, 3.3];
const C = [4.7, 6.2, 4, 5.4, 13.2, 11.4, 8.3, 7.3, 7.4, 4.4, 4.9, 5.4, 3.6, 7.4, 3.5];
const longRows = (sep: string, dec: string) => {
  let id = 0;
  return [['A', A], ['B', B], ['C', C]].flatMap(([g, vs]) => (vs as number[]).map((v) => `${++id}${sep}${g}${sep}${String(v).replace('.', dec)}`));
};
const csv = (sep = ',', dec = '.') => ['id', 'grup', 'biyobelirtec'].join(sep) + '\n' + longRows(sep, dec).join('\n') + '\n';

function multipart(filename: string, content: string | Buffer) {
  const boundary = `----sa${Math.random().toString(16).slice(2)}`;
  const head = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: text/csv\r\n\r\n`;
  return {
    payload: Buffer.concat([Buffer.from(head), Buffer.from(content), Buffer.from(`\r\n--${boundary}--\r\n`)]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

let app: FastifyInstance;
beforeEach(() => {
  app = buildApp({ dataDir: ':memory:', maxUploadBytes: 200_000 });
});
afterEach(async () => {
  await app.close();
});

async function upload(content: string | Buffer = csv(), filename = 'veri.csv') {
  const { payload, headers } = multipart(filename, content);
  return app.inject({ method: 'POST', url: '/api/datasets', payload, headers });
}
const kruskalBody = (datasetId: string) => ({ datasetId, goal: 'compare', design: 'independent', target: 'continuous', value: 'biyobelirtec', group: 'grup' });

describe('CSV ayrıştırma', () => {
  it('ayraç ve ondalık virgülü algılar, türleri çıkarır', () => {
    const p = parseCsv(Buffer.from(csv(';', ',')), { maxRows: 1000, maxColumns: 20 });
    expect(p.delimiter).toBe(';');
    expect(p.decimalComma).toBe(true);
    expect(parseCsv(Buffer.from(csv(',', '.')), { maxRows: 1000, maxColumns: 20 }).decimalComma).toBe(false);
    expect(parseCsv(Buffer.from(csv(';', '.')), { maxRows: 1000, maxColumns: 20 }).decimalComma).toBe(false);
    const byName = Object.fromEntries(p.columns.map((c) => [c.name, c]));
    expect(byName.biyobelirtec!.type).toBe('continuous');
    expect(byName.biyobelirtec!.values[0]).toBe(2.6);
    expect(byName.grup!.type).toBe('categorical');
    expect(byName.id!.likelyId).toBe(true);
    expect(p.rows).toBe(45);
  });

  it('eksik belirteçlerini ve sayısal olmayan değerleri raporlar', () => {
    const p = parseCsv(Buffer.from('a,b\n1,x\nNA,y\n3,z\n4,w\n5,q\n6,r\n7,s\n8,t\n9,u\n10,v\n11,k\n12,l\n13,m\n14,n\n15,o\n16,p\n17,ü\n18,ö\n19,ç\n20,ş\n21,ı\n22,g\n23,h\n24,j\n'), { maxRows: 100, maxColumns: 10 });
    const a = p.columns[0]!;
    expect(a.numeric).toBe(true);
    expect(a.missing).toBe(1);
  });

  it('geçersiz içerikte anlaşılır hata verir', () => {
    const lim = { maxRows: 5, maxColumns: 3 };
    expect(() => parseCsv(Buffer.from(''), lim)).toThrow(CsvError);
    expect(() => parseCsv(Buffer.from('a,b\n1,2\n'), lim)).toThrow(/2 veri satırı/);
    expect(() => parseCsv(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]), lim)).toThrow(/metin/);
    expect(() => parseCsv(Buffer.from('a,b\n1,2\n3,4\n5,6\n7,8\n9,10\n11,12\n'), lim)).toThrow(/satır desteklenir/);
    expect(() => parseCsv(Buffer.from('a,b,c,d\n1,2,3,4\n5,6,7,8\n'), lim)).toThrow(/sütun desteklenir/);
  });
});

describe('veri setleri', () => {
  it('yükler, listeler, önizler; aynı dosya tekrar yüklenince yinelenen olarak döner', async () => {
    const r = await upload();
    expect(r.statusCode).toBe(201);
    const d = r.json();
    expect(d.rows).toBe(45);
    expect(d.columns.map((c: { name: string }) => c.name)).toEqual(['id', 'grup', 'biyobelirtec']);
    const again = await upload();
    expect(again.statusCode).toBe(200);
    expect(again.json().duplicate).toBe(true);
    expect(again.json().id).toBe(d.id);
    const list = await app.inject({ url: '/api/datasets' });
    expect(list.json().datasets).toHaveLength(1);
    const detail = await app.inject({ url: `/api/datasets/${d.id}` });
    expect(detail.json().preview).toHaveLength(21);
    expect(detail.json().preview[0]).toEqual(['id', 'grup', 'biyobelirtec']);
  });

  it('çok büyük, ikili ya da bozuk dosyaları reddeder', async () => {
    const big = await upload('a,b\n' + '1,2\n'.repeat(60_000));
    expect(big.statusCode).toBe(413);
    expect(big.json().error.code).toBe('too_large');
    const bin = await upload(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x01, 0x02]));
    expect(bin.statusCode).toBe(422);
    const one = await upload('a,b\n1,2\n');
    expect(one.statusCode).toBe(422);
    const none = await app.inject({ method: 'POST', url: '/api/datasets', payload: '', headers: { 'content-type': 'multipart/form-data; boundary=x' } });
    expect(none.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('dosya adını temizler ve diskte kullanmaz', async () => {
    const r = await upload(csv(), 'Rapor<script>.csv');
    expect(r.json().name).toBe('Raporscript.csv');
  });

  it('silince analizleri de gider', async () => {
    const id = (await upload()).json().id;
    await app.inject({ method: 'POST', url: '/api/analyses', payload: kruskalBody(id) });
    expect((await app.inject({ url: '/api/analyses' })).json().analyses).toHaveLength(1);
    expect((await app.inject({ method: 'DELETE', url: `/api/datasets/${id}` })).statusCode).toBe(204);
    expect((await app.inject({ url: '/api/analyses' })).json().analyses).toHaveLength(0);
    expect((await app.inject({ url: `/api/datasets/${id}` })).statusCode).toBe(404);
  });
});

describe('analizler', () => {
  it('sonuç, doğrudan çekirdek hesabıyla aynıdır ve denetim izi taşır', async () => {
    const id = (await upload()).json().id;
    const r = await app.inject({ method: 'POST', url: '/api/analyses', payload: kruskalBody(id) });
    expect(r.statusCode).toBe(201);
    const body = r.json();
    const direct = analyze({
      goal: 'compare',
      design: 'independent',
      target: 'continuous',
      datasetName: 'veri.csv',
      value: { name: 'biyobelirtec', values: [...A, ...B, ...C] },
      group: { name: 'grup', values: [...A.map(() => 'A'), ...B.map(() => 'B'), ...C.map(() => 'C')] },
    });
    expect(body.result.outcome.statistic.value).toBeCloseTo(direct.outcome.statistic.value, 12);
    expect(body.result.decision.finalTest).toBe('Kruskal-Wallis H testi');
    expect(body.result.assumptions[0].p).toBeCloseTo(0.003776, 5);
    expect(body.inputHash).toMatch(/^[0-9a-f]{64}$/);
    expect(body.engine.ruleSet).toBe('decision-v1');
    expect(body.engine.referenceSuite.cases).toBeGreaterThan(1000);
  });

  it('aynı girdi aynı karmayı ve aynı sonucu verir; farklı girdi farklı karma', async () => {
    const id = (await upload()).json().id;
    const a = (await app.inject({ method: 'POST', url: '/api/analyses', payload: kruskalBody(id) })).json();
    const b = (await app.inject({ method: 'POST', url: '/api/analyses', payload: { ...kruskalBody(id) } })).json();
    expect(b.inputHash).toBe(a.inputHash);
    expect(b.result).toEqual(a.result);
    expect(b.id).not.toBe(a.id);
    const c = (await app.inject({ method: 'POST', url: '/api/analyses', payload: { ...kruskalBody(id), alpha: 0.01 } })).json();
    expect(c.inputHash).not.toBe(a.inputHash);
  });

  it('kaydedilen analiz geri okunur, listelenir ve silinir', async () => {
    const id = (await upload()).json().id;
    const created = (await app.inject({ method: 'POST', url: '/api/analyses', payload: kruskalBody(id) })).json();
    const got = (await app.inject({ url: `/api/analyses/${created.id}` })).json();
    expect(got.result.outcome.p).toBe(created.result.outcome.p);
    const list = (await app.inject({ url: `/api/analyses?datasetId=${id}` })).json().analyses;
    expect(list[0]).toMatchObject({ id: created.id, test: 'Kruskal-Wallis H testi', significant: true });
    expect((await app.inject({ method: 'DELETE', url: `/api/analyses/${created.id}` })).statusCode).toBe(204);
    expect((await app.inject({ url: `/api/analyses/${created.id}` })).statusCode).toBe(404);
  });

  it('geçersiz isteklere anlaşılır hata verir', async () => {
    const id = (await upload()).json().id;
    const post = (payload: unknown) => app.inject({ method: 'POST', url: '/api/analyses', payload: payload as object });
    expect((await post({})).statusCode).toBe(400);
    expect((await post({ ...kruskalBody(id), goal: 'yanlış' })).statusCode).toBe(400);
    const unknownCol = await post({ ...kruskalBody(id), value: 'yok' });
    expect(unknownCol.statusCode).toBe(422);
    expect(unknownCol.json().error.message).toContain('yok');
    const notNumeric = await post({ ...kruskalBody(id), value: 'grup' });
    expect(notNumeric.statusCode).toBe(422);
    expect(notNumeric.json().error.code).toBe('not_numeric');
    expect((await post({ ...kruskalBody('yok-id') })).statusCode).toBe(404);
    const predict = await post({ ...kruskalBody(id), goal: 'predict' });
    expect(predict.statusCode).toBe(422);
    expect(predict.json().error.message).toContain('Model Karşılaştırma');
  });

  it('kategorik karşılaştırma grup ve sonuç sütunlarından çapraz tablo kurar', async () => {
    const rows = ['grup,sonuc', ...Array.from({ length: 60 }, (_, i) => `${i % 2 ? 'a' : 'b'},${i % 3 === 0 ? 'evet' : 'hayır'}`)].join('\n');
    const id = (await upload(rows)).json().id;
    const r = await app.inject({ method: 'POST', url: '/api/analyses', payload: { datasetId: id, goal: 'compare', design: 'independent', target: 'categorical', group: 'grup', value: 'sonuc' } });
    expect(r.statusCode).toBe(201);
    expect(r.json().result.outcome.kind).toBe('table');
  });

  it('veri kalitesini gerçek sütunlardan hesaplar', async () => {
    const id = (await upload(csv())).json().id;
    const r = await app.inject({ url: `/api/datasets/${id}/quality?value=biyobelirtec&group=grup` });
    expect(r.statusCode).toBe(200);
    const q = r.json();
    expect(q.rows).toBe(45);
    expect(q.columns.find((c: { name: string }) => c.name === 'id').skipped).toBe(true);
    expect(q.focus.boxesBefore.map((b: { group: string }) => b.group)).toEqual(['A', 'B', 'C']);
    expect((await app.inject({ url: `/api/datasets/${id}/quality?value=yok` })).statusCode).toBe(422);
  });
});

describe('güvenlik', () => {
  it('yerel olmayan Host başlığını reddeder (DNS rebinding)', async () => {
    const r = await app.inject({ url: '/api/health', headers: { host: 'evil.example.com' } });
    expect(r.statusCode).toBe(403);
    expect((await app.inject({ url: '/api/health', headers: { host: '127.0.0.1:3001' } })).statusCode).toBe(200);
  });

  it('aynı köken (Origin ve Host aynı) kabul edilir, farklı port ve site reddedilir', async () => {
    const same = await app.inject({ method: 'POST', url: '/api/analyses', payload: {}, headers: { host: '127.0.0.1:4173', origin: 'http://127.0.0.1:4173' } });
    expect(same.statusCode).toBe(400);
    const other = await app.inject({ method: 'POST', url: '/api/analyses', payload: {}, headers: { host: '127.0.0.1:3001', origin: 'http://127.0.0.1:9999' } });
    expect(other.statusCode).toBe(403);
  });

  it('yazma isteklerinde yabancı Origin’i reddeder, izinli olanı kabul eder', async () => {
    const bad = await app.inject({ method: 'POST', url: '/api/analyses', payload: {}, headers: { origin: 'https://evil.example.com' } });
    expect(bad.statusCode).toBe(403);
    const ok = await app.inject({ method: 'POST', url: '/api/analyses', payload: {}, headers: { origin: 'http://localhost:5173' } });
    expect(ok.statusCode).toBe(400);
  });

  it('yanıtlar önbelleğe alınmaz ve içerik türü koklanmaz', async () => {
    const r = await app.inject({ url: '/api/health' });
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.headers['x-content-type-options']).toBe('nosniff');
  });

  it('beklenmeyen hatada ayrıntı sızdırmaz', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/analyses', payload: 'bozuk', headers: { 'content-type': 'application/json' } });
    expect(r.statusCode).toBe(400);
    expect(r.body).not.toMatch(/at .*\.ts/);
  });
});

describe('kalıcılık', () => {
  it('veri ve analizler yeniden başlatmadan sonra korunur; dosya diskte karma adıyla durur', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'statadvisor-'));
    try {
      const first = buildApp({ dataDir: dir });
      const { payload, headers } = multipart('../../etc/passwd.csv', csv());
      const up = await first.inject({ method: 'POST', url: '/api/datasets', payload, headers });
      const id = up.json().id;
      const created = (await first.inject({ method: 'POST', url: '/api/analyses', payload: kruskalBody(id) })).json();
      await first.close();

      const files = readdirSync(join(dir, 'files'));
      expect(files).toHaveLength(1);
      expect(files[0]).toMatch(/^[0-9a-f]{64}\.csv$/);

      const second = buildApp({ dataDir: dir });
      expect((await second.inject({ url: '/api/datasets' })).json().datasets).toHaveLength(1);
      expect((await second.inject({ url: `/api/analyses/${created.id}` })).json().result.outcome.p).toBe(created.result.outcome.p);
      // Yeniden başlatma sonrası da yeni analiz yapılabilir (dosya diskten okunur)
      expect((await second.inject({ method: 'POST', url: '/api/analyses', payload: kruskalBody(id) })).statusCode).toBe(201);
      await second.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('örnek veri, temizleme ve önizleme', () => {
  it('yerleşik örnekleri listeler ve sıradan bir veri seti olarak yükler', async () => {
    const list = (await app.inject({ url: '/api/samples' })).json().samples;
    expect(list.map((s: { kind: string }) => s.kind)).toEqual(['klinik', 'tedavi', 'anket']);
    const klinik = await app.inject({ method: 'POST', url: '/api/samples/klinik' });
    expect(klinik.statusCode).toBe(201);
    expect(klinik.json().rows).toBe(1420);
    const types = Object.fromEntries(klinik.json().columns.map((c: { name: string; type: string }) => [c.name, c.type]));
    expect(types).toMatchObject({ grup: 'categorical', yas: 'continuous', kan_basinci: 'continuous', gelir_duzeyi: 'continuous' });
    expect(klinik.json().columns.find((c: { name: string }) => c.name === 'gelir_duzeyi').missing).toBe(60);
    expect((await app.inject({ method: 'POST', url: '/api/samples/klinik' })).statusCode).toBe(200);
    const anket = (await app.inject({ method: 'POST', url: '/api/samples/anket' })).json();
    expect(anket.columns.find((c: { name: string }) => c.name === 'memnuniyet').type).toBe('ordinal');
    expect((await app.inject({ method: 'POST', url: '/api/samples/yok' })).statusCode).toBe(404);
  });

  it('örnek verilerde üç tasarım da uçtan uca çalışır', async () => {
    const klinik = (await app.inject({ method: 'POST', url: '/api/samples/klinik' })).json();
    const a = await app.inject({ method: 'POST', url: '/api/analyses', payload: { datasetId: klinik.id, goal: 'compare', design: 'independent', target: 'continuous', value: 'kan_basinci', group: 'grup' } });
    expect(a.statusCode).toBe(201);
    expect(a.json().result.outcome.n).toBe(1420);
    const tedavi = (await app.inject({ method: 'POST', url: '/api/samples/tedavi' })).json();
    const p = await app.inject({ method: 'POST', url: '/api/analyses', payload: { datasetId: tedavi.id, goal: 'compare', design: 'paired', target: 'continuous', conditions: ['baslangic', 'ay_1', 'ay_3'] } });
    expect(p.statusCode).toBe(201);
    expect(p.json().result.outcome.significant).toBe(true);
    const anket = (await app.inject({ method: 'POST', url: '/api/samples/anket' })).json();
    const c = await app.inject({ method: 'POST', url: '/api/analyses', payload: { datasetId: anket.id, goal: 'compare', design: 'independent', target: 'ordinal', value: 'memnuniyet', group: 'bolum' } });
    expect(c.json().result.decision.finalTest).toBe('Kruskal-Wallis H testi');
  });

  it('kaydetmeden önizleme: save=false veritabanına yazmaz', async () => {
    const id = (await upload()).json().id;
    const r = await app.inject({ method: 'POST', url: '/api/analyses?save=false', payload: kruskalBody(id) });
    expect(r.statusCode).toBe(200);
    expect(r.json().id).toBeNull();
    expect(r.json().result.outcome.test).toBe('Kruskal-Wallis H testi');
    expect((await app.inject({ url: '/api/analyses' })).json().analyses).toHaveLength(0);
  });

  it('temizleme yeni bir veri sürümü üretir; ham veri değişmez, kaynağı kayıtlıdır ve rapora yansır', async () => {
    const raw = (await app.inject({ method: 'POST', url: '/api/samples/klinik' })).json();
    const r = await app.inject({ method: 'POST', url: `/api/datasets/${raw.id}/clean`, payload: { outlierColumns: ['kan_basinci', 'biyobelirtec_x'], impute: 'median' } });
    expect(r.statusCode).toBe(201);
    const clean = r.json();
    expect(clean.id).not.toBe(raw.id);
    expect(clean.parentId).toBe(raw.id);
    expect(clean.rows).toBeLessThan(1420);
    expect(clean.columns.find((c: { name: string }) => c.name === 'gelir_duzeyi').missing).toBe(0);
    expect(clean.operations.removedRows).toBe(1420 - clean.rows);
    expect(clean.operations.log.join(' ')).toContain('Tukey');
    expect((await app.inject({ url: `/api/datasets/${raw.id}` })).json().rows).toBe(1420);
    // aynı işlem tekrarlanırsa aynı sürüm döner
    const again = await app.inject({ method: 'POST', url: `/api/datasets/${raw.id}/clean`, payload: { outlierColumns: ['kan_basinci', 'biyobelirtec_x'], impute: 'median' } });
    expect(again.statusCode).toBe(200);
    expect(again.json().id).toBe(clean.id);
    // temizlenmiş sürümde analiz ve rapor
    const a = (await app.inject({ method: 'POST', url: '/api/analyses', payload: { datasetId: clean.id, goal: 'compare', design: 'independent', target: 'continuous', value: 'kan_basinci', group: 'grup' } })).json();
    const html = (await app.inject({ url: `/api/analyses/${a.id}/report` })).body;
    expect(html).toContain('Temizlenmiş sürüm');
    expect(html).toContain('Temizlik işlemi');
    // hatalı istekler
    expect((await app.inject({ method: 'POST', url: `/api/datasets/${raw.id}/clean`, payload: {} })).statusCode).toBe(422);
    expect((await app.inject({ method: 'POST', url: `/api/datasets/${raw.id}/clean`, payload: { outlierColumns: ['grup'] } })).statusCode).toBe(422);
    expect((await app.inject({ method: 'POST', url: `/api/datasets/${raw.id}/clean`, payload: { outlierColumns: ['yok'] } })).statusCode).toBe(422);
  });

  it('kaynak veri silinince türetilmiş sürüm korunur', async () => {
    const raw = (await app.inject({ method: 'POST', url: '/api/samples/klinik' })).json();
    const clean = (await app.inject({ method: 'POST', url: `/api/datasets/${raw.id}/clean`, payload: { impute: 'median' } })).json();
    expect((await app.inject({ method: 'DELETE', url: `/api/datasets/${raw.id}` })).statusCode).toBe(204);
    const kept = (await app.inject({ url: `/api/datasets/${clean.id}` })).json();
    expect(kept.parentId).toBeNull();
  });

  it('tümünü sil: veri setleri, türetilmiş sürümler ve bağlı analizler silinir; boşken de çalışır', async () => {
    expect((await app.inject({ method: 'DELETE', url: '/api/datasets' })).json()).toEqual({ deletedDatasets: 0, deletedAnalyses: 0 });
    const raw = (await app.inject({ method: 'POST', url: '/api/samples/klinik' })).json();
    await app.inject({ method: 'POST', url: `/api/datasets/${raw.id}/clean`, payload: { impute: 'median' } });
    await app.inject({ method: 'POST', url: '/api/analyses', payload: { datasetId: raw.id, goal: 'compare', design: 'independent', target: 'continuous', value: 'kan_basinci', group: 'grup' } });
    const r = await app.inject({ method: 'DELETE', url: '/api/datasets' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ deletedDatasets: 2, deletedAnalyses: 1 });
    expect((await app.inject({ url: '/api/datasets' })).json().datasets).toHaveLength(0);
    expect((await app.inject({ url: '/api/analyses' })).json().analyses).toHaveLength(0);
    expect((await app.inject({ url: `/api/datasets/${raw.id}` })).statusCode).toBe(404);
  });

  it('kaynak silinse bile rapor "ham veri" demez; temizlik geçmişini gösterir', async () => {
    const raw = (await app.inject({ method: 'POST', url: '/api/samples/klinik' })).json();
    const clean = (await app.inject({ method: 'POST', url: `/api/datasets/${raw.id}/clean`, payload: { outlierColumns: ['kan_basinci'], impute: 'median' } })).json();
    const a = (await app.inject({ method: 'POST', url: '/api/analyses', payload: { datasetId: clean.id, goal: 'compare', design: 'independent', target: 'continuous', value: 'kan_basinci', group: 'grup' } })).json();
    expect((await app.inject({ method: 'DELETE', url: `/api/datasets/${raw.id}` })).statusCode).toBe(204);
    const html = (await app.inject({ url: `/api/analyses/${a.id}/report` })).body;
    expect(html).not.toContain('Ham veri (değiştirilmemiş)');
    expect(html).toContain('Temizlenmiş sürüm');
    expect(html).toContain('silinmiş veri seti');
    expect(html).toContain('Temizlik işlemi');
  });

  it('200.000 satırlık veride kutu grafiği ve dağılım özeti hata vermez', async () => {
    const lines = ['grup,deger'];
    for (let i = 0; i < 200_000; i++) lines.push(`${i % 2 ? 'A' : 'B'},${((i * 7919) % 10007) / 10}`);
    const big = buildApp({ dataDir: ':memory:', maxUploadBytes: 20_000_000 });
    try {
      const up = await big.inject({ method: 'POST', url: '/api/datasets', ...multipart('buyuk.csv', lines.join('\n')) });
      expect(up.statusCode).toBe(201);
      const r = await big.inject({ method: 'POST', url: '/api/analyses?save=false', payload: { datasetId: up.json().id, goal: 'compare', design: 'independent', target: 'continuous', value: 'deger', group: 'grup' } });
      expect(r.statusCode).toBe(200);
    } finally {
      await big.close();
    }
  }, 60_000);
});
