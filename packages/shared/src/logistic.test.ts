import { describe, expect, it } from 'vitest';
import { AnalysisError } from './analysis.ts';
import { binaryOutcome, classificationTable, fitLogisticRegression, hosmerLemeshow } from './logistic.ts';

const n = 80;
const x = Array.from({ length: n }, (_, i) => i / 8);
// deterministik "gürültülü" sonuç: olasılık x ile artar
const y = x.map((v, i) => (((i * 37) % 17) / 17 < 1 / (1 + Math.exp(-(v - 5))) ? 1 : 0));

describe('fitLogisticRegression', () => {
  it('olasılık oranını katsayıdan üretir ve pozitif eğimi bulur', () => {
    const r = fitLogisticRegression(y, [{ name: 'x', kind: 'numeric', values: x }]);
    const b = r.coefficients[1]!;
    expect(b.b).toBeGreaterThan(0);
    expect(b.or).toBeCloseTo(Math.exp(b.b), 10);
    expect(b.orLow).toBeLessThan(b.or);
    expect(b.orHigh).toBeGreaterThan(b.or);
    expect(r.converged).toBe(true);
    expect(r.separation).toBe('none');
    expect(r.nagelkerke).toBeGreaterThan(r.mcFadden);
    expect(r.auc).toBeGreaterThan(0.7);
  });

  it('tam ayrışmayı yakalar', () => {
    const sep = x.map((v) => (v > 5 ? 1 : 0));
    const r = fitLogisticRegression(sep, [{ name: 'x', kind: 'numeric', values: x }]);
    expect(r.separation).toBe('complete');
  });

  it('olay/yordayıcı oranını az olan sınıftan hesaplar', () => {
    const rare = x.map((_, i) => (i % 20 === 0 ? 1 : 0)); // 4 olay
    const r = fitLogisticRegression(rare, [
      { name: 'x', kind: 'numeric', values: x },
      { name: 'z', kind: 'numeric', values: x.map((v, i) => Math.sin(i) + v / 10) },
    ]);
    expect(r.events).toBe(4);
    expect(r.epv).toBeCloseTo(2, 10);
  });

  it('olay düzeyi seçilebilir; metin etiketli sonucu çevirir', () => {
    const lab = y.map((v) => (v ? 'evet' : 'hayır'));
    const a = fitLogisticRegression(lab, [{ name: 'x', kind: 'numeric', values: x }]);
    expect(a.eventLevel).toBe('hayır'); // sıralı ikinci düzey olay sayılır: "hayır" < "evet" değil, tr sıralamasında evet < hayır
    const b = fitLogisticRegression(lab, [{ name: 'x', kind: 'numeric', values: x }], { eventLevel: 'evet' });
    expect(b.eventLevel).toBe('evet');
    expect(b.coefficients[1]!.b).toBeGreaterThan(0);
    expect(b.coefficients[1]!.b).toBeCloseTo(-a.coefficients[1]!.b, 6);
  });

  it('ikiden farklı düzeyde ve tek sınıfta anlaşılır hata verir', () => {
    expect(() => binaryOutcome([1, 2, 3, 1])).toThrow(AnalysisError);
    expect(() => fitLogisticRegression(x.map(() => 1), [{ name: 'x', kind: 'numeric', values: x }])).toThrow(AnalysisError);
  });

  it('eksik değerli satırları çıkarır', () => {
    const yy: (number | null)[] = [...y];
    yy[3] = null;
    const r = fitLogisticRegression(yy, [{ name: 'x', kind: 'numeric', values: x }]);
    expect(r.n).toBe(n - 1);
    expect(r.droppedRows).toBe(1);
  });
});

describe('yardımcılar', () => {
  it('sınıflandırma tablosu ölçütleri doğru', () => {
    const t = classificationTable([1, 1, 0, 0, 1], [0.9, 0.2, 0.1, 0.6, 0.7]);
    expect([t.tp, t.fp, t.tn, t.fn]).toEqual([2, 1, 1, 1]);
    expect(t.accuracy).toBeCloseTo(0.6, 10);
    expect(t.sensitivity).toBeCloseTo(2 / 3, 10);
    expect(t.baseline).toBeCloseTo(0.6, 10);
  });

  it('Hosmer–Lemeshow: kusursuz kalibre olasılıklarda büyük p', () => {
    const p = Array.from({ length: 200 }, (_, i) => (i + 0.5) / 200);
    const yy = p.map((v, i) => ((i * 0.618) % 1 < v ? 1 : 0));
    const hl = hosmerLemeshow(yy, p)!;
    expect(hl.df).toBe(8);
    expect(hl.groups.reduce((s, g) => s + g.n, 0)).toBe(200);
    expect(hl.p).toBeGreaterThan(0.05);
  });
});
