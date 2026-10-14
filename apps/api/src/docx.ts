import { AlignmentType, Document, HeadingLevel, ImageRun, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from 'docx';
import { crosstabRows, descriptiveTables, formatP, reportFigures, type ReportData, type ReportFigure } from '@statadvisor/shared';
import { svgToPng } from './raster.ts';

const para = (text: string, opts: { bold?: boolean; italics?: boolean; size?: number; spacingAfter?: number } = {}) =>
  new Paragraph({ spacing: { after: opts.spacingAfter ?? 120 }, children: [new TextRun({ text, bold: opts.bold, italics: opts.italics, size: opts.size })] });

const heading = (text: string) => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 280, after: 120 }, children: [new TextRun({ text })] });

function table(header: string[], rows: string[][]): Table {
  const cell = (text: string, head = false, right = false) =>
    new TableCell({
      width: { size: 100 / header.length, type: WidthType.PERCENTAGE },
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
      shading: head ? { fill: 'EDEDED' } : undefined,
      children: [new Paragraph({ alignment: right ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun({ text, bold: head, size: 20 })] })],
    });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({ tableHeader: true, children: header.map((h, i) => cell(h, true, i > 0)) }), ...rows.map((r) => new TableRow({ children: r.map((c, i) => cell(c, false, i > 0)) }))],
  });
}

/** Sayfa genişliğine sığan (piksel) görüntü genişliği; yükseklik oranla hesaplanır. */
const IMAGE_WIDTH = 560;

/** Grafik: açıklama satırı + PNG görüntü (alternatif metin olarak başlık). */
function figure(f: ReportFigure): Paragraph[] {
  const png = svgToPng(f.svg);
  return [
    para(f.caption, { italics: true, size: 18, spacingAfter: 60 }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 160 },
      children: [
        new ImageRun({
          type: 'png',
          data: png.data,
          transformation: { width: IMAGE_WIDTH, height: Math.round((IMAGE_WIDTH * png.height) / png.width) },
          altText: { name: f.title, title: f.title, description: f.title },
        }),
      ],
    }),
  ];
}

/** Rapor verisinden gerçek bir .docx (Office Open XML) üretir; grafikler PNG olarak gömülür. */
export async function buildDocx(d: ReportData): Promise<Buffer> {
  const figures = reportFigures(d);
  const figs = (section: ReportFigure['section']) => figures.filter((f) => f.section === section).flatMap(figure);
  const children: (Paragraph | Table)[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: d.title })] }),
    para(`${d.datasetName} · ${d.date} · StatAdvisor AI`, { italics: true, size: 20 }),

    heading('Tanımlayıcı istatistikler'),
    ...descriptiveTables(d.descriptives).flatMap((t) => [para(t.title, { italics: true, size: 20, spacingAfter: 60 }), table(t.header, t.rows), para('', { spacingAfter: 60 })]),
    ...(d.table ? [para('Çapraz tablo (gözlenen sayı ve satır yüzdesi)', { italics: true, size: 20, spacingAfter: 60 }), table(crosstabRows(d.table).header, crosstabRows(d.table).rows), para('', { spacingAfter: 60 })] : []),
    ...figs('desc'),
    ...d.notes.map((n) => para(`• ${n}`, { size: 20 })),

    heading('Varsayım testleri ve karar notları'),
    ...(d.assumptions.length
      ? [table(['Test', 'Uygulandığı veri', 'İstatistik', 'p', 'Sonuç'], d.assumptions.map((x) => [x.name, x.subject, x.statistic, x.shape ? `sınır ±${x.shape.limit}` : formatP(x.p, true), x.passed ? 'Sağlandı' : 'İhlal edildi']))]
      : [para('Bu test türü için ayrı bir varsayım testi uygulanmadı.', { italics: true })]),
    ...figs('assump'),
    para(`Önerilen test: ${d.decision.finalTest}${d.decision.rerouteReason ? ` (${d.decision.rerouteReason})` : ''}.`, { bold: true, spacingAfter: 80 }),
    ...d.decision.warnings.map((w) => para(`• ${w}`, { size: 20 })),
    ...(d.decision.alternatives ?? []).map((a) => para(`Alternatif: ${a.test}. ${a.when}`, { size: 20 })),

    heading('Test sonucu'),
    para(d.resultLine),

    heading('APA 7 stilinde özet'),
    para(d.apaSummary),

    heading('Kaynakça'),
    ...(d.references.length ? d.references.map((r) => para(r, { size: 20 })) : [para('Kaynak yok.', { italics: true })]),
  ];
  if (d.audit) children.push(heading('Denetim izi'), table(['Öğe', 'Değer'], d.audit.map(([k, v]) => [k, v])));
  children.push(para('Bu rapor bir karar destek aracı tarafından üretilmiştir; yöntem seçiminin ve yorumun sorumluluğu araştırmacıya aittir.', { italics: true, size: 18 }));

  const doc = new Document({
    creator: 'StatAdvisor AI',
    title: d.title,
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    sections: [{ children }],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}
