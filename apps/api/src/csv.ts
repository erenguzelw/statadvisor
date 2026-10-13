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
  warnings: string[];
}

export interface ParsedCsv {
  columns: ParsedColumn[];
  rows: number;
  delimiter: string;
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
  const s = decimalComma && /^-?\d+,\d+$/.test(t) ? t.replace(',', '.') : t;
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
  const columns: ParsedColumn[] = names.map((name, c) => {
    const tokens = body.map((r) => (r[c] ?? '').trim());
    const present = tokens.filter((t) => !MISSING.has(t.toLowerCase()));
    const nums = present.map((t) => toNumber(t, decimalComma));
    const numericShare = present.length ? nums.filter((n) => n !== null).length / present.length : 0;
    const numeric = present.length > 0 && numericShare >= 0.95;
    const warnings: string[] = [];
    let values: (number | string | null)[];
    if (numeric) {
      values = tokens.map((t) => (MISSING.has(t.toLowerCase()) ? null : toNumber(t, decimalComma)));
      const invalid = present.length - nums.filter((n) => n !== null).length;
      if (invalid > 0) warnings.push(`${invalid} sayısal olmayan değer eksik sayıldı.`);
    } else {
      values = tokens.map((t) => (MISSING.has(t.toLowerCase()) ? null : t));
    }
    const filled = values.filter((v) => v !== null);
    const uniqueSet = new Set(filled.map(String));
    const allInt = numeric && filled.every((v) => Number.isInteger(v));
    const type: ColumnType = numeric ? (allInt && uniqueSet.size <= 7 ? 'ordinal' : 'continuous') : 'categorical';
    const sortedInts = numeric && allInt ? (filled as number[]) : [];
    const sequential = sortedInts.length > 1 && sortedInts.every((v, i) => i === 0 || v === sortedInts[i - 1]! + 1);
    const idName = /(^|[_\s-])(id|kimlik|no|index|sıra|sira)$/i.test(name);
    return {
      name,
      type,
      numeric,
      values,
      unique: uniqueSet.size,
      missing: values.length - filled.length,
      examples: [...uniqueSet].slice(0, 3),
      likelyId: numeric && allInt && uniqueSet.size === filled.length && (idName || sequential),
      warnings,
    };
  });

  return { columns, rows: body.length, delimiter, preview: records.slice(0, 21) };
}
