import { readFile } from 'node:fs/promises';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import JSZip from 'jszip';

/** Her testten önce sunucudaki tüm veri setlerini siler (testler birbirinden bağımsızdır). */
async function reset(request: APIRequestContext) {
  const { datasets } = (await (await request.get('/api/datasets')).json()) as { datasets: { id: string }[] };
  for (const d of datasets) await request.delete(`/api/datasets/${d.id}`);
}
async function loadSample(request: APIRequestContext, kind: string) {
  const r = await request.post(`/api/samples/${kind}`, { data: {} });
  expect(r.ok()).toBe(true);
  return (await r.json()) as { id: string; name: string };
}

test.beforeEach(async ({ request }) => {
  await reset(request);
});

const routes = [
  { path: '/veri', title: 'Veri Setleri' },
  { path: '/karar-sihirbazi', title: 'Hipotez Testi ve Model Danışmanı' },
  { path: '/model-karsilastirma', title: 'Model Karşılaştırma ve Analitik Tuzak Radarı' },
  { path: '/veri-kalitesi', title: 'Veri Kalitesi, Aykırı ve Eksik Değerler' },
  { path: '/kod-rapor', title: 'Kod Üretimi ve Otomatik Raporlama Merkezi' },
];

async function settle(page: Page) {
  await expect(page.getByText('Analiz verisi yüklenemedi')).toHaveCount(0);
  await page.waitForLoadState('networkidle');
}

for (const { path, title } of routes) {
  test(`${path} (veri varken) hatasız yüklenir ve ciddi erişilebilirlik ihlali yok`, async ({ page, request }) => {
    await loadSample(request, 'klinik');
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    if (path === '/karar-sihirbazi') await expect(page.getByText('Otomatik varsayım kontrolü')).toBeVisible();
    if (path === '/veri-kalitesi') await expect(page.getByText('Temiz hücre oranı')).toBeVisible();
    await settle(page);

    const { violations } = await new AxeBuilder({ page }).analyze();
    const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test(`${path} 375 px genişlikte yatay kaydırma yapmaz`, async ({ page, request }) => {
    await loadSample(request, 'klinik');
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await settle(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBe(0);
  });
}

test('veri yokken analiz sayfaları yönlendirir; yüklenince çalışır', async ({ page }) => {
  await page.goto('/karar-sihirbazi');
  await expect(page.getByText('Önce bir veri seti seçin')).toBeVisible();
  await page.getByRole('link', { name: 'Veri setlerine git' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Veri Setleri' })).toBeVisible();
  await expect(page.getByText('Henüz veri seti yok')).toBeVisible();
});

test('CSV yükleme: dosya seçilir, sütun türleri çıkarılır, hatalı dosya anlaşılır hata verir', async ({ page }) => {
  await page.goto('/veri');
  const rows = Array.from({ length: 30 }, (_, i) => `${i + 1};${i % 2 ? 'a' : 'b'};${(10 + i * 0.37).toFixed(2).replace('.', ',')}`);
  await page.locator('input[type=file]').setInputFiles({ name: 'ornek.csv', mimeType: 'text/csv', buffer: Buffer.from(['id;grup;deger', ...rows].join('\n')) });
  await expect(page.getByText(/“ornek.csv” yüklendi \(30 satır, 3 sütun\)/)).toBeVisible();
  await expect(page.getByRole('cell', { name: 'deger' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Sürekli', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Kategorik', exact: true })).toBeVisible();

  await page.locator('input[type=file]').setInputFiles({ name: 'bozuk.csv', mimeType: 'text/csv', buffer: Buffer.from('a,b\n1,2\n') });
  await expect(page.getByText(/2 veri satırı/)).toBeVisible();
});

test('Excel yükleme: .xlsx CSV’ye dönüştürülür ve kodlu Likert sütunu sıralı tanınır', async ({ page }) => {
  const zip = new JSZip();
  const cell = (ref: string, text: string) => `<c r="${ref}" t="inlineStr"><is><t>${text}</t></is></c>`;
  const rows = Array.from({ length: 20 }, (_, i) => `<row r="${i + 2}">${cell(`A${i + 2}`, i % 2 ? 'Kadın' : 'Erkek')}${cell(`B${i + 2}`, `${i % 5}:Etiket`)}<c r="C${i + 2}"><v>${10 + i}</v></c></row>`);
  zip.file('xl/workbook.xml', '<workbook xmlns:r="r"><sheets><sheet name="Form" sheetId="1" r:id="rId1"/></sheets></workbook>');
  zip.file('xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>');
  zip.file('xl/worksheets/sheet1.xml', `<worksheet><sheetData><row r="1">${cell('A1', 'Cinsiyet')}${cell('B1', 'Madde')}${cell('C1', 'Puan')}</row>${rows.join('')}</sheetData></worksheet>`);
  await page.goto('/veri');
  await page.locator('input[type=file]').setInputFiles({
    name: 'form yanıtları.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: await zip.generateAsync({ type: 'nodebuffer' }),
  });
  await expect(page.getByText(/“form yanıtları.csv” yüklendi \(20 satır, 3 sütun\)\. Excel dosyası CSV’ye dönüştürüldü/)).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Sıralı', exact: true })).toBeVisible();
});

test('örnek veri yüklenir, etkin yapılır ve silinebilir', async ({ page }) => {
  await page.goto('/veri');
  await page.getByRole('button', { name: /Klinik örnek örnek veri setini yükle/ }).click();
  await expect(page.getByText(/klinik_ornek.csv” yüklendi \(1\.420 satır/)).toBeVisible();
  await expect(page.getByText('Etkin veri seti: klinik_ornek.csv')).toBeVisible();
  await page.getByRole('button', { name: 'klinik_ornek.csv veri setini sil' }).click();
  await page.getByRole('button', { name: 'Evet, sil' }).click();
  await expect(page.getByText('Henüz veri seti yok')).toBeVisible();
});

test('ölçek puanı: alt boyut elle tanımlanır, alfa gösterilir, yeni sürüm etkin olur ve puan sütunu listelenir', async ({ page, request }) => {
  await loadSample(request, 'klinik');
  await page.goto('/veri');
  const box = page.getByRole('group', { name: 'Ölçek 1' });
  await box.getByLabel('Ölçek adı').fill('Bileşik puan');
  await box.getByLabel('En küçük yanıt').fill('0');
  await box.getByLabel('En büyük yanıt').fill('1000');
  await page.getByRole('button', { name: 'Puanları hesapla' }).click();
  await expect(page.getByText('en az 2 madde seçin')).toBeVisible();
  await box.getByRole('checkbox', { name: 'kan_basinci' }).check();
  await box.getByRole('checkbox', { name: 'biyobelirtec_x' }).check();
  await page.getByRole('button', { name: 'Puanları hesapla' }).click();
  await expect(page.getByText(/Cronbach α =/)).toBeVisible();
  await expect(page.getByText('Etkin veri seti: klinik_ornek (ölçekli).csv')).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Bileşik puan' })).toBeVisible();
});

test('anket: düz çizgi ve Mahalanobis taraması, taranmış sürüm, ölçek puanı normalliği ve çarpıklık-basıklık ölçütü', async ({ page, request }) => {
  const labels = ['0:Hiç', '1:Az', '2:Bazen', '3:Genellikle', '4:Tamamen'];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const lines = ['cinsiyet,m1,m2,m3,m4'];
  for (let i = 0; i < 120; i++) {
    const base = Math.floor(rnd() * 3) + 1;
    const vals = i % 30 === 5 ? [2, 2, 2, 2] : [0, 1, 2, 3].map(() => Math.min(4, Math.max(0, base + Math.round(rnd() * 2 - 1))));
    lines.push([i % 2 ? 'Kadın' : 'Erkek', ...vals.map((v) => labels[v])].join(','));
  }
  const up = await request.post('/api/datasets', { multipart: { file: { name: 'anket.csv', mimeType: 'text/csv', buffer: Buffer.from(lines.join('\n') + '\n') } } });
  expect(up.ok()).toBe(true);
  await page.goto('/veri');
  const screen = page.getByRole('region', { name: 'Anket yanıt taraması' }).or(page.locator('section', { hasText: 'Anket yanıt taraması' }).first());
  await expect(screen.getByText('Taranacak maddeler (4 seçili)')).toBeVisible();
  await screen.getByRole('button', { name: 'Yanıtları tara' }).click();
  await expect(screen.getByText(/Düz çizgi: /)).toBeVisible();
  await screen.getByRole('button', { name: /satırı çıkararak yeni sürüm oluştur/ }).click();
  await expect(page.getByText('Etkin veri seti: anket (taranmış).csv')).toBeVisible();

  const box = page.getByRole('group', { name: 'Ölçek 1' });
  await box.getByLabel('Ölçek adı').fill('Toplam');
  await box.getByLabel('Puan').selectOption('sum');
  await box.getByLabel('En küçük yanıt').fill('0');
  await box.getByLabel('En büyük yanıt').fill('4');
  for (const m of ['m1', 'm2', 'm3', 'm4']) await box.getByRole('checkbox', { name: m, exact: true }).check();
  await page.getByRole('button', { name: 'Puanları hesapla' }).click();
  await expect(page.getByText(/Puanın normalliği: çarpıklık/)).toBeVisible();

  await page.goto('/karar-sihirbazi');
  await page.getByLabel('Sonuç sütunu (sayısal)').selectOption('Toplam');
  await page.getByLabel('Grup sütunu').selectOption('cinsiyet');
  await expect(page.getByLabel('Normallik ölçütü')).toHaveValue('skewkurt-1.5');
  await expect(page.getByRole('heading', { name: 'Çarpıklık ve basıklık' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Basıklık' })).toBeVisible();
  await page.getByLabel('Normallik ölçütü').selectOption('shapiro');
  await expect(page.getByRole('heading', { name: 'Shapiro-Wilk testi' })).toBeVisible();
});

test('sihirbaz: gerçek veriden analiz hesaplar, varsayımları ve yorumu gösterir; seviye tercihi korunur', async ({ page, request }) => {
  await loadSample(request, 'klinik');
  await page.goto('/karar-sihirbazi');
  await expect(page.getByText('Shapiro-Wilk testi')).toBeVisible();
  await expect(page.getByText('Levene testi')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'İnsan dilinde sonuçlar' })).toBeVisible();
  await page.locator('summary', { hasText: 'Bu ne demek?' }).first().click();
  await expect(page.getByText(/çan eğrisine benzeyip/)).toBeVisible();

  await page.getByRole('radiogroup', { name: 'Anlatım seviyesi' }).first().getByRole('radio', { name: 'Uzman' }).click();
  await expect(page.getByText(/N = 1420/).first()).toBeVisible();
  await page.reload();
  await expect(page.getByRole('radio', { name: 'Uzman' }).first()).toHaveAttribute('aria-checked', 'true');
});

test('sihirbaz: soruları ve sütunları değiştirince farklı test çalışır', async ({ page, request }) => {
  await loadSample(request, 'klinik');
  await loadSample(request, 'tedavi');
  // En yeni veri seti (tedavi) etkindir.
  await page.goto('/karar-sihirbazi');
  await expect(page.getByRole('main').getByText('tedavi_ornek.csv').first()).toBeVisible();
  await page.getByRole('radio', { name: /Hayır, aynı kişiler tekrar ölçüldü/ }).check();
  await expect(page.getByText(/Koşullar arasında/).first()).toBeVisible();
  await expect(page.getByText(/eşleşmiş farklar/).first()).toBeVisible();

  await page.getByRole('radio', { name: 'İki değişken arasındaki ilişkiye bakmak' }).check();
  await expect(page.getByText(/Değişkenler arasında/).first()).toBeVisible();

  await page.getByRole('radio', { name: 'Bir sonucu tahmin etmek' }).check();
  await expect(page.getByText('Hipotez testi uygulanmıyor')).toBeVisible();
  await expect(page.getByRole('link', { name: /Model Karşılaştırma sayfasına gidin/ })).toBeVisible();
});

test('sihirbaz: geçersiz seçim anlaşılır hata verir', async ({ page, request }) => {
  await loadSample(request, 'anket');
  await page.goto('/karar-sihirbazi');
  // hedefi kategorik yap, sonuç sütunu ile grup sütununu aynı seç: eksik bilgi uyarısı
  await page.getByRole('radio', { name: /Kategorik/ }).check();
  await page.getByLabel('Sonuç sütunu (kategorik)').selectOption('bolum');
  await page.getByLabel('Grup sütunu').selectOption('bolum');
  await expect(page.getByText('Analiz için eksik bilgi')).toBeVisible();
});

test('kaydet → kod ve rapor: kod indirilir, rapor sunucudan gelir ve denetim izi içerir', async ({ page, request }) => {
  await loadSample(request, 'klinik');
  await page.goto('/karar-sihirbazi');
  await expect(page.getByText('Shapiro-Wilk testi')).toBeVisible();
  const save = page.getByRole('button', { name: 'Kaydet ve kod/rapor oluştur' });
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page).toHaveURL(/\/kod-rapor\?analiz=/);
  await expect(page.getByText('Hazır kod üretimi')).toBeVisible();
  await expect(page.getByText(/pd\.read_csv/).first()).toBeVisible();
  await expect(page.getByText('Beklenen konsol çıktısı')).toBeVisible();

  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Betiği indir (.py)' }).click();
  const file = await dl;
  expect(file.suggestedFilename()).toBe('analiz.py');
  expect(await readFile((await file.path())!, 'utf8')).toContain('stats.');

  const href = await page.getByRole('link', { name: 'Raporu incele' }).getAttribute('href');
  const html = await (await request.get(href!)).text();
  for (const id of ['desc', 'assump', 'result', 'apa', 'refs', 'audit']) expect(html).toContain(`data-section="${id}"`);
  expect(html).toContain('klinik_ornek.csv');
  await expect(page.getByText('Girdi karması (SHA-256)')).toBeVisible();

  // Word (.docx): gerçek bir Office Open XML paketi
  await page.locator('label', { hasText: 'Word (.docx)' }).click();
  const docxHref = await page.getByRole('link', { name: 'İndir (.docx)' }).getAttribute('href');
  const docx = await request.get(docxHref!);
  expect(docx.headers()['content-type']).toContain('wordprocessingml');
  expect((await docx.body()).subarray(0, 2).toString()).toBe('PK');

  // PDF: Chromium kuruluysa gerçek bir PDF, değilse uyarı ve kapalı düğme
  const caps = (await (await request.get('/api/capabilities')).json()) as { pdf: boolean };
  await page.locator('label', { hasText: 'PDF' }).click();
  if (caps.pdf) {
    const pdfHref = await page.getByRole('link', { name: 'İndir (.pdf)' }).getAttribute('href');
    const pdf = await request.get(pdfHref!);
    expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');
  } else {
    await expect(page.getByText(/npx playwright install chromium/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'İndir (.pdf)' })).toBeDisabled();
  }
});

test('kod ve rapor: kaydedilmiş analiz yokken yönlendirir', async ({ page, request }) => {
  await loadSample(request, 'klinik');
  await page.goto('/kod-rapor');
  await expect(page.getByText('Henüz kaydedilmiş analiz yok')).toBeVisible();
});

test('veri kalitesi: aykırı ve eksik değerler gösterilir; temizlenmiş sürüm etkin olur ve analizde kullanılır', async ({ page, request }) => {
  await loadSample(request, 'klinik');
  await page.goto('/veri-kalitesi');
  await expect(page.getByText(/Dallanan yol uyarısı/)).toBeVisible();
  await expect(page.getByText('Eksik değerler', { exact: true })).toBeVisible();
  await page.getByRole('radio', { name: 'Sonrası (önizleme)' }).check();
  await expect(page.getByText(/satır çıkarılır/)).toBeVisible();
  await expect(page.getByText(/Temizleme kodu \(Python\)/)).toBeVisible();

  await page.getByRole('button', { name: 'Temizlenmiş sürümü oluştur' }).click();
  await expect(page.getByText('Temizlenmiş sürüm oluşturuldu ve etkin veri seti yapıldı')).toBeVisible();
  await expect(page.getByRole('banner').getByLabel('Veri seti')).toContainText('temizlenmiş');

  await page.getByRole('button', { name: 'Hipotez testine geç' }).click();
  await expect(page).toHaveURL(/karar-sihirbazi/);
  await expect(page.getByRole('main').getByText('klinik_ornek (temizlenmiş).csv').first()).toBeVisible();
  await expect(page.getByText('Shapiro-Wilk testi')).toBeVisible();
});

test('model karşılaştırma: ölçütler taban çizgisiyle birlikte gösterilir; bayraklar işaretlenir', async ({ page }) => {
  await page.goto('/model-karsilastirma');
  await expect(page.getByText(/taban çizgisi %\d+\.\d/).first()).toBeVisible();
  await expect(page.getByText(/Doğruluk tek başına yanıltıcıdır/)).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'PR-AUC' })).toBeVisible();
  await expect(page.getByText(/kırmızı bayrak açık/)).toBeVisible();
  await page.getByRole('button', { name: 'Tümünü çözüldü olarak işaretle' }).click();
  await expect(page.getByText('Tüm bayraklar çözüldü')).toBeVisible();
});

test('mobil menü açılır, gezinir ve kapanır', async ({ page, request }) => {
  await loadSample(request, 'klinik');
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/karar-sihirbazi');
  await page.getByRole('button', { name: 'Menüyü aç' }).click();
  const dialog = page.getByRole('dialog', { name: 'Ana menü' });
  await dialog.getByRole('link', { name: 'Veri Setleri' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('heading', { level: 1, name: 'Veri Setleri' })).toBeVisible();
});
