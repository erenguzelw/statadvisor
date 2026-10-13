import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  analyze,
  analyzeQuality,
  AnalysisError,
  buildReport,
  cleanColumns,
  generateAnalysisCode,
  generateCleaningCode,
  columnsToCsv,
  ENGINE,
  reportFromResult,
  sampleDataset,
  SAMPLE_KINDS,
  type AnalysisRequest,
  type AnalysisResult,
  type AnalysisSpec,
  type ImputeMethod,
  type NumericColumn,
  type TextColumn,
} from '@statadvisor/shared';
import { CsvError, parseCsv, type ParsedColumn, type ParsedCsv } from './csv.ts';
import { openDb } from './db.ts';
import { buildDocx } from './docx.ts';
import { PdfUnavailableError, pdfAvailable, renderPdf } from './pdf.ts';

export interface AppOptions {
  /** Veritabanı ve yüklenen dosyaların tutulduğu klasör. ":memory:" ile yalnızca bellekte çalışır. */
  dataDir: string;
  maxUploadBytes?: number;
  maxRows?: number;
  maxColumns?: number;
  /** Derlenmiş arayüzün klasörü; verilirse sunucu arayüzü de sunar (tek komutla çalışma). */
  webDir?: string;
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
      // Aynı köken (arayüz sunucusu isteği vekil olarak iletir ve Host'u korur) ya da açıkça izinli köken kabul edilir.
      const sameOrigin = (() => {
        try {
          return origin !== undefined && new URL(origin).host === host;
        } catch {
          return false;
        }
      })();
      if (origin && !sameOrigin && !origins.includes(origin)) throw new ApiError(403, 'forbidden_origin', 'İstek bu kökenden kabul edilmiyor.');
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
    if (err instanceof PdfUnavailableError) return reply.status(501).send({ error: { code: err.code, message: err.message } });
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
    parent_id: string | null;
    operations_json: string | null;
  }
  const columnSummary = (c: ParsedColumn) => ({ name: c.name, type: c.type, numeric: c.numeric, unique: c.unique, missing: c.missing, examples: c.examples, likelyId: c.likelyId, warnings: c.warnings });
  const datasetJson = (r: DatasetRow) => ({ id: r.id, name: r.name, size: r.size, rows: r.rows, columns: JSON.parse(r.columns_json) as unknown[], createdAt: r.created_at, parentId: r.parent_id, operations: r.operations_json ? (JSON.parse(r.operations_json) as unknown) : null });

  /* ---------- Veri setleri ---------- */
  /** Bir CSV içeriğini veri seti olarak kaydeder; aynı içerik varsa mevcut kayıt döner. */
  function ingest(buf: Buffer, rawName: string, provenance?: { parentId: string; operations: unknown }) {
    const csv = parseCsv(buf, limits);
    const hash = sha256(buf);
    const existing = db.prepare('SELECT * FROM datasets WHERE sha256 = ?').get(hash) as DatasetRow | undefined;
    if (existing) return { dataset: datasetJson(existing), created: false };
    // Özgün dosya adı yalnızca etiket olarak saklanır; diskte hiçbir zaman kullanılmaz.
    const name = [...(rawName || 'veri.csv')].filter((ch) => ch.charCodeAt(0) >= 32 && ch !== '<' && ch !== '>').join('').slice(0, 200) || 'veri.csv';
    const id = hash.slice(0, 16);
    writeFile(hash, buf);
    const now = new Date().toISOString();
    db.prepare('INSERT INTO datasets (id, name, sha256, size, rows, columns_json, created_at, parent_id, operations_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      id,
      name,
      hash,
      buf.length,
      csv.rows,
      JSON.stringify(csv.columns.map(columnSummary)),
      now,
      provenance?.parentId ?? null,
      provenance ? JSON.stringify(provenance.operations) : null,
    );
    cache.set(id, csv);
    return { dataset: datasetJson(db.prepare('SELECT * FROM datasets WHERE id = ?').get(id) as unknown as DatasetRow), created: true };
  }

  app.post('/api/datasets', async (req, reply) => {
    const part = await req.file();
    if (!part) throw new ApiError(400, 'no_file', 'Dosya gönderilmedi.');
    const buf = await part.toBuffer();
    if (part.file.truncated) throw new ApiError(413, 'too_large', `Dosya çok büyük (en fazla ${Math.round(maxUpload / 1024 / 1024)} MB).`);
    const { dataset, created } = ingest(buf, part.filename);
    return reply.status(created ? 201 : 200).send({ ...dataset, duplicate: !created });
  });

  /** Yerleşik örnek veri setlerinden birini sıradan bir yükleme gibi kaydeder. */
  app.get('/api/samples', async () => ({
    samples: SAMPLE_KINDS.map((k) => {
      const s = sampleDataset(k);
      return { kind: s.kind, title: s.title, description: s.description, fileName: s.fileName };
    }),
  }));
  app.post('/api/samples/:kind', async (req, reply) => {
    const { kind } = req.params as { kind: string };
    if (!(SAMPLE_KINDS as string[]).includes(kind)) throw new ApiError(404, 'not_found', 'Örnek veri seti bulunamadı.');
    const s = sampleDataset(kind as (typeof SAMPLE_KINDS)[number]);
    const { dataset, created } = ingest(Buffer.from(s.csv, 'utf8'), s.fileName);
    return reply.status(created ? 201 : 200).send({ ...dataset, duplicate: !created });
  });

  /** Temizleme: yeni bir veri sürümü üretir; ham veri değişmez. */
  const CleanBody = z.object({
    outlierColumns: z.array(colName).max(200).default([]),
    impute: z.enum(['none', 'median', 'knn']).default('none'),
  });
  app.post('/api/datasets/:id/clean', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = CleanBody.parse(req.body ?? {});
    if (body.outlierColumns.length === 0 && body.impute === 'none') throw new ApiError(422, 'nothing_to_do', 'Uygulanacak bir işlem seçilmedi.');
    const { row, csv } = parsed(id);
    const result = cleanColumns(
      csv.columns.map((c) => ({ name: c.name, numeric: c.numeric, values: c.values, skip: c.likelyId })),
      body,
    );
    if (result.columns[0]!.values.length < 3) throw new ApiError(422, 'too_few_rows', 'Temizlikten sonra analiz için yeterli satır kalmıyor.');
    const buf = Buffer.from(columnsToCsv(result.columns), 'utf8');
    const operations = { ...body, removedRows: result.removedRows, imputedCells: result.imputedCells, log: result.log };
    const { dataset, created } = ingest(buf, `${row.name.replace(/\.csv$/i, '')} (temizlenmiş).csv`, { parentId: row.id, operations });
    return reply.status(created ? 201 : 200).send({ ...dataset, duplicate: !created });
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

  /** Ham CSV'yi olduğu gibi indirir (üretilen kodun okuduğu dosya). */
  app.get('/api/datasets/:id/download', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { row } = parsed(id);
    const ascii = [...row.name].map((ch) => (ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) <= 126 && ch !== '"' && ch !== '\\' ? ch : '_')).join('');
    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(row.name)}`);
    return readFile(row.sha256);
  });

  const fileInfo = (row: DatasetRow, csv: ParsedCsv) => ({ fileName: row.name, delimiter: csv.delimiter, decimalComma: csv.decimalComma });

  /** Temizleme işleminin Python karşılığı. */
  app.get('/api/datasets/:id/cleaning-code', async (req) => {
    const { id } = req.params as { id: string };
    const q = z.object({ clean: z.string().max(4000).optional(), impute: z.enum(['none', 'median', 'knn']).default('none') }).parse(req.query);
    const { row, csv } = parsed(id);
    const clean = q.clean ? q.clean.split(',').map((s) => s.trim()).filter(Boolean) : [];
    for (const n of clean) if (!csv.columns.some((c) => c.name === n)) throw new ApiError(422, 'unknown_column', `“${n}” adlı sütun bulunamadı.`);
    return generateCleaningCode(fileInfo(row, csv), {
      numericColumns: csv.columns.filter((c) => c.numeric).map((c) => c.name),
      categoricalColumns: csv.columns.filter((c) => !c.numeric).map((c) => c.name),
      idColumns: csv.columns.filter((c) => c.likelyId).map((c) => c.name),
      outlierColumns: clean,
      impute: q.impute as ImputeMethod,
    });
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
    const save = (req.query as { save?: string }).save !== 'false';
    const { row, csv } = parsed(body.datasetId);
    const request = toRequest(body, csv, row.name);
    const result = analyze(request);
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    const inputHash = sha256(`${row.sha256}\n${canonical(body)}`);
    const engine = engineInfo();
    if (!save) return reply.status(200).send({ id: null, datasetId: row.id, createdAt, inputHash, engine, result });
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

  /** Rapor: denetim izi dahil. format = html | pdf | docx */
  app.get('/api/analyses/:id/report', async (req, reply) => {
    const { format } = z.object({ format: z.enum(['html', 'pdf', 'docx']).default('html') }).parse(req.query);
    const a = analysisJson(getAnalysis((req.params as { id: string }).id));
    // Tarih, analizin oluşturulma tarihidir: aynı analiz her zaman aynı raporu üretir.
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
    const ds = db.prepare('SELECT * FROM datasets WHERE id = ?').get(a.datasetId) as DatasetRow | undefined;
    if (ds) {
      audit.unshift(['Veri seti', `${ds.name} (SHA-256 ${ds.sha256.slice(0, 16)}…, ${ds.rows} satır)`]);
      if (ds.parent_id) {
        const parent = db.prepare('SELECT name FROM datasets WHERE id = ?').get(ds.parent_id) as { name: string } | undefined;
        audit.splice(1, 0, ['Veri sürümü', `Temizlenmiş sürüm (kaynak: ${parent?.name ?? 'silinmiş veri seti'})`]);
        const ops = ds.operations_json ? (JSON.parse(ds.operations_json) as { log?: string[] }) : {};
        for (const line of ops.log ?? []) audit.splice(2, 0, ['Temizlik işlemi', line]);
      } else {
        audit.splice(1, 0, ['Veri sürümü', 'Ham veri (değiştirilmemiş)']);
      }
    }
    const data = reportFromResult(a.result, date, audit);
    const html = buildReport(data);
    if (format === 'html') {
      reply.header('Content-Type', 'text/html; charset=utf-8');
      reply.header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:");
      return html;
    }
    if (format === 'docx') {
      reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      reply.header('Content-Disposition', 'attachment; filename="rapor.docx"');
      return buildDocx(data);
    }
    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', 'attachment; filename="rapor.pdf"');
    return renderPdf(html);
  });

  /** Bu makinede hangi çıktı biçimleri kullanılabilir? */
  app.get('/api/capabilities', async () => ({ pdf: await pdfAvailable(), docx: true, html: true }));

  /** Analizin Python karşılığı; betik, beklenen çıktıyla birebir aynı satırları yazdırır. */
  app.get('/api/analyses/:id/code', async (req) => {
    const a = analysisJson(getAnalysis((req.params as { id: string }).id));
    const { row, csv } = parsed(a.datasetId);
    return generateAnalysisCode(fileInfo(row, csv), a.request as AnalysisSpec, a.result);
  });

  if (opts.webDir && existsSync(join(opts.webDir, 'index.html'))) {
    app.register(fastifyStatic, { root: opts.webDir });
    // Tarayıcı yönlendirmesi (SPA): /api dışındaki bilinmeyen GET istekleri arayüze gider.
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api/')) return reply.sendFile('index.html');
      return reply.status(404).send({ error: { code: 'not_found', message: 'Bulunamadı.' } });
    });
  }

  app.get('/api/health', async () => ({ ok: true, engine: engineInfo() }));

  app.addHook('onClose', async () => {
    db.close();
  });

  return app;
}
