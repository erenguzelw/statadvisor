# Veri kalitesi ve temizleme kuralları

Bu belge, Veri Kalitesi sayfasının ve `packages/shared/src/quality.ts`, `clean.ts` dosyalarının hangi kuralları,
neden uyguladığını özetler. Arayüz, API, temizleme işlemi, üretilen Python kodu ve rapor aynı kuralları kullanır.

## Üç ayrı sayı

| Sayı | Anlamı | Nasıl belirlenir |
|---|---|---|
| **Geçersiz hücre** | Değer, kullanıcının **doğruladığı** aralığın ya da kategori kümesinin dışında | Yalnızca kullanıcı kuralı kaydettiyse aranır. Gözlenen en küçük/en büyük değerden kural **üretilmez**. |
| **İncelenecek uç değer** | Tukey sınırlarının dışında | Yalnızca **sürekli** ölçümlerde. Veri hatası olduğu varsayılmaz. |
| **Eksik değer** | Boş ya da eksik olarak tanınan hücre | Dosyadan okunurken. |

## Türe göre kontrol

- **Sürekli:** Tukey (Q1 − 1.5·IQR, Q3 + 1.5·IQR) uç değer olarak işaretlenir. Sınırlar, geçersiz sayılan hücreler dışarıda bırakılarak hesaplanır.
- **Sıralı (ör. 1–5 anket maddesi):** Tukey **uygulanmaz**; geçerli uç cevaplar (1 ve 5) silinmez. Yalnızca kullanıcının doğruladığı aralığın dışı (ör. 9) geçersiz sayılır.
- **Kategorik:** Tukey uygulanmaz. Yalnızca kullanıcının doğruladığı kategorilerin dışındaki değerler geçersiz sayılır. Sayısal kodlar (1 = Kadın, 2 = Erkek) kullanıcı tarafından “kategorik” yapılabilir.
- **Ölçek puanı (toplam/ortalama):** Maddelerden ayrı değerlendirilir; beklenen aralık ölçek tanımından (kullanıcının girdiği madde min/maks değerleri) gelir.
- **Kimlik benzeri sütunlar** taranmaz.

Tür çıkarımı kesin değildir: az sayıda farklı tamsayı içeren sütunlar sıralı sayılır, 8–20 farklı tamsayı içerenler sürekli sayılır ve ikisi için de “sayısal kod olabilir” uyarısı gösterilir. Tür, Veri Kalitesi sayfasından düzeltilir.

## Güvenli varsayılanlar

Taramak ile silmek bağımsızdır. Başlangıçta hiçbir kural ve doldurma seçili değildir. Her kural `(sütun, sorun, eylem)` üçlüsüdür:
eylem **eksik işaretle** (hücre) ya da **satırı sil**. Doldurma yalnızca açıkça seçilirse yapılır:
sürekli sütunlarda medyan ya da KNN, sıralı ve kategorik sütunlarda mod (ara değerler geçerli bir cevap olmayabilir).
KNN desteklenmiyorsa (kalan satır sayısı > 5000) sessizce başka yönteme geçilmez; açık hata verilir.

## Satır kaybı eşikleri

Toplam ya da (grup seçiliyse) grup başına satır kaybı **%5** üzerinde inceleme uyarısı, **%10** üzerinde gerekçe ve açık onay ister
(sunucu da zorlar). Bu eşikler **bilimsel eşikler değildir**; ürünün koruyucu tasarım eşikleridir. Birden fazla sütunda işaretli bir
satır kayıpta yalnızca bir kez sayılır.

## Sürüm geçmişi

Ham veri değişmez. Her işlem yeni bir veri sürümü üretir; kurallar, kullanıcı seçimleri, gerekçe ve önceki işlemler `operations.history`
içinde saklanır ve analiz raporunun denetim izine yazılır. Temizlenmiş veri yeniden temizlenirse Tukey sınırları o sürümün verisinden
yeniden hesaplanır; önceki turda uç değerler çıkarıldıysa dağılım daralmıştır ve yeni sınırlar ek gözlemleri işaretleyebilir.

## Kaynaklar

- Tukey, J. W. (1977). *Exploratory Data Analysis*. Addison-Wesley. (Çeyrekler açıklığı sınırları, keşifsel bir işaretleme aracıdır.)
- Hoaglin, D. C., Iglewicz, B., & Tukey, J. W. (1986). Performance of some resistant rules for outlier labeling. *Journal of the American Statistical Association, 81*(396), 991–999.
- Schafer, J. L., & Graham, J. W. (2002). Missing data: Our view of the state of the art. *Psychological Methods, 7*(2), 147–177. (Eksik veri mekanizmaları ve doldurma/silme tercihleri.)

Bu araç taramanın verinin doğru olduğunu garanti etmediğini, eksiklik mekanizmasını (MCAR vb.) sınamadığını ve araştırmacının
kararının yerine geçmediğini açıkça belirtir.

## Geçerli kategoriler, tür onayı ve eksiklik tanılaması

- **Geçerli kategoriler:** Kategorik bir sütunun gözlenen değerleri sayılarıyla listelenir (`GET /api/datasets/:id/levels?column=`); kullanıcı geçerli olanları işaretler. Sistem önceden işaretleme yapmaz; kural yalnızca kullanıcı Kaydet'e bastığında “doğrulanmış” sayılır.
- **Tür onayı:** Dosyadan çıkarılan tür kesin değildir (kategori kodu ile sıralı ölçek dosyadan ayırt edilemez). Kullanıcı türü kaydedene kadar sütun tabloda “doğrulanmadı” rozetiyle işaretli kalır (`typeConfirmed`). Ad ipucu (cinsiyet, grup, bölüm…) taşıyan ve az sayıda tamsayı kodu içeren sütunlar kategorik sayılır; bu da onay bekler.
- **Eksiklik tanılaması:** Her eksikli sütunun eksik-gösterge değişkeni diğer sütunlarla karşılaştırılır (sayısal: Mann–Whitney U, kategorik: ki-kare; Holm düzeltmesi, α = 0,05). Sonuç “MCAR ile uyumsuz olabilir” ya da “çelişki görülmedi, MCAR kanıtlanmadı”dır. Little'ın MCAR testi uygulanmaz.
