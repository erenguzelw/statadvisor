import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import multipart from '@fastify/multipart';
import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  analyze,
  analyzeQuality,
  AnalysisError,
  buildReport,
  ENGINE,
  reportFromResult,
  type AnalysisRequest,
  type AnalysisResult,
  type NumericColumn,
  type TextColumn,
} from '@statadvisor/shared';
import { CsvError, parseCsv, type ParsedColumn, type ParsedCsv } from './csv.ts';
import { openDb } from './db.ts';

export interface AppOptions {
  /** Veritabanı ve yüklenen dosyaların tutulduğu klasör. ":memory:" ile yalnızca bellekte çalışır. */
  dataDir: string;
  maxUploadBytes?: number;
  maxRows?: number;
  maxColumns?: number;
  /** İzin verilen tarayıcı kökenleri (CSRF koruması). */
  allowedOrigins?: string[];
  appVersion?: string;
}

/** İstemciye olduğu gibi gösterilebilen hata. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const LOCAL_HOST = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/;

const colName = z.string().min(1).max(200);
const AnalysisBody = z.object({
  datasetId: z.string().min(1).max(64),
  goal: z.enum(['compare', 'relate', 'predict']),
  design: z.enum(['independent', 'paired', 'unknown']),
  target: z.enum(['continuous', 'ordinal', 'categorical']),
  alpha: z.number().gt(0).lt(1).optional(),
  value: colName.optional(),
  group: colName.optional(),
  conditions: z.array(colName).min(2).max(12).optional(),
  x: colName.optional(),
  y: colName.optional(),
  rowVar: colName.optional(),
  colVar: colName.optional(),
});
type AnalysisBodyType = z.infer<typeof AnalysisBody>;

const QualityQuery = z.object({
  value: colName.optional(),
  group: colName.optional(),
  clean: z.string().max(4000).optional(),
});

/** Anahtarları sıralanmış, tekrarlanabilir JSON; girdi karması için kullanılır. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');

export function buildApp(opts: AppOptions): FastifyInstance {
  const maxUpload = opts.maxUploadBytes ?? 50 * 1024 * 1024;
  const limits = { maxRows: opts.maxRows ?? 200_000, maxColumns: opts.maxColumns ?? 200 };
  const memory = opts.dataDir === ':memory:';
  const filesDir = memory ? '' : join(opts.dataDir, 'files');
  if (!memory) mkdirSync(filesDir, { recursive: true });
  const db = openDb(memory ? ':memory:' : join(opts.dataDir, 'statadvisor.db'));
  const memFiles = new Map<string, Buffer>();
  const origins = opts.allowedOrigins ?? ['http://127.0.0.1:5173', 'http://localhost:5173', 'http://127.0.0.1:3001', 'http://localhost:3001'];

  const app = Fastify({ logger: false, bodyLimit: 1024 * 1024 });
  app.register(multipart, { limits: { fileSize: maxUpload, files: 1, fields: 5 } });

  /* ---------- Güvenlik: yalnızca yerel istekler, aynı köken ---------- */
  app.addHook('onRequest', async (req, reply) => {
    const host = req.headers.host ?? '';
    if (!LOCAL_HOST.test(host)) throw new ApiError(403, 'forbidden_host', 'Bu hizmet yalnızca yerel olarak erişilebilir.');
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const origin = req.headers.origin;
      if (origin && !origins.includes(origin)) throw new ApiError(403, 'forbidden_origin', 'İstek bu kökenden kabul edilmiyor.');
    }
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Cache-Control', 'no-store');
  });

  app.setErrorHandler((err: unknown, _req, reply) => {
    const e = err as { code?: string; statusCode?: number; message?: string };
    if (err instanceof ApiError) return reply.status(err.status).send({ error: { code: err.code, message: err.message } });
    if (err instanceof z.ZodError) {
      const issue = err.issues[0];
      return reply.status(400).send({ error: { code: 'invalid_request', message: `Geçersiz istek: ${issue?.path.join('.') || 'gövde'}: ${issue?.message ?? ''}`.trim() } });
    }
    if (err instanceof CsvError || err instanceof AnalysisError) return reply.status(422).send({ error: { code: (err as CsvError).code, message: err.message } });
    if (e.code === 'FST_REQ_FILE_TOO_LARGE' || e.statusCode === 413) {
      return reply.status(413).send({ error: { code: 'too_large', message: `Dosya çok büyük (en fazla ${Math.round(maxUpload / 1024 / 1024)} MB).` } });
    }
    if (e.statusCode && e.statusCode < 500) return reply.status(e.statusCode).send({ error: { code: 'bad_request', message: e.message ?? 'Geçersiz istek.' } });
    return reply.status(500).send({ error: { code: 'internal', message: 'Beklenmeyen bir hata oluştu.' } });
  });

  /* ---------- Depolama ---------- */
  const writeFile = (hash: string, buf: Buffer) => (memory ? void memFiles.set(hash, buf) : writeFileSync(join(filesDir, `${hash}.csv`), buf));
  const readFile = (hash: string): Buffer => (memory ? memFiles.get(hash)! : readFileSync(join(filesDir, `${hash}.csv`)));
  const removeFile = (hash: string) => (memory ? void memFiles.delete(hash) : rmSync(join(filesDir, `${hash}.csv`), { force: true }));

  const cache = new Map<string, ParsedCsv>();
  const parsed = (id: string): { row: DatasetRow; csv: ParsedCsv } => {
    const row = db.prepare('SELECT * FROM datasets WHERE id = ?').get(id) as DatasetRow | undefined;
    if (!row) throw new ApiError(404, 'not_found', 'Veri seti bulunamadı.');
    let csv = cache.get(id);
    if (!csv) {
      csv = parseCsv(readFile(row.sha256), limits);
      cache.set(id, csv);
      if (cache.size > 6) cache.delete(cache.keys().next().value!);
    }
    return { row, csv };
  };

  interface DatasetRow {
    id: string;
    name: string;
    sha256: string;
    size: number;
    rows: number;
    columns_json: string;
    created_at: string;
  }
  const columnSummary = (c: ParsedColumn) => ({ name: c.name, type: c.type, numeric: c.numeric, unique: c.unique, missing: c.missing, examples: c.examples, likelyId: c.likelyId, warnings: c.warnings });
  const datasetJson = (r: DatasetRow) => ({ id: r.id, name: r.name, size: r.size, rows: r.rows, columns: JSON.parse(r.columns_json) as unknown[], createdAt: r.created_at });

  /* ---------- Veri setleri ---------- */
  app.post('/api/datasets', async (req, reply) => {
    const part = await req.file();
    if (!part) throw new ApiError(400, 'no_file', 'Dosya gönderilmedi.');
    const buf = await part.toBuffer();
    if (part.file.truncated) throw new ApiError(413, 'too_large', `Dosya çok büyük (en fazla ${Math.round(maxUpload / 1024 / 1024)} MB).`);
    const csv = parseCsv(buf, limits);
    const hash = sha256(buf);
    const existing = db.prepare('SELECT * FROM datasets WHERE sha256 = ?').get(hash) as DatasetRow | undefined;
    if (existing) return reply.status(200).send({ ...datasetJson(existing), duplicate: true });
    // Özgün dosya adı yalnızca etiket olarak saklanır; diskte hiçbir zaman kullanılmaz.
    const name = [...(part.filename || 'veri.csv')].filter((ch) => ch.charCodeAt(0) >= 32 && ch !== '<' && ch !== '>').join('').slice(0, 200) || 'veri.csv';
    const id = hash.slice(0, 16);
    writeFile(hash, buf);
    const now = new Date().toISOString();
    db.prepare('INSERT INTO datasets (id, name, sha256, size, rows, columns_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      id,
      name,
      hash,
      buf.length,
      csv.rows,
      JSON.stringify(csv.columns.map(columnSummary)),
      now,
    );
    cache.set(id, csv);
    return reply.status(201).send({ id, name, size: buf.length, rows: csv.rows, columns: csv.columns.map(columnSummary), createdAt: now, duplicate: false });
  });

  app.get('/api/datasets', async () => {
    const rows = db.prepare('SELECT * FROM datasets ORDER BY created_at DESC').all() as unknown as DatasetRow[];
    return { datasets: rows.map(datasetJson) };
  });

  app.get('/api/datasets/:id', async (req) => {
    const { id } = req.params as { id: string };
    const { row, csv } = parsed(id);
    return { ...datasetJson(row), delimiter: csv.delimiter, preview: csv.preview };
  });

  app.delete('/api/datasets/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = db.prepare('SELECT * FROM datasets WHERE id = ?').get(id) as DatasetRow | undefined;
    if (!row) throw new ApiError(404, 'not_found', 'Veri seti bulunamadı.');
    db.prepare('DELETE FROM datasets WHERE id = ?').run(id);
    removeFile(row.sha256);
    cache.delete(id);
    return reply.status(204).send();
  });

  /* ---------- Veri kalitesi ---------- */
  app.get('/api/datasets/:id/quality', async (req) => {
    const { id } = req.params as { id: string };
    const q = QualityQuery.parse(req.query);
    const { csv } = parsed(id);
    const known = new Set(csv.columns.map((c) => c.name));
    const clean = q.clean ? q.clean.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
    for (const n of [q.value, q.group, ...(clean ?? [])]) if (n && !known.has(n)) throw new ApiError(422, 'unknown_column', `“${n}” adlı sütun bulunamadı.`);
    return analyzeQuality(
      csv.columns.map((c) => ({ name: c.name, numeric: c.numeric, values: c.values, skip: c.likelyId })),
      { valueColumn: q.value, groupColumn: q.group, cleanColumns: clean },
    );
  });

  /* ---------- Analizler ---------- */
  function toRequest(b: AnalysisBodyType, csv: ParsedCsv, datasetName: string): AnalysisRequest {
    const find = (name: string) => {
      const c = csv.columns.find((x) => x.name === name);
      if (!c) throw new ApiError(422, 'unknown_column', `“${name}” adlı sütun bulunamadı.`);
      return c;
    };
    const num = (name?: string): NumericColumn | undefined => {
      if (!name) return undefined;
      const c = find(name);
      if (!c.numeric) throw new ApiError(422, 'not_numeric', `“${name}” sayısal bir sütun değil; bu analiz için sayısal sütun gerekir.`);
      return { name, values: c.values as (number | null)[] };
    };
    const text = (name?: string): TextColumn | undefined => {
      if (!name) return undefined;
      const c = find(name);
      return { name, values: c.values.map((v) => (v === null ? null : String(v))) };
    };
    return {
      goal: b.goal,
      design: b.design,
      target: b.target,
      alpha: b.alpha,
      datasetName,
      value: b.target === 'categorical' ? undefined : num(b.value),
      group: text(b.group),
      conditions: b.conditions?.map((n) => num(n)!),
      x: num(b.x),
      y: num(b.y),
      rowVar: text(b.rowVar),
      colVar: text(b.colVar),
    };
  }

  /** Kategorik karşılaştırmada grup sütunu satır, sonuç sütunu sütun değişkenidir. */
  function normalizeBody(b: AnalysisBodyType): AnalysisBodyType {
    if (b.goal === 'compare' && b.target === 'categorical') return { ...b, rowVar: b.rowVar ?? b.group, colVar: b.colVar ?? b.value };
    return b;
  }

  const engineInfo = () => ({ app: opts.appVersion ?? '0.1.0', node: process.version, engine: ENGINE.version, engineName: ENGINE.name, ruleSet: ENGINE.ruleSet, referenceSuite: ENGINE.referenceSuite });

  app.post('/api/analyses', async (req, reply) => {
    const body = normalizeBody(AnalysisBody.parse(req.body));
    const { row, csv } = parsed(body.datasetId);
    const request = toRequest(body, csv, row.name);
    const result = analyze(request);
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    const inputHash = sha256(`${row.sha256}\n${canonical(body)}`);
    const engine = engineInfo();
    db.prepare(
      'INSERT INTO analyses (id, dataset_id, created_at, request_json, result_json, input_hash, engine_json, test, p, significant) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(id, row.id, createdAt, JSON.stringify(body), JSON.stringify(result), inputHash, JSON.stringify(engine), result.outcome.test, result.outcome.p, result.outcome.significant ? 1 : 0);
    return reply.status(201).send({ id, datasetId: row.id, createdAt, inputHash, engine, result });
  });

  interface AnalysisRow {
    id: string;
    dataset_id: string;
    created_at: string;
    request_json: string;
    result_json: string;
    input_hash: string;
    engine_json: string;
    test: string;
    p: number | null;
    significant: number;
  }
  const analysisJson = (r: AnalysisRow) => ({
    id: r.id,
    datasetId: r.dataset_id,
    createdAt: r.created_at,
    inputHash: r.input_hash,
    engine: JSON.parse(r.engine_json) as unknown,
    request: JSON.parse(r.request_json) as unknown,
    result: JSON.parse(r.result_json) as AnalysisResult,
  });
  const getAnalysis = (id: string): AnalysisRow => {
    const r = db.prepare('SELECT * FROM analyses WHERE id = ?').get(id) as AnalysisRow | undefined;
    if (!r) throw new ApiError(404, 'not_found', 'Analiz bulunamadı.');
    return r;
  };

  app.get('/api/analyses', async (req) => {
    const { datasetId } = req.query as { datasetId?: string };
    const rows = (datasetId
      ? db.prepare('SELECT id, dataset_id, created_at, test, p, significant, request_json, input_hash FROM analyses WHERE dataset_id = ? ORDER BY created_at DESC').all(datasetId)
      : db.prepare('SELECT id, dataset_id, created_at, test, p, significant, request_json, input_hash FROM analyses ORDER BY created_at DESC LIMIT 200').all()) as unknown as (Pick<AnalysisRow, 'id' | 'dataset_id' | 'created_at' | 'test' | 'p' | 'significant' | 'request_json' | 'input_hash'>)[];
    return {
      analyses: rows.map((r) => ({ id: r.id, datasetId: r.dataset_id, createdAt: r.created_at, test: r.test, p: r.p, significant: r.significant === 1, inputHash: r.input_hash, request: JSON.parse(r.request_json) as unknown })),
    };
  });

  app.get('/api/analyses/:id', async (req) => analysisJson(getAnalysis((req.params as { id: string }).id)));

  app.delete('/api/analyses/:id', async (req, reply) => {
    const id = (req.params as { id: string }).id;
    getAnalysis(id);
    db.prepare('DELETE FROM analyses WHERE id = ?').run(id);
    return reply.status(204).send();
  });

  /** Rapor: denetim izi dahil. format = html | print | word */
  app.get('/api/analyses/:id/report', async (req, reply) => {
    const { format } = z.object({ format: z.enum(['html', 'print', 'word']).default('html') }).parse(req.query);
    const a = analysisJson(getAnalysis((req.params as { id: string }).id));
    const date = new Date(a.createdAt).toLocaleDateString('tr-TR');
    const eng = a.engine as ReturnType<typeof engineInfo>;
    const audit: [string, string][] = [
      ['Analiz kimliği', a.id],
      ['Girdi karması (SHA-256)', a.inputHash],
      ['Çalıştırılan test', a.result.outcome.test],
      ['Kural kümesi', eng.ruleSet],
      ['Motor sürümü', `${eng.engineName} ${eng.engine}`],
      ['Referans doğrulama', `SciPy ${eng.referenceSuite.scipy}, ${eng.referenceSuite.cases} vaka`],
      ['Çalışma ortamı', `Node ${eng.node}`],
    ];
    const html = buildReport(reportFromResult(a.result, date, audit), format);
    reply.header('Content-Type', format === 'word' ? 'application/msword; charset=utf-8' : 'text/html; charset=utf-8');
    if (format === 'word') reply.header('Content-Disposition', 'attachment; filename="rapor.doc"');
    reply.header('Content-Security-Policy', format === 'print' ? "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'" : "default-src 'none'; style-src 'unsafe-inline'");
    return html;
  });

  app.get('/api/health', async () => ({ ok: true, engine: engineInfo() }));

  app.addHook('onClose', async () => {
    db.close();
  });

  return app;
}
