import JSZip from 'jszip';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.ts';
import { readXlsx, toCsv } from './xlsx.ts';

/** En küçük geçerli .xlsx: verilen sayfa, paylaşılan metinler ve stiller. */
async function makeXlsx(opts: { sheet: string; shared?: string[]; styles?: string; date1904?: boolean; sheetTarget?: string }) {
  const zip = new JSZip();
  const target = opts.sheetTarget ?? 'worksheets/sheet1.xml';
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
  zip.file(
    'xl/workbook.xml',
    `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${
      opts.date1904 ? '<workbookPr date1904="1"/>' : ''
    }<sheets><sheet name="Form Yanıtları 1" sheetId="1" r:id="rId1"/><sheet name="İkinci" sheetId="2" r:id="rId2"/></sheets></workbook>`,
  );
  zip.file(
    'xl/_rels/workbook.xml.rels',
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="ws" Target="worksheets/sheet9.xml"/><Relationship Id="rId1" Type="ws" Target="${target}"/></Relationships>`,
  );
  zip.file(`xl/${target.replace(/^\//, '').replace(/^xl\//, '')}`, `<?xml version="1.0"?><worksheet><sheetData>${opts.sheet}</sheetData></worksheet>`);
  zip.file('xl/worksheets/sheet9.xml', '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>yanlış sayfa</t></is></c></row></sheetData></worksheet>');
  if (opts.shared) zip.file('xl/sharedStrings.xml', `<sst>${opts.shared.map((s) => (s.startsWith('<') ? `<si>${s}</si>` : `<si><t>${s}</t></si>`)).join('')}</sst>`);
  if (opts.styles) zip.file('xl/styles.xml', opts.styles);
  return Buffer.from(await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
}

const STYLES = `<styleSheet><numFmts count="1"><numFmt numFmtId="164" formatCode="dd&quot;.&quot;mm&quot;.&quot;yyyy hh:mm:ss"/></numFmts>
<cellXfs count="4"><xf numFmtId="0"/><xf numFmtId="164" applyNumberFormat="1"/><xf numFmtId="14"/><xf numFmtId="2"/></cellXfs></styleSheet>`;

describe('readXlsx', () => {
  it('paylaşılan metinleri, zengin metni, varlıkları ve satır içi metni okur', async () => {
    const buf = await makeXlsx({
      shared: ['Cinsiyet', '2:Bazen katılıyorum', '<r><t>Ka</t></r><r><rPr/><t xml:space="preserve">dın</t></r>', 'A &amp; B &lt;5&gt;', 'satır_x000A_sonu'],
      sheet:
        '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="inlineStr"><is><t>Madde 1</t></is></c></row>' +
        '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" t="s"><v>1</v></c></row>' +
        '<row r="3"><c r="A3" t="s"><v>3</v></c><c r="B3" t="s"><v>4</v></c></row>',
    });
    expect(readXlsx(buf)).toEqual([
      ['Cinsiyet', 'Madde 1'],
      ['Kadın', '2:Bazen katılıyorum'],
      ['A & B <5>', 'satır\nsonu'],
    ]);
  });

  it('boş hücreleri, boş satırları ve sağdaki boş sütunları doğru konumlar', async () => {
    const buf = await makeXlsx({
      sheet:
        '<row r="1"><c r="A1" t="inlineStr"><is><t>a</t></is></c><c r="C1" t="inlineStr"><is><t>c</t></is></c><c r="E1" s="0"/></row>' +
        '<row r="3"><c r="B3"><v>2</v></c></row>' +
        '<row r="4"><c r="A4"><v>1</v></c><c r="C4"><v>3</v></c></row>',
    });
    expect(readXlsx(buf)).toEqual([
      ['a', '', 'c'],
      ['', '2', ''],
      ['1', '', '3'],
    ]);
  });

  it('tarih biçimli sayıları tarihe çevirir, diğer sayılara dokunmaz', async () => {
    const buf = await makeXlsx({
      styles: STYLES,
      sheet:
        '<row r="1"><c r="A1" t="inlineStr"><is><t>zaman</t></is></c><c r="B1" t="inlineStr"><is><t>gun</t></is></c><c r="C1" t="inlineStr"><is><t>deger</t></is></c></row>' +
        // 45678.5 = 2025-01-21 12:00:00; 45678 = 2025-01-21
        '<row r="2"><c r="A2" s="1"><v>45678.5</v></c><c r="B2" s="2"><v>45678</v></c><c r="C2" s="3"><v>0.30000000000000004</v></c></row>' +
        '<row r="3"><c r="A3" s="1"><v>45678.000011574</v></c><c r="B3" s="2"><v>1</v></c><c r="C3"><v>1E-3</v></c></row>',
    });
    expect(readXlsx(buf)).toEqual([
      ['zaman', 'gun', 'deger'],
      ['2025-01-21 12:00:00', '2025-01-21', '0.3'],
      ['2025-01-21 00:00:01', '1899-12-31', '0.001'],
    ]);
  });

  it('1904 tarih sistemini, mantıksal ve hata hücrelerini işler', async () => {
    const buf = await makeXlsx({
      date1904: true,
      styles: STYLES,
      sheet:
        '<row r="1"><c r="A1" t="inlineStr"><is><t>t</t></is></c><c r="B1" t="inlineStr"><is><t>b</t></is></c><c r="C1" t="inlineStr"><is><t>e</t></is></c><c r="D1" t="inlineStr"><is><t>f</t></is></c></row>' +
        '<row r="2"><c r="A2" s="2"><v>1</v></c><c r="B2" t="b"><v>1</v></c><c r="C2" t="e"><v>#DIV/0!</v></c><c r="D2" t="str"><f>A1&amp;"x"</f><v>tx</v></c></row>',
    });
    expect(readXlsx(buf)).toEqual([
      ['t', 'b', 'e', 'f'],
      ['1904-01-02', 'TRUE', '', 'tx'],
    ]);
  });

  it('ilk sayfayı ilişki dosyasındaki yoldan bulur', async () => {
    const buf = await makeXlsx({ sheetTarget: '/xl/worksheets/form.xml', sheet: '<row r="1"><c r="A1" t="inlineStr"><is><t>doğru sayfa</t></is></c></row>' });
    expect(readXlsx(buf)).toEqual([['doğru sayfa']]);
  });

  it('CSV yazarken virgül, tırnak ve satır sonu içeren alanları tırnaklar', () => {
    expect(toCsv([['a,b', 'x"y', 'düz', 'iki\nsatır']])).toBe('"a,b","x""y",düz,"iki\nsatır"\n');
  });
});

describe('Excel yükleme', () => {
  let app: FastifyInstance;
  beforeEach(() => {
    app = buildApp({ dataDir: ':memory:' });
  });
  afterEach(async () => {
    await app.close();
  });

  const upload = (buf: Buffer, name: string) => {
    const boundary = '----xlsx';
    const payload = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: application/octet-stream\r\n\r\n`),
      buf,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    return app.inject({ method: 'POST', url: '/api/datasets', payload, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } });
  };

  it('.xlsx dosyasını CSV olarak saklar ve sütun türlerini tanır', async () => {
    const likert = ['0:Hiç katılmıyorum', '1:Katılmıyorum', '2:Bazen katılıyorum', '3:Katılıyorum', '4:Tamamen katılıyorum'];
    const rows = Array.from({ length: 12 }, (_, i) => `<row r="${i + 2}"><c r="A${i + 2}" s="1"><v>${45678 + i / 10}</v></c><c r="B${i + 2}" t="s"><v>${i % 2}</v></c><c r="C${i + 2}" t="s"><v>${2 + (i % 5)}</v></c><c r="D${i + 2}"><v>${(i * 1.5).toFixed(1)}</v></c></row>`);
    const buf = await makeXlsx({
      styles: STYLES,
      shared: ['Kadın', 'Erkek', ...likert],
      sheet: '<row r="1"><c r="A1" t="inlineStr"><is><t>Zaman damgası</t></is></c><c r="B1" t="inlineStr"><is><t>Cinsiyet</t></is></c><c r="C1" t="inlineStr"><is><t>Madde 1</t></is></c><c r="D1" t="inlineStr"><is><t>Puan</t></is></c></row>' + rows.join(''),
    });
    const r = await upload(buf, 'anket yanıtları.xlsx');
    expect(r.statusCode, r.body).toBe(201);
    const d = r.json();
    expect(d.name).toBe('anket yanıtları.csv');
    expect(d.convertedFrom).toBe('xlsx');
    expect(d.rows).toBe(12);
    const types = Object.fromEntries((d.columns as { name: string; type: string; prefixCoded?: boolean }[]).map((c) => [c.name, c.type]));
    expect(types).toEqual({ 'Zaman damgası': 'categorical', Cinsiyet: 'categorical', 'Madde 1': 'ordinal', Puan: 'continuous' });
    const csv = (await app.inject({ url: `/api/datasets/${d.id}/download` })).body;
    expect(csv.split('\n')[1]).toBe('2025-01-21,Kadın,0:Hiç katılmıyorum,0');

    // Aynı dosya ikinci kez yüklenince yinelenen kayıt oluşmaz.
    const again = await upload(buf, 'anket yanıtları.xlsx');
    expect(again.statusCode).toBe(200);
    expect(again.json().duplicate).toBe(true);
  });

  it('eski .xls biçimini anlaşılır bir mesajla reddeder', async () => {
    const ole = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(512)]);
    const r = await upload(ole, 'eski.xls');
    expect(r.statusCode).toBe(422);
    expect(r.json().error.message).toMatch(/\.xls/);
  });

  it('Excel olmayan bir ZIP dosyasını reddeder', async () => {
    const zip = new JSZip();
    zip.file('notlar.txt', 'merhaba');
    const r = await upload(Buffer.from(await zip.generateAsync({ type: 'nodebuffer' })), 'arsiv.zip');
    expect(r.statusCode).toBe(422);
    expect(r.json().error.message).toMatch(/Excel/);
  });
});
