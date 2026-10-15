/** Faktöriyel ANOVA raporu (blok belgesi): amaç, tasarım, betimleyici, varsayımlar, ANOVA tablosu, etkileşim grafikleri, yorum. */
import { interactionSvg, normalityPanelSvg } from './chart-svg.ts';
import type { FactorialResult } from './factorial.ts';
import type { DocBlock, ReportDoc } from './report-doc.ts';
import { formatP, pText } from './stats.ts';

const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : '–');
const f3 = (x: number) => (Number.isFinite(x) ? x.toFixed(3) : '–');
const trList = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} ve ${xs[xs.length - 1]}`);
const eta = (x: number) => (Number.isFinite(x) ? x.toFixed(3).replace(/^0/, '') : '–');

const REFERENCES = [
  'Field, A. (2018). Discovering statistics using IBM SPSS Statistics (5th ed.). SAGE.',
  'Maxwell, S. E., Delaney, H. D., & Kelley, K. (2018). Designing experiments and analyzing data: A model comparison perspective (3rd ed.). Routledge.',
  'Cohen, J. (1988). Statistical power analysis for the behavioral sciences (2nd ed.). Lawrence Erlbaum Associates.',
  'Levene, H. (1960). Robust tests for equality of variances. In I. Olkin (Ed.), Contributions to probability and statistics (pp. 278–292). Stanford University Press.',
  'Shapiro, S. S., & Wilk, M. B. (1965). An analysis of variance test for normality (complete samples). Biometrika, 52(3–4), 591–611.',
];

type Term = FactorialResult['terms'][number];

export function interpretFactorial(r: FactorialResult): string[] {
  const out: string[] = [];
  const sig = (t: Term) => Number.isFinite(t.p) && t.p < r.alpha;
  const line = (t: Term) => `F(${t.df}, ${r.error.df}) = ${f2(t.F)}, ${pText(t.p)}, ηp² = ${eta(t.partialEta2)}`;
  for (const t of r.terms) {
    const kind = t.factors.length === 1 ? 'ana etkisi' : `${t.factors.length} yönlü etkileşimi`;
    if (t.df === 0) out.push(`${t.name} ${kind} kestirilemedi (serbestlik derecesi 0).`);
    else out.push(`${t.name} ${kind} ${sig(t) ? 'anlamlıdır' : 'anlamlı değildir'}: ${line(t)}.`);
  }
  const inter = r.terms.filter((t) => t.factors.length > 1 && sig(t));
  if (inter.length) out.push(`Anlamlı etkileşim (${trList(inter.map((t) => t.name))}) bulunduğundan ilgili ana etkiler tek başına yorumlanmamalı; bir faktörün etkisi diğer faktörün düzeyine göre değişir. Basit etkiler (diğer faktörün her düzeyinde ayrı karşılaştırma) incelenmelidir.`);
  for (const ph of r.postHoc) {
    const sp = ph.pairs.filter((x) => x.p < r.alpha);
    out.push(sp.length ? `${ph.factor} için Tukey HSD: anlamlı farklar ${sp.map((x) => `${x.a} – ${x.b} (fark = ${f2(x.diff)}, ${pText(x.p)})`).join('; ')}.` : `${ph.factor} için Tukey HSD ikili karşılaştırmalarında anlamlı fark bulunmadı.`);
  }
  const simpleSig = r.simpleEffects.filter((x) => x.pAdj < r.alpha);
  if (r.simpleEffects.length) out.push(simpleSig.length ? `Basit etkiler (Bonferroni düzeltmeli): ${simpleSig.map((x) => `${x.factor}, ${x.at.factor} = ${x.at.level} düzeyinde anlamlı (F(${x.df}, ${r.error.df}) = ${f2(x.F)}, ${pText(x.pAdj)})`).join('; ')}.` : 'Basit etkilerin hiçbiri düzeltmeden sonra anlamlı kalmadı.');
  out.push(`Model toplam varyansın %${(r.r2 * 100).toFixed(1)}’ini açıklamaktadır (R² = ${f3(r.r2)}, düzeltilmiş R² = ${f3(r.adjR2)}).`);
  return out;
}

export function buildFactorialDoc(r: FactorialResult, opts: { datasetName: string; date: string; audit?: [string, string][] }): ReportDoc {
  const blocks: DocBlock[] = [];
  const design = r.factors.map((f) => `${f} (${r.levels[f]!.length} düzey)`).join(' × ');
  blocks.push(
    { type: 'heading', text: 'Araştırmanın amacı' },
    {
      type: 'p',
      text: `Bu analizin amacı, “${opts.datasetName}” veri setinde “${r.dependent}” değişkeninin ${trList(r.factors.map((f) => `“${f}”`))} faktörlerine göre farklılaşıp farklılaşmadığını${r.factors.length > 1 ? ' ve faktörlerin birlikte (etkileşim) etki gösterip göstermediğini' : ''} sınamaktır.`,
    },
    { type: 'list', items: [...r.terms.map((t) => `${t.factors.length === 1 ? 'Ana etki' : 'Etkileşim'}: ${t.name}`), 'Her etki için H0: ilgili ortalamalar eşittir; H1: en az bir ortalama farklıdır.'] },
    { type: 'heading', text: 'Tasarım ve yöntem' },
    {
      type: 'kv',
      rows: [
        ['Bağımlı değişken', r.dependent],
        ['Faktörler', design],
        ['Gözlem sayısı', `${r.n}${r.dropped ? ` (eksik değer nedeniyle ${r.dropped} satır çıkarıldı)` : ''}`],
        ['Hücre sayısı', `${r.totalCells - r.emptyCells} dolu / ${r.totalCells} (hücre başına n: ${r.minCellN}–${r.maxCellN})`],
        ['Kareler toplamı', r.ssType === 'III' ? 'Tip III (SPSS/SAS varsayılanı)' : 'Tip II'],
        ['Anlamlılık düzeyi', `α = ${r.alpha}`],
      ],
    },
  );
  if (r.ssTypeSwitched) blocks.push({ type: 'note', level: 'warning', title: 'Boş hücre', text: `${r.emptyCells} hücrede gözlem yok. Tip III kareler toplamı boş hücrelerde tanımsız olduğundan Tip II kullanıldı (marjinalite ilkesine uygun; bir terim sınanırken onu kapsayan etkileşimler modelden çıkarılır). Sonuçlar SPSS’in Tip III çıktısından farklı olabilir.` });
  else if (!r.balanced) blocks.push({ type: 'note', level: 'info', title: 'Dengesiz tasarım', text: 'Hücre büyüklükleri eşit değil; Tip III kareler toplamı hücre büyüklüklerinden bağımsız ortalama karşılaştırmalarına dayanır.' });
  if (r.minCellN < 5) blocks.push({ type: 'note', level: 'warning', title: 'Küçük hücreler', text: `En küçük hücrede yalnızca ${r.minCellN} gözlem var; varsayım testlerinin gücü ve sonuçların kararlılığı sınırlıdır.` });

  blocks.push({ type: 'heading', text: 'Betimleyici istatistikler' });
  blocks.push({ type: 'table', caption: `${r.dependent}: hücre (faktör düzeyi kombinasyonu) ortalamaları.`, header: [...r.factors, 'n', 'Ortalama', 'SS'], rows: r.cells.map((c) => [...c.levels, String(c.n), f2(c.mean), f2(c.sd)]) });
  blocks.push({ type: 'table', caption: 'Faktör düzeylerine göre marjinal ortalamalar (gözlenen).', header: ['Faktör', 'Düzey', 'n', 'Ortalama', 'SS'], rows: r.marginals.map((m) => [m.factor, m.level, String(m.n), f2(m.mean), f2(m.sd)]) });

  blocks.push({ type: 'heading', text: 'Varsayımlar' });
  const rows: string[][] = [];
  if (r.levene) rows.push(['Levene (varyans homojenliği, hücreler arası)', `F(${r.levene.df1}, ${r.levene.df2}) = ${f2(r.levene.F)}`, formatP(r.levene.p, true), r.levene.p >= r.alpha ? 'Sağlandı' : 'İhlal edildi']);
  if (r.residualNormality) rows.push(['Shapiro-Wilk (model kalıntıları)', `W = ${f3(r.residualNormality.W)}`, formatP(r.residualNormality.p, true), r.residualNormality.p >= r.alpha ? 'Sağlandı' : 'İhlal edildi']);
  if (rows.length) blocks.push({ type: 'table', header: ['Test', 'İstatistik', 'p', 'Sonuç'], rows });
  const panel = normalityPanelSvg(r.residuals, 'Kalıntılar');
  if (panel) blocks.push({ type: 'figure', title: 'Kalıntıların histogramı ve normal Q-Q grafiği', caption: 'Model kalıntıları: sol histogram ve kuramsal normal eğri (kesikli), sağ normal Q-Q grafiği.', svg: panel });
  const violated = (r.levene && r.levene.p < r.alpha) || (r.residualNormality && r.residualNormality.p < r.alpha);
  blocks.push({ type: 'p', muted: true, text: violated ? 'Bir varsayım ihlal edilmiş görünüyor. Hücre büyüklükleri benzer ve yeterliyse F testi dayanıklıdır; aksi halde sonuçlar dönüştürülmüş veriyle ya da parametrik olmayan yöntemlerle desteklenmelidir.' : 'Varsayımlar sağlanıyor görünüyor; sonuçlar standart F testiyle yorumlanabilir.' });

  const t = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : '–');
  const row = (name: string, o: { ss: number; df: number; ms: number; F: number; p: number }, pe?: number) => [name, t(o.ss), String(o.df), t(o.ms), t(o.F), o.df > 0 ? formatP(o.p, true) : '–', pe === undefined ? '–' : eta(pe)];
  blocks.push(
    { type: 'heading', text: 'ANOVA tablosu' },
    {
      type: 'table',
      caption: `Bağımlı değişken: ${r.dependent}. Kareler toplamı: ${r.ssType === 'III' ? 'Tip III' : 'Tip II'}. ηp²: kısmi eta-kare (≈ .01 küçük, .06 orta, .14 büyük).`,
      header: ['Kaynak', 'Kareler toplamı', 'sd', 'Kareler ortalaması', 'F', 'p', 'ηp²'],
      rows: [
        row('Düzeltilmiş model', r.model, r.model.ss / (r.model.ss + r.error.ss)),
        row('Sabit', r.intercept),
        ...r.terms.map((x) => row(x.name, x, x.partialEta2)),
        ['Hata', t(r.error.ss), String(r.error.df), t(r.error.ms), '–', '–', '–'],
        ['Toplam (düzeltilmiş)', t(r.total.ssCorrected), String(r.total.dfCorrected), '–', '–', '–', '–'],
      ],
    },
    { type: 'p', muted: true, text: `R² = ${f3(r.r2)}; düzeltilmiş R² = ${f3(r.adjR2)}.` },
  );

  const sigText = (p: number) => (p < r.alpha ? 'Anlamlı' : 'Anlamlı değil');
  if (r.postHoc.length) {
    blocks.push({ type: 'heading', text: 'İkili karşılaştırmalar (Tukey HSD)' });
    for (const ph of r.postHoc) {
      blocks.push({
        type: 'table',
        caption: `${ph.factor}: ikili farklar. Modelin hata kareler ortalaması (${f2(r.error.ms)}) ve hata sd (${r.error.df}) kullanıldı; p değerleri aile bazında düzeltilmiştir; %${Math.round((1 - r.alpha) * 100)} eşzamanlı güven aralığı. Ortalamalar gözlenen marjinal ortalamalardır (hücre büyüklükleri eşit değilse Tukey–Kramer).`,
        header: ['Çift', 'Fark', `%${Math.round((1 - r.alpha) * 100)} GA`, 'p', 'Sonuç'],
        rows: ph.pairs.map((x) => [`${x.a} – ${x.b}`, f2(x.diff), `[${f2(x.ciLow)}, ${f2(x.ciHigh)}]`, formatP(x.p, true), sigText(x.p)]),
      });
    }
  }
  if (r.simpleEffects.length) {
    blocks.push({ type: 'heading', text: 'Basit etkiler (anlamlı etkileşimin ardından)' });
    blocks.push({
      type: 'table',
      caption: 'Bir faktörün etkisi, diğer faktörün her düzeyinde ayrı ayrı sınanır; hata terimi modelin hata kareler ortalamasıdır (diğer faktörler üzerinden gözlenen ortalamalarla). Düzeltilmiş p: aynı ailedeki düzey sayısına göre Bonferroni.',
      header: ['Etkileşim', 'Etki', 'Koşul', 'n', 'F', 'sd', 'p', 'Düzeltilmiş p', 'Sonuç'],
      rows: r.simpleEffects.map((s) => [s.term, s.factor, `${s.at.factor} = ${s.at.level}`, String(s.n), f2(s.F), `${s.df}, ${r.error.df}`, formatP(s.p, true), formatP(s.pAdj, true), sigText(s.pAdj)]),
    });
  }

  // etkileşim grafikleri: her faktör çifti için, diğer faktörler üzerinden gözlenen ortalama
  if (r.factors.length >= 2) {
    blocks.push({ type: 'heading', text: 'Etkileşim grafikleri' });
    for (let a = 0; a < r.factors.length; a++) {
      for (let b = a + 1; b < r.factors.length; b++) {
        const A = r.factors[a]!;
        const B = r.factors[b]!;
        const series = r.levels[B]!.map((lb) => ({
          name: lb,
          values: r.levels[A]!.map((la) => {
            const cs = r.cells.filter((c) => c.levels[a] === la && c.levels[b] === lb);
            const n = cs.reduce((s, c) => s + c.n, 0);
            return n ? cs.reduce((s, c) => s + c.n * c.mean, 0) / n : null;
          }),
        }));
        const title = `${A} × ${B} etkileşim grafiği`;
        blocks.push({ type: 'figure', title, caption: `${title}: çizgiler ${B} düzeylerini gösterir; çizgiler paralel değilse etkileşim vardır (diğer faktörler üzerinden gözlenen ortalamalar).`, svg: interactionSvg(r.levels[A]!, series, A, r.dependent, title) });
      }
    }
  }

  blocks.push({ type: 'heading', text: 'Yorum' }, { type: 'list', items: interpretFactorial(r) });
  const apa = r.terms.map((x) => `${x.name}: F(${x.df}, ${r.error.df}) = ${f2(x.F)}, ${pText(x.p)}, ηp² = ${eta(x.partialEta2)}`).join('; ');
  blocks.push({ type: 'heading', text: 'APA 7 stilinde özet' }, { type: 'p', text: `${design} faktöriyel varyans analizi (N = ${r.n}) sonuçları: ${apa}.` });
  blocks.push({ type: 'heading', text: 'Kaynakça' }, { type: 'list', items: REFERENCES });
  if (opts.audit) blocks.push({ type: 'heading', text: 'Denetim izi' }, { type: 'kv', rows: opts.audit });
  return {
    title: 'Faktöriyel ANOVA raporu',
    subtitle: `${opts.datasetName} · ${opts.date} · StatAdvisor AI`,
    blocks,
    footer: 'Bu rapor bir karar destek aracı tarafından üretilmiştir; yöntem seçiminin ve yorumun sorumluluğu araştırmacıya aittir.',
  };
}
