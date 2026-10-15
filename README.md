# StatAdvisor AI

Veri analizi asistanı. Verinizi (Excel `.xlsx`, SPSS `.sav` ya da CSV) yükleyin; uygulama veri kalitesini denetler, varsayımlara bakıp **doğru istatistiksel testi önerir** (nedenini açıklar), hesaplar ve sade bir dille yorumlar. Doğrusal ve lojistik regresyon kurar, faktöriyel ANOVA yapar, sınıflandırma modellerini çapraz doğrulamayla karşılaştırır; ekrandaki sayıları birebir yeniden üreten **Python kodunu** ve raporu (HTML, PDF, DOCX) üretir. **Her şey bu bilgisayarda çalışır; veriniz dışarı gönderilmez.**

Proje önce yalnızca bir "hipotez testi danışmanı" olarak başladı; kullanıcıların sonraki ihtiyaçlarıyla (regresyon, model karşılaştırma, çok faktörlü tasarımlar) tam bir analiz asistanına dönüştü.

## Neler yapar?

| Alan | İçerik |
|---|---|
| **Veri** | CSV / Excel (.xlsx) / SPSS (.sav) yükleme; sütun türü tanıma, veri kalitesi denetimi, temizleme, ölçek puanı, yanıt taraması. SPSS'te değer etiketleri (ör. 1 → Kadın), kullanıcı eksikleri ve tarihler çözülür. |
| **Karar Sihirbazı** | Amaç, tasarım ve sütun seçimine göre test önerisi; normallik ve varyans eşitliği veriden hesaplanır; öneri değişirse nedeni yazılır. Önerinin alternatifleri "Bunu çalıştır" ile denenebilir. |
| **Testler** | Student/Welch t, Mann-Whitney U, tek yönlü ve Welch ANOVA (Tukey HSD / Games–Howell), Kruskal-Wallis (Dunn), eşleştirilmiş t, Wilcoxon, işaret testi, tekrarlı ölçümler ANOVA, Friedman, Pearson, Spearman, Kendall tau-b, ki-kare, Fisher kesin testi, McNemar, Cochran Q. |
| **Regresyon** | Doğrusal ve ikili lojistik regresyon: katsayılar, güven aralıkları, tanılar (VIF, Cook, Durbin–Watson…), APA özeti. |
| **Faktöriyel ANOVA** | 1–4 faktör, Tip III kareler toplamı (boş hücre varsa Tip II), Levene ve kalıntı normalliği, Tukey HSD, basit etkiler, etkileşim grafikleri. Menüde gizlidir; `/faktoriyel-anova` adresinden açılır. |
| **Model karşılaştırma** | Taban, lojistik regresyon, karar ağacı, k-NN, SVM, rastgele orman, gradyan artırma; tabakalı çapraz doğrulama. Rapor: amaç, betimleyici istatistikler, sınıfa göre dağılım, aykırı değer ve normallik grafikleri, model grafikleri. |
| **Kod ve rapor** | Her analizin Python karşılığı (çıktısı ekrandakiyle birebir aynıdır, testle doğrulanır) ve HTML / DOCX / PDF raporu; Kod & Rapor Merkezi'nde saklanır. |

## Gereksinimler

- Node.js 24 veya üstü (geliştirme Node 26'da yapıldı; `node:sqlite` ve doğrudan TypeScript çalıştırma gerekir)
- PDF raporu için (isteğe bağlı): `npx playwright install chromium`
- Python yalnızca referans doğrulama ve üretilen kodun testleri için gerekir (`tools/reference/README.md`); yoksa bu testler atlanır

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

- Desteklenmeyen girdiler: eski Excel (.xls), `.zsav` (zlib sıkıştırmalı SPSS) ve 255 karakterden uzun SPSS metin değişkenleri; `.sas7bdat` okunmaz.
- Model karşılaştırmada hiper-parametre ayarı yoktur (scikit-learn varsayılanları). Ağaç, orman ve gradyan artırma rastgelelik içerdiğinden scikit-learn'den birkaç binde ayrışabilir. SVM 15 bin eğitim gözleminin, k-NN ise yaklaşık 3·10¹⁰ uzaklık hesabının üzerinde atlanır (süre gözlem sayısının karesiyle büyür).
- Regresyonda dayanıklı (HC) standart hata ve Firth/ceza lojistik regresyonu yoktur; bunlar gerektiğinde uyarı verilir.
- ANOVA sonrası post-hoc: Welch ANOVA'dan sonra Games–Howell, klasik ANOVA'dan sonra Tukey HSD (Tukey–Kramer); Karar Sihirbazı varsayılan olarak Welch'i seçer, “Levene anlamsızsa klasik test” seçeneği SPSS alışkanlığına uyar. Tekrarlı ölçümlü ANOVA'da Greenhouse-Geisser düzeltmesi yok.
- R kodu üretilmez; yalnızca doğrulanabilen Python kodu üretilir.
- Faktöriyel ANOVA'da boş hücre varsa Tip III tanımsız olduğundan Tip II hesaplanır ve raporda uyarılır; sonuçlar SPSS'in Tip III çıktısından farklı olabilir. Post-hoc yalnızca ana etkiler için (Tukey) ve anlamlı iki yönlü etkileşimlerin basit etkileri içindir.
- Kategorik karşılaştırmada eşleşmiş tasarım (McNemar, Cochran Q) yalnızca ikili (2 değerli) sütunları destekler.
- Alternatif olarak önerilen Permütasyon ANOVA ve Doğrusal karma model henüz çalıştırılamaz; çok değişkenli yöntemler (MANOVA, faktör analizi, diskriminant analizi) yoktur.
- Model karşılaştırma ve faktöriyel ANOVA raporları grafik içerir; doğrusal ve lojistik regresyon raporları grafik içermez (grafikler arayüzdedir).
- Kaynakça künyeleri yayın öncesi doğrulanmalıdır; bağımsız bir istatistikçi incelemesi önerilir.
