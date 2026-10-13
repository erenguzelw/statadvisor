import { getModelReport, SESSION_TEST_COUNT } from './models';

describe('model karşılaştırma', () => {
  const r = getModelReport();

  it('ölçütler hesaplanmış, tutarlı ve yönlendiricidir', () => {
    expect(r.models).toHaveLength(3);
    expect(r.facts.positives).toBe(142);
    expect(r.facts.rows).toBe(1775);
    expect(r.facts.baselineAccuracy).toBeCloseTo(1 - r.facts.testPositives / r.facts.testRows, 12);
    for (const m of r.models) {
      expect(m.metrics.rocAuc).toBeGreaterThan(0.6);
      expect(m.metrics.prAuc).toBeGreaterThan(r.facts.prevalence);
      expect(m.metrics.f1).toBeGreaterThanOrEqual(0);
      expect(m.roc.at(0)).toEqual({ fpr: 0, tpr: 0 });
      expect(m.roc.at(-1)).toEqual({ fpr: 1, tpr: 1 });
    }
  });

  it('önerilen model en yüksek PR-AUC değerine sahiptir ve bayrak metinleri ölçütlerden üretilir', () => {
    const best = r.models.reduce((a, b) => (b.metrics.prAuc > a.metrics.prAuc ? b : a));
    expect(r.recommendedId).toBe(best.id);
    expect(r.insight.metric).toBe(`F1 (azınlık) = ${best.metrics.f1.toFixed(2)}`);
    const imbalance = r.redFlags.find((f) => f.id === 'imbalance')!;
    expect(imbalance.description).toContain(`%${(r.facts.baselineAccuracy * 100).toFixed(1)}`);
    const multi = r.redFlags.find((f) => f.id === 'multiple-comparisons')!;
    expect(multi.description).toContain(`%${((1 - 0.95 ** SESSION_TEST_COUNT) * 100).toFixed(1)}`);
    expect(multi.solution).toContain('Holm');
  });

  it('sonuç bellekte tutulur (tohumlu ve belirleyici)', () => {
    expect(getModelReport()).toBe(r);
  });
});
