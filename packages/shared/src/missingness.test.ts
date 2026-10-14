import { describe, expect, it } from 'vitest';
import { analyzeMissingness } from './missingness.ts';

const n = 120;
const age = Array.from({ length: n }, (_, i) => 20 + (i % 40));
const sex = Array.from({ length: n }, (_, i) => (i % 2 ? 'K' : 'E'));

describe('analyzeMissingness', () => {
  it('eksiklik yaşa bağlıysa MCAR ile uyumsuz olabilir der', () => {
    const y = age.map((a) => (a > 52 ? null : a * 2));
    const r = analyzeMissingness([
      { name: 'yas', numeric: true, categorical: false, values: age },
      { name: 'cinsiyet', numeric: false, categorical: true, values: sex },
      { name: 'y', numeric: true, categorical: false, values: y },
    ]);
    const c = r.columns.find((x) => x.column === 'y')!;
    expect(c.verdict).toBe('incompatible');
    expect(c.associations[0]!.other).toBe('yas');
    expect(r.incompatible).toBe(1);
  });

  it('rastgele dağılan eksiklikte çelişki görülmedi der, MCAR kanıtlamaz', () => {
    const y = age.map((a, i) => (i % 7 === 0 ? null : a));
    const r = analyzeMissingness([
      { name: 'yas', numeric: true, categorical: false, values: age.map((a, i) => a + ((i * 13) % 5)) },
      { name: 'cinsiyet', numeric: false, categorical: true, values: sex },
      { name: 'y', numeric: true, categorical: false, values: y },
    ]);
    expect(r.columns[0]!.verdict).toBe('noContradiction');
  });

  it('kategorik ilişkiyi ki-kare ile yakalar', () => {
    const y = sex.map((s, i) => (s === 'K' && i % 3 !== 0 ? null : 1));
    const r = analyzeMissingness([
      { name: 'cinsiyet', numeric: false, categorical: true, values: sex },
      { name: 'y', numeric: true, categorical: false, values: y },
    ]);
    expect(r.columns[0]!.verdict).toBe('incompatible');
    expect(r.columns[0]!.associations[0]!.test).toBe('ki-kare');
  });

  it('çok az eksik gözlemde sınanamaz', () => {
    const y = age.map((a, i) => (i < 2 ? null : a));
    const r = analyzeMissingness([
      { name: 'yas', numeric: true, categorical: false, values: age },
      { name: 'y', numeric: true, categorical: false, values: y },
    ]);
    expect(r.columns[0]!.verdict).toBe('insufficient');
  });
});
