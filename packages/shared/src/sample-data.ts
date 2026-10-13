/**
 * Yerleşik örnek veri setleri. Tohumlu ve belirleyicidir; sunucuya sıradan bir CSV gibi yüklenir,
 * böylece örnek ve gerçek veri aynı yoldan geçer.
 */
import { gaussian, mulberry32 } from './ml.ts';

export type SampleKind = 'klinik' | 'tedavi' | 'anket';

export interface SampleDataset {
  kind: SampleKind;
  fileName: string;
  title: string;
  description: string;
  csv: string;
}

const round = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;
const toCsv = (header: string[], rows: (string | number | null)[][]) =>
  [header.join(','), ...rows.map((r) => r.map((v) => (v === null ? '' : String(v))).join(','))].join('\n') + '\n';

/** 3 gruplu klinik veri: aykırı kan basıncı/biyobelirteç değerleri ve 60 eksik gelir düzeyi içerir. */
function klinik(): SampleDataset {
  const rng = mulberry32(2026);
  const groups = [
    { id: 'A', n: 472, shift: 0 },
    { id: 'B', n: 480, shift: 4 },
    { id: 'C', n: 468, shift: 8 },
  ];
  const rows: { grup: string; yas: number; kan: number; gelir: number | null; bio: number }[] = [];
  for (const g of groups) {
    for (let i = 0; i < g.n; i++) {
      rows.push({
        grup: g.id,
        yas: Math.max(18, Math.min(90, Math.round(50 + 12 * gaussian(rng)))),
        kan: round(124 + g.shift + 12 * gaussian(rng), 1),
        gelir: Math.round(Math.exp(10.5 + 0.45 * gaussian(rng)) / 100) * 100,
        bio: round(Math.exp(1.35 + 0.25 * gaussian(rng)), 2),
      });
    }
  }
  for (let i = rows.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [rows[i], rows[j]] = [rows[j]!, rows[i]!];
  }
  // Örnek sorunlar bilinçli olarak yerleştirilir (yalnızca bu demo veri setine aittir).
  rows[1]!.kan = 248;
  rows[5]!.bio = 18.9;
  for (let k = 0; k < 8; k++) rows[40 + k * 150]!.kan = 205 + k * 7;
  for (let k = 0; k < 3; k++) rows[90 + k * 400]!.bio = 12 + k * 1.5;
  const missing = new Set<number>([3, 6]);
  while (missing.size < 60) missing.add(Math.floor(rng() * rows.length));
  for (const i of missing) rows[i]!.gelir = null;
  return {
    kind: 'klinik',
    fileName: 'klinik_ornek.csv',
    title: 'Klinik örnek',
    description: '1.420 hasta, 3 grup; aykırı değerler ve eksik gelir bilgisi içerir. Grup karşılaştırması ve veri kalitesi için.',
    csv: toCsv(
      ['id', 'grup', 'yas', 'kan_basinci', 'gelir_duzeyi', 'biyobelirtec_x'],
      rows.map((r, i) => [i + 1, r.grup, r.yas, r.kan, r.gelir, r.bio]),
    ),
  };
}

/** Aynı kişilerde üç ölçüm (eşleşmiş tasarım). */
function tedavi(): SampleDataset {
  const rng = mulberry32(77);
  const rows = Array.from({ length: 40 }, (_, i) => {
    const base = Math.exp(3 + 0.35 * gaussian(rng));
    return [i + 1, round(base, 1), round(base * (0.88 + 0.08 * gaussian(rng)), 1), round(base * (0.74 + 0.1 * gaussian(rng)), 1)];
  });
  return {
    kind: 'tedavi',
    fileName: 'tedavi_ornek.csv',
    title: 'Tedavi takibi',
    description: '40 kişide başlangıç, 1. ay ve 3. ay ölçümleri (eşleşmiş tasarım).',
    csv: toCsv(['id', 'baslangic', 'ay_1', 'ay_3'], rows),
  };
}

/** Sıralı (1–5) ve kategorik (evet/hayır) değişkenler. */
function anket(): SampleDataset {
  const rng = mulberry32(31);
  const bolumler = ['Pazarlama', 'Üretim', 'Yazılım', 'İnsan Kaynakları'];
  const rows = Array.from({ length: 300 }, (_, i) => {
    const b = i % 4;
    const latent = 3 + (b === 2 ? 0.6 : b === 1 ? -0.4 : 0) + 0.9 * gaussian(rng);
    const puan = Math.max(1, Math.min(5, Math.round(latent)));
    const tavsiye = rng() < 0.25 + 0.14 * puan ? 'evet' : 'hayir';
    return [i + 1, bolumler[b]!, puan, tavsiye];
  });
  return {
    kind: 'anket',
    fileName: 'anket_ornek.csv',
    title: 'Çalışan anketi',
    description: '300 yanıt: bölüm, memnuniyet puanı (1–5, sıralı) ve tavsiye (evet/hayır, kategorik).',
    csv: toCsv(['id', 'bolum', 'memnuniyet', 'tavsiye'], rows),
  };
}

const makers: Record<SampleKind, () => SampleDataset> = { klinik, tedavi, anket };
export const SAMPLE_KINDS = Object.keys(makers) as SampleKind[];
export function sampleDataset(kind: SampleKind): SampleDataset {
  return makers[kind]();
}
