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
import { isOle, isZip, xlsxToCsv } from './xlsx.ts';
import { openDb } from './db.ts';
import { buildProfile, describeColumns, effectiveColumns, ProfileBody } from './profile.ts';
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
    return analyzeQuality(effectiveColumns(row, csv), { valueColumn: q.value, groupColumn: q.group, rules });
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
