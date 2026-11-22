/**
 * Kabul testi: “Makine Öğrenmesi ile Fiziksel Performans Sınıflandırması” raporunun veri seti (Kaggle bodyPerformance,
 * 13.393 satır, 4 sınıf) StatAdvisor'da baştan sona çalıştırılır ve raporun iddiaları denetlenir.
 *
 * Yavaştır (~90 sn) ve veri dosyası depoda bulunmaz; bu yüzden yalnızca şu koşullarla çalışır:
 *   STATADVISOR_SLOW=1 ve STATADVISOR_BODYPERFORMANCE veri dosyasının yolunu gösteriyor (Kaggle: bodyPerformance.csv).
 */
import { existsSync, readFileSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.ts';

const FILE = process.env.STATADVISOR_BODYPERFORMANCE ?? '';
const enabled = process.env.STATADVISOR_SLOW === '1' && FILE !== '' && existsSync(FILE);
if (!enabled) console.warn('bodyPerformance kabul testi atlandı (STATADVISOR_SLOW=1 ve STATADVISOR_BODYPERFORMANCE gerekir).');

(enabled ? describe : describe.skip)('bodyPerformance raporunun yeniden üretimi ve denetimi', () => {
  let app: FastifyInstance;
  beforeAll(() => {
    app = buildApp({ dataDir: ':memory:' });
  });
  afterAll(async () => {
    await app.close();
  });

  it('tüm modeller çalışır; raporun sayıları ve iddiaları sınanır', async () => {
    const csv = readFileSync(FILE, 'utf8');
    const boundary = '----sabody';
    const payload = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="bodyPerformance.csv"\r\nContent-Type: text/csv\r\n\r\n${csv}\r\n--${boundary}--\r\n`);
    const up = await app.inject({ method: 'POST', url: '/api/datasets', payload, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } });
    expect(up.statusCode).toBe(201);
    const ds = up.json();
    expect(ds.rows).toBe(13393);
    const numeric = ds.columns.filter((c: { numeric: boolean; name: string; likelyId: boolean }) => c.numeric && c.name !== 'class' && !c.likelyId).map((c: { name: string }) => c.name);
    const start = await app.inject({ method: 'POST', url: `/api/datasets/${ds.id}/model-runs`, payload: { target: 'class', numeric, categorical: ['gender'], models: ['baseline', 'logistic', 'tree', 'knn', 'svm', 'rf', 'gb'], folds: 5, seed: 42 } });
    expect(start.statusCode, start.body).toBe(202);
    let job = start.json();
    for (let i = 0; i < 1200 && job.status === 'running'; i++) {
      await new Promise((r) => setTimeout(r, 500));
      job = (await app.inject({ url: `/api/model-runs/${job.id}` })).json();
    }
    expect(job.status, job.error).toBe('done');
    const r = job.result;
    interface M {
      accuracy: { mean: number; sd: number };
      trainAccuracy: number;
      gap: number;
      aucPerClass: number[];
    }
    const m = Object.fromEntries(r.models.map((x: { id: string }) => [x.id, x])) as Record<'baseline' | 'logistic' | 'tree' | 'knn' | 'svm' | 'rf' | 'gb', M>;
    const notes = job.interpretation.notes as { title: string; text: string }[];

    // 1) “A, B, C, D sınıfları dengeli”: doğru; “dengesizlik” yorumu üretilmemeli
    expect(r.classCounts).toEqual([3348, 3347, 3349, 3349]);
    expect(job.interpretation.balance.label).toBe('dengeli');
    expect(notes.some((n) => n.title === 'Sınıflar dengeli')).toBe(true);
    expect(notes.some((n) => /dengesiz/.test(n.title))).toBe(false);
    expect(r.baselineAccuracy).toBeCloseTo(0.25, 2);

    // 2) Tek bölünmedeki sayılar (karar ağacı %65,99, SVM %69,91, k-NN %60,92) çapraz doğrulama ± 2 SS içinde
    const within = (mean: number, sd: number, v: number) => Math.abs(mean - v) <= 2 * sd + 0.005;
    expect(within(m.tree.accuracy.mean, m.tree.accuracy.sd, 0.6599)).toBe(true);
    expect(within(m.svm.accuracy.mean, m.svm.accuracy.sd, 0.6991)).toBe(true);
    expect(within(m.knn.accuracy.mean, m.knn.accuracy.sd, 0.6092)).toBe(true);

    // 3) Karar ağacı: eğitimde ~%100, testte ~%65 → aşırı uyum bayrağı
    expect(m.tree.trainAccuracy).toBeGreaterThan(0.99);
    expect(m.tree.gap).toBeGreaterThan(0.3);
    expect(notes.find((n) => n.title.startsWith('Aşırı uyum'))!.text).toContain('Karar Ağacı');

    // 4) “SVM en başarılı model”: yalnızca raporun üç modeli içinde doğru; rastgele orman ve gradyan artırma SVM'i geçer
    expect(m.svm.accuracy.mean).toBeGreaterThan(m.tree.accuracy.mean);
    expect(m.svm.accuracy.mean).toBeGreaterThan(m.knn.accuracy.mean);
    expect(m.rf.accuracy.mean).toBeGreaterThan(m.svm.accuracy.mean + 0.03);
    expect(m.gb.accuracy.mean).toBeGreaterThan(m.svm.accuracy.mean);
    expect(job.interpretation.best.id).toBe('rf');

    // 5) SVM sınıf AUC: A ≈ 0,94 ve D ≈ 0,96 (rapor), B ve C ≈ 0,80 bandı
    const auc = m.svm.aucPerClass as number[];
    expect(auc[0]).toBeGreaterThan(0.92);
    expect(auc[0]).toBeLessThan(0.96);
    expect(auc[3]).toBeGreaterThan(0.93);
    expect(auc[3]).toBeLessThan(0.97);
    expect(auc[1]).toBeGreaterThan(0.75);
    expect(auc[1]).toBeLessThan(0.83);
    expect(auc[2]).toBeGreaterThan(0.75);
    expect(auc[2]).toBeLessThan(0.83);

    // 6) Korelasyon: yön ve sıralama veriden gelir. “Yağ oranı–mekik” güçlü ama NEGATİF ve en güçlü değil.
    const pairs = r.associations.pairs as { a: string; b: string; r: number }[];
    const top = pairs[0]!;
    expect([top.a, top.b].sort()).toEqual(['broad jump_cm', 'sit-ups counts']);
    expect(top.r).toBeGreaterThan(0.7);
    const idx = pairs.findIndex((p) => [p.a, p.b].includes('body fat_%') && [p.a, p.b].includes('sit-ups counts'));
    expect(idx).toBeGreaterThan(0);
    expect(pairs[idx]!.r).toBeLessThan(-0.55);
    expect(job.interpretation.correlations[0]).toMatch(/^En güçlü ilişki: .*pozitif/);

    // 7) Rapor ve Python kodu üretilir
    const rep = await app.inject({ url: `/api/model-runs/${job.id}/report?format=html` });
    expect(rep.statusCode).toBe(200);
    expect(rep.body).toContain('Karışıklık matrisi');
    const code = await app.inject({ url: `/api/model-runs/${job.id}/code` });
    expect(code.json().code).toContain('SVC(kernel="rbf"');
  }, 900_000);
});
