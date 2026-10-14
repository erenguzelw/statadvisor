import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  ALL_MODELS,
  analyze,
  analyzeQuality,
  missingnessOf,
  type MissingnessReport,
  AnalysisError,
  buildRegressionReport,
  buildReport,
  cleanColumns,
  computeScales,
  groupLossOf,
  KNN_MAX_ROWS,
  lossLevel,
  planRules,
  ROW_LOSS_CONFIRM,
  ROW_LOSS_REVIEW,
  validateRules,
  type CleanRule,
  generateScalesCode,
  generateScreeningCode,
  screenResponses,
  type ScaleDef,
  fitLinearRegression,
  buildModelCompareDoc,
  generateModelCompareCode,
  interpretComparison,
  renderReportHtml,
  prepareData,
  runCrossValidation,
  stratifiedKFold,
  type CvResult,
  type ModelCompareSpec,
  fitLogisticRegression,
  generateLogisticCode,
  hosmerLemeshowRows,
  classificationRows,
  logisticReportData,
  logitCoefficientRows,
  logitModelRows,
  narrateLogistic,
  type LogisticSpec,
  generateAnalysisCode,
  generateRegressionCode,
  narrateRegression,
  regressionReportData,
  coefficientRows,
  modelRows,
  type RegressionSpec,
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
import { isOle, isZip, xlsxToCsv } from './xlsx.ts';
import { openDb } from './db.ts';
import { buildProfile, describeColumns, effectiveColumns, ProfileBody } from './profile.ts';
import { buildDocx, buildDocxFromDoc, buildRegressionDocx } from './docx.ts';
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
  normality: z.enum(['shapiro', 'skewkurt-1.5', 'skewkurt-2']).optional(),
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
  cleanJson: z.string().max(80000).optional(),
  rulesJson: z.string().max(200000).optional(),
});

/** Sütun adlarındaki virgül ve boşlukları korur; eski istemciler de desteklenir. */
function parseCleanColumns(q: { clean?: string; cleanJson?: string }): string[] | undefined {
  if (q.cleanJson !== undefined) {
    let names: unknown;
    try {
      names = JSON.parse(q.cleanJson);
    } catch {
      throw new ApiError(400, 'invalid_columns', 'Temizlenecek sütun listesi geçersiz.');
    }
    return z.array(colName).max(200).parse(names);
  }
  return q.clean === undefined ? undefined : q.clean.split(',').map((s) => s.trim()).filter(Boolean);
}

const RuleSchema = z.object({ column: colName, issue: z.enum(['invalid', 'extreme']), action: z.enum(['setMissing', 'removeRow']) });

/**
 * Temizleme kuralları. rulesJson yeni biçimdir ({column, issue, action} listesi). Eski clean/cleanJson sütun listesi,
 * her sütun için “uç değeri olan satırı sil” kuralına çevrilir. Hiçbiri verilmezse kural yoktur: hiçbir şey seçilmemiş
 * sayılır, “hepsi” sayılmaz.
 */
function parseRules(q: { clean?: string; cleanJson?: string; rulesJson?: string }): CleanRule[] {
  if (q.rulesJson !== undefined) {
    if (q.clean !== undefined || q.cleanJson !== undefined) throw new ApiError(400, 'invalid_rules', 'rulesJson ile clean/cleanJson birlikte kullanılamaz.');
    let raw: unknown;
    try {
      raw = JSON.parse(q.rulesJson);
    } catch {
      throw new ApiError(400, 'invalid_rules', 'Temizleme kuralları geçersiz.');
    }
    return z.array(RuleSchema).max(400).parse(raw);
  }
  return (parseCleanColumns(q) ?? []).map((column) => ({ column, issue: 'extreme' as const, action: 'removeRow' as const }));
}

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
  const missingnessCache = new Map<string, MissingnessReport>();
  /** Önbelleğe ekler; en fazla 6 veri seti tutulur (yükleme yolu dahil). */
  const remember = (id: string, csv: ParsedCsv) => {
    cache.delete(id);
    cache.set(id, csv);
    if (cache.size > 6) cache.delete(cache.keys().next().value!);
  };
  const parsed = (id: string): { row: DatasetRow; csv: ParsedCsv } => {
    const row = db.prepare('SELECT * FROM datasets WHERE id = ?').get(id) as DatasetRow | undefined;
    if (!row) throw new ApiError(404, 'not_found', 'Veri seti bulunamadı.');
    let csv = cache.get(id);
    if (!csv) {
      csv = parseCsv(readFile(row.sha256), limits);
      remember(id, csv);
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
    profile_json: string | null;
  }
  const columnSummary = (c: ParsedColumn) => ({ name: c.name, type: c.type, numeric: c.numeric, unique: c.unique, missing: c.missing, examples: c.examples, likelyId: c.likelyId, prefixCoded: c.prefixCoded, rankLabels: c.rankLabels, warnings: c.warnings });
  const datasetJson = (r: DatasetRow) => ({ id: r.id, name: r.name, size: r.size, rows: r.rows, columns: describeColumns(r.columns_json, r), createdAt: r.created_at, parentId: r.parent_id, operations: r.operations_json ? (JSON.parse(r.operations_json) as unknown) : null });

  /** Kaynak sürümün işlem kaydı ve ondan önceki geçmiş; ham veri (işlemsiz kaynak) geçmişe girmez. */
  function historyOf(parent: DatasetRow | undefined): unknown[] {
    if (!parent?.operations_json) return [];
    const ops = JSON.parse(parent.operations_json) as { history?: unknown[] } & Record<string, unknown>;
    const { history, ...own } = ops;
    return [...(history ?? []), { dataset: parent.name, createdAt: parent.created_at, operations: own }];
  }

  /* ---------- Veri setleri ---------- */
  /** Bir CSV içeriğini veri seti olarak kaydeder; aynı içerik varsa mevcut kayıt döner. */
  function ingest(buf: Buffer, rawName: string, provenance?: { parentId: string; operations: Record<string, unknown> }) {
    const csv = parseCsv(buf, limits);
    const hash = sha256(buf);
    const existing = db.prepare('SELECT * FROM datasets WHERE sha256 = ?').get(hash) as DatasetRow | undefined;
    if (existing) return { dataset: datasetJson(existing), created: false };
    // Özgün dosya adı yalnızca etiket olarak saklanır; diskte hiçbir zaman kullanılmaz.
    const name = [...(rawName || 'veri.csv')].filter((ch) => ch.charCodeAt(0) >= 32 && ch !== '<' && ch !== '>').join('').slice(0, 200) || 'veri.csv';
    const id = hash.slice(0, 16);
    writeFile(hash, buf);
    const now = new Date().toISOString();
    // Türetilmiş sürüm: önceki işlemler sürüm geçmişine yazılır, sütun profili kaynaktan kopyalanır.
    const parent = provenance ? (db.prepare('SELECT * FROM datasets WHERE id = ?').get(provenance.parentId) as DatasetRow | undefined) : undefined;
    const operations = provenance ? { ...provenance.operations, history: historyOf(parent) } : null;
    db.prepare('INSERT INTO datasets (id, name, sha256, size, rows, columns_json, created_at, parent_id, operations_json, profile_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      id,
      name,
      hash,
      buf.length,
      csv.rows,
      JSON.stringify(csv.columns.map(columnSummary)),
      now,
      provenance?.parentId ?? null,
      operations ? JSON.stringify(operations) : null,
      parent?.profile_json ?? null,
    );
    remember(id, csv);
    return { dataset: datasetJson(db.prepare('SELECT * FROM datasets WHERE id = ?').get(id) as unknown as DatasetRow), created: true };
  }

  app.post('/api/datasets', async (req, reply) => {
    const part = await req.file();
    if (!part) throw new ApiError(400, 'no_file', 'Dosya gönderilmedi.');
    const buf = await part.toBuffer();
    if (part.file.truncated) throw new ApiError(413, 'too_large', `Dosya çok büyük (en fazla ${Math.round(maxUpload / 1024 / 1024)} MB).`);
    if (isOle(buf)) throw new CsvError('Eski Excel biçimi (.xls) desteklenmiyor. Dosyayı Excel’de .xlsx ya da CSV olarak kaydedip yeniden yükleyin.');
    if (isZip(buf)) {
      // Excel dosyası CSV'ye çevrilip öyle saklanır; Python kodu ve indirilen veri bu CSV'dir.
      const name = (part.filename || 'veri.xlsx').replace(/\.xlsx$/i, '') + '.csv';
      const { dataset, created } = ingest(xlsxToCsv(buf), name);
      return reply.status(created ? 201 : 200).send({ ...dataset, duplicate: !created, convertedFrom: 'xlsx' });
    }
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

  /**
   * Temizleme: yeni bir veri sürümü üretir; ham veri değişmez. Kurallar kullanıcı tarafından seçilir; hiçbir sütun
   * kendiliğinden temizlenmez. Eski `outlierColumns` listesi “uç değeri olan satırı sil” kuralı olarak yorumlanır.
   */
  const CleanBody = z.object({
    rules: z.array(RuleSchema).max(400).optional(),
    outlierColumns: z.array(colName).max(200).optional(),
    impute: z.enum(['none', 'median', 'knn']).default('none'),
    /** Kayıp oranını grup başına da denetlemek için (arayüzdeki grup sütunu). */
    groupColumn: colName.optional(),
    /** %10 üzeri satır kaybında gereken gerekçe ve açık onay. */
    acknowledgement: z.object({ reason: z.string().trim().min(10).max(1000) }).optional(),
  });
  app.post('/api/datasets/:id/clean', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = CleanBody.parse(req.body ?? {});
    if (body.rules && body.outlierColumns) throw new ApiError(400, 'invalid_rules', 'rules ile outlierColumns birlikte kullanılamaz.');
    const rules: CleanRule[] = body.rules ?? (body.outlierColumns ?? []).map((column) => ({ column, issue: 'extreme' as const, action: 'removeRow' as const }));
    if (rules.length === 0 && body.impute === 'none') throw new ApiError(422, 'nothing_to_do', 'Uygulanacak bir işlem seçilmedi.');
    const { row, csv } = parsed(id);
    if (body.groupColumn && !csv.columns.some((c) => c.name === body.groupColumn)) throw new ApiError(422, 'unknown_column', `“${body.groupColumn}” adlı sütun bulunamadı.`);
    const eff = effectiveColumns(row, csv);
    // Satır kaybı: toplam ve grup başına; eşikler ürünün koruyucu tasarım eşikleridir (bilimsel eşik değil).
    const plan = planRules(eff, rules);
    const total = row.rows ? (plan.removedRows / row.rows) * 100 : 0;
    const groupCol = eff.find((c) => c.name === body.groupColumn);
    const groupLoss = groupCol ? groupLossOf(groupCol.values, plan.remove) : undefined;
    const loss = lossLevel(total, groupLoss);
    if (loss.level === 'confirm' && !body.acknowledgement) {
      throw new ApiError(422, 'confirmation_required', `Satır kaybı %${loss.worstRate.toFixed(1)} (${loss.worstScope}); %${ROW_LOSS_CONFIRM} üzerinde işlemi onaylamak için gerekçe (en az 10 karakter) ve açık onay gerekir.`);
    }
    if (body.impute === 'knn' && row.rows - plan.removedRows > KNN_MAX_ROWS) {
      throw new ApiError(422, 'knn_too_large', `KNN imputasyonu en fazla ${KNN_MAX_ROWS.toLocaleString('tr-TR')} satırda desteklenir (kalacak: ${(row.rows - plan.removedRows).toLocaleString('tr-TR')}); medyan/mod ile doldurmayı seçin.`);
    }
    const result = cleanColumns(eff, { rules, impute: body.impute });
    if (result.columns[0]!.values.length < 3) throw new ApiError(422, 'too_few_rows', 'Temizlikten sonra analiz için yeterli satır kalmıyor.');
    const log = [...result.log];
    if ((row.parent_id || row.operations_json) && rules.some((r) => r.issue === 'extreme')) {
      log.push('Bu veri, daha önce işlenmiş bir sürümdür: Tukey sınırları bu sürümün verisinden yeniden hesaplandı. Önceki turda uç değerler çıkarıldıysa dağılım daralmıştır ve yeni sınırlar ek gözlemleri işaretleyebilir.');
    }
    const buf = Buffer.from(columnsToCsv(result.columns), 'utf8');
    const operations = {
      kind: 'cleaning',
      rules,
      impute: body.impute,
      groupColumn: body.groupColumn ?? null,
      removedRows: result.removedRows,
      removedRate: total,
      setMissingCells: result.setMissingCells,
      imputedCells: result.imputedCells,
      loss: { level: loss.level, worstRate: loss.worstRate, worstScope: loss.worstScope, reviewThreshold: ROW_LOSS_REVIEW, confirmThreshold: ROW_LOSS_CONFIRM, groups: groupLoss ?? null },
      acknowledgement: body.acknowledgement ?? null,
      log,
    };
    const { dataset, created } = ingest(buf, `${row.name.replace(/\.csv$/i, '')} (temizlenmiş).csv`, { parentId: row.id, operations });
    return reply.status(created ? 201 : 200).send({ ...dataset, duplicate: !created });
  });

  /** Sütun profili: tür düzeltmesi ve kullanıcının doğruladığı geçerli aralık/kategoriler (tüm profil değiştirilir). */
  app.put('/api/datasets/:id/profile', async (req) => {
    const { id } = req.params as { id: string };
    const body = ProfileBody.parse(req.body ?? {});
    const { csv } = parsed(id);
    const profile = buildProfile(body, csv);
    db.prepare('UPDATE datasets SET profile_json = ? WHERE id = ?').run(Object.keys(profile).length ? JSON.stringify(profile) : null, id);
    return datasetJson(db.prepare('SELECT * FROM datasets WHERE id = ?').get(id) as unknown as DatasetRow);
  });

  /** Bir sütunun gözlenen değerleri ve sayıları: kullanıcı geçerli kategorileri bu listeden işaretler (öneri değil, seçenek listesi). */
  app.get('/api/datasets/:id/levels', async (req) => {
    const { id } = req.params as { id: string };
    const { column } = z.object({ column: z.string().min(1).max(200) }).parse(req.query);
    const { csv } = parsed(id);
    const c = csv.columns.find((x) => x.name === column);
    if (!c) throw new ApiError(422, 'unknown_column', `“${column}” adlı sütun bulunamadı.`);
    const counts = new Map<string, number>();
    for (const v of c.values) if (v !== null && v !== undefined) counts.set(String(v), (counts.get(String(v)) ?? 0) + 1);
    const limit = 200;
    const levels = [...counts.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => (c.numeric ? Number(a.value) - Number(b.value) : b.count - a.count || a.value.localeCompare(b.value, 'tr')));
    return { column, total: levels.length, truncated: levels.length > limit, levels: levels.slice(0, limit) };
  });

  /** Ölçek puanları: araştırmacının tanımladığı alt boyutlardan yeni sütunlar ekleyen yeni bir veri sürümü üretir. */
  const ScaleBody = z.object({
    scales: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(80),
          items: z.array(colName).min(2).max(200),
          reverse: z.array(colName).max(200).default([]),
          method: z.enum(['mean', 'sum']).default('mean'),
          min: z.number().finite(),
          max: z.number().finite(),
          minValidShare: z.number().gt(0).max(1).default(1),
        }),
      )
      .min(1)
      .max(30),
  });
  const qcols = (csv: ParsedCsv) => csv.columns.map((c) => ({ name: c.name, numeric: c.numeric, values: c.values, skip: c.likelyId }));
  app.post('/api/datasets/:id/scales', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = ScaleBody.parse(req.body ?? {});
    const { row, csv } = parsed(id);
    const base = qcols(csv);
    const results = computeScales(base, body.scales as ScaleDef[]);
    const added = results.map((r) => ({ name: r.name, numeric: true, values: r.values, skip: false }));
    const buf = Buffer.from(columnsToCsv([...base, ...added]), 'utf8');
    const operations = {
      scales: body.scales,
      results: results.map((r) => ({ name: r.name, alpha: r.alpha, nAlpha: r.nAlpha, nValid: r.nValid, mean: r.mean, skewness: r.skewness, kurtosis: r.kurtosis, shapiroW: r.shapiroW, shapiroP: r.shapiroP, notes: r.notes })),
      log: results.map((r) => `Ölçek “${r.name}”: ${r.nValid} geçerli puan, alfa ${r.alpha === null ? 'hesaplanamadı' : r.alpha.toFixed(3)}.`),
    };
    const { dataset, created } = ingest(buf, `${row.name.replace(/\.csv$/i, '')} (ölçekli).csv`, { parentId: row.id, operations });
    return reply.status(created ? 201 : 200).send({ ...dataset, duplicate: !created, scaleResults: operations.results });
  });
  /** Anket yanıt taraması: düz çizgi ve Mahalanobis. Önizleme, uygulama (yeni sürüm) ve Python kodu. */
  const ScreenBody = z.object({
    items: z.array(colName).min(2).max(200),
    straightLine: z.boolean().default(true),
    mahalanobis: z.boolean().default(true),
    mahalanobisAlpha: z.number().gt(0).lt(0.5).default(0.001),
  });
  const screen = (id: string, raw: unknown) => {
    const body = ScreenBody.parse(raw ?? {});
    const { row, csv } = parsed(id);
    return { body, row, csv, result: screenResponses(qcols(csv), body) };
  };
  app.post('/api/datasets/:id/screen', async (req) => screen((req.params as { id: string }).id, req.body).result);
  app.post('/api/datasets/:id/screen/apply', async (req, reply) => {
    const { body, row, csv, result } = screen((req.params as { id: string }).id, req.body);
    if (result.flagged.length === 0) throw new ApiError(422, 'nothing_to_do', 'Çıkarılacak işaretli satır yok.');
    const drop = new Set(result.flagged);
    const kept = qcols(csv).map((c) => ({ ...c, values: c.values.filter((_, i) => !drop.has(i)) }));
    if (kept[0]!.values.length < 3) throw new ApiError(422, 'too_few_rows', 'Taramadan sonra analiz için yeterli satır kalmıyor.');
    const log = [
      ...(body.straightLine ? [`Düz çizgi yanıt (${body.items.length} maddenin tümüne aynı yanıt): ${result.straightLiners.length} satır.`] : []),
      ...(body.mahalanobis ? [`Mahalanobis D² (sd = ${result.items}, p < ${body.mahalanobisAlpha}, kritik değer ${result.critical!.toFixed(2)}): ${result.mahalanobis.length} satır.`] : []),
      `Toplam ${result.flagged.length} satır çıkarıldı.`,
    ];
    const operations = { screening: body, removedRows: result.flagged.length, log };
    const { dataset, created } = ingest(Buffer.from(columnsToCsv(kept), 'utf8'), `${row.name.replace(/\.csv$/i, '')} (taranmış).csv`, { parentId: row.id, operations });
    return reply.status(created ? 201 : 200).send({ ...dataset, duplicate: !created });
  });
  app.post('/api/datasets/:id/screen-code', async (req) => {
    const { body, row, csv, result } = screen((req.params as { id: string }).id, req.body);
    return generateScreeningCode(fileInfo(row, csv), body, result);
  });

  /** Ölçek tanımının Python karşılığı (sonuçlar sunucuda yeniden hesaplanır). */
  app.post('/api/datasets/:id/scales-code', async (req) => {
    const { id } = req.params as { id: string };
    const body = ScaleBody.parse(req.body ?? {});
    const { row, csv } = parsed(id);
    const results = computeScales(qcols(csv), body.scales as ScaleDef[]);
    return generateScalesCode(fileInfo(row, csv), body.scales as ScaleDef[], results);
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

  /** Tüm veri setlerini, dosyalarını ve (zincirleme silmeyle) bunlara bağlı kayıtlı analizleri siler. */
  app.delete('/api/datasets', async () => {
    const rows = db.prepare('SELECT sha256 FROM datasets').all() as { sha256: string }[];
    const analyses = (db.prepare('SELECT COUNT(*) AS n FROM analyses').get() as { n: number }).n;
    db.prepare('DELETE FROM datasets').run();
    for (const r of rows) removeFile(r.sha256);
    cache.clear();
    return { deletedDatasets: rows.length, deletedAnalyses: analyses };
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

  const fileInfo = (row: DatasetRow, csv: ParsedCsv) => ({ fileName: row.name, delimiter: csv.delimiter, decimalComma: csv.decimalComma, prefixCoded: csv.columns.filter((c) => c.prefixCoded).map((c) => c.name), rankCoded: Object.fromEntries(csv.columns.filter((c) => c.rankLabels).map((c) => [c.name, c.rankLabels!])) });

  /** Temizleme işleminin Python karşılığı (uygulamanın yaptığı işlemle aynı kurallar). */
  app.get('/api/datasets/:id/cleaning-code', async (req) => {
    const { id } = req.params as { id: string };
    const q = QualityQuery.pick({ clean: true, cleanJson: true, rulesJson: true }).extend({ impute: z.enum(['none', 'median', 'knn']).default('none') }).parse(req.query);
    const { row, csv } = parsed(id);
    const rules = parseRules(q);
    for (const r of rules) if (!csv.columns.some((c) => c.name === r.column)) throw new ApiError(422, 'unknown_column', `“${r.column}” adlı sütun bulunamadı.`);
    const eff = effectiveColumns(row, csv);
    validateRules(eff, rules);
    if (q.impute === 'knn') {
      const kept = row.rows - planRules(eff, rules).removedRows;
      if (kept > KNN_MAX_ROWS) throw new ApiError(422, 'knn_too_large', `KNN imputasyonu en fazla ${KNN_MAX_ROWS.toLocaleString('tr-TR')} satırda desteklenir (kalacak: ${kept.toLocaleString('tr-TR')}); medyan/mod ile doldurmayı seçin.`);
    }
    const isContinuous = (c: (typeof eff)[number]) => c.numeric && c.kind === 'continuous';
    const validity: Record<string, { numeric: boolean; range?: { min: number; max: number }; categories?: string[] }> = {};
    for (const r of rules) {
      const c = eff.find((x) => x.name === r.column)!;
      if (c.validRange || c.validCategories?.length) validity[c.name] = { numeric: c.numeric, range: c.validRange, categories: c.validCategories };
    }
    return generateCleaningCode(fileInfo(row, csv), {
      numericColumns: eff.filter((c) => c.numeric).map((c) => c.name),
      continuousColumns: eff.filter((c) => !c.skip && isContinuous(c)).map((c) => c.name),
      modeColumns: eff.filter((c) => !c.skip && !isContinuous(c)).map((c) => c.name),
      rules,
      validity,
      impute: q.impute as ImputeMethod,
    });
  });

  /* ---------- Veri kalitesi ---------- */
  app.get('/api/datasets/:id/quality', async (req) => {
    const { id } = req.params as { id: string };
    const q = QualityQuery.parse(req.query);
    const { row, csv } = parsed(id);
    const known = new Set(csv.columns.map((c) => c.name));
    const rules = parseRules(q);
    for (const n of [q.value, q.group, ...rules.map((r) => r.column)]) if (n && !known.has(n)) throw new ApiError(422, 'unknown_column', `“${n}” adlı sütun bulunamadı.`);
    const cols = effectiveColumns(row, csv);
    // Eksiklik tanılaması kurallara bağlı değildir ve büyük veride pahalıdır: veri seti + profil başına bir kez hesaplanır.
    const key = `${row.id}\u0000${row.profile_json ?? ''}\u0000${row.operations_json ?? ''}`;
    let missingness = missingnessCache.get(key);
    if (!missingness) {
      missingness = missingnessOf(cols);
      missingnessCache.set(key, missingness);
      if (missingnessCache.size > 12) missingnessCache.delete(missingnessCache.keys().next().value!);
    }
    return analyzeQuality(cols, { valueColumn: q.value, groupColumn: q.group, rules, missingness });
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
      normality: b.normality,
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
      // Kaynak silinirse parent_id null olur (ON DELETE SET NULL); işlem kaydı ise kalır, bu yüzden ikisine de bakılır.
      if (ds.parent_id || ds.operations_json) {
        const parent = ds.parent_id ? (db.prepare('SELECT name FROM datasets WHERE id = ?').get(ds.parent_id) as { name: string } | undefined) : undefined;
        audit.splice(1, 0, ['Veri sürümü', `Temizlenmiş sürüm (kaynak: ${parent?.name ?? 'silinmiş veri seti'})`]);
        type Ops = { log?: string[]; removedRows?: number; removedRate?: number; loss?: { level: string; worstRate: number; worstScope: string }; acknowledgement?: { reason: string } | null; history?: { dataset: string; operations: Ops }[] };
        const ops = ds.operations_json ? (JSON.parse(ds.operations_json) as Ops) : {};
        const lines: [string, string][] = [];
        for (const h of ops.history ?? []) lines.push(['Önceki işlem', `${h.dataset}: ${(h.operations.log ?? []).join(' ')}`]);
        for (const line of ops.log ?? []) lines.push(['Temizlik işlemi', line]);
        if (ops.removedRows) {
          const level = ops.loss?.level === 'confirm' ? 'onay gerekti' : ops.loss?.level === 'review' ? 'inceleme eşiği aşıldı' : 'eşik aşılmadı';
          lines.push(['Satır kaybı', `${ops.removedRows} satır (%${(ops.removedRate ?? 0).toFixed(1)}); ${level}. Eşikler ürünün koruyucu tasarım eşikleridir, bilimsel eşik değildir.`]);
        }
        if (ops.acknowledgement) lines.push(['Kullanıcı gerekçesi', ops.acknowledgement.reason]);
        audit.splice(2, 0, ...lines);
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

  /* ---------- Doğrusal regresyon ---------- */
  const RegressionBody = z.object({
    dependent: colName,
    numeric: z.array(colName).max(60).default([]),
    categorical: z.array(colName).max(30).default([]),
    alpha: z.number().min(0.001).max(0.2).default(0.05),
    reference: z.record(colName, z.string().max(200)).optional(),
  });

  /** Gövdeyi veri setine göre doğrular, modeli uydurur ve sonucu döndürür. */
  function runRegression(id: string, rawBody: unknown) {
    const body = RegressionBody.parse(rawBody ?? {});
    const { row, csv } = parsed(id);
    const col = (name: string) => {
      const c = csv.columns.find((x) => x.name === name);
      if (!c) throw new ApiError(422, 'unknown_column', `“${name}” adlı sütun bulunamadı.`);
      return c;
    };
    const dep = col(body.dependent);
    if (!dep.numeric) throw new ApiError(422, 'bad_dependent', `Bağımlı değişken “${dep.name}” sayısal değil; doğrusal regresyon sayısal bir sonuç ister.`);
    const all = [...body.numeric, ...body.categorical];
    if (all.length === 0) throw new ApiError(422, 'no_predictors', 'En az bir yordayıcı seçin.');
    if (new Set(all).size !== all.length) throw new ApiError(422, 'duplicate_predictor', 'Bir değişken hem sayısal hem kategorik yordayıcı olarak ya da birden fazla kez seçilmiş.');
    if (all.includes(dep.name)) throw new ApiError(422, 'dependent_in_predictors', 'Bağımlı değişken aynı zamanda yordayıcı olamaz.');
    for (const n of body.numeric) if (!col(n).numeric) throw new ApiError(422, 'bad_predictor', `“${n}” sayısal değil; kategorik yordayıcı olarak ekleyin.`);
    for (const n of all) if (col(n).likelyId) throw new ApiError(422, 'id_predictor', `“${n}” kimlik sütunu gibi görünüyor; yordayıcı olamaz.`);
    const spec: RegressionSpec = {
      dependent: dep.name,
      numeric: body.numeric,
      categorical: body.categorical,
      alpha: body.alpha,
      reference: body.reference,
      numericCategorical: body.categorical.filter((n) => col(n).numeric),
    };
    const result = fitLinearRegression(
      dep.values as (number | null)[],
      [
        ...body.numeric.map((n) => ({ name: n, kind: 'numeric' as const, values: col(n).values })),
        ...body.categorical.map((n) => ({ name: n, kind: 'categorical' as const, values: col(n).values })),
      ],
      { alpha: body.alpha, reference: body.reference },
    );
    return { row, csv, spec, result };
  }

  app.post('/api/datasets/:id/regression', async (req) => {
    const { id } = req.params as { id: string };
    const { row, csv, spec, result } = runRegression(id, req.body);
    const narrative = narrateRegression(result, spec.dependent);
    const code = generateRegressionCode(fileInfo(row, csv), spec, result);
    // Kalıntı grafiği için en çok ~2000 nokta (eşit aralıklı)
    const step = Math.max(1, Math.ceil(result.n / 2000));
    const plot = { fitted: [] as number[], residuals: [] as number[], step };
    for (let i = 0; i < result.n; i += step) {
      plot.fitted.push(result.fitted[i]!);
      plot.residuals.push(result.residuals[i]!);
    }
    const { fitted, residuals, cooks, leverage, usedRows, ...summary } = result;
    void fitted; void residuals; void cooks; void leverage; void usedRows;
    return { datasetId: row.id, datasetName: row.name, spec, result: summary, narrative, model: modelRows(result), coefficients: coefficientRows(result), plot, code, engine: engineInfo() };
  });

  /** Regresyon raporu: html | pdf | docx (aynı gövdeyle model yeniden hesaplanır). */
  app.post('/api/datasets/:id/regression/report', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { format } = z.object({ format: z.enum(['html', 'pdf', 'docx']).default('html') }).parse(req.query);
    const { row, spec, result } = runRegression(id, req.body);
    const eng = engineInfo();
    const audit: [string, string][] = [
      ['Veri seti', `${row.name} (SHA-256 ${row.sha256.slice(0, 16)}…, ${row.rows} satır)`],
      ['Bağımlı değişken', spec.dependent],
      ['Yordayıcılar', [...spec.numeric, ...spec.categorical].join(', ')],
      ['Referans düzeyler', result.categories.map((c) => `${c.name}: ${c.reference}`).join('; ') || '–'],
      ['Güven düzeyi', `%${Math.round((1 - (spec.alpha ?? 0.05)) * 100)}`],
      ['Motor sürümü', `${eng.engineName} ${eng.engine}`],
      ['Referans doğrulama', `statsmodels OLS ile karşılaştırıldı (referans paketi: ${eng.referenceSuite.cases} vaka)`],
      ['Çalışma ortamı', `Node ${eng.node}`],
    ];
    const data = regressionReportData(result, spec, row.name, new Date().toLocaleDateString('tr-TR'), audit);
    const html = buildRegressionReport(data);
    if (format === 'html') {
      reply.header('Content-Type', 'text/html; charset=utf-8');
      reply.header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:");
      return html;
    }
    if (format === 'docx') {
      reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      reply.header('Content-Disposition', 'attachment; filename="regresyon-raporu.docx"');
      return buildRegressionDocx(data);
    }
    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', 'attachment; filename="regresyon-raporu.pdf"');
    return renderPdf(html);
  });

  /* ---------- İkili lojistik regresyon ---------- */
  const LogisticBody = RegressionBody.extend({ eventLevel: z.string().max(200).optional() });

  function runLogistic(id: string, rawBody: unknown) {
    const body = LogisticBody.parse(rawBody ?? {});
    const { row, csv } = parsed(id);
    const col = (name: string) => {
      const c = csv.columns.find((x) => x.name === name);
      if (!c) throw new ApiError(422, 'unknown_column', `“${name}” adlı sütun bulunamadı.`);
      return c;
    };
    const dep = col(body.dependent);
    const all = [...body.numeric, ...body.categorical];
    if (all.length === 0) throw new ApiError(422, 'no_predictors', 'En az bir yordayıcı seçin.');
    if (new Set(all).size !== all.length) throw new ApiError(422, 'duplicate_predictor', 'Bir değişken hem sayısal hem kategorik yordayıcı olarak ya da birden fazla kez seçilmiş.');
    if (all.includes(dep.name)) throw new ApiError(422, 'dependent_in_predictors', 'Bağımlı değişken aynı zamanda yordayıcı olamaz.');
    for (const n of body.numeric) if (!col(n).numeric) throw new ApiError(422, 'bad_predictor', `“${n}” sayısal değil; kategorik yordayıcı olarak ekleyin.`);
    for (const n of all) if (col(n).likelyId) throw new ApiError(422, 'id_predictor', `“${n}” kimlik sütunu gibi görünüyor; yordayıcı olamaz.`);
    const result = fitLogisticRegression(
      dep.values,
      [
        ...body.numeric.map((n) => ({ name: n, kind: 'numeric' as const, values: col(n).values })),
        ...body.categorical.map((n) => ({ name: n, kind: 'categorical' as const, values: col(n).values })),
      ],
      { alpha: body.alpha, reference: body.reference, eventLevel: body.eventLevel },
    );
    const spec: LogisticSpec = {
      dependent: dep.name,
      numeric: body.numeric,
      categorical: body.categorical,
      alpha: body.alpha,
      reference: body.reference,
      numericCategorical: [...body.categorical, ...(dep.numeric ? [dep.name] : [])].filter((n) => col(n).numeric),
      eventLevel: result.eventLevel,
    };
    return { row, csv, spec, result };
  }

  app.post('/api/datasets/:id/logistic', async (req) => {
    const { id } = req.params as { id: string };
    const { row, csv, spec, result } = runLogistic(id, req.body);
    const narrative = narrateLogistic(result, spec.dependent);
    // Tam ayrışmada statsmodels da hata verir; katsayılar anlamsız olduğu için kod üretilmez.
    const code = result.separation === 'complete' ? null : generateLogisticCode(fileInfo(row, csv), spec, result);
    const { probs, usedRows, ...summary } = result;
    void probs; void usedRows;
    return {
      datasetId: row.id,
      datasetName: row.name,
      spec,
      result: summary,
      narrative,
      model: logitModelRows(result),
      coefficients: logitCoefficientRows(result),
      classification: classificationRows(result),
      hosmerLemeshow: hosmerLemeshowRows(result),
      code,
      engine: engineInfo(),
    };
  });

  app.post('/api/datasets/:id/logistic/report', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { format } = z.object({ format: z.enum(['html', 'pdf', 'docx']).default('html') }).parse(req.query);
    const { row, spec, result } = runLogistic(id, req.body);
    const eng = engineInfo();
    const audit: [string, string][] = [
      ['Veri seti', `${row.name} (SHA-256 ${row.sha256.slice(0, 16)}…, ${row.rows} satır)`],
      ['Bağımlı değişken', `${spec.dependent} (olay: ${result.eventLevel}; referans: ${result.referenceLevel})`],
      ['Yordayıcılar', [...spec.numeric, ...spec.categorical].join(', ')],
      ['Referans düzeyler', result.categories.map((c) => `${c.name}: ${c.reference}`).join('; ') || '–'],
      ['Güven düzeyi', `%${Math.round((1 - (spec.alpha ?? 0.05)) * 100)}`],
      ['Sınıflandırma eşiği', String(result.classification.threshold)],
      ['Motor sürümü', `${eng.engineName} ${eng.engine}`],
      ['Referans doğrulama', `statsmodels Logit ile karşılaştırıldı (referans paketi: ${eng.referenceSuite.cases} vaka)`],
      ['Çalışma ortamı', `Node ${eng.node}`],
    ];
    const data = logisticReportData(result, spec, row.name, new Date().toLocaleDateString('tr-TR'), audit);
    const html = buildRegressionReport(data);
    if (format === 'html') {
      reply.header('Content-Type', 'text/html; charset=utf-8');
      reply.header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:");
      return html;
    }
    if (format === 'docx') {
      reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      reply.header('Content-Disposition', 'attachment; filename="lojistik-regresyon-raporu.docx"');
      return buildRegressionDocx(data);
    }
    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', 'attachment; filename="lojistik-regresyon-raporu.pdf"');
    return renderPdf(html);
  });

  /* ---------- Gerçek veride model karşılaştırma (arka plan işi) ---------- */
  const ModelRunBody = z.object({
    target: colName,
    numeric: z.array(colName).max(200).default([]),
    categorical: z.array(colName).max(100).default([]),
    models: z.array(z.enum(ALL_MODELS as [string, ...string[]])).min(1).max(ALL_MODELS.length).default(['baseline', 'logistic', 'tree', 'knn', 'rf', 'gb']),
    folds: z.number().int().min(2).max(10).default(5),
    seed: z.number().int().min(0).max(2_147_483_647).default(42),
  });

  interface ModelJob {
    id: string;
    datasetId: string;
    status: 'running' | 'done' | 'error';
    progress: { done: number; total: number; model: string; fold: number };
    startedAt: number;
    finishedAt?: number;
    spec: ModelCompareSpec;
    result?: CvResult;
    error?: string;
  }
  const modelJobs = new Map<string, ModelJob>();
  const MAX_FEATURE_LEVELS = 30;

  function startModelRun(id: string, rawBody: unknown): ModelJob {
    const body = ModelRunBody.parse(rawBody ?? {});
    const { row, csv } = parsed(id);
    const col = (name: string) => {
      const c = csv.columns.find((x) => x.name === name);
      if (!c) throw new ApiError(422, 'unknown_column', `“${name}” adlı sütun bulunamadı.`);
      return c;
    };
    const target = col(body.target);
    const all = [...body.numeric, ...body.categorical];
    if (all.length === 0) throw new ApiError(422, 'no_features', 'En az bir özellik seçin.');
    if (new Set(all).size !== all.length) throw new ApiError(422, 'duplicate_feature', 'Bir değişken birden fazla kez seçilmiş.');
    if (all.includes(target.name)) throw new ApiError(422, 'target_in_features', 'Hedef değişken aynı zamanda özellik olamaz.');
    for (const n of body.numeric) if (!col(n).numeric) throw new ApiError(422, 'bad_feature', `“${n}” sayısal değil; kategorik özellik olarak ekleyin.`);
    for (const n of all) if (col(n).likelyId) throw new ApiError(422, 'id_feature', `“${n}” kimlik sütunu gibi görünüyor; özellik olamaz (modelin ezberlemesine yol açar).`);
    for (const n of body.categorical) {
      if (col(n).unique > MAX_FEATURE_LEVELS) throw new ApiError(422, 'too_many_levels', `“${n}” kategorik özellik olarak ${col(n).unique} düzey içeriyor (en fazla ${MAX_FEATURE_LEVELS}).`);
    }
    if (target.likelyId) throw new ApiError(422, 'id_target', `“${target.name}” kimlik sütunu gibi görünüyor; hedef olamaz.`);
    if (target.numeric && target.unique > 20) throw new ApiError(422, 'continuous_target', `Hedef “${target.name}” ${target.unique} farklı sayısal değer içeriyor; bu sürekli bir ölçüm. Sınıflandırma için en fazla 20 sınıf desteklenir; sürekli hedef için Doğrusal Regresyon sayfasını kullanın.`);
    if ([...modelJobs.values()].some((j) => j.status === 'running')) throw new ApiError(409, 'busy', 'Zaten çalışan bir model karşılaştırması var; bitmesini bekleyin.');

    const data = prepareData(target.values, [
      ...body.numeric.map((n) => ({ name: n, kind: 'numeric' as const, values: col(n).values })),
      ...body.categorical.map((n) => ({ name: n, kind: 'categorical' as const, values: col(n).values })),
    ]);
    stratifiedKFold(data.y, body.folds, body.seed); // yetersiz sınıf büyüklüğünü iş başlamadan açık hatayla bildirir
    const spec: ModelCompareSpec = {
      target: target.name,
      numeric: body.numeric,
      categorical: body.categorical,
      numericCategorical: body.categorical.filter((n) => col(n).numeric),
      targetNumeric: target.numeric,
      folds: body.folds,
      seed: body.seed,
      models: body.models as ModelCompareSpec['models'],
    };
    const job: ModelJob = { id: randomUUID(), datasetId: row.id, status: 'running', progress: { done: 0, total: 0, model: '', fold: 0 }, startedAt: Date.now(), spec };
    modelJobs.set(job.id, job);
    // en çok 20 iş bellekte tutulur
    while (modelJobs.size > 20) modelJobs.delete(modelJobs.keys().next().value!);
    void runCrossValidation(data, { folds: body.folds, seed: body.seed, models: spec.models }, {
      progress: (pr) => {
        job.progress = pr;
      },
      yield: () => new Promise<void>((resolve) => setImmediate(resolve)),
    })
      .then((result) => {
        job.result = result;
        job.status = 'done';
      })
      .catch((e: unknown) => {
        job.status = 'error';
        job.error = e instanceof Error ? e.message : 'Model karşılaştırması başarısız oldu.';
      })
      .finally(() => {
        job.finishedAt = Date.now();
      });
    return job;
  }

  const jobJson = (j: ModelJob) => {
    // katman numaraları büyük olabilir; arayüze gönderilmez (kod betiği bunları yeniden üretir)
    const result = j.result ? { ...j.result, foldOf: undefined } : undefined;
    return { id: j.id, datasetId: j.datasetId, status: j.status, progress: j.progress, elapsedSeconds: ((j.finishedAt ?? Date.now()) - j.startedAt) / 1000, spec: j.spec, result, interpretation: j.result ? interpretComparison(j.result) : undefined, error: j.error };
  };

  app.post('/api/datasets/:id/model-runs', async (req, reply) => {
    const { id } = req.params as { id: string };
    return reply.status(202).send(jobJson(startModelRun(id, req.body)));
  });

  const getModelJob = (id: string) => {
    const j = modelJobs.get(id);
    if (!j) throw new ApiError(404, 'not_found', 'Bu model karşılaştırması bulunamadı (sunucu yeniden başlatılmış ya da çok eski olabilir).');
    return j;
  };

  app.get('/api/model-runs/:id', async (req) => jobJson(getModelJob((req.params as { id: string }).id)));

  app.get('/api/model-runs/:id/code', async (req) => {
    const j = getModelJob((req.params as { id: string }).id);
    if (!j.result) throw new ApiError(409, 'not_ready', 'Model karşılaştırması henüz bitmedi.');
    const { row, csv } = parsed(j.datasetId);
    return generateModelCompareCode(fileInfo(row, csv), j.spec, j.result);
  });

  /** Model karşılaştırma raporu: html | pdf | docx (iş bittikten sonra). */
  app.get('/api/model-runs/:id/report', async (req, reply) => {
    const { format } = z.object({ format: z.enum(['html', 'pdf', 'docx']).default('html') }).parse(req.query);
    const j = getModelJob((req.params as { id: string }).id);
    if (!j.result) throw new ApiError(409, 'not_ready', 'Model karşılaştırması henüz bitmedi.');
    const { row } = parsed(j.datasetId);
    const eng = engineInfo();
    const foldSizes = j.result.models.find((m) => !m.skipped)?.folds.map((f) => `${f.nTrain}/${f.nTest}`).join(', ') ?? '–';
    const audit: [string, string][] = [
      ['Veri seti', `${row.name} (SHA-256 ${row.sha256.slice(0, 16)}…, ${row.rows} satır)`],
      ['Çapraz doğrulama', `tabakalı ${j.spec.folds} katlı, tohum ${j.spec.seed}; katman başına eğitim/test: ${foldSizes}`],
      ['Modeller', j.result.models.map((m) => m.label + (m.skipped ? ' (atlandı)' : '')).join(', ')],
      ['Ön işleme', 'Katman içinde uydurulan: medyan/mod doldurma, standartlaştırma (sayısal), tek-sıcak kodlama (kategorik)'],
      ['Motor sürümü', `${eng.engineName} ${eng.engine}`],
      ['Referans doğrulama', `scikit-learn ile aynı katmanlarda karşılaştırıldı (referans paketi: ${eng.referenceSuite.cases} vaka)`],
      ['Çalışma ortamı', `Node ${eng.node}`],
    ];
    const doc = buildModelCompareDoc(j.result, j.spec, { datasetName: row.name, date: new Date(j.finishedAt ?? Date.now()).toLocaleDateString('tr-TR'), audit });
    const html = renderReportHtml(doc);
    if (format === 'html') {
      reply.header('Content-Type', 'text/html; charset=utf-8');
      reply.header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:");
      return html;
    }
    if (format === 'docx') {
      reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      reply.header('Content-Disposition', 'attachment; filename="model-karsilastirma-raporu.docx"');
      return buildDocxFromDoc(doc);
    }
    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', 'attachment; filename="model-karsilastirma-raporu.pdf"');
    return renderPdf(html);
  });

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
