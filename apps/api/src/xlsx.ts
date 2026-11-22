/**
 * Excel (.xlsx) dosyasını CSV metnine çevirir; ardından olağan CSV hattı kullanılır.
 * Bağımlılıksızdır: ZIP, node:zlib ile açılır; XML yalnızca gereken öğeler için okunur.
 * Yalnızca ilk çalışma sayfası okunur. Tarih biçimli hücreler "YYYY-AA-GG SS:DD:ss" metnine çevrilir.
 */
import { inflateRawSync } from 'node:zlib';
import { CsvError } from './csv.ts';

/** Açılmış tek bir ZIP girdisi için üst sınır (sıkıştırma bombasına karşı). */
const MAX_ENTRY = 256 * 1024 * 1024;

export const isZip = (buf: Buffer) => buf.length > 4 && buf.readUInt32LE(0) === 0x04034b50;
/** Eski ikili Excel (.xls) ve diğer OLE belgeleri. */
export const isOle = (buf: Buffer) => buf.length > 8 && buf.readUInt32BE(0) === 0xd0cf11e0 && buf.readUInt32BE(4) === 0xa1b11ae1;

export function unzip(buf: Buffer): Map<string, () => Buffer> {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new CsvError('Excel dosyası okunamadı: ZIP yapısı bozuk.');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  if (p === 0xffffffff) throw new CsvError('Excel dosyası çok büyük (ZIP64 desteklenmiyor).');
  const entries = new Map<string, () => Buffer>();
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new CsvError('Excel dosyası okunamadı: ZIP dizini bozuk.');
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    entries.set(name, () => {
      if (local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50) throw new CsvError('Excel dosyası okunamadı: ZIP girdisi bozuk.');
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + size);
      if (method === 0) return data;
      if (method !== 8) throw new CsvError('Excel dosyası desteklenmeyen bir sıkıştırma yöntemi kullanıyor.');
      try {
        return inflateRawSync(data, { maxOutputLength: MAX_ENTRY });
      } catch {
        throw new CsvError('Excel dosyası açılamadı (bozuk ya da çok büyük).');
      }
    });
  }
  return entries;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function decode(s: string): string {
  return s
    .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e: string) =>
      e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : (ENTITIES[e.toLowerCase()] ?? m),
    )
    .replace(/_x([0-9a-f]{4})_/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
}

const attr = (attrs: string, name: string) => new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(attrs)?.[1];
/** Bir öğenin içindeki tüm <t> metinlerini birleştirir (zengin metin parçaları dahil, okunuş ipuçları hariç). */
const textOf = (xml: string) => [...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1]!)).join('');

const BUILTIN_DATE = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);
function isDateFormat(code: string): boolean {
  const bare = code
    .replace(/"[^"]*"/g, '')
    .replace(/\\./g, '')
    .replace(/\[[^\]]*\]/g, '');
  return /[ymdhs]/i.test(bare) && !/^general$/i.test(bare.trim());
}

/** Tarih biçimli stil indeksleri. */
function dateStyles(stylesXml: string | null): Set<number> {
  const out = new Set<number>();
  if (!stylesXml) return out;
  const custom = new Map<number, string>();
  for (const m of stylesXml.matchAll(/<numFmt\b([^>]*)\/?>/g)) {
    const id = Number(attr(m[1]!, 'numFmtId'));
    const code = attr(m[1]!, 'formatCode');
    if (Number.isFinite(id) && code !== undefined) custom.set(id, decode(code));
  }
  const xfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(stylesXml)?.[1] ?? '';
  let i = 0;
  for (const m of xfs.matchAll(/<xf\b([^>]*?)(\/>|>)/g)) {
    const id = Number(attr(m[1]!, 'numFmtId') ?? 0);
    if (BUILTIN_DATE.has(id) || (custom.has(id) && isDateFormat(custom.get(id)!))) out.add(i);
    i++;
  }
  return out;
}

const pad = (n: number) => String(n).padStart(2, '0');
function serialToText(serial: number, date1904: boolean): string {
  const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const d = new Date(epoch + Math.round(serial * 86400) * 1000);
  const day = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  if (serial < 1) return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  return Number.isInteger(serial) ? day : `${day} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

/** Excel'in kayan nokta artığını (0.30000000000000004) temizler. */
const numText = (v: string) => {
  const n = Number(v);
  return Number.isFinite(n) ? String(Number(n.toPrecision(15))) : v;
};

function colIndex(ref: string): number {
  let n = 0;
  for (const ch of ref.toUpperCase()) {
    const c = ch.charCodeAt(0);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

/** İlk çalışma sayfasını satır × sütun metin tablosu olarak okur. */
export function readXlsx(buf: Buffer): string[][] {
  const zip = unzip(buf);
  const read = (name: string) => {
    const get = zip.get(name);
    return get ? get().toString('utf8') : null;
  };
  const workbook = read('xl/workbook.xml');
  if (!workbook) throw new CsvError('Bu dosya bir Excel çalışma kitabı gibi görünmüyor (.xlsx).');

  const firstSheet = /<sheet\b([^>]*)\/?>/.exec(workbook)?.[1] ?? '';
  const rid = attr(firstSheet, 'r:id');
  const rels = read('xl/_rels/workbook.xml.rels') ?? '';
  let target = 'worksheets/sheet1.xml';
  for (const m of rels.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    if (rid && attr(m[1]!, 'Id') === rid) target = attr(m[1]!, 'Target') ?? target;
  }
  const sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
  const sheet = read(sheetPath);
  if (!sheet) throw new CsvError('Excel dosyasında çalışma sayfası bulunamadı.');

  const shared = [...(read('xl/sharedStrings.xml') ?? '').matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g)].map((m) => textOf(m[1] ?? ''));
  const dates = dateStyles(read('xl/styles.xml'));
  const date1904 = /<workbookPr\b[^>]*date1904="(1|true)"/.test(workbook);

  const rows: string[][] = [];
  let nextRow = 0;
  for (const rm of sheet.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const rAttr = attr(rm[1]!, 'r');
    const r = rAttr ? Number(rAttr) - 1 : nextRow;
    nextRow = r + 1;
    const cells: string[] = [];
    let nextCol = 0;
    for (const cm of (rm[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const a = cm[1]!;
      const body = cm[2] ?? '';
      const ref = attr(a, 'r');
      const c = ref ? colIndex(ref) : nextCol;
      nextCol = c + 1;
      const t = attr(a, 't') ?? 'n';
      const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let text = '';
      if (t === 's') text = v === undefined ? '' : (shared[Number(v)] ?? '');
      else if (t === 'inlineStr') text = textOf(/<is\b[^>]*>([\s\S]*?)<\/is>/.exec(body)?.[1] ?? '');
      else if (t === 'str' || t === 'd') text = v === undefined ? '' : decode(v);
      else if (t === 'b') text = v === '1' ? 'TRUE' : v === '0' ? 'FALSE' : '';
      else if (t === 'e') text = '';
      else if (v !== undefined) {
        const style = Number(attr(a, 's') ?? 0);
        const n = Number(v);
        text = dates.has(style) && Number.isFinite(n) ? serialToText(n, date1904) : numText(v);
      }
      cells[c] = text;
    }
    rows[r] = Array.from(cells, (x) => x ?? '');
  }

  // Boş satırları ve sağdaki boş sütunları at.
  const filled = Array.from(rows, (r) => r ?? []).filter((r) => r.some((x) => x.trim() !== ''));
  const width = filled.reduce((w, r) => {
    let last = r.length - 1;
    while (last >= 0 && r[last]!.trim() === '') last--;
    return Math.max(w, last + 1);
  }, 0);
  return filled.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ''));
}

const quote = (s: string) => (/[",\r\n]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
export const toCsv = (rows: string[][]) => rows.map((r) => r.map(quote).join(',')).join('\n') + '\n';

/** .xlsx içeriğini virgülle ayrılmış, UTF-8 CSV'ye çevirir. */
export function xlsxToCsv(buf: Buffer): Buffer {
  const rows = readXlsx(buf);
  if (rows.length === 0) throw new CsvError('Excel dosyasının ilk sayfası boş.');
  return Buffer.from(toCsv(rows), 'utf8');
}
