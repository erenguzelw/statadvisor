# StatAdvisor AI

Akıllı hipotez testi ve model seçim danışmanı. Verinizi (Excel .xlsx ya da CSV) yükleyin; uygulama veri kalitesini denetler, doğru istatistiksel testi önerir, hesaplar; doğrusal ve lojistik regresyon kurar, sınıflandırma modellerini çapraz doğrulamayla karşılaştırır; Python kodunu ve raporu (HTML, PDF, DOCX) üretir. **Her şey bu bilgisayarda çalışır; veriniz dışarı gönderilmez.**

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
| `STATADVISOR_SLOW=1 npm test -w @statadvisor/api` | Yavaş kabul testi dahil: bodyPerformance verisi (`STATADVISOR_BODYPERFORMANCE` ya da masaüstündeki `statadvisor/bodyPerformance.csv`) üzerinde raporun yeniden üretimi |
| `npm run backup` | Veritabanının tutarlı yedeğini `apps/api/backups/` altına yazar |
| `npm run reset-data` | Yedek alır, sonra tüm yerel veriyi siler (sunucu kapalıyken) |

## Mimari

- `packages/shared`: istatistik motoru (testler, varsayımlar, karar kuralları), doğrusal/lojistik regresyon, sınıflandırma modelleri ve çapraz doğrulama, veri temizleme, kod ve rapor üretimi. SciPy/statsmodels/scikit-learn/pingouin ile üretilmiş 1568 referans vakayla doğrulanır (regresyonlar statsmodels ile 1e-7 içinde; lojistik, k-NN ve SVM scikit-learn ile aynı katmanlarda birebir; Tukey HSD ve Games–Howell SciPy/pingouin ile 1e-8 içinde).
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

`apps/api/.data/` (SQLite). `STATADVISOR_DATA` ile değiştirilir. Kod & Rapor Merkezi'ndeki kayıtlar (Karar Sihirbazı testleri ve “Rapor merkezine kaydet” ile saklanan regresyon, lojistik regresyon ve model karşılaştırma sonuçları) burada durur; sunucu yeniden başlasa da kalır, veri seti silinince onunla birlikte silinir. Yedek ve silme için komutlara bakın. Ayrıntı: `docs/gizlilik.md`.

## Sınırlamalar

- Model karşılaştırmada hiper-parametre ayarı yoktur (scikit-learn varsayılanları). Ağaç, orman ve gradyan artırma rastgelelik içerdiğinden scikit-learn'den birkaç binde ayrışabilir. SVM 15 bin eğitim gözleminin, k-NN ise yaklaşık 3·10¹⁰ uzaklık hesabının üzerinde atlanır (süre gözlem sayısının karesiyle büyür).
- Regresyonda dayanıklı (HC) standart hata ve Firth/ceza lojistik regresyonu yoktur; bunlar gerektiğinde uyarı verilir.
- ANOVA sonrası post-hoc: Welch ANOVA'dan sonra Games–Howell, klasik ANOVA'dan sonra Tukey HSD (Tukey–Kramer); Karar Sihirbazı varsayılan olarak Welch'i seçer, “Levene anlamsızsa klasik test” seçeneği SPSS alışkanlığına uyar. Tekrarlı ölçümlü ANOVA'da Greenhouse-Geisser düzeltmesi yok.
- R kodu üretilmez; yalnızca doğrulanabilen Python kodu üretilir.
- Regresyon ve model karşılaştırma raporları (HTML/DOCX/PDF) grafik içermez; grafikler arayüzdedir.
- Kaynakça künyeleri yayın öncesi doğrulanmalıdır; bağımsız bir istatistikçi incelemesi önerilir.
