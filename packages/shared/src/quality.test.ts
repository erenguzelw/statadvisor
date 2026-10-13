import { analyzeQuality, type QualityColumn } from './quality.ts';
import { gaussian, mulberry32 } from './ml.ts';

const rng = mulberry32(9);
const n = 300;
const group = Array.from({ length: n }, (_, i) => ['A', 'B', 'C'][i % 3]!);
const value: (number | null)[] = Array.from({ length: n }, (_, i) => Math.round((100 + (i % 3) * 5 + 8 * gaussian(rng)) * 10) / 10);
value[10] = 400; // belirgin aykırı değer
value[11] = null; // eksik
value[12] = null;
const other: (number | null)[] = Array.from({ length: n }, () => Math.round(gaussian(rng) * 100) / 100);
other[20] = 50;

const columns: QualityColumn[] = [
  { name: 'id', numeric: true, values: Array.from({ length: n }, (_, i) => i + 1), skip: true },
  { name: 'grup', numeric: false, values: group },
  { name: 'deger', numeric: true, values: value },
  { name: 'diger', numeric: true, values: other },
];

describe('analyzeQuality', () => {
  const q = analyzeQuality(columns, { valueColumn: 'deger', groupColumn: 'grup' });

  it('eksik ve aykırı hücreleri sütunlardan sayar; kimlik sütununu atlar', () => {
    expect(q.rows).toBe(n);
    expect(q.missingCells).toBe(2);
    const id = q.columns.find((c) => c.name === 'id')!;
    expect(id.skipped).toBe(true);
    expect(id.outliers).toBe(0);
    const deger = q.columns.find((c) => c.name === 'deger')!;
    expect(deger.outliers).toBeGreaterThanOrEqual(1);
    expect(deger.lower).toBeLessThan(deger.upper!);
    expect(q.cleanColumns).toEqual(['deger', 'diger']);
    expect(q.outlierCells).toBe(q.columns.filter((c) => q.cleanColumns.includes(c.name)).reduce((s, c) => s + c.outliers, 0));
  });

  it('temiz hücre oranı ve silinen satırlar tutarlıdır', () => {
    expect(q.integrityBefore).toBeCloseTo((1 - (q.outlierCells + q.missingCells) / q.cells) * 100, 10);
    expect(q.cleanedRows + q.removedRows).toBe(n);
    expect(q.removedRows).toBeGreaterThanOrEqual(2);
    expect(q.removedRows).toBeLessThanOrEqual(q.outlierCells);
  });

  it('odak sütunda öncesi/sonrası kutular ve Shapiro-Wilk hesaplanır; temizlik normalliği iyileştirir', () => {
    const f = q.focus!;
    expect(f.boxesBefore.map((b) => b.group)).toEqual(['A', 'B', 'C']);
    expect(f.boxesBefore.flatMap((b) => b.outliers)).toContain(400);
    expect(f.boxesAfter.flatMap((b) => b.outliers)).not.toContain(400);
    expect(f.shapiroAfter!.p).toBeGreaterThan(f.shapiroBefore!.p);
    expect(f.shapiroBefore!.n).toBe(n - 2);
    expect(f.histAfter.bins.reduce((s, b) => s + b.count, 0)).toBe(n - 2 - q.removedRows);
  });

  it('yalnızca seçilen sütunlar temizlenir', () => {
    const only = analyzeQuality(columns, { cleanColumns: ['deger'] });
    expect(only.cleanColumns).toEqual(['deger']);
    expect(only.removedRows).toBeLessThanOrEqual(q.removedRows);
  });
});

