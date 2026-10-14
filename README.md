# StatAdvisor AI

Akıllı hipotez testi ve model seçim danışmanı. Verinizi yükleyin; uygulama veri kalitesini denetler, doğru istatistiksel testi önerir, hesaplar, Python kodunu ve raporu (HTML, PDF, DOCX) üretir. **Her şey bu bilgisayarda çalışır; veriniz dışarı gönderilmez.**

## Gereksinimler

- Node.js 24 veya üstü (geliştirme Node 26'da yapıldı; `node:sqlite` ve doğrudan TypeScript çalıştırma gerekir)
- PDF raporu için (isteğe bağlı): `npx playwright install chromium`
- Python yalnızca referans doğrulama için gerekir (`tools/reference/README.md`)

## Çalıştırma

```bash
npm install
npm start            # arayüzü derler ve http://127.0.0.1:3001 adresinde sunar
npm run dev          # geliştirme: API 3001, arayüz http://localhost:5173
```

## Komutlar

| Komut | Ne yapar |
|---|---|
| `npm run check` | Tip denetimi + lint + tüm birim testleri |
| `npm run e2e` | Playwright uçtan uca + erişilebilirlik testleri |
| `npm run backup` | Veritabanının tutarlı yedeğini `apps/api/backups/` altına yazar |
| `npm run reset-data` | Yedek alır, sonra tüm yerel veriyi siler (sunucu kapalıyken) |

## Mimari

- `packages/shared`: istatistik motoru (testler, varsayımlar, karar kuralları), veri temizleme, kod ve rapor üretimi. SciPy/statsmodels/scikit-learn ile üretilmiş 1094 referans vakayla doğrulanır.
- `apps/api`: Fastify sunucusu + SQLite. Yalnızca `127.0.0.1` dinler; Host ve Origin denetimi yapar.
- `apps/web`: React + Tailwind arayüzü (`ui/` klasöründeki tasarımlardan).
- `docs/`: gereksinimler, uygulama planı, risk ve fırsat raporu, gizlilik notu.

## Tanıtım videosu

`video/` klasöründe [Remotion](https://github.com/remotion-dev/remotion) ile yazılmış 60 saniyelik tanıtım videosu vardır (ana uygulamadan bağımsız, kendi `npm install`'ı ile):

```
cd video
npm install
npm run studio   # tarayıcıda önizleme ve düzenleme
npm run render   # out/statadvisor-tanitim.mp4
```

## Veri nerede?

`apps/api/.data/` (SQLite). `STATADVISOR_DATA` ile değiştirilir. Yedek ve silme için komutlara bakın. Ayrıntı: `docs/gizlilik.md`.

## Sınırlamalar

- Model karşılaştırma sayfası gerçek verinize bağlı değildir; tarayıcıda eğitilen sentetik veriyle çalışır.
- Tukey HSD / Games-Howell yok (yerine ikili Welch + Holm); tekrarlı ölçümlü ANOVA'da Greenhouse-Geisser düzeltmesi yok.
- R kodu üretilmez; yalnızca doğrulanabilen Python kodu üretilir.
- DOCX raporu grafik içermez (HTML/PDF içerir).
- Kaynakça künyeleri yayın öncesi doğrulanmalıdır; bağımsız bir istatistikçi incelemesi önerilir.
