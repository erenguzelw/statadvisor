import type { WizardAnswers } from '@statadvisor/shared';
import type { AnalysisBody, ColumnInfo, ColumnType } from '@/data/api';

export const columnTypeLabel: Record<ColumnType, string> = { continuous: 'Sürekli', ordinal: 'Sıralı', categorical: 'Kategorik' };

/** Kullanıcının seçtiği değişkenler. Kullanılmayan alanlar yok sayılır. */
export interface Picks {
  value?: string;
  group?: string;
  conditions: string[];
  x?: string;
  y?: string;
  rowVar?: string;
  colVar?: string;
}

export type Answers = Pick<WizardAnswers, 'goal' | 'design' | 'target'>;

const usable = (c: ColumnInfo) => !c.likelyId;
/** Kullanıcı bir sayısal sütunu “kategorik” olarak düzelttiyse (kategori kodu) sayısal ölçüm adayı sayılmaz. */
export const numericColumns = (cols: ColumnInfo[]) => cols.filter((c) => c.numeric && c.type !== 'categorical' && usable(c));
/** Grup sütunu adayı: 2–12 farklı değer. */
export const groupColumns = (cols: ColumnInfo[]) => cols.filter((c) => usable(c) && c.unique >= 2 && c.unique <= 12);

export function typeOf(cols: ColumnInfo[], name: string | undefined): ColumnType | undefined {
  return cols.find((c) => c.name === name)?.type;
}

/** Veri setinden makul varsayılanlar: ilk sürekli sütun sonuç, ilk kategorik sütun grup. */
export function defaultPicks(cols: ColumnInfo[]): { picks: Picks; target: ColumnType } {
  const nums = numericColumns(cols);
  const value = nums.find((c) => c.type === 'continuous') ?? nums[0];
  const groups = groupColumns(cols).filter((c) => c.name !== value?.name);
  const group = groups.find((c) => !c.numeric) ?? groups[0];
  const rowCols = groupColumns(cols);
  return {
    picks: {
      value: value?.name,
      group: group?.name,
      conditions: nums.slice(0, 2).map((c) => c.name),
      x: nums[0]?.name,
      y: nums[1]?.name,
      rowVar: rowCols[0]?.name,
      colVar: rowCols[1]?.name,
    },
    target: value?.type ?? 'continuous',
  };
}

/** İstek tamamsa gövdeyi, değilse null döndürür. Var olmayan sütunlar eksik sayılır. */
export function buildBody(datasetId: string, cols: ColumnInfo[], a: Answers, p: Picks): AnalysisBody | null {
  if (a.goal === 'predict') return null;
  const has = (n?: string): n is string => Boolean(n) && cols.some((c) => c.name === n);
  const base = { datasetId, goal: a.goal, design: a.design, target: a.target };
  if (a.goal === 'relate') {
    if (a.target === 'categorical') return has(p.rowVar) && has(p.colVar) && p.rowVar !== p.colVar ? { ...base, rowVar: p.rowVar, colVar: p.colVar } : null;
    return has(p.x) && has(p.y) && p.x !== p.y ? { ...base, x: p.x, y: p.y } : null;
  }
  if (a.design === 'paired' && a.target !== 'categorical') {
    const conds = p.conditions.filter(has);
    return conds.length >= 2 ? { ...base, conditions: conds } : null;
  }
  if (a.target === 'categorical') return has(p.group) && has(p.value) && p.group !== p.value ? { ...base, group: p.group, value: p.value } : null;
  return has(p.value) && has(p.group) && p.value !== p.group ? { ...base, value: p.value, group: p.group } : null;
}

/** İstek tamamlanmadığında kullanıcıya gösterilecek eksik adımın açıklaması. */
export function missingHint(a: Answers): string {
  if (a.goal === 'predict') return 'Tahmin ve modelleme için Doğrusal Regresyon, Lojistik Regresyon ya da Model Karşılaştırma sayfalarını kullanın.';
  if (a.goal === 'relate') return a.target === 'categorical' ? 'İki farklı kategorik sütun seçin.' : 'İki farklı sayısal sütun seçin.';
  if (a.design === 'paired' && a.target !== 'categorical') return 'Karşılaştırılacak en az iki sütun (koşul) seçin.';
  if (a.target === 'categorical') return 'Bir grup sütunu ve bir sonuç sütunu seçin (farklı sütunlar).';
  return 'Bir sonuç sütunu ve bir grup sütunu seçin (farklı sütunlar).';
}
