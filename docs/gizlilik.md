# Veri gizliliği (KVKK notu)

- **Yerel çalışma:** Hesaplamalar, kod ve rapor üretimi bu bilgisayardaki sunucuda yapılır. Uygulama dış hizmete veri göndermez; çalışma anında internet gerekmez.
- **Ağ erişimi:** Sunucu yalnızca `127.0.0.1` dinler; başka cihazlar erişemez. Yerel olmayan Host ve yabancı Origin istekleri reddedilir.
- **Saklama:** Yüklenen CSV'ler ve analizler `apps/api/.data/` altındaki SQLite dosyasında tutulur. Dosya adları diskte kullanılmaz.
- **Silme:** Arayüzden veri kümesi/analiz silinebilir; `npm run reset-data` her şeyi siler (önce yedek alır — yedeği de silmeyi unutmayın).
- **Kişisel veri:** Yüklediğiniz veride kişisel veri varsa sorumluluk veri sorumlusundadır (anonimleştirme önerilir). Uygulama otomatik anonimleştirme yapmaz.
- **Yedekler:** `apps/api/backups/` şifresiz saklanır; paylaşmadan önce içeriğini kontrol edin.
