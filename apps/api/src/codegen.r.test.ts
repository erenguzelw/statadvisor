/**
 * "Kod = ekrandaki sonuç" garantisi (R): üretilen R betiği gerçekten çalıştırılır ve çıktısı, arayüzde gösterilen
 * beklenen çıktıyla birebir karşılaştırılır. R bulunmayan ortamlarda bu testler atlanır; atlandığı çıktıda görünür.
 *
 * Rscript yolu: STATADVISOR_RSCRIPT ortam değişkeni, PATH ya da Windows'ta C:Program FilesR altındaki en yeni sürüm.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { gaussian, mulberry32 } from '@statadvisor/shared';
import { buildApp } from './app.ts';

function findRscript(): string {
  if (process.env.STATADVISOR_RSCRIPT) return process.env.STATADVISOR_RSCRIPT;
  if (spawnSync('Rscript', ['--version']).status === 0) return 'Rscript';
  const base = 'C:/Program Files/R';
  if (existsSync(base)) {
    const v = readdirSync(base).filter((d) => d.startsWith('R-')).sort().reverse()[0];
    if (v && existsSync(join(base, v, 'bin', 'Rscript.exe'))) return join(base, v, 'bin', 'Rscript.exe');
  }
  return '';
}
const RS = findRscript();
const hasR = RS !== '' && spawnSync(RS, ['-e', '1'], { encoding: 'utf8' }).status === 0;
if (!hasR) console.warn('UYARI: R bulunamadı; üretilen R kodunun doğrulama testleri atlanıyor.');
const suite = hasR ? describe : describe.skip;

const rng = mulberry32(11);
const g = (n: number, mu: number, s = 1) => Array.from({ length: n }, () => Math.round((mu + s * gaussian(rng)) * 100) / 100);
const csv = (header: string[], rows: (string | number)[][], sep = ',') => [header.join(sep), ...rows.map((r) => r.join(sep))].join('\n') + '\n';
const twoGroups = (a: number[], b: number[], sep = ',', dec = '.') =>
  csv(['grup', 'deger'], [...a.map((v) => ['kontrol', String(v).replace('.', dec)]), ...b.map((v) => ['tedavi', String(v).replace('.', dec)])], sep);

let app: FastifyInstance;
let work: string;
beforeEach(() => {
  app = buildApp({ dataDir: ':memory:' });
  work = mkdtempSync(join(tmpdir(), 'sa-r-'));
});
afterEach(async () => {
  await app.close();
  rmSync(work, { recursive: true, force: true });
});

async function sample(kind: string) {
  return (await app.inject({ method: 'POST', url: `/api/samples/${kind}` })).json().id as string;
}
async function uploadCsv(content: string, name = 'veri.csv') {
  const boundary = '----sapy';
  const payload = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: text/csv\r\n\r\n${content}\r\n--${boundary}--\r\n`);
  const r = await app.inject({ method: 'POST', url: '/api/datasets', payload, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } });
  expect(r.statusCode).toBeLessThan(300);
  return r.json().id as string;
}

/** Analizi kaydeder, kodu alır, dosyayı yazar, R'da çalıştırır; çıktıyı beklenenle karşılaştırır. */
async function verify(datasetId: string, body: Record<string, unknown>) {
  const created = await app.inject({ method: 'POST', url: '/api/analyses', payload: { datasetId, ...body } });
  expect(created.statusCode, created.body).toBe(201);
  const analysis = created.json();
  const code = (await app.inject({ url: `/api/analyses/${analysis.id}/code?lang=r` })).json();
  const ds = (await app.inject({ url: `/api/datasets/${datasetId}` })).json();
  writeFileSync(join(work, ds.name), (await app.inject({ url: `/api/datasets/${datasetId}/download` })).rawPayload);
  writeFileSync(join(work, code.filename), code.code);
  const out = execFileSync(RS, [code.filename], { cwd: work, encoding: 'utf8', timeout: 90_000 });
  expect(out.trim().split(/\r?\n/)).toEqual(code.expectedOutput);
  return { analysis: analysis.result, code };
}

const cmp = (extra: Record<string, unknown>) => ({ goal: 'compare', design: 'independent', target: 'continuous', ...extra });

suite('üretilen R kodu, ekrandaki sonucu birebir yeniden üretir', () => {
  const T = 120_000;

  it('3 grup, sürekli: klinik örnek (kan basıncı, biyobelirteç, yaş)', { timeout: T }, async () => {
    const id = await sample('klinik');
    for (const value of ['kan_basinci', 'biyobelirtec_x', 'yas']) {
      const { analysis } = await verify(id, cmp({ value, group: 'grup' }));
      expect(analysis.assumptions.length).toBe(2);
    }
  });

  it('2 grup normal: Welch t-testi', { timeout: T }, async () => {
    const id = await uploadCsv(twoGroups(g(40, 10, 2), g(55, 12, 3)));
    const { analysis } = await verify(id, cmp({ value: 'deger', group: 'grup' }));
    expect(analysis.outcome.test).toBe('Welch t-testi');
  });

  it('2 grup çarpık: Mann-Whitney U', { timeout: T }, async () => {
    const skew = (n: number, mu: number) => g(n, mu, 0.7).map((v) => Math.round(Math.exp(v) * 100) / 100);
    const id = await uploadCsv(twoGroups(skew(40, 1), skew(35, 1.5)));
    const { analysis } = await verify(id, cmp({ value: 'deger', group: 'grup' }));
    expect(analysis.outcome.test).toBe('Mann-Whitney U testi');
  });

  it('noktalı virgül ayraç ve ondalık virgül', { timeout: T }, async () => {
    const id = await uploadCsv(twoGroups(g(30, 5), g(30, 6), ';', ','), 'virgullu.csv');
    const { code } = await verify(id, cmp({ value: 'deger', group: 'grup' }));
    expect(code.code).toContain('dec = ","');
    expect(code.code).toContain('sep = ";"');
  });

  it('3 grup normal, eşit olmayan varyans: Welch ANOVA ve Games–Howell (fark, GA ve p birebir)', { timeout: T }, async () => {
    const rows = [...g(40, 0, 1).map((v) => ['a', v]), ...g(50, 1.5, 1.5).map((v) => ['b', v]), ...g(45, 3, 0.8).map((v) => ['c', v])];
    const id = await uploadCsv(csv(['grup', 'y'], rows));
    const { analysis, code } = await verify(id, cmp({ value: 'y', group: 'grup' }));
    expect(analysis.outcome.test).toBe('Welch ANOVA');
    expect(analysis.outcome.postHoc?.method).toBe('Games–Howell');
    expect(analysis.outcome.postHoc?.pairs).toHaveLength(3);
    expect(code.expectedOutput.some((l: string) => /^a - b: fark = -?\d+\.\d{4} GA: \[/.test(l))).toBe(true);
  });

  it('4 grup normal, eşit varyans, farklı grup büyüklükleri; Levene tercihiyle klasik ANOVA ve Tukey–Kramer', { timeout: T }, async () => {
    // Kendi tohumuyla üretilir: ortak üretecin durumu önceki testlere bağlıdır ve Levene'i şans eseri anlamlı yapabilir.
    const r2 = mulberry32(2027); // bu tohumda Shapiro p = .83, Levene p = .93
    const h = (n: number, mu: number) => Array.from({ length: n }, () => Math.round((mu + 2 * gaussian(r2)) * 100) / 100);
    const rows = [...h(25, 10).map((v) => ['A', v]), ...h(32, 12).map((v) => ['B', v]), ...h(18, 10.4).map((v) => ['C', v]), ...h(28, 13.5).map((v) => ['D', v])];
    const id = await uploadCsv(csv(['grup', 'y'], rows));
    const { analysis } = await verify(id, cmp({ value: 'y', group: 'grup', variance: 'levene' }));
    expect(analysis.outcome.test, JSON.stringify(analysis.assumptions.map((x: { name: string; p: number }) => [x.name, x.p]))).toBe('Tek Yönlü ANOVA');
    expect(analysis.outcome.postHoc?.method).toBe('Tukey HSD (Tukey–Kramer)');
    expect(analysis.outcome.postHoc?.pairs).toHaveLength(6);
    expect(analysis.outcome.postHoc?.letters.map((l: { group: string }) => l.group)[0]).toBe('D');
  });

  it('ilişki: Pearson ve Spearman', { timeout: T }, async () => {
    const id = await sample('klinik');
    await verify(id, { goal: 'relate', design: 'independent', target: 'continuous', x: 'yas', y: 'kan_basinci' });
    await verify(id, { goal: 'relate', design: 'independent', target: 'continuous', x: 'kan_basinci', y: 'biyobelirtec_x' });
  });

  it('eşleşmiş 2 ve 3 koşul (tedavi örneği)', { timeout: T }, async () => {
    const id = await sample('tedavi');
    await verify(id, { goal: 'compare', design: 'paired', target: 'continuous', conditions: ['baslangic', 'ay_3'] });
    await verify(id, { goal: 'compare', design: 'paired', target: 'continuous', conditions: ['baslangic', 'ay_1', 'ay_3'] });
  });

  it('eşleşmiş çarpık veri: Wilcoxon ve Friedman', { timeout: T }, async () => {
    const base = g(35, 0, 0.8).map((v) => Math.exp(v));
    const rows = base.map((b, i) => [i + 1, +(b).toFixed(3), +(b * 1.4 * Math.exp(gaussian(rng) * 0.5)).toFixed(3), +(b * 1.9 * Math.exp(gaussian(rng) * 0.5)).toFixed(3)]);
    const id = await uploadCsv(csv(['id', 't0', 't1', 't2'], rows));
    const w = await verify(id, { goal: 'compare', design: 'paired', target: 'continuous', conditions: ['t0', 't1'] });
    expect(['Wilcoxon işaretli sıra testi', 'Eşleştirilmiş t-testi']).toContain(w.analysis.outcome.test);
    const f = await verify(id, { goal: 'compare', design: 'paired', target: 'continuous', conditions: ['t0', 't1', 't2'] });
    expect(['Friedman testi', 'Tekrarlı ölçümler ANOVA']).toContain(f.analysis.outcome.test);
  });

  it('sıralı hedef ve kategorik tablolar (anket örneği)', { timeout: T }, async () => {
    const id = await sample('anket');
    const ord = await verify(id, cmp({ target: 'ordinal', value: 'memnuniyet', group: 'bolum' }));
    expect(ord.analysis.outcome.test).toBe('Kruskal-Wallis H testi');
    await verify(id, cmp({ target: 'categorical', group: 'bolum', value: 'tavsiye' }));
  });

  it('kodlu Likert etiketleri ("2:Bazen katılıyorum") sıralı sayıya çevrilir ve kod aynısını yapar', { timeout: T }, async () => {
    const labels = ['Hiç katılmıyorum', 'Çok az katılıyorum', 'Bazen katılıyorum', 'Genellikle katılıyorum', 'Tamamen katılıyorum'];
    const rows = Array.from({ length: 90 }, (_, i) => {
      const grup = ['kadın', 'erkek'][i % 2]!;
      const k = Math.min(4, Math.max(0, Math.round(2 + (grup === 'erkek' ? 0.8 : 0) + gaussian(rng))));
      return [grup, `${k}:${labels[k]}`];
    });
    const id = await uploadCsv(csv(['cinsiyet', 'madde'], rows), 'likert.csv');
    const ds = (await app.inject({ url: `/api/datasets/${id}` })).json();
    expect(ds.columns.find((c: { name: string }) => c.name === 'madde')).toMatchObject({ type: 'ordinal', numeric: true, prefixCoded: true });
    const { code } = await verify(id, cmp({ target: 'ordinal', value: 'madde', group: 'cinsiyet' }));
    expect(code.code).toContain('KODLU');
  });

  it('aralık etiketleri ("18-23", "1 saatten az", "7 ve üzeri") sıralanır ve kod aynısını yapar', { timeout: T }, async () => {
    const sure = ['4-6', '1 saatten az', '7 ve üzeri', '1-3 saat'];
    const yas = ['30-35', '18-23', '24-29'];
    const rows = Array.from({ length: 120 }, (_, i) => {
      const k = Math.min(3, Math.max(0, Math.round(1.5 + (i % 2) * 0.9 + gaussian(rng))));
      return [['kadın', 'erkek'][i % 2]!, sure[[1, 3, 0, 2][k]!]!, yas[i % 3]!];
    });
    const id = await uploadCsv(csv(['cinsiyet', 'sure', 'yas'], rows), 'araliklar.csv');
    const ds = (await app.inject({ url: `/api/datasets/${id}` })).json();
    expect(ds.columns.find((c: { name: string }) => c.name === 'sure')).toMatchObject({ type: 'ordinal', numeric: true, rankLabels: ['1 saatten az', '1-3 saat', '4-6', '7 ve üzeri'] });
    expect(ds.columns.find((c: { name: string }) => c.name === 'yas')).toMatchObject({ type: 'ordinal', rankLabels: ['18-23', '24-29', '30-35'] });
    expect(ds.columns.find((c: { name: string }) => c.name === 'cinsiyet')).toMatchObject({ type: 'categorical' });
    const { code } = await verify(id, cmp({ target: 'ordinal', value: 'sure', group: 'cinsiyet' }));
    expect(code.code).toContain('SIRALI');
  });

  it('normallik çarpıklık-basıklık ölçütüyle (±1.5 ve ±2) değerlendirilir; R aynı değerleri üretir', { timeout: T }, async () => {
    const skew = (n: number, mu: number) => g(n, mu, 0.9).map((v) => Math.round(Math.exp(v) * 100) / 100);
    const id = await uploadCsv(twoGroups(skew(60, 1), skew(55, 1.3)));
    const a = await verify(id, cmp({ value: 'deger', group: 'grup', normality: 'skewkurt-1.5' }));
    const card = a.analysis.assumptions.find((x: { name: string }) => x.name === 'Çarpıklık-Basıklık');
    expect(card).toBeDefined();
    expect(a.analysis.assumptions.some((x: { name: string }) => x.name === 'Shapiro-Wilk')).toBe(false);
    expect(a.analysis.outcome.test).toBe(card.passed ? 'Welch t-testi' : 'Mann-Whitney U testi');
    expect(a.analysis.references.join(' ')).toContain('Tabachnick');
    expect(a.code.code).toContain('carpiklik_basiklik');
    const normalId = await uploadCsv(twoGroups(g(50, 10, 2), g(50, 11, 2)), 'normal.csv');
    const b = await verify(normalId, cmp({ value: 'deger', group: 'grup', normality: 'skewkurt-2' }));
    expect(b.analysis.outcome.test).toBe('Welch t-testi');
    expect(b.analysis.descriptives[0]).toHaveProperty('kurtosis');
  });

  it('küçük 2×2 tablo: Fisher kesin testi', { timeout: T }, async () => {
    const rows = [...Array(7).fill(['a', 'evet']), ...Array(2).fill(['a', 'hayir']), ...Array(1).fill(['b', 'evet']), ...Array(8).fill(['b', 'hayir'])];
    const id = await uploadCsv(csv(['grup', 'sonuc'], rows));
    const { analysis } = await verify(id, cmp({ target: 'categorical', group: 'grup', value: 'sonuc' }));
    expect(analysis.outcome.test).toBe('Fisher kesin testi');
  });

  it('eksik değerli satırlar kodla aynı şekilde atılır', { timeout: T }, async () => {
    const rows = [...g(30, 5).map((v, i) => ['a', i % 9 === 0 ? 'NA' : v]), ...g(30, 7).map((v, i) => ['b', i % 7 === 0 ? '' : v])];
    const id = await uploadCsv(csv(['grup', 'y'], rows));
    const { analysis } = await verify(id, cmp({ value: 'y', group: 'grup' }));
    expect(analysis.notes.join(' ')).toContain('eksik değer');
  });


  // --- Python paketinde ayrıca sınanan dallar (kategorik eşleşmiş, Kendall, işaret) ve post-hoc'lar ---
  const yesNo = (() => {
    const rows: string[] = [];
    const add = (n: number, a: string, b: string, c3: string) => {
      for (let i = 0; i < n; i++) rows.push(`${a},${b},${c3}`);
    };
    add(14, 'hayır', 'hayır', 'hayır');
    add(9, 'hayır', 'evet', 'evet');
    add(3, 'evet', 'hayır', 'hayır');
    add(10, 'evet', 'evet', 'evet');
    add(4, 'hayır', 'evet', 'hayır');
    return 'once,sonra,sonra2\n' + rows.join('\n') + '\n';
  })();
  const pairsXY = 'x,y\n' + [[9, 6.6], [11, 13.2], [1, 5.9], [3, 3.8], [2, -1.7], [4, 1.1], [6, 10.8], [7, 7.6], [0, -5.2], [10, 9.7], [5, 1.5], [8, 6.1]].map((r) => r.join(',')).join('\n') + '\n';
  const ordPaired = 'a,b\n' + [[1, 2], [2, 2], [3, 5], [2, 4], [1, 3], [4, 4], [2, 5], [3, 4], [1, 2], [2, 3], [3, 3], [1, 4], [2, 3]].map((r) => r.join(',')).join('\n') + '\n';

  it('McNemar (kesin) ve Cochran Q + ikili McNemar post-hoc', { timeout: T }, async () => {
    const id = await uploadCsv(yesNo, 'evethayir.csv');
    await verify(id, { goal: 'compare', design: 'paired', target: 'categorical', conditions: ['once', 'sonra'] });
    await verify(id, { goal: 'compare', design: 'paired', target: 'categorical', conditions: ['once', 'sonra', 'sonra2'] });
  });

  it('Kendall tau (kesin p, bağsız) ve işaret testi', { timeout: T }, async () => {
    await verify(await uploadCsv(pairsXY, 'xy.csv'), { goal: 'relate', design: 'unknown', target: 'continuous', x: 'x', y: 'y', test: 'Kendall tau' });
    await verify(await uploadCsv(ordPaired, 'ord.csv'), { goal: 'compare', design: 'paired', target: 'ordinal', conditions: ['a', 'b'], test: 'İşaret testi' });
  });

  it('Kendall tau-b (bağlı, n > 33: yaklaşık p) ve Spearman', { timeout: T }, async () => {
    const rows = Array.from({ length: 60 }, () => {
      const a = Math.round(gaussian(rng) * 2 + 5);
      return [a, Math.round(a + gaussian(rng) * 2)];
    });
    const id = await uploadCsv(csv(['x', 'y'], rows), 'bagli.csv');
    await verify(id, { goal: 'relate', design: 'unknown', target: 'ordinal', x: 'x', y: 'y', test: 'Kendall tau' });
    await verify(id, { goal: 'relate', design: 'unknown', target: 'ordinal', x: 'x', y: 'y' });
  });

  it('anlamlı Kruskal-Wallis + Dunn (Holm), bağlı sıralı veride', { timeout: T }, async () => {
    const lik = (n: number, mu: number) => Array.from({ length: n }, () => Math.min(5, Math.max(1, Math.round(mu + gaussian(rng)))));
    const rows = [...lik(30, 2).map((v) => ['A', v]), ...lik(35, 3).map((v) => ['B', v]), ...lik(28, 4).map((v) => ['C', v])];
    const id = await uploadCsv(csv(['grup', 'puan'], rows), 'dunn.csv');
    const { analysis } = await verify(id, cmp({ target: 'ordinal', value: 'puan', group: 'grup' }));
    expect(analysis.outcome.test).toBe('Kruskal-Wallis H testi');
    expect(analysis.outcome.postHoc?.method).toMatch(/Dunn/);
  });

  it('anlamlı Friedman + Wilcoxon post-hoc ve Tekrarlı ölçümler ANOVA + eşleştirilmiş t post-hoc', { timeout: T }, async () => {
    const skewRows = Array.from({ length: 30 }, (_, i) => {
      const b = Math.exp(gaussian(rng) * 0.7);
      return [i + 1, +b.toFixed(3), +(b * 1.5 * Math.exp(gaussian(rng) * 0.3)).toFixed(3), +(b * 2.2 * Math.exp(gaussian(rng) * 0.3)).toFixed(3)];
    });
    const id = await uploadCsv(csv(['id', 't0', 't1', 't2'], skewRows), 'friedman.csv');
    const f = await verify(id, { goal: 'compare', design: 'paired', target: 'continuous', conditions: ['t0', 't1', 't2'] });
    expect(f.analysis.outcome.postHoc).toBeDefined();
    const tedavi = await sample('tedavi');
    const a = await verify(tedavi, { goal: 'compare', design: 'paired', target: 'continuous', conditions: ['baslangic', 'ay_1', 'ay_3'] });
    expect(a.analysis.outcome.postHoc).toBeDefined();
  });

  it('eşit varyanslı 2 grup: Student t-testi', { timeout: T }, async () => {
    const id = await uploadCsv(twoGroups(g(40, 10, 2), g(40, 11.5, 2)), 'student.csv');
    const { analysis } = await verify(id, cmp({ value: 'deger', group: 'grup', variance: 'levene' }));
    expect(['Bağımsız örneklem t-testi', 'Welch t-testi']).toContain(analysis.outcome.test);
  });

  /** Ölçek ve tarama uçları: kodu alır, betiği R'da çalıştırır, çıktıyı beklenenle karşılaştırır. */
  async function runOtherCode(id: string, url: string, payload: Record<string, unknown>) {
    const code = (await app.inject({ method: 'POST', url: `/api/datasets/${id}/${url}?lang=r`, payload })).json();
    const ds = (await app.inject({ url: `/api/datasets/${id}` })).json();
    writeFileSync(join(work, ds.name), (await app.inject({ url: `/api/datasets/${id}/download` })).rawPayload);
    writeFileSync(join(work, code.filename), code.code);
    const out = execFileSync(RS, [code.filename], { cwd: work, encoding: 'utf8', timeout: 90_000 });
    expect(out.trim().split(/\r?\n/)).toEqual(code.expectedOutput);
    return code;
  }

  it('ölçek puanları: ters madde, toplam/ortalama, eksik kuralı ve Cronbach alfa R ile eşleşir', { timeout: T }, async () => {
    const rows = Array.from({ length: 80 }, (_, i) => {
      const latent = gaussian(rng);
      const item = (rev = false) => {
        const v = Math.min(4, Math.max(0, Math.round(2 + latent + 0.7 * gaussian(rng))));
        return rev ? 4 - v : v;
      };
      const cell = (v: number, miss: boolean) => (miss ? '' : v);
      return [['kadın', 'erkek'][i % 2]!, item(), item(), cell(item(), i % 11 === 0), item(true), item(), cell(item(), i % 7 === 0), item()];
    });
    const id = await uploadCsv(csv(['cinsiyet', 'a1', 'a2', 'a3', 'a4', 'b1', 'b2', 'b3'], rows), 'olcek.csv');
    const scales = [
      { name: 'A_puan', items: ['a1', 'a2', 'a3', 'a4'], reverse: ['a4'], method: 'mean', min: 0, max: 4, minValidShare: 0.75 },
      { name: 'B_toplam', items: ['b1', 'b2', 'b3'], reverse: [], method: 'sum', min: 0, max: 4, minValidShare: 1 },
    ];
    const code = await runOtherCode(id, 'scales-code', { scales });
    expect(code.expectedOutput[0]).toMatch(/alfa: 0\.\d{4} n_alfa: \d+/);
    expect(code.expectedOutput.filter((l: string) => l.startsWith('Madde ['))).toHaveLength(7); // 4 + 3 madde
  });

  it('anket taraması: düz çizgi ve Mahalanobis R ile eşleşir', { timeout: T }, async () => {
    const items = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'];
    const rows = Array.from({ length: 150 }, (_, i) => {
      if (i % 25 === 3) return [`k${i}`, ...items.map(() => 2)];
      if (i === 40) return [`k${i}`, 4, 0, 4, 0, 4, 0];
      const latent = gaussian(rng);
      return [`k${i}`, ...items.map(() => Math.min(4, Math.max(0, Math.round(2 + latent + 0.6 * gaussian(rng)))))];
    });
    rows[7]![3] = '';
    const id = await uploadCsv(csv(['kisi', ...items], rows), 'tarama.csv');
    const code = await runOtherCode(id, 'screen-code', { items, straightLine: true, mahalanobis: true });
    expect(code.expectedOutput.length).toBe(3);
    await runOtherCode(id, 'screen-code', { items, straightLine: true, mahalanobis: false });
  });
});
