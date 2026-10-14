import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.ts';

let app: FastifyInstance;
beforeEach(() => {
  app = buildApp({ dataDir: ':memory:' });
});
afterEach(async () => {
  await app.close();
});

async function upload(content: string, filename = 'veri.csv') {
  const boundary = '----q';
  const payload = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: text/csv\r\n\r\n${content}\r\n--${boundary}--\r\n`);
  const r = await app.inject({ method: 'POST', url: '/api/datasets', payload, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } });
  expect(r.statusCode, r.body).toBeLessThan(300);
  return r.json();
}
const get = async (url: string) => app.inject({ url });
const quality = async (id: string, params: Record<string, string> = {}) => (await get(`/api/datasets/${id}/quality?${new URLSearchParams(params)}`)).json();
const put = (id: string, columns: Record<string, unknown>) => app.inject({ method: 'PUT', url: `/api/datasets/${id}/profile`, payload: { columns } });
const clean = (id: string, body: Record<string, unknown>) => app.inject({ method: 'POST', url: `/api/datasets/${id}/clean`, payload: body });
const rulesJson = (rules: unknown[]) => JSON.stringify(rules);

/** Anket benzeri veri: 179 satır, 1–5 maddeler (geçerli uç cevaplar seyrek), sürekli puan, sayısal kategori kodu. */
function survey(opts: { nine?: boolean } = {}) {
  const lines = ['id,grup,m1,m2,puan,kod,yas'];
  for (let i = 0; i < 179; i++) {
    const m1 = i === 5 && opts.nine ? 9 : i % 29 === 0 ? 1 : i % 31 === 0 ? 5 : 3 + (i % 2);
    const m2 = i % 37 === 0 ? 5 : i % 41 === 0 ? 1 : 4;
    const puan = i === 7 ? 95 : i === 8 ? 5 : 50 + (i % 9);
    const kod = i === 3 ? 3 : 1 + (i % 2); // 3 kodu seyrek
    const yas = i === 9 ? 999 : 20 + (i % 30);
    lines.push(`${i + 1},${['A', 'B', 'C'][i % 3]},${m1},${m2},${puan},${kod},${yas}`);
  }
  return lines.join('\n') + '\n';
}
type Col = Record<string, unknown> & { name: string; type: string; inferredType: string; warnings: string[] };
const col = (d: unknown, name: string) => (d as { columns: Col[] }).columns.find((c) => c.name === name) as Col;

describe('veri kalitesi: güvenli varsayılanlar ve türe göre kontrol', () => {
  it('kural verilmezse satır silinmez; sıralı maddeler ve kategorik kod Tukey ile taranmaz; sürekli uç değerler görünür', async () => {
    const ds = await upload(survey());
    const q = await quality(ds.id, { value: 'puan', group: 'grup' });
    expect(q.plan.rules).toEqual([]);
    expect(q.plan.removedRows).toBe(0);
    expect(q.plan.cleanedRows).toBe(179);
    const byName = Object.fromEntries(q.columns.map((c: { name: string }) => [c.name, c]));
    expect(byName.m1).toMatchObject({ kind: 'ordinal', tukeyApplied: false, extremes: 0 });
    expect(byName.m2).toMatchObject({ kind: 'ordinal', tukeyApplied: false, extremes: 0 });
    expect(byName.kod).toMatchObject({ kind: 'ordinal', tukeyApplied: false, extremes: 0 });
    expect(byName.puan.extremes).toBeGreaterThanOrEqual(2); // 95 ve 5: incelenecek
    expect(byName.id.skipped).toBe(true);
    expect(q.invalidCells).toBe(0); // hiçbir kural doğrulanmadı
  });

  it('eski sütun listesi parametresi artık “hepsi” anlamına gelmez; sıralı maddeye Tukey kuralı reddedilir', async () => {
    const ds = await upload(survey());
    const empty = await quality(ds.id, { cleanJson: '[]' });
    expect(empty.plan.removedRows).toBe(0);
    const res = await get(`/api/datasets/${ds.id}/quality?${new URLSearchParams({ cleanJson: JSON.stringify(['m1', 'puan']) })}`);
    expect(res.statusCode).toBe(422);
    expect(res.json().error.message).toContain('Tukey sınırı yalnızca sürekli');
  });

  it('doğrulanmış 1–5 aralığında 9 geçersiz hücredir; doğrulanmadıysa işaretlenmez; seyrek geçerli 1 ve 5 korunur', async () => {
    const ds = await upload(survey({ nine: true }));
    expect((await quality(ds.id)).invalidCells).toBe(0);
    expect((await quality(ds.id)).columns.find((c: { name: string }) => c.name === 'm1').validity).toBe('unconfirmed');
    const saved = await put(ds.id, { m1: { validRange: { min: 1, max: 5 } } });
    expect(saved.statusCode).toBe(200);
    expect(col(saved.json(), 'm1').profile).toMatchObject({ validRange: { min: 1, max: 5 } });
    const q = await quality(ds.id);
    expect(q.columns.find((c: { name: string }) => c.name === 'm1')).toMatchObject({ validity: 'range', invalid: 1 });
    expect(q.invalidCells).toBe(1);
    expect(q.plan.removedRows).toBe(0);
    // geçersiz hücreyi eksik işaretle: satır silinmez
    const set = await quality(ds.id, { rulesJson: rulesJson([{ column: 'm1', issue: 'invalid', action: 'setMissing' }]) });
    expect(set.plan).toMatchObject({ removedRows: 0, setMissingCells: 1 });
    // doğrulanmamış sütunda geçersiz-hücre kuralı reddedilir
    const bad = await get(`/api/datasets/${ds.id}/quality?${new URLSearchParams({ rulesJson: rulesJson([{ column: 'm2', issue: 'invalid', action: 'setMissing' }]) })}`);
    expect(bad.statusCode).toBe(422);
    expect(bad.json().error.message).toContain('doğrulanmadı');
  });

  it('kullanıcı türü düzeltebilir: sayısal kod kategorik olunca Tukey uygulanmaz ve tanımlı kategoriler dışı ayrı işaretlenir', async () => {
    const ds = await upload(survey());
    expect(col(ds, 'kod')).toMatchObject({ type: 'ordinal', inferredType: 'ordinal' });
    expect(col(ds, 'yas').warnings.join(' ')).toBe(''); // 30 farklı değer: sürekli, uyarı yok
    expect(col(ds, 'kod').warnings.join(' ')).toContain('Kategori numarası');
    const saved = await put(ds.id, { kod: { type: 'categorical', validCategories: ['1', '2'] } });
    expect(saved.statusCode).toBe(200);
    expect(col(saved.json(), 'kod')).toMatchObject({ type: 'categorical', inferredType: 'ordinal', typeOverridden: true });
    const q = await quality(ds.id);
    expect(q.columns.find((c: { name: string }) => c.name === 'kod')).toMatchObject({ kind: 'categorical', tukeyApplied: false, extremes: 0, validity: 'categories', invalid: 1 });
    // kategorik sayısal sütun sayısal sonuç sütunu adayı değildir ama grup olarak kullanılabilir (arayüz bunu uygular)
    // geçersiz: metin sütununu sürekli yapmak ve kategorik sütuna aralık vermek
    expect((await put(ds.id, { grup: { type: 'continuous' } })).statusCode).toBe(422);
    expect((await put(ds.id, { kod: { type: 'categorical', validRange: { min: 1, max: 2 } } })).statusCode).toBe(422);
    expect((await put(ds.id, { m1: { validRange: { min: 5, max: 1 } } })).statusCode).toBe(400);
    expect((await put(ds.id, { yok: { type: 'categorical' } })).statusCode).toBe(422);
    // aynı sütunu sürekli yapmak Tukey'i açar
    await put(ds.id, { kod: { type: 'continuous' } });
    expect((await quality(ds.id)).columns.find((c: { name: string }) => c.name === 'kod').tukeyApplied).toBe(true);
  });

  it('profil veri setine özgüdür: başka veri setine ve yeni veriye taşınmaz', async () => {
    const a = await upload(survey({ nine: true }), 'a.csv');
    const b = await upload(survey(), 'b.csv');
    await put(a.id, { m1: { validRange: { min: 1, max: 5 } }, kod: { type: 'categorical' } });
    const qb = await quality(b.id);
    expect(qb.columns.find((c: { name: string }) => c.name === 'm1').validity).toBe('unconfirmed');
    expect(qb.columns.find((c: { name: string }) => c.name === 'kod').kind).toBe('ordinal');
    expect(qb.plan.rules).toEqual([]);
    const list = (await get('/api/datasets')).json().datasets;
    expect(col(list.find((d: { id: string }) => d.id === b.id), 'kod').type).toBe('ordinal');
  });

  it('ölçek puanı maddelerden ayrı değerlendirilir: sürekli sayılır, aralığı ölçek tanımından gelir', async () => {
    const ds = await upload(survey());
    const r = await app.inject({ method: 'POST', url: `/api/datasets/${ds.id}/scales`, payload: { scales: [{ name: 'ozguven', items: ['m1', 'm2'], reverse: [], method: 'mean', min: 1, max: 5, minValidShare: 1 }] } });
    expect(r.statusCode, r.body).toBeLessThan(300);
    const scaled = r.json();
    const q = await quality(scaled.id);
    const c = q.columns.find((x: { name: string }) => x.name === 'ozguven');
    expect(c).toMatchObject({ score: true, kind: 'continuous', validity: 'range', validRange: { min: 1, max: 5 }, invalid: 0 });
    expect(q.columns.find((x: { name: string }) => x.name === 'm1').score).toBe(false);
    expect(col(scaled, 'ozguven')).toMatchObject({ score: true, type: 'continuous' });
  });
});

describe('temizleme: açık kurallar, satır kaybı, onay ve sürüm geçmişi', () => {
  it('hiçbir kural ve doldurma yoksa işlem reddedilir; eski outlierColumns hâlâ çalışır', async () => {
    const ds = await upload(survey());
    expect((await clean(ds.id, {})).statusCode).toBe(422);
    expect((await clean(ds.id, { rules: [], impute: 'none' })).statusCode).toBe(422);
    const legacy = await clean(ds.id, { outlierColumns: ['puan'], impute: 'none' });
    expect(legacy.statusCode).toBe(201);
    expect(legacy.json().rows).toBeLessThan(179);
    expect((await clean(ds.id, { outlierColumns: ['m1'] })).statusCode).toBe(422); // sıralı madde
  });

  it('eksik işaretleme satırı korur; satır silme yalnızca seçilirse; doldurma yalnızca seçilirse', async () => {
    const ds = await upload(survey({ nine: true }));
    await put(ds.id, { m1: { validRange: { min: 1, max: 5 } } });
    const r = await clean(ds.id, { rules: [{ column: 'm1', issue: 'invalid', action: 'setMissing' }] });
    expect(r.statusCode).toBe(201);
    const child = r.json();
    expect(child.rows).toBe(179);
    expect(child.operations).toMatchObject({ kind: 'cleaning', removedRows: 0, setMissingCells: 1, imputedCells: 0 });
    expect(child.operations.rules).toEqual([{ column: 'm1', issue: 'invalid', action: 'setMissing' }]);
    expect(col(child, 'm1').missing).toBe(1); // doldurulmadı, eksik kaldı
    // aynı işlemde doldurma açıkça istenirse
    const filled = await clean(ds.id, { rules: [{ column: 'm1', issue: 'invalid', action: 'setMissing' }], impute: 'median' });
    expect(filled.json().operations.imputedCells).toBe(1);
    expect(col(filled.json(), 'm1').missing).toBe(0);
    // profil türetilmiş sürüme kopyalandı
    expect(col(child, 'm1').profile).toMatchObject({ validRange: { min: 1, max: 5 } });
  });

  it('birden fazla sütunda işaretli kişi satır kaybında bir kez sayılır', async () => {
    const lines = ['a,b'];
    for (let i = 0; i < 60; i++) lines.push(`${(10 + (i % 5) * 0.7).toFixed(1)},${(20 + (i % 4) * 0.9).toFixed(1)}`);
    lines[8] = '900,900'; // aynı kişi iki sütunda
    lines[30] = '12.1,800';
    const ds = await upload(lines.join('\n') + '\n');
    const rules = rulesJson([{ column: 'a', issue: 'extreme', action: 'removeRow' }, { column: 'b', issue: 'extreme', action: 'removeRow' }]);
    const q = await quality(ds.id, { rulesJson: rules });
    expect(q.plan.byRule.map((r: { cells: number }) => r.cells)).toEqual([1, 2]);
    expect(q.plan.removedRows).toBe(2);
    expect(q.plan.cleanedRows).toBe(58);
    const r = await clean(ds.id, { rules: JSON.parse(rules) });
    expect(r.json().rows).toBe(58);
  });

  it('%10 üzeri satır kaybı gerekçe ve açık onay ister; grup bazlı kayıp da denetlenir', async () => {
    const lines = ['g,v'];
    for (let i = 0; i < 100; i++) lines.push(`${i < 50 ? 'A' : 'B'},${i >= 80 && i < 92 ? 500 : (10 + (i % 5) * 0.7).toFixed(1)}`);
    const ds = await upload(lines.join('\n') + '\n');
    const rule = [{ column: 'v', issue: 'extreme', action: 'removeRow' }];
    const q = await quality(ds.id, { rulesJson: rulesJson(rule), group: 'g' });
    expect(q.plan.removedRate).toBeCloseTo(12, 10);
    expect(q.plan).toMatchObject({ level: 'confirm', reviewThreshold: 5, confirmThreshold: 10 });
    const refused = await clean(ds.id, { rules: rule });
    expect(refused.statusCode).toBe(422);
    expect(refused.json().error.code).toBe('confirmation_required');
    expect((await clean(ds.id, { rules: rule, acknowledgement: { reason: 'kısa' } })).statusCode).toBe(400);
    const ok = await clean(ds.id, { rules: rule, groupColumn: 'g', acknowledgement: { reason: 'Veri girişi hatası olduğu kaynak dosyadan doğrulandı.' } });
    expect(ok.statusCode).toBe(201);
    expect(ok.json().operations.acknowledgement.reason).toContain('doğrulandı');
    expect(ok.json().operations.loss).toMatchObject({ level: 'confirm', confirmThreshold: 10 });
    // toplam %8 (onay gerekmez) ama B grubunda %16: grup sütunu verilince onay istenir
    const l2 = ['g,v'];
    for (let i = 0; i < 100; i++) l2.push(`${i < 50 ? 'A' : 'B'},${i >= 60 && i < 68 ? 500 : (10 + (i % 5) * 0.7).toFixed(1)}`);
    const ds2 = await upload(l2.join('\n') + '\n', 'iki.csv');
    expect((await clean(ds2.id, { rules: rule })).statusCode).toBe(201);
    const ds3 = await upload(l2.join('\n').replace('A,10.0', 'A,11.0') + '\n', 'uc.csv');
    const g = await clean(ds3.id, { rules: rule, groupColumn: 'g' });
    expect(g.statusCode).toBe(422);
    expect(g.json().error.message).toContain('“B” grubu');
  });

  it('sürüm geçmişi korunur; yeniden temizlemede Tukey sınırlarının yeniden hesaplandığı belirtilir; ham veri değişmez', async () => {
    const raw = await upload(survey());
    const rule = [{ column: 'puan', issue: 'extreme', action: 'setMissing' }];
    const first = (await clean(raw.id, { rules: rule })).json();
    expect(first.operations.history).toEqual([]); // ham kaynak geçmişe girmez
    const second = (await clean(first.id, { rules: [{ column: 'yas', issue: 'extreme', action: 'setMissing' }] })).json();
    expect(second.operations.history).toHaveLength(1);
    expect(second.operations.history[0]).toMatchObject({ dataset: first.name, operations: { kind: 'cleaning', rules: rule } });
    expect(second.operations.log.join(' ')).toContain('daha önce işlenmiş');
    const third = (await clean(second.id, { impute: 'median' })).json();
    expect(third.operations.history.map((h: { dataset: string }) => h.dataset)).toEqual([first.name, second.name]);
    // ham veri hâlâ özgün
    expect((await get(`/api/datasets/${raw.id}`)).json().rows).toBe(179);
    expect((await quality(raw.id)).missingCells).toBe(0);
  });

  it('KNN desteklenmiyorsa sessizce başka yönteme geçmez, açık hata verir', async () => {
    const lines = ['x,y'];
    for (let i = 0; i < 5001; i++) lines.push(`${i % 97 + (i % 7) / 10},${i === 3 ? '' : (i % 53) + (i % 11) / 10}`);
    const ds = await upload(lines.join('\n') + '\n');
    const knn = await clean(ds.id, { impute: 'knn' });
    expect(knn.statusCode).toBe(422);
    expect(knn.json().error.code).toBe('knn_too_large');
    expect((await get(`/api/datasets/${ds.id}/cleaning-code?impute=knn`)).statusCode).toBe(422);
    expect((await clean(ds.id, { impute: 'median' })).statusCode).toBe(201);
  });

  it('kural biçimi hataları: bozuk JSON 400, bilinmeyen sütun 422, kural ile eski parametre birlikte 400', async () => {
    const ds = await upload(survey());
    for (const invalid of ['{', '{}', '[1]', '[{"column":"puan"}]']) {
      expect((await get(`/api/datasets/${ds.id}/quality?${new URLSearchParams({ rulesJson: invalid })}`)).statusCode).toBe(400);
      expect((await get(`/api/datasets/${ds.id}/cleaning-code?${new URLSearchParams({ rulesJson: invalid })}`)).statusCode).toBe(400);
    }
    const unknown = rulesJson([{ column: 'yok', issue: 'extreme', action: 'removeRow' }]);
    expect((await get(`/api/datasets/${ds.id}/quality?${new URLSearchParams({ rulesJson: unknown })}`)).statusCode).toBe(422);
    expect((await get(`/api/datasets/${ds.id}/quality?${new URLSearchParams({ rulesJson: '[]', cleanJson: '[]' })}`)).statusCode).toBe(400);
    expect((await clean(ds.id, { rules: [], outlierColumns: [] })).statusCode).toBe(400);
  });

  it('Türkçe ve virgüllü sütun adlarıyla kurallar ve kod çalışır; boş seçim hiçbir şeyi seçmez', async () => {
    const a = 'Kendime güveniyorum, çoğu zaman';
    const b = 'Çocukluk yaşı (yıl)';
    const lines = [`"${a}","${b}"`];
    for (let i = 0; i < 40; i++) lines.push(`${i === 4 ? 400 : (50 + (i % 6) * 0.8).toFixed(1)},${(20 + (i % 7) * 0.6).toFixed(1)}`);
    const ds = await upload(lines.join('\n') + '\n');
    const rule = [{ column: a, issue: 'extreme', action: 'setMissing' }];
    const q = await quality(ds.id, { rulesJson: rulesJson(rule), value: a, group: b });
    expect(q.plan.setMissingCells).toBe(1);
    const code = (await get(`/api/datasets/${ds.id}/cleaning-code?${new URLSearchParams({ rulesJson: rulesJson(rule) })}`)).json();
    expect(code.code).toContain(a);
    expect(code.code).toContain('"uc"');
    const none = await quality(ds.id, { rulesJson: '[]' });
    expect(none.plan.rules).toEqual([]);
    expect(none.plan.removedRows).toBe(0);
  });
});
