# LMS Gereksinim Belirtimi

Bu belge, [lms_en_etkili_10_ozellik.md](lms_en_etkili_10_ozellik.md) dosyasında tanımlanan 10 modülü temel alarak sistemin fonksiyonel ve fonksiyonel olmayan gereksinimlerini tanımlar.

## 1. Kapsam ve Varsayımlar

- **Kullanıcı rolleri:**
  - **Öğrenci:** Kurslara kayıt olur ve öğrenir.
  - **Eğitmen:** İçerik, sınav ve ödev hazırlar, değerlendirme yapar.
  - **Yönetici:** Kullanıcıları, kursları ve sistem ayarlarını yönetir.
- **Platform:** Web tabanlı, mobil uyumlu (responsive) uygulama. Yerel mobil uygulama kapsam dışıdır.
- **Dil:** Arayüz Türkçedir. Altyapı çoklu dil desteğine hazır kurulur.
- **Sürümleme:** Gereksinimler iki sürüme ayrılır. **S1 (MVP)** ilk sürümdür; **S2** sonraki sürümü ifade eder.
- **Öncelik (MoSCoW):**
  - **M** (Must): Olmazsa olmaz.
  - **S** (Should): Olmalı.
  - **C** (Could): Olabilir.

> Varsayımlar (hedef kitle, kullanıcı sayısı, barındırma ortamı) netleştikçe ölçülebilir değerler güncellenmelidir.

---

## 2. Fonksiyonel Gereksinimler

### 2.0 Kimlik Doğrulama ve Kullanıcı Yönetimi (ortak altyapı)

| ID | Gereksinim | Öncelik | Sürüm |
|---|---|---|---|
| FR-AUTH-01 | Kullanıcı e-posta ve parola ile kayıt olabilmeli, e-posta doğrulaması yapılmalıdır. | M | S1 |
| FR-AUTH-02 | Kullanıcı giriş/çıkış yapabilmeli, parolasını e-posta bağlantısıyla sıfırlayabilmelidir. | M | S1 |
| FR-AUTH-03 | Sistem rol tabanlı yetkilendirme (Öğrenci, Eğitmen, Yönetici) uygulamalıdır. | M | S1 |
| FR-AUTH-04 | Kullanıcı profil bilgilerini (ad, fotoğraf, bildirim tercihleri) düzenleyebilmelidir. | S | S1 |
| FR-AUTH-05 | Yönetici kullanıcı oluşturabilmeli, rol atayabilmeli, hesapları askıya alabilmelidir. | M | S1 |
| FR-AUTH-06 | Kurumsal tek oturum açma (SSO: Google / Microsoft / SAML) desteklenmelidir. | C | S2 |

### 2.1 Kişisel Öğrenme Paneli

| ID | Gereksinim | Öncelik | Sürüm |
|---|---|---|---|
| FR-DASH-01 | Öğrenci, kayıtlı olduğu kursları ilerleme yüzdeleriyle birlikte tek ekranda görmelidir. | M | S1 |
| FR-DASH-02 | Panel, son kalınan derse tek tıkla dönüş sağlayan "Devam Et" kartı sunmalıdır. | M | S1 |
| FR-DASH-03 | Panel, önümüzdeki 7 gün içindeki ödev, sınav ve canlı dersleri listelemelidir. | M | S1 |
| FR-DASH-04 | Panel, okunmamış bildirim ve duyuruları özetlemelidir. | S | S1 |
| FR-DASH-05 | Eğitmen paneli, verdiği kursları, bekleyen değerlendirmeleri ve öğrenci sayılarını göstermelidir. | M | S1 |
| FR-DASH-06 | Öğrenci panel kartlarının sırasını ve görünürlüğünü kişiselleştirebilmelidir. | C | S2 |

### 2.2 Kurs ve Eğitim İçerikleri

| ID | Gereksinim | Öncelik | Sürüm |
|---|---|---|---|
| FR-CRS-01 | Eğitmen Kurs → Modül → Ders hiyerarşisinde içerik oluşturabilmeli, düzenleyebilmeli, silebilmelidir. | M | S1 |
| FR-CRS-02 | Ders içeriği video, PDF, sunum, zengin metin ve dış bağlantı türlerini desteklemelidir. | M | S1 |
| FR-CRS-03 | Eğitmen modül ve dersleri sürükle-bırak ile yeniden sıralayabilmelidir. | S | S1 |
| FR-CRS-04 | Kurs, "sıralı" (önceki ders bitmeden sonraki açılmaz) veya "serbest" ilerleme modunda yayınlanabilmelidir. | M | S1 |
| FR-CRS-05 | Kurslar taslak / yayında / arşiv durumlarına sahip olmalıdır. | M | S1 |
| FR-CRS-06 | Öğrenci kurs kataloğunu arayabilmeli, filtreleyebilmeli ve kursa kayıt olabilmelidir (açık kayıt veya eğitmen onaylı). | M | S1 |
| FR-CRS-07 | Bir ders, öğrenci tarafından "tamamlandı" olarak işaretlenebilmeli veya video izlenme oranına (ör. %90) göre otomatik tamamlanmalıdır. | M | S1 |
| FR-CRS-08 | Video oynatıcı kaldığı yerden devam etmeli ve oynatma hızı ayarı sunmalıdır. | S | S1 |
| FR-CRS-09 | Eğitmen kurs için duyuru yayınlayabilmelidir. | S | S1 |
| FR-CRS-10 | Öğrenci derslerde kişisel not alabilmelidir. | C | S2 |

### 2.3 Kişiselleştirilmiş Öğrenme Yolları

| ID | Gereksinim | Öncelik | Sürüm |
|---|---|---|---|
| FR-PATH-01 | Eğitmen kurs ve dersler için ön koşul tanımlayabilmelidir. | S | S2 |
| FR-PATH-02 | Eğitmen içeriklere zorluk seviyesi (başlangıç / orta / ileri) ve beceri etiketi atayabilmelidir. | S | S2 |
| FR-PATH-03 | Sistem, seviye belirleme sınavı sonucuna göre öğrenciye başlangıç noktası önermelidir. | S | S2 |
| FR-PATH-04 | Sistem, sınavlarda düşük başarı gösterilen konular için tekrar içerikleri önermelidir. | S | S2 |
| FR-PATH-05 | Öğrenci kendi hedefini (ör. "Python temelleri, 4 hafta") belirleyerek önerilen bir çalışma planı alabilmelidir. | C | S2 |

### 2.4 Sınav ve Kendini Değerlendirme

| ID | Gereksinim | Öncelik | Sürüm |
|---|---|---|---|
| FR-QZ-01 | Eğitmen çoktan seçmeli, çoklu seçim, doğru/yanlış, boşluk doldurma ve açık uçlu soru oluşturabilmelidir. | M | S1 |
| FR-QZ-02 | Eğitmen soruları konu ve zorluk etiketiyle bir soru bankasında saklayabilmelidir. | S | S1 |
| FR-QZ-03 | Sınav ayarları: süre sınırı, deneme hakkı, açılış/kapanış tarihi, soru ve şık karıştırma, geçme notu. | M | S1 |
| FR-QZ-04 | Kapalı uçlu sorular otomatik puanlanmalı, sonuç anında gösterilmelidir. | M | S1 |
| FR-QZ-05 | Açık uçlu sorular eğitmen tarafından manuel puanlanabilmelidir. | M | S1 |
| FR-QZ-06 | Sınav sonrası doğru cevaplar ve açıklamalar, eğitmenin belirlediği zamanda gösterilmelidir. | M | S1 |
| FR-QZ-07 | Süreli sınavda süre dolduğunda cevaplar otomatik teslim edilmelidir. | M | S1 |
| FR-QZ-08 | Bağlantı kopmasına karşı cevaplar düzenli aralıklarla sunucuya kaydedilmelidir. | M | S1 |
| FR-QZ-09 | Öğrenci, sonuçlarını konu bazlı başarı dağılımıyla görebilmelidir. | S | S1 |
| FR-QZ-10 | Eğitmen soru bazında istatistik (doğru oranı, ayırt edicilik) görebilmelidir. | C | S2 |

### 2.5 Yapay Zekâ Destekli Eğitim Asistanı

| ID | Gereksinim | Öncelik | Sürüm |
|---|---|---|---|
| FR-AI-01 | Öğrenci, kayıtlı olduğu kursun içerikleri hakkında doğal dilde soru sorabilmelidir. | S | S2 |
| FR-AI-02 | Asistan yanıtları kurs materyallerine dayanmalı (RAG) ve kaynak dersi/sayfayı göstermelidir. | S | S2 |
| FR-AI-03 | Asistan bir dersi özetleyebilmeli, kavramı örnekle açıklayabilmeli, alıştırma sorusu üretebilmelidir. | S | S2 |
| FR-AI-04 | Asistan, aktif bir sınav sırasında o sınavın sorularına yanıt vermemelidir. | M | S2 |
| FR-AI-05 | Eğitmen asistanı kurs bazında açıp kapatabilmeli ve kullanım kayıtlarını görebilmelidir. | S | S2 |
| FR-AI-06 | Öğrenci yanıtları "faydalı / hatalı" olarak geri bildirimle işaretleyebilmelidir. | C | S2 |

### 2.6 Ödev ve Proje Yönetimi

| ID | Gereksinim | Öncelik | Sürüm |
|---|---|---|---|
| FR-ASG-01 | Eğitmen açıklama, ek dosya, teslim tarihi ve puanlama ölçütü (rubrik) ile ödev oluşturabilmelidir. | M | S1 |
| FR-ASG-02 | Öğrenci dosya yükleyerek veya metin girerek ödev teslim edebilmelidir. | M | S1 |
| FR-ASG-03 | Geç teslim politikası tanımlanabilmeli (kabul etme / puan kesintisiyle kabul) ve geç teslimler işaretlenmelidir. | M | S1 |
| FR-ASG-04 | Eğitmen teslimleri puanlayıp yazılı geri bildirim verebilmeli, öğrenci bunu görebilmelidir. | M | S1 |
| FR-ASG-05 | Eğitmen yeniden teslim izni verebilmeli; tüm teslim sürümleri saklanmalıdır. | S | S1 |
| FR-ASG-06 | Grup ödevleri: eğitmen grup oluşturabilmeli, tek teslim tüm grup için geçerli olmalıdır. | S | S2 |
| FR-ASG-07 | Toplu not dışa aktarımı (CSV/Excel) sağlanmalıdır. | S | S1 |
| FR-ASG-08 | İntihal kontrolü entegrasyonu. | C | S2 |

### 2.7 Öğrenme İlerlemesi ve Performans Analizi

| ID | Gereksinim | Öncelik | Sürüm |
|---|---|---|---|
| FR-ANL-01 | Sistem ders tamamlama, sınav sonucu ve ödev notlarını kullanıcı bazında kaydetmelidir. | M | S1 |
| FR-ANL-02 | Öğrenci kurs bazında tamamlama oranı, not ortalaması ve konu bazlı başarıyı grafiklerle görebilmelidir. | M | S1 |
| FR-ANL-03 | Eğitmen sınıf genelinde ilerleme ve not dağılımını görebilmeli, geride kalan öğrencileri listeleyebilmelidir. | M | S1 |
| FR-ANL-04 | Sistem çalışma süresini (aktif ders görüntüleme süresi) yaklaşık olarak ölçmelidir. | S | S2 |
| FR-ANL-05 | Güçlü ve zayıf konular otomatik belirlenip öğrenciye gösterilmelidir. | S | S2 |
| FR-ANL-06 | Raporlar CSV/PDF olarak dışa aktarılabilmelidir. | C | S2 |

### 2.8 Etkileşim ve Tartışma Ortamı

| ID | Gereksinim | Öncelik | Sürüm |
|---|---|---|---|
| FR-DIS-01 | Her kursun konu başlıklı bir tartışma forumu olmalıdır. | S | S2 |
| FR-DIS-02 | Kullanıcılar gönderi oluşturabilmeli, yanıtlayabilmeli, beğenebilmelidir. | S | S2 |
| FR-DIS-03 | Eğitmen bir yanıtı "kabul edilen cevap" olarak işaretleyebilmeli, gönderileri sabitleyebilmelidir. | S | S2 |
| FR-DIS-04 | Eğitmen ve yönetici uygunsuz içeriği gizleyebilmeli/silebilmeli; kullanıcılar içerik raporlayabilmelidir. | M | S2 |
| FR-DIS-05 | Ders sayfasında o derse bağlı soru-cevap alanı bulunmalıdır. | C | S2 |

### 2.9 Takvim, Hatırlatmalar ve Bildirimler

| ID | Gereksinim | Öncelik | Sürüm |
|---|---|---|---|
| FR-NOT-01 | Ödev, sınav ve canlı ders tarihleri öğrencinin kişisel takviminde otomatik görünmelidir. | M | S1 |
| FR-NOT-02 | Takvim ay / hafta / liste görünümleri sunmalıdır. | S | S1 |
| FR-NOT-03 | Sistem yaklaşan teslimler için uygulama içi ve e-posta hatırlatması göndermelidir (varsayılan: 24 saat önce). | M | S1 |
| FR-NOT-04 | Yeni not, geri bildirim, duyuru ve forum yanıtı olaylarında bildirim üretilmelidir. | M | S1 |
| FR-NOT-05 | Kullanıcı bildirim kanallarını ve türlerini tercihlerinden yönetebilmelidir. | S | S1 |
| FR-NOT-06 | Takvim iCal (.ics) ile dış takvimlere aktarılabilmelidir. | C | S2 |

### 2.10 Sertifika, Rozet ve Başarı Yönetimi

| ID | Gereksinim | Öncelik | Sürüm |
|---|---|---|---|
| FR-CRT-01 | Kurs tamamlama koşulları (tüm dersler + geçme notu) sağlandığında PDF sertifika otomatik üretilmelidir. | S | S2 |
| FR-CRT-02 | Her sertifikanın benzersiz kodu ve herkese açık doğrulama sayfası olmalıdır. | S | S2 |
| FR-CRT-03 | Eğitmen/yönetici rozet tanımlayabilmeli ve verilme kurallarını belirleyebilmelidir. | C | S2 |
| FR-CRT-04 | Öğrenci kazandığı sertifika ve rozetleri profilinde görebilmeli, bağlantı ile paylaşabilmelidir. | C | S2 |

### 2.11 Yönetim Paneli

| ID | Gereksinim | Öncelik | Sürüm |
|---|---|---|---|
| FR-ADM-01 | Yönetici tüm kursları ve kullanıcıları listeleyip arayabilmelidir. | M | S1 |
| FR-ADM-02 | Yönetici CSV ile toplu kullanıcı içe aktarabilmeli ve kursa toplu kayıt yapabilmelidir. | S | S1 |
| FR-ADM-03 | Yönetici sistem geneli kullanım istatistiklerini (aktif kullanıcı, kurs sayısı, depolama) görebilmelidir. | S | S2 |
| FR-ADM-04 | Kritik işlemler (rol değişikliği, not değişikliği, silme) denetim kaydına (audit log) yazılmalıdır. | M | S1 |

---

## 3. Fonksiyonel Olmayan Gereksinimler

### 3.1 Performans

| ID | Gereksinim |
|---|---|
| NFR-PERF-01 | Sayfaların %95'i, normal yük altında 2 saniyenin altında etkileşime hazır olmalıdır (4G bağlantı). |
| NFR-PERF-02 | API isteklerinin %95'i 300 ms altında yanıt vermelidir (dosya yükleme ve AI hariç). |
| NFR-PERF-03 | Video içerikleri CDN üzerinden, uyarlanabilir bit hızıyla (HLS) sunulmalı; oynatma 3 saniye içinde başlamalıdır. |
| NFR-PERF-04 | AI asistanı ilk yanıt parçasını 3 saniye içinde akış (streaming) olarak göstermeye başlamalıdır. |
| NFR-PERF-05 | Sistem, S1'de 500 eşzamanlı kullanıcıyı ve aynı anda 200 kişinin girdiği bir sınavı performans kaybı olmadan desteklemelidir. |

### 3.2 Ölçeklenebilirlik

| ID | Gereksinim |
|---|---|
| NFR-SCL-01 | Uygulama sunucuları durumsuz (stateless) olmalı ve yatay ölçeklenebilmelidir. |
| NFR-SCL-02 | Dosyalar uygulama sunucusunda değil, nesne depolamada (S3 uyumlu) tutulmalıdır. |
| NFR-SCL-03 | Bildirim, e-posta, sertifika üretimi ve video işleme gibi uzun işler arka plan kuyruğunda çalışmalıdır. |
| NFR-SCL-04 | Mimari, 10.000 kayıtlı kullanıcıya yeniden tasarım gerektirmeden büyüyebilmelidir. |

### 3.3 Güvenlik

| ID | Gereksinim |
|---|---|
| NFR-SEC-01 | Tüm trafik HTTPS (TLS 1.2+) üzerinden olmalıdır. |
| NFR-SEC-02 | Parolalar güçlü ve tuzlu bir algoritmayla (Argon2id veya bcrypt) saklanmalıdır; parola politikası en az 8 karakter olmalıdır. |
| NFR-SEC-03 | Yetkilendirme sunucu tarafında her istekte kontrol edilmelidir. Öğrenci yalnızca kayıtlı olduğu kursun verisine erişebilmelidir. |
| NFR-SEC-04 | OWASP Top 10 risklerine (SQL enjeksiyonu, XSS, CSRF, IDOR vb.) karşı önlem alınmalıdır. |
| NFR-SEC-05 | Giriş ve parola sıfırlama uç noktalarında hız sınırlama (rate limiting) ve başarısız deneme kilidi uygulanmalıdır. |
| NFR-SEC-06 | Yüklenen dosyalar tür ve boyut (varsayılan en fazla 100 MB) kontrolünden geçmeli, kötü amaçlı yazılım taramasına tabi tutulmalıdır. |
| NFR-SEC-07 | Özel dosyalara erişim, süreli imzalı URL'lerle sağlanmalıdır. |
| NFR-SEC-08 | Yönetici ve eğitmen hesaplarında iki faktörlü doğrulama (2FA) desteklenmelidir (S2). |

### 3.4 Gizlilik ve Mevzuat

| ID | Gereksinim |
|---|---|
| NFR-PRV-01 | Sistem 6698 sayılı KVKK'ya uygun olmalıdır: aydınlatma metni, açık rıza kaydı, veri envanteri. |
| NFR-PRV-02 | Kullanıcı kişisel verilerini dışa aktarabilmeli ve hesabının silinmesini talep edebilmelidir. |
| NFR-PRV-03 | AI asistanına gönderilen veriler kişisel tanımlayıcılardan arındırılmalıdır. Sağlayıcının verileri model eğitimi için kullanmadığı sözleşmeyle güvence altına alınmalıdır. |
| NFR-PRV-04 | Kişisel veriler Türkiye'de veya KVKK'nın yurt dışına aktarım şartlarını karşılayan bir ortamda barındırılmalıdır. |

### 3.5 Erişilebilirlik ve Kullanılabilirlik

| ID | Gereksinim |
|---|---|
| NFR-UX-01 | Arayüz WCAG 2.1 AA düzeyine uygun olmalıdır: klavye ile gezinme, ekran okuyucu etiketleri, yeterli renk kontrastı. |
| NFR-UX-02 | Videolar için altyazı desteği olmalıdır. |
| NFR-UX-03 | Arayüz 360 px genişlikten masaüstüne kadar duyarlı (responsive) çalışmalıdır. |
| NFR-UX-04 | Yeni bir öğrenci, eğitim almadan kursa kayıt olup ilk dersi 3 dakika içinde başlatabilmelidir (kullanılabilirlik testiyle doğrulanır). |
| NFR-UX-05 | Hata mesajları Türkçe, anlaşılır olmalı ve kullanıcıya çözüm yolu göstermelidir. |
| NFR-UX-06 | Açık ve koyu tema desteklenmelidir (S2). |

### 3.6 Güvenilirlik ve Kullanılabilirlik Süresi

| ID | Gereksinim |
|---|---|
| NFR-REL-01 | Aylık erişilebilirlik en az %99,5 olmalıdır (planlı bakım hariç). |
| NFR-REL-02 | Veritabanı günlük otomatik yedeklenmeli, yedekler en az 30 gün saklanmalıdır. RPO ≤ 24 saat, RTO ≤ 4 saat olmalıdır. |
| NFR-REL-03 | Sınav cevapları ve ödev teslimleri hiçbir koşulda kaybolmamalıdır: işlemsel (transactional) kayıt yapılmalı ve öğrenciye teslim onayı verilmelidir. |
| NFR-REL-04 | AI servisi kullanılamadığında sistemin geri kalanı etkilenmemeli, kullanıcıya bilgi mesajı gösterilmelidir. |

### 3.7 Bakım Yapılabilirlik ve Geliştirme

| ID | Gereksinim |
|---|---|
| NFR-MNT-01 | İş mantığı için otomatik test kapsamı en az %70 olmalıdır. Kritik akışlar (giriş, sınav teslimi, ödev teslimi) uçtan uca test edilmelidir. |
| NFR-MNT-02 | Her değişiklik CI hattında lint, test ve derlemeden geçmelidir. |
| NFR-MNT-03 | API, OpenAPI ile belgelenmelidir. |
| NFR-MNT-04 | Veritabanı şema değişiklikleri sürümlü migration'larla yapılmalıdır. |
| NFR-MNT-05 | Modüller, bir modüldeki değişiklik diğerlerini kırmayacak biçimde gevşek bağlı tasarlanmalıdır. |

### 3.8 İzlenebilirlik (Observability)

| ID | Gereksinim |
|---|---|
| NFR-OBS-01 | Uygulama yapılandırılmış log üretmeli; hatalar merkezi bir hata izleme aracına raporlanmalıdır. |
| NFR-OBS-02 | Yanıt süresi, hata oranı ve kuyruk uzunluğu metrikleri izlenmeli, eşik aşımında uyarı üretilmelidir. |
| NFR-OBS-03 | Loglarda parola, token ve kişisel veri bulunmamalıdır. |

### 3.9 Uyumluluk ve Birlikte Çalışabilirlik

| ID | Gereksinim |
|---|---|
| NFR-CMP-01 | Chrome, Edge, Firefox ve Safari'nin son iki ana sürümü ile mobil Chrome/Safari desteklenmelidir. |
| NFR-CMP-02 | İçerik paketleri için SCORM 1.2 / xAPI içe aktarımı desteklenmelidir (S2). |
| NFR-CMP-03 | Dış araç entegrasyonu için LTI 1.3 desteği sağlanmalıdır (S2). |

### 3.10 Yerelleştirme

| ID | Gereksinim |
|---|---|
| NFR-L10N-01 | Tüm arayüz metinleri kaynak dosyalarında tutulmalı; yeni dil eklemek kod değişikliği gerektirmemelidir. |
| NFR-L10N-02 | Tarih, saat ve sayı biçimleri yerel ayara göre gösterilmelidir. Saat dilimi varsayılanı Europe/Istanbul olmalıdır. |

### 3.11 AI'ya Özgü Kalite Gereksinimleri

| ID | Gereksinim |
|---|---|
| NFR-AI-01 | Asistan, yanıtı kurs materyalinde bulamadığında bunu açıkça belirtmeli ve uydurma bilgi vermemelidir. |
| NFR-AI-02 | Kullanıcı başına günlük istek kotası uygulanmalı ve maliyet izlenmelidir. |
| NFR-AI-03 | Zararlı veya konu dışı istekler filtrelenmelidir. |
| NFR-AI-04 | Asistan, temsilî bir soru setiyle düzenli olarak değerlendirilmelidir (doğruluk ve kaynak gösterme oranı). |

---

## 4. S1 (MVP) Özeti

S1 kapsamındaki modüller şunlardır:

- Kimlik doğrulama
- Kişisel öğrenme paneli
- Kurs ve içerik yönetimi
- Sınav
- Ödev
- Temel analitik
- Takvim ve bildirimler
- Temel yönetim paneli

S1'de hedeflenen fonksiyonel olmayan gereksinimler:

- **Güvenlik:** NFR-SEC-01 ile NFR-SEC-07 arası.
- **Gizlilik:** KVKK uyumu (NFR-PRV-01 ile NFR-PRV-04 arası).
- **Erişilebilirlik:** WCAG 2.1 AA.
- **Performans:** 500 eşzamanlı kullanıcı.
- **Güvenilirlik:** %99,5 erişilebilirlik ve kayıpsız teslim garantisi.

S2'ye bırakılan modüller şunlardır:

- AI asistanı
- Kişiselleştirilmiş öğrenme yolları
- Forum
- Sertifika ve rozetler
- SSO, SCORM ve LTI entegrasyonları

## 5. Açık Sorular

1. Hedef kitle nedir: üniversite, kurumsal eğitim veya bireysel kullanıcılar? Bu seçim kayıt modelini ve SSO önceliğini etkiler.
2. Beklenen kullanıcı sayısı ve en yoğun eşzamanlı sınav büyüklüğü nedir?
3. Canlı ders aracı (Zoom, Google Meet, BigBlueButton) entegre mi edilecek, yoksa yalnızca bağlantı olarak mı eklenecek?
4. Ücretli kurs ve ödeme altyapısı kapsamda mı?
5. Barındırma ortamı ve veri yerleşimi kısıtları nelerdir?
