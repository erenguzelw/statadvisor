import { groupResiduals, levene, shapiroWilk } from '@/lib/assumptions';
import { recommendTest } from '@/lib/decision';
import { buildReport, REPORT_SECTION_IDS } from '@/lib/report';
import { analysis } from './analysis';
import { apaSummary, citation, reportSections, snippets } from './code';
import { getModelReport, SESSION_TEST_COUNT } from './models';
import { getQualityReport } from './quality';
import { groupList } from './sample';

describe('analiz örneği', () => {
  it('varsayım testleri gerçek hesaptır ve karar motoru örnekteki Kruskal-Wallis ile uyumludur', () => {
    const s = analysis.assumptions.find((a) => a.id === 'shapiro')!;
    const l = analysis.assumptions.find((a) => a.id === 'levene')!;
    expect(s.p).toBe(shapiroWilk(groupResiduals(groupList)).p);
    expect(l.p).toBe(levene(groupList).p);
    expect(analysis.decision.finalTest).toBe('Kruskal-Wallis H testi');
    expect(recommendTest(analysis.defaultAnswers, analysis.assumptionInput).finalTest).toBe(analysis.decision.finalTest);
    expect(analysis.decision.warnings.length).toBeGreaterThan(0);
  });

  it('APA özeti Shapiro-Wilk sonucunu gerçek değeriyle içerir; kod örneği SMOTE sızıntısı içermez', () => {
    const s = analysis.assumptions.find((a) => a.id === 'shapiro')!;
    expect(apaSummary).toContain(s.statistic.replace('W = ', ''));
    expect(snippets.find((x) => x.id === 'sklearn')!.code).not.toContain('fit_resample');
  });
});

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

describe('veri kalitesi', () => {
  const q = getQualityReport();

  it('sayılar veriden hesaplanır ve birbiriyle tutarlıdır', () => {
    const s = q.summary;
    expect(s.observations).toBe(1420);
    expect(s.missing).toBe(60);
    expect(s.outliers).toBe(s.outlierColumns.reduce((a, c) => a + c.count, 0));
    expect(s.cleanedRows + s.removedRows).toBe(s.observations);
    expect(s.removedRows).toBeLessThanOrEqual(s.outliers);
    expect(s.integrityBefore).toBeCloseTo((1 - (s.outliers + s.missing) / s.cells) * 100, 10);
    expect(q.boxes.reduce((a, b) => a + b.n, 0)).toBe(1420);
    expect(q.boxesCleaned.reduce((a, b) => a + b.n, 0)).toBe(s.cleanedRows);
  });

  it('aykırılar normallik testini gerçekten bozar; temizlik sonrası sonuç değişir (dallanan yol)', () => {
    expect(q.summary.shapiroBefore.p).toBeLessThan(0.001);
    expect(q.summary.shapiroAfter.p).toBeGreaterThan(q.summary.shapiroBefore.p);
  });

  it('önizleme satırlarındaki işaretler sınırlarla uyumludur', () => {
    const bp = q.summary.outlierColumns.find((c) => c.column === 'bloodPressure')!;
    for (const r of q.rows) {
      const out = r.bloodPressure < bp.lower || r.bloodPressure > bp.upper;
      if (out) expect(r.outlierIn).toBe('bloodPressure');
    }
  });
});

describe('rapor', () => {
  it('arayüzdeki içerik listesindeki her bölümü içerir ve girdileri kaçırır', () => {
    expect(reportSections.map((s) => s.id)).toEqual([...REPORT_SECTION_IDS]);
    const html = buildReport({ analysis, apaSummary, citation: `${citation} <script>x</script>`, date: '1.1.2026' }, 'html');
    for (const id of REPORT_SECTION_IDS) expect(html).toContain(`data-section="${id}"`);
    expect(html).not.toContain('<script>x');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('print()');
    expect(buildReport({ analysis, apaSummary, citation, date: 'x' }, 'print')).toContain('print()');
  });
});
