import { analysis } from '@/data/mocks/analysis';
import { apaSummary, snippets } from '@/data/mocks/code';
import { kruskal, sampleGroups } from '@/data/mocks/sample';
import { chiSquareSurvival, effectLabel, formatP, kruskalWallis } from './stats';

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

describe('örnek veri tutarlılığı', () => {
  it('analiz sayfasındaki istatistik, kod örneğinin çıktısıyla aynı veriden gelir', () => {
    const t = analysis.testStatistic;
    expect(t.value).toBe(kruskal.H);
    expect(t.n).toBe(45);
    const scipy = snippets.find((s) => s.id === 'scipy')!;
    expect(scipy.output[0]).toContain(`H(2) = ${kruskal.H.toFixed(2)}`);
    expect(scipy.output[0]).toContain(`p = ${kruskal.p.toFixed(4)}`);
    expect(scipy.output[0]).toContain(`ε² = ${(kruskal.H / 44).toFixed(2)}`);
  });

  it('APA özeti ve ekran metinleri aynı değerleri kullanır, desteklenmeyen post-hoc iddiası yoktur', () => {
    expect(apaSummary).toContain(`H(2) = ${kruskal.H.toFixed(2)}`);
    expect(apaSummary).toContain(`p = ${formatP(kruskal.p, true)}`);
    expect(apaSummary).not.toMatch(/Grup A ile Grup C/);
    expect(analysis.result.metric).toBe(`p = ${formatP(kruskal.p)}`);
  });

  it('kod örneği gösterilen veriyi içerir ve her grupta 15 gözlem vardır', () => {
    const scipy = snippets.find((s) => s.id === 'scipy')!;
    for (const g of Object.values(sampleGroups)) {
      expect(g).toHaveLength(15);
      expect(scipy.code).toContain(g.map((v) => v.toFixed(1)).join(', '));
    }
  });

  it('SMOTE, çapraz doğrulamadan önce değil Pipeline içinde uygulanır', () => {
    const sk = snippets.find((s) => s.id === 'sklearn')!;
    expect(sk.code).toContain('from imblearn.pipeline import Pipeline');
    expect(sk.code).not.toMatch(/fit_resample/);
    expect(sk.code).toContain('cross_val_score(model, X, y');
  });
});
