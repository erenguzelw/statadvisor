import { AnalysisError } from './analysis.ts';
import { cleanColumns, columnsToCsv, KNN_MAX_ROWS } from './clean.ts';
import type { QualityColumn } from './quality.ts';
import { sampleDataset, SAMPLE_KINDS } from './sample-data.ts';

const col = (name: string, values: (number | string | null)[], numeric = true): QualityColumn => ({ name, numeric, values });

describe('cleanColumns', () => {
  const x = Array.from({ length: 60 }, (_, i) => i + 1);
  const y: (number | null)[] = x.map((v) => 2 * v);
  y[10] = null;
  y[20] = null;
  const withOutlier: (number | null)[] = x.map((v) => 100 + (v % 7));
  withOutlier[5] = 9999;

  it('Tukey sınırı dışındaki satırları çıkarır ve nedenini günlüğe yazar', () => {
    const r = cleanColumns([col('x', x), col('d', withOutlier)], { outlierColumns: ['d'], impute: 'none' });
    expect(r.removedRows).toBe(1);
    expect(r.columns[0]!.values).toHaveLength(59);
    expect(r.columns[0]!.values).not.toContain(6);
    expect(r.log.join(' ')).toContain('Tukey');
  });

  it('medyan/mod ile doldurur; sütun türüne göre ayrım yapar', () => {
    const r = cleanColumns([col('y', y), col('g', ['a', 'a', 'b', null, ...Array(56).fill('a')], false)], { outlierColumns: [], impute: 'median' });
    expect(r.imputedCells).toBe(3);
    expect(r.columns[0]!.values.every((v) => v !== null)).toBe(true);
    expect(r.columns[1]!.values[3]).toBe('a');
  });

  it('KNN, ilişkili değişkenden eksik değeri yaklaşık geri kazanır', () => {
    const r = cleanColumns([col('x', x), col('y', y)], { outlierColumns: [], impute: 'knn', k: 4 });
    expect(r.columns[1]!.values[10]).toBeCloseTo(22, 8);
    expect(r.columns[1]!.values[20]).toBeCloseTo(42, 8);
  });

  it('hatalı istekleri anlaşılır biçimde reddeder', () => {
    expect(() => cleanColumns([col('x', x)], { outlierColumns: ['yok'], impute: 'none' })).toThrow(AnalysisError);
    expect(() => cleanColumns([col('g', ['a', 'b'], false)], { outlierColumns: ['g'], impute: 'none' })).toThrow(/sayısal değil/);
    const big = Array.from({ length: KNN_MAX_ROWS + 1 }, (_, i) => (i === 3 ? null : i));
    expect(() => cleanColumns([col('b', big), col('c', big.map((v) => (v === null ? 1 : v)))], { outlierColumns: [], impute: 'knn' })).toThrow(/KNN/);
  });
});

describe('columnsToCsv', () => {
  it('tırnak, virgül ve satır sonunu kaçırır; eksik değeri boş yazar', () => {
    const csv = columnsToCsv([col('ad', ['a,b', 'c"d', null, 'e\nf'], false), col('v', [1, null, 3.5, 4])]);
    expect(csv.split('\n')[0]).toBe('ad,v');
    expect(csv).toContain('"a,b",1');
    expect(csv).toContain('"c""d",');
    expect(csv).toContain(',3.5');
    expect(csv).toContain('"e\nf",4');
  });
});

describe('örnek veri setleri', () => {
  it('belirleyicidir ve beklenen yapıdadır', () => {
    for (const kind of SAMPLE_KINDS) {
      const a = sampleDataset(kind);
      expect(sampleDataset(kind).csv).toBe(a.csv);
      expect(a.csv.split('\n').length).toBeGreaterThan(30);
      expect(a.fileName).toMatch(/\.csv$/);
    }
    const k = sampleDataset('klinik').csv.split('\n');
    expect(k[0]).toBe('id,grup,yas,kan_basinci,gelir_duzeyi,biyobelirtec_x');
    expect(k.length - 2).toBe(1420);
    expect(k.slice(1, -1).filter((l) => l.split(',')[4] === '').length).toBe(60);
  });
});
