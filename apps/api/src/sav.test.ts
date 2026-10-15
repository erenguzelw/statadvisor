import { describe, expect, it } from 'vitest';
import { isSav, savToCsv } from './sav.ts';

const i32 = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeInt32LE(n);
  return b;
};
const f64 = (n: number) => {
  const b = Buffer.alloc(8);
  b.writeDoubleLE(n);
  return b;
};
const str = (s: string, n: number) => Buffer.concat([Buffer.from(s, 'utf8'), Buffer.alloc(Math.max(0, n - Buffer.byteLength(s)), 0x20)]);

/** Küçük bir .sav kurar: cinsiyet (1/2, etiketli), puan (sayısal, 99 = kullanıcı eksiği), ad (metin, 8). */
function build(compressed: boolean, rows: [number, number, string][]): Buffer {
  const header = Buffer.concat([
    str('$FL2', 4),
    str('@(#) SPSS DATA FILE test', 60),
    i32(2),
    i32(3), // nominal case size
    i32(compressed ? 1 : 0),
    i32(0),
    i32(rows.length),
    f64(100),
    str('01 Jan 26', 9),
    str('12:00:00', 8),
    str('', 64),
    Buffer.alloc(3),
  ]);
  const variable = (typ: number, name: string, miss: number[] = []) =>
    Buffer.concat([i32(2), i32(typ), i32(0), i32(miss.length), i32(0x050800), i32(0x050800), str(name, 8), ...miss.map(f64)]);
  const labels = Buffer.concat([
    i32(3),
    i32(2),
    f64(1),
    Buffer.from([6]),
    str('Kadın', 7),
    f64(2),
    Buffer.from([5]),
    str('Erkek', 7),
    i32(4),
    i32(1),
    i32(1),
  ]);
  const data = compressed
    ? Buffer.concat(
        rows.flatMap(([g, s, n]) => [Buffer.from([g + 100, 253, 253, 0, 0, 0, 0, 0]), f64(s), str(n, 8)]),
      )
    : Buffer.concat(rows.flatMap(([g, s, n]) => [f64(g), f64(s), str(n, 8)]));
  const tail = compressed ? Buffer.from([252, 0, 0, 0, 0, 0, 0, 0]) : Buffer.alloc(0);
  return Buffer.concat([header, variable(0, 'cinsiyet'), variable(0, 'puan', [99]), variable(8, 'ad'), labels, i32(999), i32(0), data, tail]);
}

const rows: [number, number, string][] = [
  [1, 85.5, 'Ayşe'],
  [2, 99, 'Ali'],
  [1, 70, 'Zeynep'],
];

describe('SPSS (.sav) okuyucu', () => {
  for (const compressed of [false, true]) {
    it(`${compressed ? 'bayt-kodlu sıkıştırılmış' : 'sıkıştırmasız'} dosyayı CSV yapar; etiket ve eksik değer çözülür`, () => {
      const buf = build(compressed, rows);
      expect(isSav(buf)).toBe(true);
      const lines = savToCsv(buf).toString('utf8').trim().split('\n');
      expect(lines[0]).toBe('cinsiyet,puan,ad');
      expect(lines[1]).toBe('Kadın,85.5,Ayşe');
      expect(lines[2]).toBe('Erkek,,Ali');
      expect(lines[3]).toBe('Kadın,70,Zeynep');
    });
  }
  it('bozuk dosyada anlaşılır hata verir', () => {
    expect(() => savToCsv(Buffer.from('not an spss file'))).toThrow(/SPSS/);
  });
});
