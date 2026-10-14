/**
 * Sütun profili: kullanıcının düzelttiği sütun türü ve doğruladığı geçerli değerler. Profil veri setine özgüdür;
 * yalnızca türetilmiş sürüm oluşturulurken kaynaktan kopyalanır. Gözlenen en küçük/en büyük değerlerden otomatik
 * geçerlilik kuralı üretilmez: kural yalnızca kullanıcı kaydettiğinde “doğrulanmış” olur.
 */
import { z } from 'zod';
import { AnalysisError, type ColumnKind, type QualityColumn } from '@statadvisor/shared';
import type { ColumnType, ParsedColumn, ParsedCsv } from './csv.ts';

export interface ColumnProfile {
  type?: ColumnType;
  /** Kullanıcı sütun türünü kaydederek onayladı (dosyadan çıkarılan tür kesin sayılmaz). */
  typeConfirmed?: boolean;
  validRange?: { min: number; max: number };
  validCategories?: string[];
}
export type DatasetProfile = Record<string, ColumnProfile>;

const name = z.string().min(1).max(200);

export const ProfileBody = z.object({
  columns: z.record(
    name,
    z.object({
      type: z.enum(['continuous', 'ordinal', 'categorical']).nullish(),
      typeConfirmed: z.boolean().nullish(),
      validRange: z
        .object({ min: z.number().finite(), max: z.number().finite() })
        .refine((r) => r.min <= r.max, { message: 'En küçük değer en büyük değerden büyük olamaz.' })
        .nullish(),
      validCategories: z.array(z.string().trim().min(1).max(200)).min(1).max(500).nullish(),
    }),
  ),
});

export function parseProfile(json: string | null | undefined): DatasetProfile {
  if (!json) return {};
  try {
    const v = JSON.parse(json) as unknown;
    return v && typeof v === 'object' ? (v as DatasetProfile) : {};
  } catch {
    return {};
  }
}

/** Gövdeyi veri setine göre doğrular ve saklanacak sade profili döndürür (boş girişler atılır). */
export function buildProfile(body: z.infer<typeof ProfileBody>, csv: ParsedCsv): DatasetProfile {
  const out: DatasetProfile = {};
  for (const [colName, p] of Object.entries(body.columns)) {
    const c = csv.columns.find((x) => x.name === colName);
    if (!c) throw new AnalysisError(`“${colName}” adlı sütun bulunamadı.`);
    const type = p.type ?? undefined;
    if ((type === 'continuous' || type === 'ordinal') && !c.numeric) {
      throw new AnalysisError(`“${colName}” sayısal değil; türü “${type === 'continuous' ? 'sürekli' : 'sıralı'}” yapılamaz (yalnızca kategorik olabilir).`);
    }
    const effective: ColumnType = type ?? c.type;
    const entry: ColumnProfile = {};
    if (type && type !== c.type) entry.type = type;
    if (p.typeConfirmed) entry.typeConfirmed = true;
    if (p.validRange) {
      if (!c.numeric || effective === 'categorical') throw new AnalysisError(`“${colName}” için sayısal aralık tanımlanamaz; kategorik sütunlarda geçerli kategorileri listeleyin.`);
      entry.validRange = { min: p.validRange.min, max: p.validRange.max };
    }
    if (p.validCategories) {
      if (effective !== 'categorical') throw new AnalysisError(`“${colName}” kategorik değil; geçerli kategori listesi yalnızca kategorik sütunlarda tanımlanır.`);
      const cats = [...new Set(p.validCategories)];
      if (c.numeric && cats.some((k) => !Number.isFinite(Number(k)))) throw new AnalysisError(`“${colName}” sayısal kodlu; geçerli kategoriler sayı olmalıdır.`);
      entry.validCategories = cats;
    }
    if (Object.keys(entry).length > 0) out[colName] = entry;
  }
  return out;
}

export interface ScaleLike {
  name: string;
  items: string[];
  method: 'mean' | 'sum';
  min: number;
  max: number;
}

/** Bu sürümde ve önceki işlemlerde tanımlanan ölçek puanı sütunları (ad → tanım). */
export function collectScales(operationsJson: string | null): Map<string, ScaleLike> {
  const out = new Map<string, ScaleLike>();
  if (!operationsJson) return out;
  const visit = (ops: unknown) => {
    const o = ops as { scales?: ScaleLike[]; history?: { operations?: unknown }[] } | null;
    for (const s of Array.isArray(o?.scales) ? o!.scales! : []) out.set(s.name, s);
    for (const h of o?.history ?? []) visit(h.operations);
  };
  try {
    visit(JSON.parse(operationsJson));
  } catch {
    /* bozuk kayıt: ölçek bilgisi yok say */
  }
  return out;
}

/** Ölçek tanımından beklenen puan aralığı (kullanıcının girdiği madde min/max değerlerinden). */
const scaleRange = (s: ScaleLike) => {
  const k = s.method === 'sum' ? s.items.length : 1;
  return { min: s.min * k, max: s.max * k };
};

/** Taramaya girecek etkin sütunlar: tür düzeltmesi, doğrulanmış geçerlilik ve ölçek puanı bilgisi dahil. */
export function effectiveColumns(row: { profile_json: string | null; operations_json: string | null }, csv: ParsedCsv): QualityColumn[] {
  const profile = parseProfile(row.profile_json);
  const scales = collectScales(row.operations_json);
  return csv.columns.map((c) => {
    const p = profile[c.name] ?? {};
    const scale = scales.get(c.name);
    const kind: ColumnKind = p.type ?? (scale ? 'continuous' : c.type);
    return {
      name: c.name,
      numeric: c.numeric,
      values: c.values,
      skip: c.likelyId,
      kind,
      score: Boolean(scale),
      validRange: kind === 'categorical' ? undefined : (p.validRange ?? (scale ? scaleRange(scale) : undefined)),
      validCategories: kind === 'categorical' ? p.validCategories : undefined,
    };
  });
}

/** Arayüze giden sütun özeti: etkin tür, çıkarılan tür ve kullanıcının doğruladığı kurallar. */
export function describeColumns(columnsJson: string, row: { profile_json: string | null; operations_json: string | null }) {
  const profile = parseProfile(row.profile_json);
  const scales = collectScales(row.operations_json);
  const cols = JSON.parse(columnsJson) as (Omit<ParsedColumn, 'values'> & { typeUncertain?: boolean })[];
  return cols.map((c) => {
    const p = profile[c.name] ?? {};
    const scale = scales.get(c.name);
    return {
      ...c,
      inferredType: c.type,
      type: p.type ?? (scale ? ('continuous' as const) : c.type),
      typeOverridden: p.type !== undefined,
      typeConfirmed: p.typeConfirmed === true,
      score: Boolean(scale),
      profile: { validRange: p.validRange ?? null, validCategories: p.validCategories ?? null },
      scaleRange: scale && !p.validRange ? scaleRange(scale) : null,
    };
  });
}
