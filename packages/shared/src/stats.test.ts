import { chiSquareSurvival, effectLabel, formatP, kruskalWallis } from './stats.ts';

describe('kruskalWallis', () => {
  it('tamamen ayrışan üç grup için SciPy ile aynı sonucu verir (H = 12.5, p = 0.0019)', () => {
    const r = kruskalWallis([
      [14.2, 18.5, 12.1, 16.4, 15.0],
      [22.1, 24.6, 27.3, 20.8, 26.0],
      [31.4, 29.8, 35.2, 33.1, 30.5],
    ]);
    expect(r.H).toBeCloseTo(12.5, 6);
    expect(r.p).toBeCloseTo(Math.exp(-6.25), 8);
    expect(r.df).toBe(2);
    expect(r.epsilonSquared).toBeCloseTo(12.5 / 14, 8);
  });

  it('bağları (eşit değerleri) düzeltir', () => {
    const r = kruskalWallis([[1, 2, 2], [2, 3, 3], [3, 4, 4]]);
    expect(r.H).toBeGreaterThan(0);
    expect(Number.isFinite(r.p)).toBe(true);
  });
});

describe('chiSquareSurvival', () => {
  it('bilinen kritik değerlerde 0.05 verir', () => {
    expect(chiSquareSurvival(3.841459, 1)).toBeCloseTo(0.05, 4);
    expect(chiSquareSurvival(5.991465, 2)).toBeCloseTo(0.05, 4);
    expect(chiSquareSurvival(7.814728, 3)).toBeCloseTo(0.05, 4);
  });
});

describe('formatP ve effectLabel', () => {
  it('APA biçiminde baştaki sıfırı atar ve çok küçük p değerini < .001 gösterir', () => {
    expect(formatP(0.0029, true)).toBe('.003');
    expect(formatP(0.0004, true)).toBe('< .001');
    expect(formatP(0.41)).toBe('0.41');
  });
  it('etki büyüklüğünü sınıflar', () => {
    expect(effectLabel(0.008)).toBe('ihmal edilebilir');
    expect(effectLabel(0.27)).toBe('geniş');
  });
});
