import { formatP } from '@statadvisor/shared';
import { analysis } from './analysis';
import { apaSummary, snippets } from './code';
import { kruskal, sampleGroups } from './sample';

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
