import { averagePrecision, fSurvival, levene, normalCdf, normalQuantile, quantile, rocAuc, shapiroWilk, tukeyFences } from './assumptions';

describe('normal dağılım', () => {
  it('bilinen değerleri verir', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 12);
    expect(normalCdf(1.959964)).toBeCloseTo(0.975, 6);
    expect(normalQuantile(0.975)).toBeCloseTo(1.959964, 6);
    expect(normalQuantile(0.001)).toBeCloseTo(-3.090232, 5);
  });
});

describe('fSurvival', () => {
  it('kritik değerlerde 0.05 verir', () => {
    expect(fSurvival(4.964603, 1, 10)).toBeCloseTo(0.05, 4);
    expect(fSurvival(3.885294, 2, 12)).toBeCloseTo(0.05, 4);
    expect(fSurvival(3.098391, 3, 20)).toBeCloseTo(0.05, 4);
  });
});

describe('shapiroWilk', () => {
  it('n = 3 için kesin formülle uyuşur', () => {
    const r = shapiroWilk([1, 2, 4]);
    expect(r.W).toBeCloseTo(0.9643, 3);
    expect(r.p).toBeCloseTo(0.637, 2);
  });

  it('Royston örneğinde (n = 11) bilinen W ≈ 0.79 ve küçük p değeri verir', () => {
    const r = shapiroWilk([148, 154, 158, 160, 161, 162, 166, 170, 182, 195, 236]);
    expect(r.W).toBeGreaterThan(0.78);
    expect(r.W).toBeLessThan(0.8);
    expect(r.p).toBeGreaterThan(0.003);
    expect(r.p).toBeLessThan(0.012);
  });

  it('normal kantil verisinde W ≈ 1 ve p yüksektir', () => {
    const x = Array.from({ length: 100 }, (_, i) => normalQuantile((i + 0.5) / 100));
    const r = shapiroWilk(x);
    expect(r.W).toBeGreaterThan(0.99);
    expect(r.p).toBeGreaterThan(0.5);
  });

  it('çok çarpık veride normalliği reddeder', () => {
    const x = Array.from({ length: 200 }, (_, i) => Math.exp(2.5 * normalQuantile((i + 0.5) / 200)));
    expect(shapiroWilk(x).p).toBeLessThan(0.001);
  });

  it('çok küçük ve çok büyük n için hata verir', () => {
    expect(() => shapiroWilk([1, 2])).toThrow(RangeError);
  });
});

describe('levene', () => {
  it('eşit yayılımlı gruplarda yüksek p, farklı yayılımda düşük p verir', () => {
    const eq = levene([[1, 2, 3, 4, 5, 6], [11, 12, 13, 14, 15, 16], [21, 22, 23, 24, 25, 26]]);
    expect(eq.F).toBeCloseTo(0, 8);
    expect(eq.p).toBeGreaterThan(0.99);
    const uneq = levene([[10, 10.1, 9.9, 10.05, 9.95, 10], [10, 14, 6, 12, 8, 10], [10, 30, -10, 20, 0, 10]]);
    expect(uneq.p).toBeLessThan(0.05);
    expect(uneq.df1).toBe(2);
    expect(uneq.df2).toBe(15);
  });
});

describe('quantile ve tukeyFences', () => {
  it('pandas ile aynı doğrusal enterpolasyonu kullanır', () => {
    expect(quantile([1, 2, 3, 4], 0.25)).toBeCloseTo(1.75, 10);
    expect(quantile([1, 2, 3, 4], 0.75)).toBeCloseTo(3.25, 10);
    const f = tukeyFences([1, 2, 3, 4, 100]);
    expect(f.q1).toBe(2);
    expect(f.q3).toBe(4);
    expect(f.upper).toBe(7);
    expect(100 > f.upper).toBe(true);
  });
});

describe('sınıflandırma ölçütleri', () => {
  it('mükemmel ve rastgele sıralamada beklenen AUC / AP değerlerini verir', () => {
    expect(rocAuc([0.9, 0.8, 0.2, 0.1], [1, 1, 0, 0])).toBe(1);
    expect(rocAuc([0.5, 0.5, 0.5, 0.5], [1, 0, 1, 0])).toBe(0.5);
    expect(averagePrecision([0.9, 0.8, 0.2, 0.1], [1, 1, 0, 0])).toBe(1);
    // Pozitifler ortada: sıralı etiketler 1,0,1,0 -> AP = 0.5*1 + 0.5*(2/3)
    expect(averagePrecision([0.9, 0.8, 0.7, 0.6], [1, 0, 1, 0])).toBeCloseTo(0.5 + 0.5 * (2 / 3), 10);
  });
});
