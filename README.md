# StatAdvisor AI

Akıllı hipotez testi ve model seçim danışmanının arayüzü. Tasarım kaynakları `ui/` klasöründedir; React uygulaması `apps/web` altındadır.

## Çalıştırma

```bash
npm install
npm run dev          # http://localhost:5173
```

| Komut | Ne yapar |
|---|---|
| `npm run build` | Tip denetimi + üretim derlemesi (`apps/web/dist`) |
| `npm run preview` | Derlemeyi yerelde sunar |
| `npm run typecheck` / `npm run lint` | TypeScript ve ESLint |
| `npm test` | Vitest birim testleri |
| `npm run e2e` | Playwright uçtan uca + axe erişilebilirlik testleri (ilk seferde `npx playwright install chromium`) |

Uygulama çalışırken internet gerekmez: yazı tipleri (`@fontsource`) ve ikonlar (`lucide-react`) pakete gömülüdür.

## Yapı

```
apps/web/src/
  styles/tokens.css     Tasarım tokenları (renk, tip ölçeği, köşe, gölge) — DESIGN.md'den
  components/ui/        Ürünü bilmeyen jenerik bileşenler (Button, Panel, Tabs, CodeBlock, DataTable…)
  components/layout/    AppShell, Sidebar, TopBar, PageHeader
  components/charts/    SVG grafikler (histogram + normal eğri, kutu grafiği, ROC)
  components/domain/    StatAdvisor'a özgü bileşenler (varsayım kartı, model kartı, kırmızı bayrak…)
  features/             Dört sayfa: karar-sihirbazi, model-karsilastirma, veri-kalitesi, kod-rapor
  data/                 Domain tipleri, örnek veri (mocks) ve TanStack Query hook'ları
  context/AppContext    Yeni Başlayan / Uzman seviyesi ve seçili veri seti
```

- Sayfalar veriye yalnızca `data/queries.ts` içindeki hook'larla erişir. Node/SQLite API eklendiğinde yalnızca bu dosyadaki `mock()` çağrıları gerçek istekle değişir.
- Geliştirme ortamında `/bilesenler` adresi tüm jenerik bileşenlerin varyantlarını gösterir.
- Sınıf birleştirmek için `cn()` kullanın (`lib/cn.ts`); çakışan Tailwind sınıflarını doğru çözer.
