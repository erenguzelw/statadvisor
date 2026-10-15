/**
 * SPSS (.sav) dosyasını CSV metnine çevirir; ardından olağan CSV hattı kullanılır. Bağımlılıksızdır.
 * Desteklenen: sıkıştırmasız ve bayt-kodlu sıkıştırılmış (varsayılan) dosyalar, uzun değişken adları, değer etiketleri,
 * kullanıcı tanımlı eksik değerler, tarih biçimleri, UTF-8 ve Windows/ISO kod sayfaları. Desteklenmeyen: .zsav (zlib), 255 karakterden uzun metinler.
 * Bir değişkenin değer etiketleri yalnızca verideki TÜM değerleri kapsıyorsa uygulanır (ör. 1 → "Kadın"); aksi halde sayılar korunur.
 */
import { CsvError } from './csv.ts';
import { toCsv } from './xlsx.ts';

export const isSav = (buf: Buffer) => buf.length > 176 && buf.toString('latin1', 0, 4) === '$FL2';
export const isZsav = (buf: Buffer) => buf.length > 176 && buf.toString('latin1', 0, 4) === '$FL3';

/** SPSS tarih sayıları 1582-10-14 00:00'dan beri saniyedir. */
const SPSS_EPOCH_OFFSET = 12219379200;
const DATE_ONLY = new Set([20, 23, 24, 38, 39]);
const DATE_TIME = new Set([22]);

interface Variable {
  nameRaw: Buffer;
  width: number; // 0 = sayısal
  missing: number[];
  missingRange?: [number, number];
  fmtType: number;
  index: number; // ilk kaydın 1 tabanlı sırası (devam kayıtları dahil)
}

const MISSING_SYS = -1.7976931348623157e308;

export function savToCsv(buf: Buffer): Buffer {
  if (isZsav(buf)) throw new CsvError('.zsav (zlib sıkıştırmalı SPSS) biçimi desteklenmiyor. SPSS’te dosyayı .sav olarak kaydedip yeniden yükleyin.');
  if (!isSav(buf)) throw new CsvError('SPSS dosyası okunamadı: geçerli bir .sav başlığı yok.');
  const layout = buf.readInt32LE(64);
  const le = layout === 2 || layout === 3;
  const i32 = (o: number) => (le ? buf.readInt32LE(o) : buf.readInt32BE(o));
  const f64 = (o: number) => (le ? buf.readDoubleLE(o) : buf.readDoubleBE(o));
  if (!le && buf.readInt32BE(64) !== 2 && buf.readInt32BE(64) !== 3) throw new CsvError('SPSS dosyası okunamadı: bilinmeyen bayt sırası.');
  const compression = i32(72);
  const nCases = i32(80);
  const bias = f64(84);
  if (compression === 2) throw new CsvError('Zlib sıkıştırmalı SPSS dosyaları desteklenmiyor.');
  if (compression !== 0 && compression !== 1) throw new CsvError('SPSS dosyası okunamadı: bilinmeyen sıkıştırma türü.');

  const vars: Variable[] = [];
  let recordIndex = 0;
  let longNamesRaw: Buffer | undefined;
  let codePage = 0;
  let encodingName = '';
  let p = 176;
  const need = (n: number) => {
    if (p + n > buf.length) throw new CsvError('SPSS dosyası okunamadı: dosya eksik ya da bozuk.');
  };
  const pad4 = (n: number) => Math.ceil(n / 4) * 4;
  const labelTargets: { raw: Map<string, string>; vars: number[] }[] = [];

  loop: for (;;) {
    need(4);
    const type = i32(p);
    p += 4;
    switch (type) {
      case 2: {
        need(28);
        const typ = i32(p);
        const hasLabel = i32(p + 4);
        const nMissing = i32(p + 8);
        const print = i32(p + 12);
        const nameRaw = Buffer.from(buf.subarray(p + 20, p + 28));
        p += 28;
        if (hasLabel) {
          need(4);
          const len = i32(p);
          p += 4 + pad4(len);
        }
        const miss: number[] = [];
        let range: [number, number] | undefined;
        if (nMissing !== 0) {
          const n = Math.abs(nMissing);
          need(n * 8);
          const vals = Array.from({ length: n }, (_, k) => f64(p + k * 8));
          p += n * 8;
          if (typ === 0) {
            if (nMissing < 0) {
              range = [vals[0]!, vals[1]!];
              if (n === 3) miss.push(vals[2]!);
            } else miss.push(...vals);
          }
        }
        recordIndex++;
        if (typ !== -1) {
          vars.push({ nameRaw, width: typ, missing: miss, missingRange: range, fmtType: (print >> 16) & 0xff, index: recordIndex });
        }
        break;
      }
      case 3: {
        need(4);
        const count = i32(p);
        p += 4;
        const raw = new Map<string, string>();
        for (let k = 0; k < count; k++) {
          need(9);
          const key = Buffer.from(buf.subarray(p, p + 8));
          const len = buf[p + 8]!;
          const total = 8 + Math.ceil((len + 1) / 8) * 8;
          need(total);
          raw.set(key.toString('hex'), buf.toString('latin1', p + 9, p + 9 + len));
          p += total;
        }
        // hemen ardından 4 numaralı kayıt: bu etiketlerin geçerli olduğu değişkenler
        need(8);
        if (i32(p) !== 4) throw new CsvError('SPSS dosyası okunamadı: değer etiketi kaydı bozuk.');
        const nVars = i32(p + 4);
        need(8 + nVars * 4);
        const idx = Array.from({ length: nVars }, (_, k) => i32(p + 8 + k * 4));
        p += 8 + nVars * 4;
        labelTargets.push({ raw, vars: idx });
        break;
      }
      case 6: {
        need(4);
        p += 4 + i32(p) * 80;
        break;
      }
      case 7: {
        need(12);
        const sub = i32(p);
        const size = i32(p + 4);
        const count = i32(p + 8);
        p += 12;
        const len = size * count;
        need(len);
        const body = buf.subarray(p, p + len);
        if (sub === 13) {
          longNamesRaw = Buffer.from(body);
        } else if (sub === 3 && len >= 32) {
          codePage = le ? body.readInt32LE(28) : body.readInt32BE(28);
        } else if (sub === 20) {
          encodingName = body.toString('latin1').trim();
        } else if (sub === 21) {
          throw new CsvError('255 karakterden uzun metin değişkenleri içeren SPSS dosyaları desteklenmiyor.');
        }
        p += len;
        break;
      }
      case 999:
        p += 4;
        break loop;
      default:
        throw new CsvError('SPSS dosyası okunamadı: bilinmeyen kayıt türü.');
    }
  }

  // metin çözümü
  const encLabel = (() => {
    const n = encodingName.toLowerCase();
    if (n) return n;
    if (codePage === 65001) return 'utf-8';
    if (codePage === 1254 || codePage === 28599) return 'windows-1254';
    if (codePage === 1252 || codePage === 0) return '';
    if (codePage === 28591) return 'iso-8859-1';
    return codePage ? `windows-${codePage}` : '';
  })();
  const makeDecoder = (label: string, fatal: boolean) => {
    try {
      return new TextDecoder(label, { fatal });
    } catch {
      return null;
    }
  };
  const decodeWith = (dec: TextDecoder | null, b: Buffer) => (dec ? dec.decode(b) : b.toString('latin1'));
  const decoder = encLabel ? makeDecoder(encLabel, false) : null;
  const strictUtf8 = makeDecoder('utf-8', true);
  const fallback = makeDecoder('windows-1254', false);
  const decode = (b: Buffer) => {
    if (decoder) return decodeWith(decoder, b);
    try {
      return decodeWith(strictUtf8, b);
    } catch {
      return decodeWith(fallback, b);
    }
  };

  const widthSlots = (v: Variable) => (v.width === 0 ? 1 : Math.ceil(v.width / 8));

  // ---- veri ----
  const cases: (number | string | null)[][] = [];
  const cellsPerCase = vars.reduce((s, v) => s + widthSlots(v), 0);
  const nextSlots = (slots: Buffer[]): (number | string | null)[] => {
    const row: (number | string | null)[] = [];
    let s = 0;
    for (const v of vars) {
      const w = widthSlots(v);
      if (v.width === 0) {
        const raw = slots[s]!;
        const x = le ? raw.readDoubleLE(0) : raw.readDoubleBE(0);
        row.push(x <= MISSING_SYS || Number.isNaN(x) ? null : x);
      } else {
        const joined = Buffer.concat(slots.slice(s, s + w)).subarray(0, v.width);
        row.push(decode(joined).replace(/[\s\0]+$/, ''));
      }
      s += w;
    }
    return row;
  };
  const MAX_CASES = 5_000_000;
  if (compression === 0) {
    const stride = cellsPerCase * 8;
    for (let o = p; o + stride <= buf.length && cases.length < MAX_CASES; o += stride) {
      cases.push(nextSlots(Array.from({ length: cellsPerCase }, (_, k) => buf.subarray(o + k * 8, o + k * 8 + 8))));
    }
  } else {
    let cur: Buffer[] = [];
    const sysmis = Buffer.alloc(8);
    (le ? sysmis.writeDoubleLE : sysmis.writeDoubleBE).call(sysmis, MISSING_SYS, 0);
    const spaces = Buffer.alloc(8, 0x20);
    const push = (b: Buffer) => {
      cur.push(b);
      if (cur.length === cellsPerCase) {
        cases.push(nextSlots(cur));
        cur = [];
      }
    };
    let o = p;
    outer: while (o + 8 <= buf.length && cases.length < MAX_CASES) {
      const cmds = buf.subarray(o, o + 8);
      o += 8;
      for (const c of cmds) {
        if (c === 0) continue;
        if (c === 252) break outer;
        if (c === 253) {
          if (o + 8 > buf.length) break outer;
          push(buf.subarray(o, o + 8));
          o += 8;
        } else if (c === 254) push(spaces);
        else if (c === 255) push(sysmis);
        else {
          const b = Buffer.alloc(8);
          (le ? b.writeDoubleLE : b.writeDoubleBE).call(b, c - bias, 0);
          push(b);
        }
      }
    }
  }
  if (nCases > 0 && cases.length > nCases) cases.length = nCases;
  if (!cases.length) throw new CsvError('SPSS dosyasında veri satırı bulunamadı.');

  // kullanıcı tanımlı eksik değerler
  vars.forEach((v, j) => {
    if (v.width !== 0 || (!v.missing.length && !v.missingRange)) return;
    for (const row of cases) {
      const x = row[j];
      if (typeof x !== 'number') continue;
      if (v.missing.includes(x) || (v.missingRange && x >= v.missingRange[0] && x <= v.missingRange[1])) row[j] = null;
    }
  });

  // değer etiketleri: her değişkende, verideki tüm değerler etiketliyse uygulanır
  const byVarIndex = new Map(vars.map((v, j) => [v.index, j]));
  const labelMaps = new Map<number, Map<string, string>>();
  for (const t of labelTargets) {
    for (const vi of t.vars) {
      const j = byVarIndex.get(vi);
      if (j === undefined) continue;
      const v = vars[j]!;
      if (v.width !== 0) continue;
      const m = labelMaps.get(j) ?? new Map<string, string>();
      for (const [hex, label] of t.raw) {
        const raw = Buffer.from(hex, 'hex');
        const x = le ? raw.readDoubleLE(0) : raw.readDoubleBE(0);
        m.set(String(x), decode(Buffer.from(label, 'latin1')));
      }
      labelMaps.set(j, m);
    }
  }

  const fmtNum = (x: number) => (Number.isInteger(x) ? String(x) : String(Number(x.toPrecision(15))));
  const iso = (sec: number, withTime: boolean) => {
    const d = new Date((sec - SPSS_EPOCH_OFFSET) * 1000);
    if (Number.isNaN(d.getTime())) return '';
    const s = d.toISOString();
    return withTime ? `${s.slice(0, 10)} ${s.slice(11, 19)}` : s.slice(0, 10);
  };
  const longNames = new Map<string, string>();
  if (longNamesRaw) {
    for (const pair of decode(longNamesRaw).split('	')) {
      const eq = pair.indexOf('=');
      if (eq > 0) longNames.set(pair.slice(0, eq).trim(), pair.slice(eq + 1));
    }
  }
  const header = vars.map((v) => {
    const short = decode(v.nameRaw).trim();
    return longNames.get(short) ?? short;
  });
  const used = new Set<string>();
  const names = header.map((h, i) => {
    let n = h || `degisken_${i + 1}`;
    for (let k = 2; used.has(n); k++) n = `${h}_${k}`;
    used.add(n);
    return n;
  });
  const columnText = vars.map((v, j) => {
    if (v.width !== 0) return (x: number | string | null) => String(x ?? '');
    if (DATE_ONLY.has(v.fmtType)) return (x: number | string | null) => (typeof x === 'number' ? iso(x, false) : '');
    if (DATE_TIME.has(v.fmtType)) return (x: number | string | null) => (typeof x === 'number' ? iso(x, true) : '');
    const labels = labelMaps.get(j);
    if (labels && labels.size) {
      const seen = new Set<string>();
      for (const row of cases) if (typeof row[j] === 'number') seen.add(String(row[j]));
      if ([...seen].every((s) => labels.has(s))) return (x: number | string | null) => (typeof x === 'number' ? labels.get(String(x)) ?? fmtNum(x) : '');
    }
    return (x: number | string | null) => (typeof x === 'number' ? fmtNum(x) : '');
  });
  const rows = [names, ...cases.map((row) => row.map((x, j) => columnText[j]!(x)))];
  return Buffer.from(toCsv(rows), 'utf8');
}
