# Akıllı Hipotez Testi ve Model Seçim Danışmanı — Tanıtım Videosu

> Kaynak: `danisman-tanitim.mp4` · Süre: ~60 sn · 1920×1080
> Bu döküm, videodaki ekran metinleri ve görsellerden çıkarılmıştır.

---

## 1. Açılış (00:00 – 00:06)

**Akıllı Hipotez Testi**
**ve Model Seçim Danışmanı**

*Veri biliminde doğru kararı, doğru anda verin.*

---

## 2. Problem (00:07 – 00:09)

### Hangi test? Hangi model?

*Karar yorgunluğu ve gözden kaçan teknik hatalar…*

Ekranda uçuşan sorular: `t-testi?` · `Ki-kare?` · `ANOVA?` · `Mann-Whitney U?` · `Kruskal-Wallis?` · `Lojistik Regresyon?` · `Random Forest?` · `XGBoost?`

---

## 3. Çözüm (00:10 – 00:11)

### Çözüm: **tek bir akıllı danışman.**

---

## 4. Özellikler

### Özellik 02 — Karar Sihirbazı (00:12 – 00:17)

*Teknik terim bilmeden, birkaç basit soruyla doğru teste.*

| Soru | Cevap |
|---|---|
| 1. Amacınız nedir? | ✓ Grupları karşılaştırmak |
| 2. Kaç grubu karşılaştırıyorsunuz? | ✓ 3 grup |
| 3. Hedef değişkeniniz? | ✓ Sürekli (sayısal) |

Karar ağacı: **Amaç?** → İlişki / **Karşılaştırma** / Tahmin → 2 grup / **3+ grup** → ✅ **Tek Yönlü ANOVA**

---

### Özellik 01 — Otomatik Varsayım Kontrolü (00:18 – 00:24)

*Normallik ve varyans homojenliği arka planda test edilir.*

- ❌ **Shapiro-Wilk** `p = 0.012` — Veri normal dağılmıyor
- ✅ **Levene** `p = 0.41` — Varyanslar homojen
- ~~ANOVA~~ → **Kruskal-Wallis**
  *Varsayım sağlanmadı → non-parametrik alternatife otomatik yönlendirme*

Grafik: Verinizin histogramı ile beklenen normal dağılım eğrisinin karşılaştırması.

---

### Özellik 03 — İnsan Dilinde Sonuçlar (00:25 – 00:29)

*Rakamlar değil, eyleme dönüştürülebilir net cümleler.*

| Çıktı | Otomatik yorum |
|---|---|
| `p = 0.003` | Gruplar arasında istatistiksel olarak anlamlı bir fark var. |
| `F1 (azınlık) = 0.42` | Modeliniz azınlık sınıfını tahmin etmekte zorlanıyor. |

---

### Özellik 04 — Hazır Kod Üretimi (00:30 – 00:35)

*Jupyter'da hemen çalıştırılabilir, açıklamalı kod parçaları.*

```python
# analiz.py
from scipy import stats

# Normallik sağlanmadı → non-parametrik test
h, p = stats.kruskal(grup_a, grup_b, grup_c)

print(f"H = {h:.2f}, p = {p:.4f}")
if p < 0.05:
    print("Gruplar arasında anlamlı fark var.")
```

Desteklenen araçlar: **Python · SciPy** · **Statsmodels** · **Scikit-learn** · **R**

*Kopyala → yapıştır → çalıştır.*

---

### Özellik 05 · 06 — Akıllı Grafikler + Tuzak Uyarıları (00:36 – 00:42)

*Doğru görselleştirme ve zamanında kırmızı bayrak.*

Grafikler: Grup A / B / C kutu grafikleri · ROC eğrisi (**AUC = 0.91**)

| 🚩 Uyarı | Öneri |
|---|---|
| Çoklu karşılaştırma (p-hacking riski) | Bonferroni düzeltmesi uygula |
| Dengesiz veri seti (%92 / %8) | SMOTE ile yeniden örnekle |
| Aşırı öğrenme ihtimali | Çapraz doğrulama kullan |

---

### Özellik 07 — Karşılaştırmalı Model Paneli (00:43 – 00:47)

*Tek bir "en iyi" yok: artılar ve eksiler yan yana.*

| Model | Hız | Yorumlanabilirlik | Doğruluk |
|---|---:|---:|---:|
| Lojistik Regresyon | 95 | 95 | 78 |
| Random Forest ★ *Dengeli seçim* | 62 | 48 | 89 |
| XGBoost | 70 | 35 | 91 |

---

### Özellik 08 · 09 · 10 — Temiz Veri, Hızlı Rapor, Size Uygun Dil (00:48 – 00:54)

- **Özellik 08 — Aykırı & Eksik Veri:** Sorunlu hücreler işaretlenir ve düzeltilir.
  *Önerilen: medyan ile doldurma + IQR filtresi*
- **Özellik 09 — Tek Tıkla Rapor:** APA stili · PDF · HTML çıktısı (`rapor.pdf` %15 → %100 ✓)
- **Özellik 10 — Uzmanlık Seviyesi:** *Yeni Başlayan ↔ Uzman* anahtarı
  - **Yeni Başlayan:** "Üç grup arasında gerçek bir fark var; tesadüf olma ihtimali çok düşük."
  - **Uzman:** `H(2) = 11.6` · `p = .003, ε² = 0.21`

---

## 5. Slogan (00:54 – 00:56)

**Doğru test. Doğru model. Tek asistan.**

---

## 6. Kapanış (00:57 – 01:00)

**Akıllı Hipotez Testi ve Model Seçim Danışmanı**

*Karar yorgunluğuna son. Analize odaklanın.*
