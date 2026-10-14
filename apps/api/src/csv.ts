import { parse } from 'csv-parse/sync';

export type ColumnType = 'continuous' | 'ordinal' | 'categorical';

export interface ParsedColumn {
  name: string;
  type: ColumnType;
  numeric: boolean;
  values: (number | string | null)[];
  unique: number;
  missing: number;
  examples: string[];
  /** Kimlik benzeri sütun (benzersiz tamsayı sırası); aykırı değer taramasından çıkarılır. */
  likelyId: boolean;
  /** Değerler "2:Bazen katılıyorum" biçiminde kodlu etiketti; baştaki sayı alındı. */
  prefixCoded: boolean;
  /** Aralık etiketleri ("18-23", "7 ve üzeri") küçükten büyüğe sıralandı; değerler 0,1,2… sıra numarasıdır. */
  rankLabels: string[] | null;
  warnings: string[];
}

export interface ParsedCsv {
  columns: ParsedColumn[];
  rows: number;
  delimiter: string;
  /** Sayısal sütunlarda ondalık ayracı virgül olan en az bir değer var. */
  decimalComma: boolean;
  /** İlk satırların ham metni (önizleme). */
  preview: string[][];
}

/** Kullanıcıya gösterilebilir CSV hatası. */
export class CsvError extends Error {
  readonly code = 'csv_error';
}

export interface CsvLimits {
  maxRows: number;
  maxColumns: number;
}

const MISSING = new Set(['', 'na', 'n/a', 'nan', 'null', 'none', '-', '?', '#n/a']);
const DELIMITERS = [',', ';', '\t', '|'] as const;
/** Ondalık ayracı virgül olan sayı belirteci, ör. "3,5". */
const DECIMAL_COMMA = /^-?\d+,\d+$/;
/** Likert benzeri kodlu etiket, ör. "2:Bazen katılıyorum" (sayı + iki nokta ile başlar). */
export const CODED_LABEL = /^\s*(-?\d+)\s*:/;

function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '').slice(0, 8);
  let best: { d: string; score: number } = { d: ',', score: 0 };
  for (const d of DELIMITERS) {
    const counts = lines.map((line) => {
      let inQuote = false;
      let c = 0;
      for (const ch of line) {
        if (ch === '"') inQuote = !inQuote;
        else if (ch === d && !inQuote) c++;
      }
      return c;
    });
    const first = counts[0] ?? 0;
    if (first === 0) continue;
    const consistent = counts.filter((c) => c === first).length;
    const score = consistent * 1000 + first;
    if (score > best.score) best = { d, score };
  }
  return best.d;
}

/**
 * Aralık etiketlerini ("18-23", "1-3 saat", "1 saatten az", "7 ve üzeri") sayısal alt sınıra göre sıralar.
 * Tüm etiketler tanınmaz ya da sıra belirsizse null döner (sütun kategorik kalır).
 */
export function rankOrder(labels: string[]): string[] | null {
  if (labels.length < 2 || labels.length > 12) return null;
  const keyed = labels.map((label) => {
    const range = /^(\d+(?:[.,]\d+)?)\s*[-–]\s*\d+(?:[.,]\d+)?/.exec(label);
    if (range) return { label, key: Number(range[1]!.replace(',', '.')) };
    // "7 ve üzeri", "7+", "7 saat ve üzeri" (sayı ile ifade arasında bir birim kelimesi olabilir)
    const open = /^(\d+(?:[.,]\d+)?)\s*(?:[^\d\s]\S*\s+)?(\+|ve\s+(üzeri|üstü|üstünde|fazla)|ve\s+üzerinde)/i.exec(label);
    if (open) return { label, key: Number(open[1]!.replace(',', '.')) };
    const below = /^(\d+(?:[.,]\d+)?)\s*\S*\s*(den|dan)?\s*(az|altı|altında|daha az)\b/i.exec(label);
    if (below) return { label, key: Number(below[1]!.replace(',', '.')) - 0.5 };
    return null;
  });
  if (keyed.some((k) => k === null)) return null;
  const ks = keyed as { label: string; key: number }[];
  if (new Set(ks.map((k) => k.key)).size !== ks.length) return null;
  return ks.sort((a, b) => a.key - b.key).map((k) => k.label);
}

function uniqueNames(raw: string[]): string[] {
  const seen = new Map<string, number>();
  return raw.map((n, i) => {
    const base = n.trim() || `sütun_${i + 1}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base}_${count}`;
  });
}

/** Ondalık virgül (3,5) yalnızca ayraç virgül değilse sayı olarak yorumlanır. */
function toNumber(token: string, decimalComma: boolean): number | null {
  const t = token.trim();
  if (t === '' || /^0x/i.test(t)) return null;
  const s = decimalComma && DECIMAL_COMMA.test(t) ? t.replace(',', '.') : t;
  if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function parseCsv(buffer: Buffer, limits: CsvLimits): ParsedCsv {
  let text = buffer.toString('utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  if (text.includes('\u0000')) throw new CsvError('Bu dosya metin (CSV) gibi görünmüyor: ikili içerik bulundu.');
  if (text.trim() === '') throw new CsvError('Dosya boş.');

  const delimiter = detectDelimiter(text);
  let records: string[][];
  try {
    records = parse(text, { delimiter, relax_column_count: true, skip_empty_lines: true, relax_quotes: true, trim: true }) as string[][];
  } catch (e) {
    throw new CsvError(`CSV okunamadı: ${e instanceof Error ? e.message : 'bilinmeyen hata'}`);
  }
  if (records.length < 3) throw new CsvError('En az bir başlık satırı ve 2 veri satırı gerekir.');
  const header = records[0]!;
  if (header.length > limits.maxColumns) throw new CsvError(`En fazla ${limits.maxColumns} sütun desteklenir (bulunan: ${header.length}).`);
  const body = records.slice(1);
  if (body.length > limits.maxRows) throw new CsvError(`En fazla ${limits.maxRows.toLocaleString('tr-TR')} satır desteklenir (bulunan: ${body.length.toLocaleString('tr-TR')}).`);

  const names = uniqueNames(header);
  const decimalComma = delimiter !== ',';
  let usedDecimalComma = false;
  const columns: ParsedColumn[] = names.map((name, c) => {
    const tokens = body.map((r) => (r[c] ?? '').trim());
    const present = tokens.filter((t) => !MISSING.has(t.toLowerCase()));
    const prefixCoded = present.length > 0 && present.filter((t) => CODED_LABEL.test(t)).length / present.length >= 0.95;
    const num = (t: string) => (prefixCoded ? toNumber(CODED_LABEL.exec(t)?.[1] ?? '', false) : toNumber(t, decimalComma));
    const nums = present.map(num);
    const numericShare = present.length ? nums.filter((n) => n !== null).length / present.length : 0;
    const numeric = present.length > 0 && numericShare >= 0.95;
    const rankLabels = numeric ? null : rankOrder([...new Set(present)]);
    const warnings: string[] = [];
    let values: (number | string | null)[];
    if (numeric) {
      if (!prefixCoded && decimalComma && present.some((t, i) => nums[i] !== null && DECIMAL_COMMA.test(t))) usedDecimalComma = true;
      values = tokens.map((t) => (MISSING.has(t.toLowerCase()) ? null : num(t)));
      const invalid = present.length - nums.filter((n) => n !== null).length;
      if (invalid > 0) warnings.push(`${invalid} sayısal olmayan değer eksik sayıldı.`);
    } else if (rankLabels) {
      values = tokens.map((t) => (MISSING.has(t.toLowerCase()) ? null : rankLabels.indexOf(t)));
      warnings.push(`Aralık etiketleri küçükten büyüğe sıralandı: ${rankLabels.join(' < ')}.`);
    } else {
      values = tokens.map((t) => (MISSING.has(t.toLowerCase()) ? null : t));
    }
    const isNum = numeric || rankLabels !== null;
    const filled = values.filter((v) => v !== null);
    const uniqueSet = new Set(filled.map(String));
    const allInt = isNum && filled.every((v) => Number.isInteger(v));
    // Ad ipucu (cinsiyet, grup, kod…): az sayıda tamsayı kodu taşıyan bu sütunlar sıra değil kategori numarasıdır.
    const nameHintsCategory = /(cinsiyet|gender|sex|grup|group|medeni|bölüm|bolum|sınıf|sinif|meslek|şehir|sehir|kategori|category)/i.test(name);
    const codedCategory = numeric && allInt && !prefixCoded && nameHintsCategory && uniqueSet.size >= 2 && uniqueSet.size <= 12;
    const type: ColumnType = rankLabels ? 'ordinal' : codedCategory ? 'categorical' : numeric ? (allInt && uniqueSet.size <= 7 ? 'ordinal' : 'continuous') : 'categorical';
    const sortedInts = numeric && allInt ? (filled as number[]) : [];
    const sequential = sortedInts.length > 1 && sortedInts.every((v, i) => i === 0 || v === sortedInts[i - 1]! + 1);
    const idName = /(^|[_\s-])(id|kimlik|no|index|sıra|sira)$/i.test(name);
    const isId = numeric && allInt && uniqueSet.size === filled.length && (idName || sequential);
    // Tamsayı kodlu sütunlar sürekli ölçüm olmayabilir (kategori numarası, madde kodu). Tür çıkarımı kesin değildir;
    // kullanıcıdan doğrulaması istenir ve Veri Kalitesi sayfasından türü düzeltilebilir.
    if (codedCategory && !isId) warnings.push('Sütun adı bir kategoriye işaret ediyor ve değerler az sayıda tamsayı; kategorik koda benzediği için kategorik sayıldı. Türü doğrulayın.');
    else if (numeric && allInt && !isId && !prefixCoded) {
      if (type === 'ordinal') warnings.push('Tamsayı kodlu ve az sayıda değer içeriyor; sıralı sayıldı. Kategori numarası (ör. 1 = Kadın, 2 = Erkek) ise türü kategorik yapın.');
      else if (uniqueSet.size <= 20) warnings.push('Tamsayı kodlu ve sınırlı sayıda farklı değer içeriyor; sürekli ölçüm değil sayısal kod olabilir. Türü doğrulayın.');
    }
    return {
      name,
      type,
      numeric: isNum,
      values,
      unique: uniqueSet.size,
      missing: values.length - filled.length,
      examples: rankLabels ? rankLabels.slice(0, 3) : [...uniqueSet].slice(0, 3),
      rankLabels,
      prefixCoded: numeric && prefixCoded,
      likelyId: numeric && allInt && uniqueSet.size === filled.length && (idName || sequential),
      warnings: numeric && prefixCoded ? [...warnings, 'Değerler kodlu etiketti (ör. “2:Bazen katılıyorum”); baştaki sayı kullanıldı.'] : warnings,
    };
  });

  return { columns, rows: body.length, delimiter, decimalComma: usedDecimalComma, preview: records.slice(0, 21) };
}
