import { analyze, buildReport, compactLetters, reportFromResult, gamesHowell, mulberry32, gaussian, normalSurvival, studentizedRangeQuantile, studentizedRangeSurvival, tTwoSidedP, tukeyHsd } from './index.ts';

const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

describe('studentize edilmiş aralık dağılımı', () => {
  it('k = 2 için kesin formülle aynıdır: P(Q > q) = P(|t| > q/√2) — çok küçük p değerlerinde de göreli duyarlı', () => {
    for (const df of [1, 3, 10.5, 50, 1000]) {
      for (const q of [0.5, 2, 5, 8, 12]) {
        const exact = tTwoSidedP(q / Math.SQRT2, df);
        expect(rel(studentizedRangeSurvival(q, 2, df), exact), `q=${q} df=${df}`).toBeLessThan(1e-9);
      }
    }
    // sonsuz serbestlik: normal dağılım
    for (const q of [1, 4, 9]) expect(rel(studentizedRangeSurvival(q, 2, Infinity), 2 * normalSurvival(q / Math.SQRT2))).toBeLessThan(1e-11);
  });

  it('kritik değer ve üst kuyruk birbirinin tersidir', () => {
    for (const [k, df] of [[3, 7], [6, 40.5], [10, 200]] as const) {
      for (const p of [0.001, 0.05, 0.5]) expect(rel(studentizedRangeSurvival(studentizedRangeQuantile(p, k, df), k, df), p)).toBeLessThan(1e-9);
    }
  });

  it('uç girdiler', () => {
    expect(studentizedRangeSurvival(0, 4, 10)).toBe(1);
    expect(studentizedRangeSurvival(-1, 4, 10)).toBe(1);
    expect(studentizedRangeSurvival(Infinity, 4, 10)).toBe(0);
    expect(studentizedRangeSurvival(500, 4, 10)).toBeLessThan(1e-20);
  });
});

describe('Tukey HSD ve Games–Howell', () => {
  const rng = mulberry32(4);
  const grp = (n: number, m: number, s: number) => Array.from({ length: n }, () => m + s * gaussian(rng));

  it('Tukey: farkın işareti ort(a) − ort(b); güven aralığı farkı içerir; p ve aralık birbiriyle tutarlıdır', () => {
    const groups = [grp(12, 10, 2), grp(15, 13, 2), grp(9, 10.5, 2)];
    const r = tukeyHsd(groups);
    expect(r.map((x) => [x.a, x.b])).toEqual([[0, 1], [0, 2], [1, 2]]);
    for (const x of r) {
      expect(x.ciLow).toBeLessThan(x.diff);
      expect(x.ciHigh).toBeGreaterThan(x.diff);
      // %95 aralık sıfırı dışarıda bırakıyorsa p < .05 (ve tersi)
      expect(x.ciLow > 0 || x.ciHigh < 0).toBe(x.p < 0.05);
    }
    expect(r[0]!.diff).toBeLessThan(0);
  });

  it('Games–Howell: aralık ve p tutarlı; serbestlik derecesi çifte özgü', () => {
    const groups = [grp(8, 10, 1), grp(30, 12, 4), grp(12, 10.2, 1.5)];
    const r = gamesHowell(groups);
    expect(new Set(r.map((x) => x.df.toFixed(6))).size).toBe(3);
    for (const x of r) expect(x.ciLow > 0 || x.ciHigh < 0).toBe(x.p < 0.05);
  });

  it('her grupta en az 2 gözlem gerekir', () => {
    expect(() => tukeyHsd([[1, 2], [3]])).toThrow(/en az 2 gözlem/);
    expect(() => gamesHowell([[1, 2, 3]])).toThrow(/En az 2 grup/);
  });

  it('12 grupta (66 çift) makul sürede biter', () => {
    const groups = Array.from({ length: 12 }, (_, i) => grp(20, 10 + i * 0.3, 1 + (i % 3)));
    const t0 = performance.now();
    tukeyHsd(groups);
    gamesHowell(groups);
    expect(performance.now() - t0).toBeLessThan(4000);
  });
});

describe('anlamlılık harfleri', () => {
  it('bilinen örnekler', () => {
    expect(compactLetters(3, [])).toEqual(['a', 'a', 'a']);
    expect(compactLetters(3, [[0, 2]])).toEqual(['a', 'ab', 'b']);
    expect(compactLetters(3, [[0, 1], [0, 2], [1, 2]])).toEqual(['a', 'b', 'c']);
    expect(compactLetters(4, [[0, 2], [0, 3], [1, 3]])).toEqual(['a', 'ab', 'bc', 'c']);
    // sıra: en yüksek ortalamalı grup (2) “a” alır
    expect(compactLetters(3, [[0, 2]], [2, 1, 0])).toEqual(['b', 'ab', 'a']);
  });

  it('anlamlı çiftler hiç harf paylaşmaz, anlamsız çiftler en az bir harf paylaşır (rastgele 300 desen)', () => {
    const rng = mulberry32(9);
    for (let t = 0; t < 300; t++) {
      const k = 2 + Math.floor(rng() * 7);
      const sig: [number, number][] = [];
      for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) if (rng() < 0.4) sig.push([i, j]);
      const L = compactLetters(k, sig);
      const share = (i: number, j: number) => [...L[i]!].some((c) => L[j]!.includes(c));
      for (let i = 0; i < k; i++) {
        for (let j = i + 1; j < k; j++) {
          const isSig = sig.some(([a, b]) => a === i && b === j);
          expect(share(i, j), `k=${k} ${JSON.stringify(sig)} → ${L.join(',')}`).toBe(!isSig);
        }
      }
    }
  });
});

describe('analiz akışında post-hoc', () => {
  const rng = mulberry32(2027);
  const vals: (number | null)[] = [];
  const grp: (string | null)[] = [];
  for (const [name, n, m] of [['A', 25, 10], ['B', 32, 12], ['C', 18, 10.4], ['D', 28, 13.5]] as const) {
    for (let i = 0; i < n; i++) {
      vals.push(Math.round((m + 2 * gaussian(rng)) * 100) / 100);
      grp.push(name);
    }
  }
  const req = (variance?: 'welch' | 'levene') => ({ goal: 'compare' as const, design: 'independent' as const, target: 'continuous' as const, datasetName: 'x.csv', value: { name: 'y', values: vals }, group: { name: 'g', values: grp }, variance });

  it('varsayılan: Welch ANOVA + Games–Howell; Levene tercihiyle klasik ANOVA + Tukey–Kramer', () => {
    const w = analyze(req());
    expect(w.outcome.test).toBe('Welch ANOVA');
    expect(w.outcome.postHoc?.method).toBe('Games–Howell');
    const t = analyze(req('levene'));
    expect(t.outcome.test).toBe('Tek Yönlü ANOVA');
    expect(t.outcome.postHoc?.method).toBe('Tukey HSD (Tukey–Kramer)');
    expect(t.references.some((r) => r.startsWith('Tukey, J. W.'))).toBe(true);
    expect(t.references.some((r) => r.startsWith('Kramer'))).toBe(true);
    expect(t.references.some((r) => r.startsWith('Holm'))).toBe(false);
  });

  it('APA metni ve rapor: fark, güven aralığı ve anlamlılık harfleri', () => {
    const r = analyze(req('levene'));
    const ph = r.outcome.postHoc!;
    expect(ph.letters[0]!.group).toBe('D'); // en yüksek ortalama
    expect(ph.letters[0]!.letters).toBe('a');
    expect(r.apaSummary).toMatch(/fark = -?\d+\.\d{2}, %95 GA \[/);
    const html = buildReport(reportFromResult(r, '01.01.2026'));
    expect(html).toContain('Anlamlılık harfleri');
    expect(html).toContain('Hedges g');
    expect(html).toContain('Tukey HSD (Tukey–Kramer)');
  });
});
