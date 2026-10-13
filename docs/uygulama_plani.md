# StatAdvisor AI: Uygulama Planı

Bu plan, mevcut durumdan (örnek veriyle çalışan, hesapları tarayıcıda yapan arayüz) gerçek veriyle çalışan yerel uygulamaya geçişi tanımlar. Kaynaklar: `docs/risk_firsat_raporu.md` (açık kalan bulgular) ve `docs/gereksinimler.md` (genel yapı).

## 1. Hedef ve kapsam

**Hedef:** Kullanıcı kendi CSV dosyasını yükler, sorulara yanıt verir, kural motorunun önerdiği testin sonucunu görür ve kodu ile raporu alır. Her şey kullanıcının bilgisayarında çalışır; veri dışarı çıkmaz.

**Kapsam dışı:** Çok kullanıcılı hesaplar, bulut barındırma, yapay zekâ ile serbest metin sohbeti, mobil uygulama.

## 2. Başlangıç durumu

| Var | Yok |
|---|---|
| React arayüzü, 4 sayfa, bileşen kütüphanesi | Gerçek veri yükleme |
| Shapiro-Wilk, Levene, Kruskal-Wallis, ROC/PR (tarayıcıda, TypeScript) | Welch ANOVA, Games-Howell, Dunn, t-testleri, Mann-Whitney, Wilcoxon, Friedman, ki-kare, korelasyon |
| Kural motoru (`lib/decision.ts`) | Motorun önerdiği testin gerçekten çalıştırılması (şimdi yalnızca Kruskal-Wallis hesaplanıyor) |
| 47 birim, 16 uçtan uca test | SciPy/R ile otomatik karşılaştırma (şimdi yalnızca birkaç bilinen değer) |
| HTML, yazdır/PDF ve .doc rapor | Gerçek .docx, denetim izi |

## 3. Aşamalar

Her aşama kendi başına çalışır durumda teslim edilir ve ayrı commit'lenir. Süre tahmini göreceli: **K** (kısa, ~1 gün), **O** (orta, 2–4 gün), **U** (uzun, 1 hafta ve üzeri).

### Aşama 0: Altyapı hazırlığı (K)

- Hesaplama kodunu `apps/web/src/lib` altından `packages/shared` paketine taşı: `stats`, `assumptions`, `decision`, `ml`, `report`, domain tipleri. Hem arayüz hem sunucu bunu kullanır.
- Kökte tek komut: `npm run check` (tip denetimi, lint, birim testler).
- **Kabul:** mevcut 47 birim test yeni konumda geçer; arayüz davranışı değişmez.

### Aşama 1: Referans doğrulama (O)

Amaç: "doğru hesapladığımızı" tek tek örneklere değil sistematik olarak kanıtlamak.

- `tools/reference/` altında bir Python betiği (SciPy, statsmodels, scikit-posthocs) rastgele ama tohumlu 200 veri seti üretir ve her testin sonucunu `packages/shared/fixtures/*.json` dosyasına yazar. Dosyalar depoya eklenir; betiği yalnızca referansları yenilemek isteyen çalıştırır.
- Vitest bu dosyaları okur ve TypeScript sonuçlarını `1e-6` toleransla karşılaştırır.
- **Önkoşul:** Betiği çalıştıracak bir Python ortamı. Bu bilgisayarda Python kurulu değil; kurulum ya da başka bir makinede bir kez çalıştırma gerekir.
- **Kabul:** Mevcut testler (Shapiro-Wilk, Levene, Kruskal-Wallis, kantil, ROC/PR) referans dosyalarla uyuşur; sapma bulunursa düzeltilir.

### Aşama 2: İstatistik motorunun tamamlanması (U)

Kural motoru bir test önerdiğinde o testin gerçekten çalışması gerekir.

| Grup | Eklenecek testler |
|---|---|
| Parametrik karşılaştırma | Student ve Welch t-testi, eşleştirilmiş t, Welch ANOVA, klasik ANOVA, tekrarlı ölçümler |
| Non-parametrik | Mann-Whitney U, Wilcoxon, Friedman |
| Post-hoc | Dunn (Holm düzeltmeli), Games-Howell, Tukey HSD |
| İlişki | Pearson, Spearman, ki-kare, Fisher kesin test |
| Çoklu karşılaştırma | Holm, Bonferroni, Benjamini-Hochberg |
| Etki büyüklüğü ve güven aralığı | Cohen d, Hedges g, η², ε², rank-biserial; ortalama farkı için güven aralığı |

- Her test: fonksiyon + referans dosya testi (Aşama 1) + `decision.ts` ile bağlantı + yorum metinleri (Yeni Başlayan ve Uzman).
- Yorum metinleri her test için ayrıca bir istatistikçi tarafından gözden geçirilir.
- **Kabul:** Karar motorunun önerebileceği her test için sonuç hesaplanır ve gösterilir; "bu senaryo için örnek sonuç yok" uyarısı kaybolur.

### Aşama 3: Sunucu ve veri katmanı (U)

`apps/api` (Node, Fastify, better-sqlite3, Drizzle). Yalnızca `127.0.0.1` dinler.

**Veri modeli:** `datasets` (dosya, satır/sütun sayısı, içerik karması), `columns` (ad, çıkarılan tür), `analyses` (yanıtlar, seçilen sütunlar), `runs` (denetim izi: girdi karması, kütüphane sürümü, tetiklenen kural, tüm sonuçlar), `reports`.

**Uçlar:**
- `POST /datasets` (CSV yükleme; boyut sınırı 50 MB; dosya adı temizlenir; tür çıkarımı: sürekli, sıralı, kategorik)
- `GET /datasets/:id/columns`
- `POST /analyses` (sütun seçimi ve yanıtlar) ve `GET /analyses/:id` (varsayım testleri, öneri, sonuç)
- `POST /analyses/:id/report?format=html|docx|pdf`
- `GET /runs` (denetim izi)

**Güvenlik ve gizlilik:** Dosyalar yerel diskte tutulur; sunucu dış ağa istek yapmaz; yüklenen içerik hiçbir zaman kod olarak yorumlanmaz; kullanıcıya veri silme düğmesi sunulur.

- **Kabul:** CSV yüklenir, analiz sunucuda hesaplanır, aynı girdi için aynı karma ve aynı sonuç döner; API testleri (Vitest, gerçek SQLite dosyası) geçer.

### Aşama 4: Arayüzün gerçek veriye bağlanması (O)

- `data/queries.ts` içindeki `mock()` çağrıları gerçek `fetch` çağrılarıyla değişir; sayfalar değişmez (bu yüzden bu yapı kuruldu).
- Yeni sayfa **Veri Yükle**: sürükle-bırak, önizleme, sütun türü onayı, hata durumları.
- **Sihirbaz gerçek veriden beslenir:** grup sayısı, hedef türü ve örneklem büyüklüğü veriden çıkarılır ve kullanıcıya onaylatılır.
- Büyük veri için hesaplar Web Worker'da; Shapiro-Wilk 5.000 gözlemin üzerinde örneklemeyle çalışır ve bu açıkça belirtilir.
- Veri kalitesi sayfası seçilen dosyayı kullanır; temizleme işlemleri yeni bir veri sürümü olarak kaydedilir.
- **Kabul:** Elle hazırlanmış üç CSV (3 grup sürekli, 2 grup eşleşmiş, kategorik) uçtan uca doğru testi önerir, doğru sonucu verir.

### Aşama 5: Üretilen kod = ekrandaki sonuç (O)

- Kod şablonları kullanıcının sütun adlarıyla ve veri yoluyla üretilir.
- Python bulunan ortamda CI, üretilen betiği gerçekten çalıştırır ve çıktıyı sunucunun sonucuyla karşılaştırır. Python yoksa bu test atlanır ve bu açıkça raporlanır.
- "Beklenen konsol çıktısı" artık gerçek analizin sonucudur.
- **Kabul:** Üç örnek veri setinde üretilen Python ve R kodu, ekrandaki H, p ve etki büyüklüğünü 4 ondalığa kadar yeniden üretir.

### Aşama 6: Raporlama (O)

- Gerçek `.docx` (docx kütüphanesi) ve tarayıcıdan bağımsız PDF (Playwright'ın yazdırma özelliği, yerelde).
- Rapora **denetim izi** bölümü: hangi varsayım kontrol edildi, hangi kural tetiklendi, hangi sürümler, veri karması, yapılan temizlikler.
- Grafikler (kutu grafiği, histogram) rapora gömülür.
- **Kabul:** Aynı analiz iki kez raporlanınca denetim izi dışında aynı çıktı üretilir.

### Aşama 7: Sertleştirme ve yayın (O)

- Erişilebilirlik taraması, 5.000 satırlık veride performans ölçümü, bellek sınırları.
- Tek komutla kurulum ve başlatma (`npm start`); SQLite dosyasının yedeklenmesi için belgelenmiş bir yol.
- Veri gizliliği ve yerel çalışma garantisi için kullanıcıya dönük kısa belge; "karar destek aracıdır" sınırlaması.
- **Bağımsız istatistikçi incelemesi:** yorum metinleri, kural motoru ve uyarılar.
- **Kabul:** Kontrol listesi (aşağıda) tamam.

## 4. Sıralama ve bağımlılıklar

```
0 ──► 1 ──► 2 ──┐
                ├──► 4 ──► 5 ──► 6 ──► 7
0 ──────► 3 ────┘
```

- 1 ve 2 birlikte kritik yoldur: motor doğrulanmadan sunucuya taşınmaz.
- 3, 2'den bağımsız başlayabilir; ikisi paralel ilerleyebilir.
- 4, hem 2 hem 3 bitmeden tamamlanamaz.

## 5. Yayın öncesi kontrol listesi

1. Ekrandaki her sayı gerçek hesaptan gelir; referans dosyalarla doğrulanmıştır.
2. Karar motorunun önerdiği her test çalıştırılabilir.
3. Üretilen kod, ekrandaki sonucu yeniden üretir.
4. Her rapor bir denetim izi taşır.
5. Veri makineden çıkmaz; bu, ağ trafiği izlenerek doğrulanır.
6. Bağımsız bir istatistikçi yorum metinlerini ve kuralları onaylamıştır.

## 6. Riskler

| Risk | Etki | Önlem |
|---|---|---|
| Referans üretmek için Python ortamı yok | Aşama 1 ve 5 gecikir | Ortamı erken kurmak; referansları bir kez başka makinede üretmek |
| Test sayısı büyüklüğü (Aşama 2) | Planı en çok uzatan kalem | Önce karar motorunun varsayılan yolları (Welch, Kruskal, Mann-Whitney, Dunn); kalanlar sonra |
| Yorum metinlerinin yanlış yönlendirmesi | Kullanıcıyı yanıltır | Her test için istatistikçi incelemesi; yanlış yorumlara karşı birim testleri |
| Büyük CSV'de tarayıcı donması | Kötü deneyim | Web Worker, boyut sınırı, örnekleme uyarısı |
| Ön test ile test seçimi sınırlamaları | Bilimsel eleştiri | Uyarılar ve Welch varsayılanı korunur; seçim kuralı rapora yazılır |

## 7. Netleştirilmesi gereken kararlar

1. **Python ortamı:** Referans üretimi ve Aşama 5 için kurulabilir mi, yoksa başka bir makinede mi çalıştırılacak?
2. **Hedef kitle:** Öğrenci ve tez yazanlar mı (eğitim odaklı metinler, yavaş akış), yoksa deneyimli analistler mi? Yorum metinlerinin derinliğini ve Aşama 2'deki test önceliğini belirler.
3. **Dağıtım:** Yalnızca `npm start` yeterli mi, yoksa kurulabilir bir masaüstü paketi (Electron/Tauri) isteniyor mu?
4. **Dil:** Arayüz yalnızca Türkçe mi kalacak? Rapor ve kod yorumları için İngilizce gerekiyorsa metinlerin kaynak dosyalara taşınması gerekir.
