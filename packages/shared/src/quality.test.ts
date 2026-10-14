import { AnalysisError } from './analysis.ts';
import { analyzeQuality, planRules, ROW_LOSS_CONFIRM, ROW_LOSS_REVIEW, scanColumn, type CleanRule, type QualityColumn } from './quality.ts';
import { gaussian, mulberry32 } from './ml.ts';

const rng = mulberry32(9);
const n = 300;
const group = Array.from({ length: n }, (_, i) => ['A', 'B', 'C'][i % 3]!);
const value: (number | null)[] = Array.from({ length: n }, (_, i) => Math.round((100 + (i % 3) * 5 + 8 * gaussian(rng)) * 10) / 10);
value[10] = 400; // belirgin uç değer
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

const rule = (column: string, issue: CleanRule['issue'], action: CleanRule['action']): CleanRule => ({ column, issue, action });

describe('analyzeQuality: varsayılanlar güvenlidir', () => {
  const q = analyzeQuality(columns, { valueColumn: 'deger', groupColumn: 'grup' });

  it('kural verilmezse hiçbir satır silinmez, hiçbir hücre değişmez; tarama yine de çalışır', () => {
    expect(q.plan.rules).toEqual([]);
    expect(q.plan.removedRows).toBe(0);
    expect(q.plan.cleanedRows).toBe(n);
    expect(q.plan.setMissingCells).toBe(0);
    expect(q.plan.level).toBe('none');
    expect(q.extremeCells).toBeGreaterThanOrEqual(2); // 400 ve 50 incelenecek uç değer olarak görünür
    expect(q.missingCells).toBe(2);
    expect(q.invalidCells).toBe(0);
  });

  it('eksik, geçersiz ve uç hücreler ayrı sayılır; kimlik sütunu atlanır', () => {
    const id = q.columns.find((c) => c.name === 'id')!;
    expect(id.skipped).toBe(true);
    expect(id.extremes).toBe(0);
    const deger = q.columns.find((c) => c.name === 'deger')!;
    expect(deger.extremes).toBeGreaterThanOrEqual(1);
    expect(deger.lower).toBeLessThan(deger.upper!);
    expect(deger.validity).toBe('unconfirmed');
    expect(q.extremeCells).toBe(q.columns.reduce((s, c) => s + c.extremes, 0));
  });

  it('gözlenen aralık yalnızca bilgidir; geçerlilik kuralı sayılmaz', () => {
    const deger = q.columns.find((c) => c.name === 'deger')!;
    expect(deger.observedMax).toBe(400);
    expect(deger.invalid).toBe(0);
  });
});

describe('analyzeQuality: kurallar ve satır kaybı', () => {
  it('yalnızca seçilen kural uygulanır; sütun seçmek taramayı etkilemez', () => {
    const none = analyzeQuality(columns, { rules: [] });
    const only = analyzeQuality(columns, { rules: [rule('deger', 'extreme', 'removeRow')] });
    expect(only.extremeCells).toBe(none.extremeCells);
    expect(only.plan.removedRows).toBeGreaterThanOrEqual(1);
    expect(only.plan.removedRows).toBeLessThanOrEqual(only.columns.find((c) => c.name === 'deger')!.extremes);
    expect(only.plan.cleanedRows + only.plan.removedRows).toBe(n);
  });

  it('birden fazla sütunda işaretlenen satır, satır kaybında yalnızca bir kez sayılır', () => {
    const a = Array.from({ length: 50 }, (_, i) => 10 + (i % 5));
    const b = Array.from({ length: 50 }, (_, i) => 20 + (i % 4));
    a[7] = 1000;
    b[7] = 2000; // aynı kişi iki sütunda
    b[30] = 3000;
    const cols: QualityColumn[] = [
      { name: 'a', numeric: true, values: a },
      { name: 'b', numeric: true, values: b },
    ];
    const q = analyzeQuality(cols, { rules: [rule('a', 'extreme', 'removeRow'), rule('b', 'extreme', 'removeRow')] });
    expect(q.plan.byRule.map((r) => r.cells)).toEqual([1, 2]); // hücre toplamı 3
    expect(q.plan.removedRows).toBe(2); // satır sayısı 2 (7. satır bir kez)
    expect(q.plan.removedRate).toBeCloseTo(4, 10);
  });

  it('eksik işaretle eylemi satır silmez; hücreyi eksik yapar', () => {
    const q = analyzeQuality(columns, { rules: [rule('deger', 'extreme', 'setMissing')] });
    expect(q.plan.removedRows).toBe(0);
    expect(q.plan.setMissingCells).toBe(q.columns.find((c) => c.name === 'deger')!.extremes);
  });

  it('grup başına kayıp ve uyarı seviyeleri; eşikler koruyucu tasarım eşikleridir', () => {
    expect(ROW_LOSS_REVIEW).toBe(5);
    expect(ROW_LOSS_CONFIRM).toBe(10);
    // 100 satır, grup B'de 4 uç değer: toplam %4, B grubunda %8 → inceleme
    const g = Array.from({ length: 100 }, (_, i) => (i < 50 ? 'A' : 'B'));
    const v = Array.from({ length: 100 }, (_, i) => 10 + (i % 5));
    for (const i of [60, 61, 62, 63]) v[i] = 500;
    const cols: QualityColumn[] = [
      { name: 'g', numeric: false, values: g },
      { name: 'v', numeric: true, values: v },
    ];
    const q = analyzeQuality(cols, { groupColumn: 'g', rules: [rule('v', 'extreme', 'removeRow')] });
    expect(q.plan.removedRate).toBeCloseTo(4, 10);
    expect(q.plan.level).toBe('review');
    expect(q.plan.worstScope).toContain('B');
    expect(q.plan.groupLoss!.find((x) => x.group === 'B')).toMatchObject({ n: 50, removed: 4 });
    expect(q.plan.groupLoss!.find((x) => x.group === 'A')).toMatchObject({ n: 50, removed: 0 });
    // 100 satırın 12'si uç → toplam %12 > %10: açık onay gerekir
    const many = Array.from({ length: 100 }, (_, i) => (i >= 80 && i < 92 ? 500 : 10 + (i % 5)));
    const big = analyzeQuality([cols[0]!, { name: 'v', numeric: true, values: many }], { rules: [rule('v', 'extreme', 'removeRow')] });
    expect(big.plan.removedRate).toBeCloseTo(12, 10);
    expect(big.plan.level).toBe('confirm');
    expect(big.plan.worstScope).toBe('tüm veri');
  });

  it('odak sütunda öncesi/sonrası kutular ve Shapiro-Wilk hesaplanır; kural uygulanınca uç değer sonrası görünümden çıkar', () => {
    const q = analyzeQuality(columns, { valueColumn: 'deger', groupColumn: 'grup', rules: [rule('deger', 'extreme', 'removeRow')] });
    const f = q.focus!;
    expect(f.boxesBefore.map((b) => b.group)).toEqual(['A', 'B', 'C']);
    expect(f.boxesBefore.flatMap((b) => b.outliers)).toContain(400);
    expect(f.boxesAfter.flatMap((b) => b.outliers)).not.toContain(400);
    expect(f.shapiroAfter!.p).toBeGreaterThan(f.shapiroBefore!.p);
    expect(f.shapiroBefore!.n).toBe(n - 2);
    expect(f.histAfter.bins.reduce((s, b) => s + b.count, 0)).toBeLessThan(f.histBefore.bins.reduce((s, b) => s + b.count, 0));
  });
});

describe('değişken türüne göre kontrol', () => {
  // 1–5 Likert maddesi: çoğu cevap 3–4, birkaç geçerli uç cevap (1 ve 5)
  const likert: number[] = Array.from({ length: 179 }, (_, i) => (i % 10 === 0 ? 4 : i % 10 === 1 ? 3 : i % 7 === 0 ? 3 : 4));
  likert[3] = 1;
  likert[40] = 5;
  likert[90] = 5;
  const item: QualityColumn = { name: 'madde', numeric: true, kind: 'ordinal', values: likert };

  it('sıralı anket maddesinde geçerli uç cevaplar incelenecek uç değer sayılmaz ve silinmez', () => {
    // Aynı değerler sürekli sayılsaydı Tukey bunları işaretlerdi:
    expect(scanColumn({ ...item, kind: 'continuous' }).extreme.filter(Boolean).length).toBeGreaterThan(0);
    const q = analyzeQuality([item]);
    const c = q.columns[0]!;
    expect(c.kind).toBe('ordinal');
    expect(c.tukeyApplied).toBe(false);
    expect(c.extremes).toBe(0);
    expect(q.plan.removedRows).toBe(0);
    expect(() => planRules([item], [rule('madde', 'extreme', 'removeRow')])).toThrow(/Tukey sınırı yalnızca sürekli/);
  });

  it('kullanıcının doğruladığı 1–5 aralığındaki 9 geçersiz hücre olarak işaretlenir; doğrulanmadıysa işaretlenmez', () => {
    const withNine = [...likert];
    withNine[5] = 9;
    expect(analyzeQuality([{ ...item, values: withNine }]).invalidCells).toBe(0); // aralık doğrulanmadı
    expect(analyzeQuality([{ ...item, values: withNine }]).columns[0]!.validity).toBe('unconfirmed');
    const q = analyzeQuality([{ ...item, values: withNine, validRange: { min: 1, max: 5 } }]);
    expect(q.columns[0]!.validity).toBe('range');
    expect(q.invalidCells).toBe(1);
    expect(q.extremeCells).toBe(0);
    // seyrek geçerli cevaplar (1 ve 5) geçersiz sayılmaz
    expect(analyzeQuality([{ ...item, validRange: { min: 1, max: 5 } }]).invalidCells).toBe(0);
    const del = analyzeQuality([{ ...item, values: withNine, validRange: { min: 1, max: 5 } }], { rules: [rule('madde', 'invalid', 'setMissing')] });
    expect(del.plan.removedRows).toBe(0);
    expect(del.plan.setMissingCells).toBe(1);
  });

  it('geçerlilik doğrulanmamış sütunda geçersiz-hücre kuralı reddedilir', () => {
    expect(() => planRules([item], [rule('madde', 'invalid', 'setMissing')])).toThrow(AnalysisError);
    expect(() => planRules([item], [rule('madde', 'invalid', 'setMissing')])).toThrow(/doğrulanmadı/);
  });

  it('sayısal kodlu kategorik sütuna Tukey uygulanmaz; tanımlı kategoriler dışındaki değer ayrı işaretlenir', () => {
    const codes = Array.from({ length: 100 }, (_, i) => (i < 90 ? 1 : i < 98 ? 2 : 3)); // 3 seyrek
    const col: QualityColumn = { name: 'cinsiyet', numeric: true, kind: 'categorical', values: codes };
    const q = analyzeQuality([col]);
    expect(q.columns[0]!.tukeyApplied).toBe(false);
    expect(q.extremeCells).toBe(0);
    const withCats = analyzeQuality([{ ...col, validCategories: ['1', '2'] }]);
    expect(withCats.invalidCells).toBe(2); // 3 kodu tanımlı kategori değil
    expect(withCats.extremeCells).toBe(0);
    const text: QualityColumn = { name: 'sehir', numeric: false, values: ['A', 'B', 'A', 'X', null], validCategories: ['A', 'B'] };
    expect(analyzeQuality([text]).columns[0]).toMatchObject({ invalid: 1, missing: 1, validity: 'categories' });
  });

  it('sürekli değişkende uç değer görünür; yalnızca açık seçimle silinir. Geçersiz kod Tukey sınırlarını bozmaz', () => {
    const v = Array.from({ length: 80 }, (_, i) => 50 + (i % 9));
    v[3] = 999; // veri girişi kodu
    v[4] = 130; // gerçek ama uç
    const col: QualityColumn = { name: 'olcum', numeric: true, values: v, validRange: { min: 0, max: 200 } };
    const noRule = analyzeQuality([col]);
    expect(noRule.plan.removedRows).toBe(0);
    expect(noRule.columns[0]!.extremes).toBe(1); // 130
    expect(noRule.columns[0]!.invalid).toBe(1); // 999
    expect(noRule.columns[0]!.upper!).toBeLessThan(100); // 999 sınır hesabına katılmadı
    const del = analyzeQuality([col], { rules: [rule('olcum', 'extreme', 'removeRow')] });
    expect(del.plan.removedRows).toBe(1);
  });

  it('ölçek puanı ayrı değerlendirilir: score bayrağı sütun özetine yansır', () => {
    const q = analyzeQuality([{ name: 'ozguven', numeric: true, kind: 'continuous', score: true, values: Array.from({ length: 30 }, (_, i) => 3 + (i % 5) / 10) }]);
    expect(q.columns[0]!.score).toBe(true);
  });

  it('yinelenen kural ve kimlik sütunu reddedilir', () => {
    expect(() => planRules(columns, [rule('deger', 'extreme', 'removeRow'), rule('deger', 'extreme', 'setMissing')])).toThrow(/birden fazla kural/);
    expect(() => planRules(columns, [rule('id', 'extreme', 'removeRow')])).toThrow(/kimlik/);
    expect(() => planRules(columns, [rule('yok', 'extreme', 'removeRow')])).toThrow(/bulunamadı/);
  });
});
