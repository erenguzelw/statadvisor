import { AbsoluteFill, Sequence } from 'remotion';
import { Background } from '../ui';
import { FPS } from '../theme';
import { Giris, Katalog, Kapanis, KlipSahnesi, parcaKare, type Altyazi, type Parca } from './bilesenler';

type Klip = { klip: string; parcalar: Parca[]; no: string; ad: string; analiz: string; altyazilar: Altyazi[] };

// Ham klip süreleri (sn): kalite 36.4 · karar 52.1 · regresyon 33.3 · lojistik 27.7 · model 129.0 · kod 26.6
const KLIPLER: Klip[] = [
  {
    klip: 'kalite.webm', no: '1', ad: 'Veri kalitesi', analiz: 'aykırı değer (Tukey) · eksik değer',
    parcalar: [{ bas: 2.5, son: 36.4, hiz: 1.7 }],
    altyazilar: [
      { t0: 0.5, t1: 6, metin: 'Önce taranır, sonra siz karar verirsiniz' },
      { t0: 6.5, t1: 13.5, metin: 'Aykırı değer (Tukey 1.5×IQR), eksik değer ve geçersiz hücre ayrı sayılır' },
      { t0: 14, t1: 19.5, metin: 'Hiçbir hücre kendiliğinden silinmez; ham veri değişmez' },
    ],
  },
  {
    klip: 'karar.webm', no: '2', ad: 'Karar sihirbazı', analiz: 'Mann-Whitney U · varsayım kontrolü',
    parcalar: [{ bas: 3, son: 52, hiz: 1.44 }],
    altyazilar: [
      { t0: 0.5, t1: 9, metin: 'Önce test önerilir: normallik sağlanmadığı için Welch t yerine Mann-Whitney U' },
      { t0: 9.5, t1: 17, metin: 'Normallik ve varyans eşitliği veriden hesaplanır (Shapiro-Wilk, Levene)' },
      { t0: 17.5, t1: 26, metin: 'Tanımlayıcı istatistikler ve histogram, kararın gerekçesini gösterir' },
      { t0: 26.5, t1: 31, metin: 'Sonuç sade dille ve APA cümlesiyle yorumlanır' },
      { t0: 31.5, t1: 33.7, metin: 'Tek tıkla kod ve rapora kaydedilir' },
    ],
  },
  {
    klip: 'regresyon.webm', no: '3', ad: 'Doğrusal regresyon', analiz: 'katsayılar · R² · tanılar',
    parcalar: [{ bas: 1.5, son: 33.2, hiz: 1.6 }],
    altyazilar: [
      { t0: 0.5, t1: 7, metin: 'Sonucu ve yordayıcıları seçin; model anında kurulur' },
      { t0: 7.5, t1: 14, metin: 'Katsayılar, güven aralıkları, R² ve F testi' },
      { t0: 14.5, t1: 19.5, metin: 'Varsayım tanıları: VIF, Cook uzaklığı, Durbin–Watson' },
    ],
  },
  {
    klip: 'lojistik.webm', no: '4', ad: 'Lojistik regresyon', analiz: 'olasılık oranı · AUC',
    parcalar: [{ bas: 1.5, son: 27.5, hiz: 1.63 }],
    altyazilar: [
      { t0: 0.5, t1: 6, metin: 'İki sınıflı bir sonucun olasılığını yordar' },
      { t0: 6.5, t1: 11, metin: 'Olasılık oranları (OR) ve güven aralıkları' },
      { t0: 11.5, t1: 15.5, metin: 'AUC, ROC eğrisi, sınıflandırma tablosu, Hosmer–Lemeshow' },
    ],
  },
  {
    klip: 'model.webm', no: '5', ad: 'Model karşılaştırma', analiz: '5 model · 5 katlı çapraz doğrulama',
    parcalar: [
      { bas: 2, son: 12, hiz: 1.6 },
      { bas: 12, son: 106, hiz: 14 },
      { bas: 106, son: 129, hiz: 1 },
    ],
    altyazilar: [
      { t0: 0.5, t1: 6, metin: 'Hedefi ve modelleri seçin: taban, lojistik, ağaç, k-NN, orman, gradyan artırma' },
      { t0: 6.5, t1: 12.5, metin: 'Tabakalı 5 katlı çapraz doğrulama çalışır (hesap 14× hızlandırıldı)' },
      { t0: 13.5, t1: 21, metin: 'Test doğruluğu, makro F1, AUC ve taban çizgisi yan yana' },
      { t0: 21.5, t1: 27, metin: 'Aşırı uyum (eğitim–test farkı) turuncu uyarıyla işaretlenir' },
      { t0: 27.5, t1: 35.5, metin: 'Yorum ve uyarılar, karışıklık matrisi, ROC eğrileri' },
    ],
  },
  {
    klip: 'kod.webm', no: '6', ad: 'Kod & Rapor Merkezi', analiz: 'Python kodu · HTML · PDF · Word',
    parcalar: [{ bas: 2.5, son: 26.5, hiz: 1.26 }],
    altyazilar: [
      { t0: 0.5, t1: 6, metin: 'Kaydedilen her analiz Python koduna dönüşür' },
      { t0: 6.5, t1: 12.5, metin: 'Kod, ekrandaki sayıları aynen üretir; beklenen çıktı yanında' },
      { t0: 13, t1: 18.8, metin: 'HTML, PDF ve Word raporu; denetim izi rapora yazılır' },
    ],
  },
];

const klipSure = (k: Klip) => k.parcalar.reduce((s, p) => s + parcaKare(p), 0);

type Sahne = { len: number; render: (len: number) => JSX.Element };
const SAHNELER: Sahne[] = [
  { len: 7 * FPS, render: (len) => <Giris duration={len} /> },
  { len: 22 * FPS, render: (len) => <Katalog duration={len} /> },
  ...KLIPLER.map<Sahne>((k) => ({ len: klipSure(k), render: (len) => <KlipSahnesi duration={len} {...k} /> })),
  { len: 6 * FPS, render: (len) => <Kapanis duration={len} /> },
];

export const OZELLIK_TOPLAM = SAHNELER.reduce((s, x) => s + x.len, 0);

export function Ozellik() {
  let from = 0;
  return (
    <AbsoluteFill>
      <Background />
      {SAHNELER.map((s, i) => {
        const at = from;
        from += s.len;
        return (
          <Sequence key={i} from={at} durationInFrames={s.len}>
            {s.render(s.len)}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}
