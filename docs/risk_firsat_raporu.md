# Akıllı Hipotez Testi ve Model Seçim Danışmanı: Çok Perspektifli Risk ve Fırsat Değerlendirmesi

**Tarih:** 13 Ekim 2026
**Kapsam:** `apps/web` altındaki React arayüzü, `ui/danisman_tanitim.md` içindeki ürün vaadi ve sahte (mock) veri dosyaları.

## Özet

Üç uzman rolü (UX araştırmacısı, kıdemli istatistikçi, şeytanın avukatı), ürünün mevcut arayüzünü sırayla eleştirdi ve birbirinin argümanlarına yanıt verdi. Ortaya çıkan ana sonuç: ürünün fikri savunulabilir ve dar bir nişte değerlidir (deterministik, denetlenebilir, yerel çalışan bir istatistik yönlendirici). Ancak şu anki arayüz, bu iddiayı kendi ekranlarıyla zayıflatan **dört kritik tutarsızlık** içeriyor. Bunlar yayından önce giderilmelidir. Hiçbiri mimari bir engel değil; dördü de içerik ve kod şablonu düzeltmesiyle çözülebilir.

**Yöntem notu.** Üç "uzman", aynı yapay zekâ modelinin farklı rollerle çalıştırılmış örnekleridir; bağımsız insan uzman görüşü değildir. Tartışma, gerçek dosya içeriği üzerinden yürütüldü. En ağır iki iddia (örnek kod çıktısı ve SMOTE sırası) ayrıca elle yeniden hesaplanarak doğrulandı (Bulgu 1 ve 2). Bulguların geri kalanı ilgili rolün analizine dayanır ve ürün hayata geçmeden önce bağımsız bir istatistikçi tarafından gözden geçirilmelidir. Kaynakça, yazım sırasında bilinen literatürden derlenmiştir; yayınlanmadan önce künyeler tek tek doğrulanmalıdır.

## Doğrulanan Kritik Bulgular

**Bulgu 1: Ekrandaki kod çıktısı koddan üretilemiyor.** Kod örneğinde (`code.ts:22-24`) üç grup birbirinden tamamen ayrışıyor; sıra toplamları 15, 40 ve 65. Kruskal ve Wallis'in (1952) formülüyle H = 12,50 ve p ≈ 0,0019 çıkar. Arayüz ise H = 11,60 ve p = 0,0031 gösteriyor. "Kopyala, yapıştır, çalıştır" vaadi ilk denemede çürüyor.

**Bulgu 2: SMOTE, çapraz doğrulamadan önce uygulanıyor.** `code.ts:70-77` içinde sentetik örnekleme (Chawla vd., 2002) tüm eğitim verisine uygulanıyor, ardından `cross_val_score` çağrılıyor. Sentetik örnekler komşularından türetildiği için test katlarına ait bilgi eğitim katlarına sızar ve raporlanan F1 değeri (0,871) şişer. Aynı arayüz `ModelComparisonPage.tsx:106` satırında "Veri sızıntısı taraması: temiz" diyor. Tuzak uyarısı sunan bir ürün için bu, kendi uyarısıyla çelişmek demektir.

**Bulgu 3: Etki büyüklüğü hesaplanamıyor.** n = 45 için ε² = H/(n−1) = 11,6/44 ≈ 0,264 olur (Tomczak ve Tomczak, 2014); ekranda 0,21 yazıyor. Ayrıca veri setinde 1420 satır, histogramda n = 366, test n'sinde 45 ve model panelinde N = 1775 gibi birbiriyle bağlantısız sayılar var. Bu tutarsızlık, bir istatistik danışmanında güveni doğrudan zedeler.

**Bulgu 4: p-değeri yanlış yorumlanıyor.** "Farkın tesadüfen ortaya çıkma olasılığı binde 3" ifadesi, p-değerinin klasik yanlış yorumudur. p, "gruplar gerçekte aynı olsaydı bu kadar uç bir veriyi görme olasılığı"dır (Wasserstein ve Lazar, 2016). "Gerçek bir etki yaratıyor" cümlesi ise gözlemsel veride nedensellik ima eder.

## Bölüm 1: UX ve Eğitim Perspektifi

**Güçlü yönler.** Üstü çizili planlanan test ile nihai test, yönlendirmeyi şeffaf kılıyor. Çoklu karşılaştırma uyarısındaki %51,2 değeri doğru: 1 − 0,95¹⁴ ≈ 0,512. Erişilebilirlik temel düzeyde düşünülmüş.

**Riskler.**
- Karar Sihirbazı salt okunur bir özet. Giriş alanı yok; "Yeniden test et" düğmesi bir şey yapmıyor.
- Bağımsızlık, eşleşme (tekrarlı ölçüm) ve hedef değişken tipi sorulmuyor. Yolda "Grup: 3+, bağımsız" yazıyor ama bu bilgi kullanıcıdan hiç alınmıyor.
- Sonuç çipi, bulgunun niteliğinden bağımsız olarak hep yeşil. Anlamlı bir sonuç "iyi", anlamsız bir sonuç "kötü" değildir.
- Yeni Başlayan / Uzman anahtarı metni değiştiriyor ama öğretmiyor. Yeni başlayan "ε² nedir?" ya da "neden Kruskal-Wallis?" sorusuyla hiç karşılaşmıyor. Anahtar yalnızca bazı metinleri değiştirdiği için tutarlı bir deneyim sunmuyor.

**Şeytanın avukatından gelen itiraz ve sonuç.** Sihirbaz cevabı veriden çıkarırsa otomasyon yanlılığı (Parasuraman ve Manzey, 2010) riski artar. Çözüm sormaya devam etmek değil, veriden çıkarılan cevabı onaylatmaktır ("Veride 3 bağımsız grup görüyorum, doğru mu?"). Karar yorgunluğunu azaltan şey metnin kısalığı değil karar sayısıdır; dolayısıyla "kısa ama yanlış" seçeneği hiç masada olmamalı. Anahtar yalnızca ayrıntı derinliğini değiştirmeli, doğruluğu değil.

## Bölüm 2: İstatistiksel Doğruluk Perspektifi

**Kapı bekçisi mantığı.** Shapiro-Wilk ve Levene sonucuna göre test seçmek, koşullu Tip I hatayı etkileyebilir (Rochon vd., 2012; Zimmerman, 2004). Shapiro-Wilk, küçük n'de güçsüz, büyük n'de önemsiz sapmaya bile duyarlıdır; arayüzdeki n = 366 veya 1420 ile p = 0,012 neredeyse hiçbir şey ifade etmez. ANOVA varsayımı ham veri için değil, grup içi kalıntılar için geçerlidir; Q-Q grafiği ve çarpıklık/basıklık daha bilgilendiricidir. Ayrıca Levene'in anlamlı çıkmaması varyans eşitliğinin kanıtı değildir; Welch yaklaşımı varsayılan olarak daha güvenlidir (Delacre vd., 2017).

**Tartışmalı nokta.** Şeytanın avukatı, ön test eleştirisinin etkisinin literatürde sınırlı olduğunu ve yaygın yazılımların bu sırayı öğrettiğini savundu; istatistikçi ise yönteme teorik olarak karşı çıktı. Bu karşılıklı iddialar bu çalışmada bağımsız olarak doğrulanmadı. Pratik uzlaşma şöyle: otomatik yönlendirme tamamen terk edilmesin, ama "güvenli varsayılan seçici" olarak yeniden tanımlansın ve ön test karar notu açıkça gösterilsin.

**Kruskal-Wallis'in yanlış tanımı.** Kruskal-Wallis, ANOVA'nın doğrudan non-parametrik karşılığı değildir; gruplar arasında stokastik üstünlük eşitliğini sınar. "Sıra ortalamaları farklılaşıyor" ifadesi yalnızca yarı doğrudur. Dağılım şekilleri ve yayılımlar benzerse medyan farkı olarak okunabilir, ancak bu ek bir varsayımdır.

**Dallanan yollar.** IQR filtresi uygulanınca Shapiro p değeri 0,012'den 0,082'ye çıkıyor ve test seçimi ANOVA'ya dönebiliyor. Analist, sonucu etkileyen bir ön işlemle testi değiştirebiliyor; bu kendi başına bir p-hacking biçimidir. "İstatistiksel güç kaybı < %0,4" ve "MCAR" iddiaları hiçbir testle desteklenmiyor.

**Çoklu karşılaştırma.** 14 testte ham p = 0,003, Bonferroni düzeltmesiyle 0,042 olur ve eşik 0,05/14 ≈ 0,00357'nin altında kaldığı için anlamlıdır; ancak sınıra yakındır. Arayüz düzeltilmiş p'yi ham p'nin yanında göstermelidir. Holm yöntemi (1979), Bonferroni'den eşit ya da daha güçlüdür ve aynı aile içi hata güvencesini verir; Bonferroni yerine varsayılan olmalıdır. Keşif amaçlı çalışmalarda yanlış keşif oranı (Benjamini ve Hochberg, 1995) daha uygun olabilir.

**Model karşılaştırma paneli.**
- %92 / %8 dengeli olmayan veride, hep çoğunluk sınıfını tahmin eden bir model %92 doğruluk alır. Panelin gösterdiği %89–91 doğruluk bu taban çizgisinin altındadır ve panelin kendi uyarısıyla (azınlık F1 = 0,42) çelişir.
- Hız, yorumlanabilirlik ve doğruluk puanları (0–100) bir ölçüme değil, elle yazılmış sabitlere dayanıyor.
- ROC eğrileri gerçek tahminlerden değil, `tpr = fpr^k` formülüyle üretiliyor; "tüm yanlış pozitif oranlarında üstün" ifadesi bu yüzden tanım gereği doğru çıkıyor, bir kanıt değil.
- Dengesiz veride ROC AUC yanıltıcıdır; kesinlik-duyarlılık eğrisi (PR-AUC) ve %8'lik taban çizgisi yan yana gösterilmelidir (Saito ve Rehmsmeier, 2015).
- Aşırı öğrenme uyarısı tek bir eğitim/test farkına (%99,1'e karşı %79,4) dayanıyor; çapraz doğrulamalı test performansı ve öğrenme eğrisi gerekir. Aynı ekranda Random Forest hem "aşırı öğrenmeye dirençli" hem aşırı öğrenme şüphelisi olarak sunuluyor.

**Diğer kod sorunları.** KNN imputasyonu tüm veri üzerinde `fit_transform` yapıyor (model kurulacaksa ikinci bir sızıntı kaynağı). `multipletests` içe aktarılıyor ama kullanılmıyor. Python örneklerinde `kan_basinci`, `tansiyon` gibi tutarsız sütun adları var.

## Bölüm 3: Eleştirel (Şeytanın Avukatı) Perspektifi

**Beş zayıf nokta.**
1. **Güven ve rekabet.** ChatGPT/Claude, pingouin, JASP, jamovi ve rstatix gibi araçlar varken, yeni ve doğrulanmamış bir asistana güvenmek için bir neden henüz sunulmuyor. "Hazır kod" zaten güçlü olan genel yapay zekâ modellerinin iyi yaptığı bir iş.
2. **Kendi uyarısıyla çelişen sızıntı denetimi** (Bulgu 2).
3. **Kod esnekliği ve tekrarlanabilirlik.** Kod şablonları sabit; sonuç, kodun gerçekten çalışmasından değil elle yazılmış metinden geliyor. Kullanıcının kendi sütun adları, eksik veri, polars, pipeline ve notebook ayrımı, sürüm sabitleme ve test edilebilirlik ele alınmıyor.
4. **Entegrasyon ve gizlilik.** CSV/Parquet/veritabanı, Colab/Jupyter, kurumsal veri politikası ve Python/R sürüm uyumsuzluğu planlanmamış. Mevcut `docs/gereksinimler.md` bir öğrenme yönetim sistemi için yazılmış; bu ürünün veri gizliliği gereksinimleri ayrıca tanımlanmalı.
5. **Sorumluluk ve bakım.** SciPy ve statsmodels sürümleri varsayılanları değiştirdiğinde kural motoru sessizce yanlışlaşabilir. "Doğrulanmış", "temiz" gibi ifadeler bir beyan taşır; beyanı yapan ürün sorumlu görünür.

**Dürüst niş değer.** Aynı rol üç savunulabilir ayrışma noktası buldu:
- **Deterministik kural motoru:** Aynı girdi her zaman aynı öneriyi verir; bu test edilebilir ve denetlenebilir.
- **Denetim izi:** Hangi varsayımın kontrol edildiği, hangi kuralın tetiklendiği ve hangi sürümün kullanıldığı kayıt altında tutulabilir. Tez, rapor ve düzenleyici bağlamlarda bu gerçek bir değerdir.
- **Yerel ve çevrimdışı çalışma:** Sağlık, İK ya da öğrenci verisiyle çalışan kullanıcıya verinin bulut yapay zekâ modeline gitmediği garantisi verilebilir.

Önerilen konumlandırma: "sihirbaz" yerine, öğrencilere ve tez yazanlara yönelik, **eğitim amaçlı, denetlenebilir bir istatistik yönlendirici**.

## Risk ve Fırsat Matrisi

| # | Risk | Önem | Giderme | Çaba | Frontend'de çözülebilir mi? |
|---|---|---|---|---|---|
| 1 | Ekrandaki sayılar koddan üretilemiyor (H, p, ε², n tutarsızlığı) | Kritik | Sayıları tek kaynaktan türet; sonra gerçek hesaplamaya bağla | Düşük (şimdi), Yüksek (gerçek motor) | Evet (sahte veri düzeltmesi) |
| 2 | SMOTE sızıntısı ve "temiz" beyanı | Kritik | Kodu `imblearn.pipeline.Pipeline` ile yaz; "temiz" ifadesini kaldır | Düşük | Evet |
| 3 | p-değeri yorumu ve nedensellik dili | Kritik | Metinleri düzelt; çip rengini bulgunun niteliğine bağla | Düşük | Evet |
| 4 | Otomatik yönlendirme, ön test ve dallanan yollar | Kritik | Welch varsayılan, Q-Q ve çarpıklık göster, karar notu ekle | Orta | Kısmen |
| 5 | Model paneli: taban çizgisi, ölçümsüz puanlar, üretilmiş ROC | Orta | Taban çizgisi ve PR-AUC ekle; puanları ölçüme bağla veya kaldır | Orta | Kısmen |
| 6 | Sihirbaz etkileşimsiz, eksik sorular | Orta | Gerçek akış; veriden öner, onaylat, "bilmiyorum" ekle | Orta | Evet |
| 7 | Rekabet ve güven | Orta | Denetim izi, deterministik motor ve yerel çalışmayı öne çıkar | Orta | Hayır (konumlandırma) |
| 8 | Kod esnekliği, sürüm ve bakım | Orta | Kullanıcının sütun adlarını kullan; sürümleri sabitle; referans test süiti | Yüksek | Hayır (backend) |
| 9 | Veri gizliliği ve entegrasyon gereksinimleri tanımsız | Orta | Ayrı gereksinim belgesi yaz | Düşük | Hayır |

**Fırsatlar.** Üniversite ve tez kitlesi için eğitim odaklı konumlandırma; denetim izi ve yeniden üretilebilirlik; çevrimdışı çalışma; kavram bazlı, katmanlı açıklamalar ("Neden?" açılır panelleri).

## Yayından Önce Aranan Beş Koşul

1. Gösterilen her sayı gerçek koddan üretilmeli (H, p, ε², ROC dahil); elle yazılmış sayı kalmamalı.
2. Sızıntı denetimi gerçek olmalı ya da kaldırılmalı; SMOTE yalnızca çapraz doğrulamanın içinde, yalnızca eğitim katına uygulanmalı.
3. "Doğrulanmış", "temiz", "tesadüf olasılığı" gibi kesinlik iddiaları kaldırılmalı; Welch varsayılan olmalı; ön test kararları açıkça etiketlenmeli.
4. Kural motoru, R ve SciPy çıktılarıyla karşılaştırılan referans veri setleriyle test edilmeli; kütüphane sürümleri ekranda gösterilmeli.
5. "Karar destek aracıdır, onay sizindir" sınırlaması ve yerel çalışma garantisi yazılı olmalı; veri gizliliği gereksinimleri bu ürün için ayrıca tanımlanmalı.

## Kaynakça

Benjamini, Y., & Hochberg, Y. (1995). Controlling the false discovery rate: A practical and powerful approach to multiple testing. *Journal of the Royal Statistical Society: Series B, 57*(1), 289–300.

Chawla, N. V., Bowyer, K. W., Hall, L. O., & Kegelmeyer, W. P. (2002). SMOTE: Synthetic minority over-sampling technique. *Journal of Artificial Intelligence Research, 16*, 321–357.

Delacre, M., Lakens, D., & Leys, C. (2017). Why psychologists should by default use Welch's *t*-test instead of Student's *t*-test. *International Review of Social Psychology, 30*(1), 92–101.

Holm, S. (1979). A simple sequentially rejective multiple test procedure. *Scandinavian Journal of Statistics, 6*(2), 65–70.

Kruskal, W. H., & Wallis, W. A. (1952). Use of ranks in one-criterion variance analysis. *Journal of the American Statistical Association, 47*(260), 583–621.

Parasuraman, R., & Manzey, D. H. (2010). Complacency and bias in human use of automation: An attentional integration. *Human Factors, 52*(3), 381–410.

Rochon, J., Gondan, M., & Kieser, M. (2012). To test or not to test: Preliminary assessment of normality when comparing two independent samples. *BMC Medical Research Methodology, 12*, Article 81.

Saito, T., & Rehmsmeier, M. (2015). The precision-recall plot is more informative than the ROC plot when evaluating binary classifiers on imbalanced datasets. *PLoS ONE, 10*(3), Article e0118432.

Tomczak, M., & Tomczak, E. (2014). The need to report effect size estimates revisited. *Trends in Sport Sciences, 21*(1), 19–25.

Wasserstein, R. L., & Lazar, N. A. (2016). The ASA statement on *p*-values: Context, process, and purpose. *The American Statistician, 70*(2), 129–133.

Zimmerman, D. W. (2004). A note on preliminary tests of equality of variances. *British Journal of Mathematical and Statistical Psychology, 57*(1), 173–181.
