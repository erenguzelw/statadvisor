import { describe, expect, it } from 'vitest';
import { balanceOf, correctedPairedT, gaussian, interpretComparison, mulberry32, prepareData, runCrossValidation, type MlFeature } from './index.ts';

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

  it('dengesiz veride doğruluğun yanıltıcı olduğunu söyler', async () => {
    const r = await runCrossValidation(make(500, [9, 1]), { folds: 5, seed: 1, models: ['baseline', 'logistic'] });
    const it = interpretComparison(r);
    expect(it.balance.label).toBe('dengesiz');
    expect(it.notes.find((n) => n.title === 'Sınıflar dengesiz')!.text).toContain('yanıltıcı');
  }, 120_000);

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
