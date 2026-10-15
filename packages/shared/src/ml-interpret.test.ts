import { beforeAll, describe, expect, it } from 'vitest';
import { balanceOf, correctedPairedT, stratifiedKFold, gaussian, interpretComparison, mulberry32, prepareData, runCrossValidation, type MlFeature } from './index.ts';

function make(n: number, classWeights: number[], seed = 3) {
  const rng = mulberry32(seed);
  const K = classWeights.length;
  const y: string[] = [];
  const tot = classWeights.reduce((s, v) => s + v, 0);
  for (let i = 0; i < n; i++) {
    let u = rng() * tot;
    let c = 0;
    while (c < K - 1 && u >= classWeights[c]!) u -= classWeights[c++]!;
    y.push(`c${c}`);
  }
  const cls = y.map((v) => Number(v.slice(1)));
  const a = cls.map((c) => c * 1.0 + gaussian(rng) * 0.9);
  const b = a.map((v) => 2 * v + gaussian(rng) * 0.5); // a ile güçlü pozitif ilişki
  const c = a.map((v) => -1.5 * v + gaussian(rng) * 0.8); // a ile güçlü negatif ilişki
  const noise = cls.map(() => gaussian(rng));
  const features: MlFeature[] = [
    { name: 'a', kind: 'numeric', values: a },
    { name: 'b', kind: 'numeric', values: b },
    { name: 'c', kind: 'numeric', values: c },
    { name: 'gurultu', kind: 'numeric', values: noise },
  ];
  return prepareData(y, features);
}

describe('balanceOf', () => {
  it('eşiklere göre etiketler', () => {
    expect(balanceOf([100, 100, 100, 100], ['a', 'b', 'c', 'd']).label).toBe('dengeli');
    expect(balanceOf([100, 110, 105, 95], ['a', 'b', 'c', 'd']).label).toBe('dengeli');
    expect(balanceOf([100, 200, 150], ['a', 'b', 'c']).label).toBe('hafif dengesiz');
    expect(balanceOf([900, 100], ['a', 'b']).label).toBe('dengesiz');
  });
});

describe('büyük veri', () => {
  it('k-NN maliyet sınırını aşınca açık gerekçeyle atlanır', async () => {
    const r = await runCrossValidation(make(300, [1, 1, 1]), { folds: 3, seed: 1, models: ['baseline', 'knn'], knnMaxOps: 1000 });
    const knn = r.models.find((m) => m.id === 'knn')!;
    expect(knn.skipped).toMatch(/karesiyle/);
    expect(knn.folds).toHaveLength(0);
    expect(interpretComparison(r).notes.some((n) => n.title === 'k-En Yakın Komşu atlandı')).toBe(true);
  });

  it('stratifiedKFold 200 bin satırda yığın taşması olmadan çalışır', () => {
    const y = Int32Array.from({ length: 200_000 }, (_, i) => i % 3);
    const f = stratifiedKFold(y, 5, 1);
    const counts = [0, 0, 0, 0, 0];
    f.forEach((v) => counts[v]!++);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(3);
  });
});

describe('correctedPairedT', () => {
  it('farklar sabitse ve sıfırsa p = 1; sabit pozitifse p = 0', () => {
    expect(correctedPairedT([0.5, 0.5, 0.5], [0.5, 0.5, 0.5], 80, 20).p).toBe(1);
    expect(correctedPairedT([0.6, 0.6, 0.6], [0.5, 0.5, 0.5], 80, 20).p).toBe(0);
  });
  it('düzeltme çarpanı t değerini küçültür', () => {
    const a = [0.71, 0.69, 0.72, 0.7, 0.73];
    const b = [0.68, 0.7, 0.69, 0.68, 0.7];
    const r = correctedPairedT(a, b, 80, 20);
    const d = a.map((v, i) => v - b[i]!);
    const md = d.reduce((s, v) => s + v, 0) / 5;
    const sd = Math.sqrt(d.reduce((s, v) => s + (v - md) ** 2, 0) / 4);
    const naive = md / (sd / Math.sqrt(5));
    expect(r.t).toBeCloseTo(md / Math.sqrt((1 / 5 + 20 / 80) * sd * sd), 10);
    expect(Math.abs(r.t)).toBeLessThan(Math.abs(naive));
  });
});

describe('interpretComparison', () => {
  it('dengeli veride “dengesiz” uyarısı üretmez ve aşırı uyumu yakalar', async () => {
    const r = await runCrossValidation(make(400, [1, 1, 1, 1]), { folds: 5, seed: 1, models: ['baseline', 'logistic', 'tree'] });
    const it = interpretComparison(r);
    expect(it.balance.label).toBe('dengeli');
    const balanced = it.notes.find((n) => n.title === 'Sınıflar dengeli')!;
    expect(balanced).toBeTruthy();
    expect(balanced.level).toBe('info');
    expect(it.notes.some((n) => n.title === 'Sınıflar dengesiz')).toBe(false);
    // karar ağacı derinlik sınırı olmadığı için eğitimde ~%100
    const tree = r.models.find((m) => m.id === 'tree')!;
    expect(tree.trainAccuracy).toBeGreaterThan(0.99);
    expect(it.notes.find((n) => n.title.startsWith('Aşırı uyum'))!.text).toContain('Karar Ağacı');
    expect(it.best).toBeTruthy();
    expect(it.significance).toBeTruthy();
  }, 120_000);

  it('rastgele ormanın ~%100 eğitim doğruluğunu aşırı uyum bayrağı yapmaz, ayrı bilgi notu verir', async () => {
    const r = await runCrossValidation(make(400, [1, 1, 1, 1]), { folds: 5, seed: 1, models: ['baseline', 'logistic', 'rf'] });
    const it = interpretComparison(r);
    const rf = r.models.find((m) => m.id === 'rf')!;
    expect(rf.gap).toBeGreaterThanOrEqual(0.1);
    const flag = it.notes.find((n) => n.title.startsWith('Aşırı uyum'));
    expect(flag?.text ?? '').not.toContain('Rastgele Orman');
    expect(it.notes.find((n) => n.title === 'Rastgele orman: eğitim doğruluğu yanıltıcı')!.level).toBe('info');
  }, 120_000);

  it('dengesiz veride doğruluğun yanıltıcı olduğunu söyler', async () => {
    const r = await runCrossValidation(make(500, [9, 1]), { folds: 5, seed: 1, models: ['baseline', 'logistic'] });
    const it = interpretComparison(r);
    expect(it.balance.label).toBe('dengesiz');
    expect(it.notes.find((n) => n.title === 'Sınıflar dengesiz')!.text).toContain('yanıltıcı');
  }, 120_000);

  describe('tabana göre kazanç anlatımı', () => {
    let base: Awaited<ReturnType<typeof runCrossValidation>>;
    beforeAll(async () => {
      base = await runCrossValidation(make(120, [1, 1]), { folds: 3, seed: 1, models: ['baseline', 'logistic'] });
    }, 60_000);

    const liftNote = (bestAcc: number, baseline: number) => {
      const r = structuredClone(base);
      r.baselineAccuracy = baseline;
      for (const m of r.models) if (m.id !== 'baseline') m.accuracy = { mean: bestAcc, sd: 0.01 };
      return interpretComparison(r).notes.find((n) => ['Taban altında', 'Taban aşılmıyor', 'Taban çok az aşılıyor', 'En yüksek doğruluk'].includes(n.title))!;
    };

    it('taban altında: “üzerinde” demez, işaretli fark verir', () => {
      const n = liftNote(0.65, 0.7);
      expect(n.title).toBe('Taban altında');
      expect(n.text).toContain('5.0 puan altında');
      expect(n.text).not.toContain('üzerinde');
    });
    it('taban ile eşit: aşılmıyor der', () => {
      const n = liftNote(0.7, 0.7);
      expect(n.title).toBe('Taban aşılmıyor');
      expect(n.text).toContain('aynı düzeyde');
      expect(n.text).not.toContain('üzerinde');
    });
    it('küçük pozitif kazanç: aşıldığını söyler ama anlamlılık/üstünlük iddia etmez', () => {
      const n = liftNote(0.72, 0.7);
      expect(n.title).toBe('Taban çok az aşılıyor');
      expect(n.level).toBe('warning');
      expect(n.text).toContain('2.0 puan üzerinde');
      expect(n.text).toContain('kanıtlamaz');
    });
    it('5 puan ve üstü kazanç: normal özet; kayan nokta artığı eşiği kaydırmaz', () => {
      for (const [acc, b] of [[0.75, 0.7], [0.7, 0.65]] as const) {
        const n = liftNote(acc, b);
        expect(n.title).toBe('En yüksek doğruluk');
        expect(n.text).toContain('kazanç 5.0 puan');
      }
    });
    it('görüntüleme yuvarlaması: 0,04996 fark 5.0 puan görünür, eşik üstü sayılır; 0,0004 fark sıfır görünür', () => {
      expect(liftNote(0.74996, 0.7).title).toBe('En yüksek doğruluk');
      expect(liftNote(0.7004, 0.7).title).toBe('Taban aşılmıyor');
      expect(liftNote(0.6996, 0.7).title).toBe('Taban aşılmıyor');
      expect(liftNote(0.6994, 0.7).title).toBe('Taban altında');
    });
  });

  it('korelasyon cümleleri yönü ve sıralamayı doğru yazar', async () => {
    const r = await runCrossValidation(make(400, [1, 1, 1]), { folds: 3, seed: 2, models: ['baseline', 'logistic'] });
    const pairs = r.associations.pairs;
    // sıralama: |r| azalan
    for (let i = 1; i < pairs.length; i++) expect(Math.abs(pairs[i - 1]!.r)).toBeGreaterThanOrEqual(Math.abs(pairs[i]!.r));
    const ab = pairs.find((p) => (p.a === 'a' && p.b === 'b') || (p.a === 'b' && p.b === 'a'))!;
    const ac = pairs.find((p) => (p.a === 'a' && p.b === 'c') || (p.a === 'c' && p.b === 'a'))!;
    expect(ab.direction).toBe('pozitif');
    expect(ab.strength).toBe('güçlü');
    expect(ac.direction).toBe('negatif');
    const it = interpretComparison(r);
    expect(it.correlations[0]).toMatch(/^En güçlü ilişki: /);
    expect(it.correlations.join(' ')).toContain('negatif');
    // hedefle en ilişkili özellik gürültü değil
    expect(r.associations.target[0]!.feature).not.toBe('gurultu');
    expect(r.associations.target.at(-1)!.feature).toBe('gurultu');
  }, 120_000);
});
