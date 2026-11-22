/**
 * Çeviri kapsamı: gerçek analiz çıktılarındaki kullanıcıya dönük her metin İngilizceye çevrildiğinde
 * Türkçe harf kalmamalıdır. Yeni bir cümle eklendiğinde sözlüğe karşılığı da eklenmelidir.
 */
import { analyze, type AnalysisRequest, type AnalysisResult } from '../analysis.ts';
import { gaussian, mulberry32 } from '../ml.ts';
import { translate } from './index.ts';

const rng = mulberry32(7);
const normal = (n: number, mu: number, s = 1) => Array.from({ length: n }, () => Math.round((mu + s * gaussian(rng)) * 100) / 100);
const skewed = (n: number, mu: number) => normal(n, mu, 0.8).map((v) => Math.round(Math.exp(v) * 100) / 100);
const long = (groups: Record<string, number[]>) => ({
  value: { name: 'puan', values: Object.values(groups).flat() as (number | null)[] },
  group: { name: 'grup', values: Object.entries(groups).flatMap(([k, v]) => v.map(() => k)) as (string | null)[] },
});
const base = { goal: 'compare', design: 'independent', target: 'continuous' } as const;

const requests: Record<string, AnalysisRequest> = {
  'Welch t': { ...base, ...long({ a: normal(40, 0), b: normal(40, 1.5) }) },
  'Welch ANOVA + Games-Howell': { ...base, ...long({ a: normal(40, 0), b: normal(40, 2, 2), c: normal(40, 4, 0.5) }) },
  'Kruskal + Dunn': { ...base, ...long({ a: skewed(40, 0), b: skewed(40, 1), c: skewed(40, 2) }) },
  'çarpıklık-basıklık ölçütü': { ...base, normality: 'skewkurt-1.5', ...long({ a: normal(30, 0), b: normal(30, 1) }) },
  'Pearson': { goal: 'relate', design: 'independent', target: 'continuous', x: { name: 'x', values: normal(40, 0) }, y: { name: 'y', values: normal(40, 1) } },
  'eşleşmiş t': {
    goal: 'compare',
    design: 'paired',
    target: 'continuous',
    conditions: [
      { name: 't0', values: normal(30, 5) },
      { name: 't1', values: normal(30, 6) },
    ],
  },
};

/** Sonuç nesnesindeki tüm metin değerlerini (iç içe) toplar. */
function strings(x: unknown, out: Set<string> = new Set()): Set<string> {
  if (typeof x === 'string') {
    if (/[A-Za-zÇĞİÖŞÜçğıöşü]{3,}/.test(x) && x.includes(' ')) out.add(x);
  } else if (Array.isArray(x)) x.forEach((v) => strings(v, out));
  else if (x && typeof x === 'object') Object.values(x).forEach((v) => strings(v, out));
  return out;
}

const turkishLetters = /[çğıöşüÇĞİÖŞÜ]/;

describe('çeviri kapsamı: analiz çıktıları', () => {
  for (const [name, req] of Object.entries(requests)) {
    it(`${name}: karar, varsayım ve notlar tamamen çevrilir`, () => {
      const r: AnalysisResult = analyze(req);
      const parts = { decision: r.decision, assumptions: r.assumptions, notes: r.notes, interpretation: r.interpretation, apa: r.apaSummary, outcome: r.outcome, references: r.references };
      const untranslated = [...strings(parts)].filter((s) => turkishLetters.test(translate('en', s)));
      expect(untranslated).toEqual([]);
    });
  }
});
