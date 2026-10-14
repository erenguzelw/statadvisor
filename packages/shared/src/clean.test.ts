import { AnalysisError } from './analysis.ts';
import { cleanColumns, columnsToCsv, KNN_MAX_ROWS, modeOf } from './clean.ts';
import type { CleanRule, QualityColumn } from './quality.ts';
import { sampleDataset, SAMPLE_KINDS } from './sample-data.ts';

const col = (name: string, values: (number | string | null)[], numeric = true, extra: Partial<QualityColumn> = {}): QualityColumn => ({ name, numeric, values, ...extra });
const rule = (column: string, issue: CleanRule['issue'], action: CleanRule['action']): CleanRule => ({ column, issue, action });

describe('cleanColumns', () => {
  const x = Array.from({ length: 60 }, (_, i) => i + 1);
  const y: (number | null)[] = x.map((v) => 2 * v);
  y[10] = null;
  y[20] = null;
  const withOutlier: (number | null)[] = x.map((v) => 100 + (v % 7));
  withOutlier[5] = 9999;

  it('kural verilmezse hiçbir şey silinmez ve doldurulmaz', () => {
    const r = cleanColumns([col('x', x), col('y', y)], { rules: [], impute: 'none' });
    expect(r.removedRows).toBe(0);
    expect(r.imputedCells).toBe(0);
    expect(r.columns[1]!.values.filter((v) => v === null)).toHaveLength(2);
  });

  it('satır silme kuralı: Tukey dışındaki satırı çıkarır ve nedenini günlüğe yazar', () => {
    const r = cleanColumns([col('x', x), col('d', withOutlier)], { rules: [rule('d', 'extreme', 'removeRow')], impute: 'none' });
    expect(r.removedRows).toBe(1);
    expect(r.columns[0]!.values).toHaveLength(59);
    expect(r.columns[0]!.values).not.toContain(6);
    expect(r.log.join(' ')).toContain('Tukey');
    expect(r.log.join(' ')).toContain('incelenecek uç değer');
  });

  it('eksik işaretle kuralı: satır korunur, yalnızca hücre eksik olur', () => {
    const r = cleanColumns([col('x', x), col('d', withOutlier)], { rules: [rule('d', 'extreme', 'setMissing')], impute: 'none' });
    expect(r.removedRows).toBe(0);
    expect(r.columns[1]!.values).toHaveLength(60);
    expect(r.columns[1]!.values[5]).toBeNull();
    expect(r.setMissingCells).toBe(1);
  });

  it('geçersiz hücreler yalnızca doğrulanmış aralığa göre işlenir; 1–5 ölçeğinde 9 temizlenir, geçerli 5 korunur', () => {
    const likert = Array.from({ length: 40 }, (_, i) => (i % 5) + 1);
    likert[7] = 9;
    const item = col('m', likert, true, { kind: 'ordinal', validRange: { min: 1, max: 5 } });
    const r = cleanColumns([item], { rules: [rule('m', 'invalid', 'setMissing')], impute: 'none' });
    expect(r.columns[0]!.values[7]).toBeNull();
    expect(r.columns[0]!.values.filter((v) => v === 5)).toHaveLength(8);
    expect(r.removedRows).toBe(0);
  });

  it('birden fazla sütunda işaretli satır bir kez silinir', () => {
    const a = Array.from({ length: 40 }, (_, i) => 10 + (i % 5));
    const b = Array.from({ length: 40 }, (_, i) => 20 + (i % 4));
    a[3] = 900;
    b[3] = 900;
    const r = cleanColumns([col('a', a), col('b', b)], { rules: [rule('a', 'extreme', 'removeRow'), rule('b', 'extreme', 'removeRow')], impute: 'none' });
    expect(r.removedRows).toBe(1);
    expect(r.columns[0]!.values).toHaveLength(39);
  });

  it('doldurma yalnızca istenirse yapılır; medyan sürekli, mod sıralı ve kategorik sütunlarda kullanılır', () => {
    const ord = col('o', [1, 2, 2, null, 2, 5, 2, 3, 2, 2], true, { kind: 'ordinal' });
    const cat = col('g', ['a', 'a', 'b', null, 'a', 'a', 'b', 'a', 'a', 'a'], false);
    const cont = col('y', [1.5, 2.5, 3.5, null, 10, 11, 12, 13, 14, 15]);
    const r = cleanColumns([cont, ord, cat], { rules: [], impute: 'median' });
    expect(r.imputedCells).toBe(3);
    expect(r.columns[1]!.values[3]).toBe(2); // mod, ortalama (≈2.67) ya da medyan değil
    expect(r.columns[2]!.values[3]).toBe('a');
    expect(r.columns[0]!.values[3]).toBe(11); // medyan
    expect(r.columns[0]!.values.every((v) => v !== null)).toBe(true);
    expect(cleanColumns([cont, ord, cat], { rules: [], impute: 'none' }).imputedCells).toBe(0);
  });

  it('KNN yalnızca sürekli sütunlara uygulanır ve ilişkili değişkenden eksik değeri geri kazanır', () => {
    const r = cleanColumns([col('x', x), col('y', y)], { rules: [], impute: 'knn', k: 4 });
    expect(r.columns[1]!.values[10]).toBeCloseTo(22, 8);
    expect(r.columns[1]!.values[20]).toBeCloseTo(42, 8);
    const ord = col('o', [1, 2, 2, null, 2, 5, 2, 3, 2, 2, ...Array(50).fill(2)], true, { kind: 'ordinal' });
    const knn = cleanColumns([col('x', x), ord], { rules: [], impute: 'knn' });
    expect(knn.columns[1]!.values[3]).toBe(2); // geçerli bir kategori; ara değer değil
  });

  it('hatalı istekleri anlaşılır biçimde reddeder; KNN desteklenmiyorsa sessizce başka yönteme geçmez', () => {
    expect(() => cleanColumns([col('x', x)], { rules: [rule('yok', 'extreme', 'removeRow')], impute: 'none' })).toThrow(AnalysisError);
    expect(() => cleanColumns([col('g', ['a', 'b'], false)], { rules: [rule('g', 'extreme', 'removeRow')], impute: 'none' })).toThrow(/Tukey sınırı yalnızca sürekli/);
    const big = Array.from({ length: KNN_MAX_ROWS + 1 }, (_, i) => (i === 3 ? null : i));
    expect(() => cleanColumns([col('b', big), col('c', big.map((v) => (v === null ? 1 : v)))], { rules: [], impute: 'knn' })).toThrow(/KNN/);
  });
});

describe('modeOf', () => {
  it('eşitlikte küçük değeri seçer; sayıları sayısal sıralar', () => {
    expect(modeOf([10, 9, 9, 10])).toBe(9);
    expect(modeOf(['b', 'a', 'a', 'b'])).toBe('a');
    expect(modeOf([])).toBeNull();
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
