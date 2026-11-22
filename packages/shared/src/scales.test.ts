/**
 * Ölçek puanı ve madde analizi. Beklenen değerler pingouin 0.7.0 (cronbach_alpha, listwise) ve SciPy 1.18.1
 * (pearsonr) ile bağımsız olarak hesaplanmıştır; ters madde min + max − x ile çevrilir, eksik yanıtlı satırlar
 * madde analizine girmez.
 */
import { describe, expect, it } from 'vitest';
import type { QualityColumn } from './quality.ts';
import { computeScales, type ScaleDef } from './scales.ts';

// 1–5 Likert; m3 ters kodlu, m5 ölçeğe uymayan madde; null = eksik yanıt (2 satır analiz dışı kalır).
const ROWS: (number | null)[][] = [
  [4, 5, 2, 4, 3], [3, 3, 3, 3, 1], [5, 5, 1, 4, 2], [2, 2, 4, 2, 5], [4, 4, 2, 5, 4],
  [1, 2, 5, 1, 3], [3, 4, 3, 3, 2], [5, 4, 1, 5, 5], [2, 3, 4, 2, 1], [4, 4, 2, 4, 3],
  [3, 2, 3, 3, 4], [5, 5, 2, 5, 1], [1, 1, 5, 2, 2], [4, 3, 2, 4, 5], [2, 2, 4, 1, 3],
  [3, 3, null, 3, 2], [4, 5, 1, 4, 4], [2, 1, 4, 2, 1], [5, 4, 2, 5, 3], [3, 3, 3, 4, 5],
  [null, 2, 4, 2, 2], [4, 4, 1, 4, 1], [1, 2, 5, 1, 4], [3, 4, 2, 3, 3],
];
const ITEMS = ['m1', 'm2', 'm3', 'm4', 'm5'];
const columns: QualityColumn[] = ITEMS.map((name, j) => ({ name, numeric: true, values: ROWS.map((r) => r[j]!) }));
const def: ScaleDef = { name: 'olcek', items: ITEMS, reverse: ['m3'], method: 'mean', min: 1, max: 5, minValidShare: 1 };

const REF = {
  n: 22,
  alpha: 0.8471869468175173,
  items: [
    { item: 'm1', mean: 3.1818181818181817, sd: 1.3322506426689291, r: 0.8970011355164494, alphaIfDeleted: 0.7482514444589251 },
    { item: 'm2', mean: 3.272727272727273, sd: 1.2792042981336627, r: 0.7532836907635553, alphaIfDeleted: 0.7908612988655679 },
    { item: 'm3', mean: 3.227272727272727, sd: 1.3427696388548196, r: 0.8856148855400952, alphaIfDeleted: 0.7510416666666666 },
    { item: 'm4', mean: 3.227272727272727, sd: 1.3427696388548198, r: 0.8744156231952018, alphaIfDeleted: 0.7543587087864664 },
    { item: 'm5', mean: 2.9545454545454546, sd: 1.4301938838683883, r: 0.059056186277127797, alphaIfDeleted: 0.962479981697552 },
  ],
};

describe('madde analizi (madde-toplam istatistikleri)', () => {
  const [res] = computeScales(columns, [def]);

  it('alfa ve madde istatistikleri pingouin/SciPy referansıyla eşleşir (1e-12)', () => {
    expect(res!.nAlpha).toBe(REF.n);
    expect(res!.alpha!).toBeCloseTo(REF.alpha, 12);
    expect(res!.itemStats.map((s) => s.item)).toEqual(ITEMS);
    res!.itemStats.forEach((s, j) => {
      const ref = REF.items[j]!;
      expect(s.mean).toBeCloseTo(ref.mean, 12);
      expect(s.sd).toBeCloseTo(ref.sd, 12);
      expect(s.itemTotalR!).toBeCloseTo(ref.r, 12);
      expect(s.alphaIfDeleted!).toBeCloseTo(ref.alphaIfDeleted, 12);
    });
    expect(res!.itemStats.map((s) => s.reversed)).toEqual([false, false, true, false, false]);
  });

  it('zayıf maddeyi ve alfayı artıracak çıkarımı uyarı olarak bildirir', () => {
    expect(res!.notes).toContain('“m5”: düzeltilmiş madde-toplam korelasyonu düşük (r = 0.06 < .30); madde ölçeğin geri kalanıyla aynı yapıyı ölçmüyor olabilir.');
    expect(res!.notes).toContain('“m5” çıkarılırsa Cronbach alfa 0.85 → 0.96 olur.');
    expect(res!.notes.filter((n) => /“m[1-4]”/.test(n))).toEqual([]);
  });

  it('ters kodlanmayı unutulan madde negatif korelasyonla yakalanır', () => {
    const [forgot] = computeScales(columns, [{ ...def, items: ['m1', 'm2', 'm3', 'm4'], reverse: [] }]);
    const m3 = forgot!.itemStats.find((s) => s.item === 'm3')!;
    expect(m3.itemTotalR!).toBeLessThan(0);
    expect(forgot!.notes.some((n) => n.startsWith('“m3”: düzeltilmiş madde-toplam korelasyonu negatif'))).toBe(true);
  });

  it('iki maddelik ölçekte "silinirse alfa" tanımsızdır; alfa için yeterli satır yoksa madde analizi boştur', () => {
    const [two] = computeScales(columns, [{ ...def, items: ['m1', 'm2'], reverse: [] }]);
    expect(two!.itemStats).toHaveLength(2);
    expect(two!.itemStats.every((s) => s.alphaIfDeleted === null && s.itemTotalR !== null)).toBe(true);
    const few = ITEMS.map((name, j) => ({ name, numeric: true, values: ROWS.slice(0, 2).map((r) => r[j]!) }));
    const [none] = computeScales(few, [def]);
    expect(none!.itemStats).toEqual([]);
  });
});
