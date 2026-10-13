import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const routes = [
  { path: '/karar-sihirbazi', title: 'Hipotez Testi ve Model Danışmanı' },
  { path: '/model-karsilastirma', title: 'Model Karşılaştırma ve Analitik Tuzak Radarı' },
  { path: '/veri-kalitesi', title: 'Veri Kalitesi, Aykırı ve Eksik Değerler' },
  { path: '/kod-rapor', title: 'Kod Üretimi ve Otomatik Raporlama Merkezi' },
];

for (const { path, title } of routes) {
  test(`${path} hatasız yüklenir ve ciddi erişilebilirlik ihlali yok`, async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    // Modeller ilk kullanımda eğitilir; içerik gelene kadar bekle.
    await expect(page.getByText('Analiz verisi yüklenemedi')).toHaveCount(0);

    const { violations } = await new AxeBuilder({ page }).analyze();
    const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test(`${path} 375 px genişlikte yatay kaydırma yapmaz`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBe(0);
  });
}

test('Uzman seviyesi istatistiksel gösterimi açar ve tercih korunur', async ({ page }) => {
  await page.goto('/karar-sihirbazi');
  await page.getByRole('radiogroup', { name: 'Anlatım seviyesi' }).first().getByRole('radio', { name: 'Uzman' }).click();
  await expect(page.getByText(/H\(2\) = 11\.70/)).toBeVisible();

  await page.getByRole('link', { name: 'Model Karşılaştırma' }).click();
  await expect(page.getByText(/duyarlılık \(recall\) = 0\.\d\d/)).toBeVisible();

  await page.reload();
  await expect(page.getByText(/duyarlılık \(recall\) = 0\.\d\d/)).toBeVisible();
});

test('Karar sihirbazı yanıtlara göre test önerir ve örnek dışı senaryoyu dürüstçe belirtir', async ({ page }) => {
  await page.goto('/karar-sihirbazi');
  await expect(page.getByText('Kruskal-Wallis H testi').first()).toBeVisible();
  await expect(page.getByText(/bağımsızlığı doğrulanmadı/)).toBeVisible();

  await page.getByRole('radio', { name: '2 grup' }).check();
  await expect(page.getByText('Bu senaryo için örnek sonuç yok')).toBeVisible();
  await expect(page.getByText('Mann-Whitney U testi').first()).toBeVisible();

  await page.getByRole('button', { name: 'Yanıtları sıfırla' }).click();
  await expect(page.getByText('Bu senaryo için örnek sonuç yok')).toHaveCount(0);
  await expect(page.getByText(/Shapiro-Wilk testi/).first()).toBeVisible();
});

test('Varsayım kartında "Bu ne demek?" açılır', async ({ page }) => {
  await page.goto('/karar-sihirbazi');
  await page.getByText('Bu ne demek?').first().click();
  await expect(page.getByText(/çan eğrisine benzeyip/)).toBeVisible();
});

test('Kırmızı bayraklar işaretlenince durum güncellenir', async ({ page }) => {
  await page.goto('/model-karsilastirma');
  await expect(page.getByText(/kırmızı bayrak açık/)).toBeVisible();
  await page.getByRole('button', { name: 'Tümünü çözüldü olarak işaretle' }).click();
  await expect(page.getByText('Tüm bayraklar çözüldü')).toBeVisible();
  await expect(page.getByText('Tüm uyarılar çözüldü')).toBeVisible();
});

test('Model panelindeki ölçütler taban çizgisiyle birlikte gösterilir', async ({ page }) => {
  await page.goto('/model-karsilastirma');
  await expect(page.getByText(/taban çizgisi %\d+\.\d/).first()).toBeVisible();
  await expect(page.getByText(/Doğruluk tek başına yanıltıcıdır/)).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'PR-AUC' })).toBeVisible();
});

test('Veri kalitesi önerileri uygulanır ve geri alınır', async ({ page }) => {
  await page.goto('/veri-kalitesi');
  await expect(page.getByText(/Dallanan yol uyarısı/)).toBeVisible();
  await page.getByRole('radio', { name: /KNN imputasyon/ }).check();
  await page.getByRole('button', { name: 'Önerilenleri tek tıkla uygula' }).click();
  await expect(page.getByText('Temizlenmiş veri seti analize hazır')).toBeVisible();
  await expect(page.getByText('KNNImputer(n_neighbors=5)')).toBeVisible();
  await page.getByRole('button', { name: 'Geri al (ham veri)' }).click();
  await expect(page.getByText('Önerileri uygulayınca veri seti analize hazır olacak')).toBeVisible();
});

test('Rapor dosyaları gerçekten üretilir ve bölümleri içerir', async ({ page }) => {
  await page.goto('/kod-rapor');
  const htmlDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'İndir (.html)' }).click();
  const html = await htmlDownload;
  expect(html.suggestedFilename()).toBe('rapor_hipotez_sonuclari.html');
  const content = await readFile((await html.path())!, 'utf8');
  for (const id of ['desc', 'assump', 'result', 'apa', 'refs']) expect(content).toContain(`data-section="${id}"`);
  expect(content).toContain('Shapiro-Wilk');

  await page.locator('label', { hasText: 'Word (.doc)' }).click();
  const docDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'İndir (.doc)' }).click();
  expect((await docDownload).suggestedFilename()).toBe('rapor_hipotez_sonuclari.doc');
});

test('Mobil menü açılır, gezinir ve kapanır', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/karar-sihirbazi');
  await page.getByRole('button', { name: 'Menüyü aç' }).click();
  const dialog = page.getByRole('dialog', { name: 'Ana menü' });
  await dialog.getByRole('link', { name: 'Kod & Rapor Merkezi' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('heading', { level: 1, name: /Kod Üretimi/ })).toBeVisible();
});
