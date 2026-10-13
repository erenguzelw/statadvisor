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

    const { violations } = await new AxeBuilder({ page }).analyze();
    const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious.map((v) => `${v.id}: ${v.nodes.length} öğe`)).toEqual([]);
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
  await expect(page.getByText(/recall = 0\.31/)).toBeVisible();

  await page.reload();
  await expect(page.getByText(/recall = 0\.31/)).toBeVisible();
});

test('Kırmızı bayraklar çözülünce üretime aktarma açılır', async ({ page }) => {
  await page.goto('/model-karsilastirma');
  const deploy = page.getByRole('button', { name: 'Modeli üretime aktar' });
  await expect(deploy).toBeDisabled();
  await page.getByRole('button', { name: 'Otomatik düzeltmeleri uygula' }).click();
  await expect(page.getByText('Tüm bayraklar çözüldü')).toBeVisible();
  await expect(deploy).toBeEnabled();
});

test('Veri kalitesi önerileri uygulanır ve geri alınır', async ({ page }) => {
  await page.goto('/veri-kalitesi');
  await page.getByRole('radio', { name: /KNN imputasyon/ }).check();
  await page.getByRole('button', { name: 'Önerilenleri tek tıkla uygula' }).click();
  await expect(page.getByText('Temizlenmiş veri seti analize hazır')).toBeVisible();
  await expect(page.getByText('KNNImputer(n_neighbors=5)')).toBeVisible();
  await page.getByRole('button', { name: 'Geri al (ham veri)' }).click();
  await expect(page.getByText('Önerileri uygulayınca veri seti analize hazır olacak')).toBeVisible();
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
