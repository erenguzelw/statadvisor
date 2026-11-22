import type { ReactNode } from 'react';
import { AbsoluteFill, Img, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { c, font, FPS } from '../theme';
import { fade, lerp, rise } from '../ui';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/** Sahne: başta ve sonda yumuşak geçiş. */
function Gecis({ duration, children }: { duration: number; children: ReactNode }) {
  const f = useCurrentFrame();
  const opacity = Math.min(fade(f, 0, 10), 1 - fade(f, duration - 10, 10));
  return <AbsoluteFill style={{ opacity, fontFamily: font.sans, color: c.fg }}>{children}</AbsoluteFill>;
}

const Logo = ({ size }: { size: number }) => (
  <Img src={staticFile('logo.png')} style={{ width: size, height: size, borderRadius: size * 0.22, boxShadow: `0 0 0 2px ${c.line}, 0 24px 90px ${c.primaryStrong}66` }} />
);

export function Giris({ duration }: { duration: number }) {
  const f = useCurrentFrame();
  return (
    <Gecis duration={duration}>
      <AbsoluteFill style={{ flexDirection: 'row', alignItems: 'center', padding: '0 150px', gap: 90 }}>
        <div style={{ ...rise(f, 0, 40), transform: `scale(${lerp(f, [0, 30], [0.85, 1])})`, opacity: fade(f, 0, 20) }}>
          <Logo size={380} />
        </div>
        <div>
          <div style={{ ...rise(f, 14), fontFamily: font.mono, fontSize: 30, color: c.secondary, letterSpacing: '0.04em' }}>özellik turu · 3 dakika</div>
          <h1 style={{ ...rise(f, 24), fontFamily: font.display, fontWeight: 700, fontSize: 132, lineHeight: 1, letterSpacing: '-0.03em', margin: '18px 0 0' }}>
            Stat<span style={{ color: c.primary }}>Advisor</span> AI
          </h1>
          <div style={{ ...rise(f, 36), marginTop: 30, width: 150, height: 6, borderRadius: 3, background: `linear-gradient(90deg, ${c.primaryStrong}, ${c.secondary})` }} />
          <p style={{ ...rise(f, 46), fontSize: 40, lineHeight: 1.35, color: c.fgMuted, margin: '30px 0 0', maxWidth: 1000 }}>
            Uygulamanın içinden, gerçek ekran kayıtlarıyla: neleri analiz ettiğini ve nasıl yaptığını gösteriyoruz.
          </p>
        </div>
      </AbsoluteFill>
    </Gecis>
  );
}

const KATEGORILER: { ad: string; renk: string; maddeler: string[] }[] = [
  { ad: 'Veri kalitesi', renk: c.secondary, maddeler: ['Aykırı değer (Tukey)', 'Eksik değer tanılaması', 'Yanıt taraması', 'Ölçek puanı · Cronbach α'] },
  { ad: 'İki grup', renk: c.primary, maddeler: ['Student / Welch t', 'Mann-Whitney U', 'Eşleştirilmiş t', 'Wilcoxon · işaret testi'] },
  { ad: 'Üç ve daha fazla grup', renk: c.tertiary, maddeler: ['ANOVA · Welch ANOVA', 'Tukey · Games–Howell', 'Kruskal-Wallis · Dunn', 'Tekrarlı ANOVA · Friedman'] },
  { ad: 'İlişki', renk: c.primary, maddeler: ['Pearson', 'Spearman', 'Kendall tau-b'] },
  { ad: 'Kategorik', renk: c.secondary, maddeler: ['Ki-kare', 'Fisher kesin testi', 'McNemar', 'Cochran Q'] },
  { ad: 'Regresyon', renk: c.tertiary, maddeler: ['Doğrusal regresyon', 'İkili lojistik regresyon', 'VIF · Cook · Durbin–Watson'] },
  { ad: 'Çok faktörlü tasarım', renk: c.secondary, maddeler: ['Faktöriyel ANOVA (1–4 faktör)', 'Tip III · basit etkiler'] },
  { ad: 'Model karşılaştırma', renk: c.primary, maddeler: ['Lojistik · karar ağacı · k-NN', 'SVM · rastgele orman', 'Gradyan artırma · çapraz doğrulama'] },
  { ad: 'Çıktı', renk: c.tertiary, maddeler: ['Sade dille yorum · APA cümlesi', 'Python kodu', 'HTML · PDF · Word raporu'] },
];

export function Katalog({ duration }: { duration: number }) {
  const f = useCurrentFrame();
  const sayac = Math.round(lerp(f, [20, 150], [0, 21]));
  return (
    <Gecis duration={duration}>
      <AbsoluteFill style={{ padding: '64px 120px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <div style={{ ...rise(f, 0), fontFamily: font.mono, fontSize: 26, color: c.secondary }}>neler analiz ediyor?</div>
            <h1 style={{ ...rise(f, 6), fontFamily: font.display, fontWeight: 700, fontSize: 72, letterSpacing: '-0.02em', margin: '10px 0 0' }}>
              Veri kalitesinden rapora <span style={{ color: c.primary }}>tek akış</span>
            </h1>
          </div>
          <div style={{ ...rise(f, 10), textAlign: 'right' }}>
            <span style={{ fontFamily: font.display, fontWeight: 700, fontSize: 110, color: c.secondary, letterSpacing: '-0.03em' }}>{sayac}+</span>
            <span style={{ fontSize: 30, color: c.fgMuted, marginLeft: 12 }}>istatistiksel yöntem</span>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 22, marginTop: 34 }}>
          {KATEGORILER.map((k, i) => {
            const t = fade(f, 20 + i * 14, 16);
            return (
              <div
                key={k.ad}
                style={{
                  opacity: t,
                  transform: `translateY(${(1 - t) * 26}px)`,
                  background: `${c.surface}ee`,
                  border: `1.5px solid ${c.line}99`,
                  borderTop: `6px solid ${k.renk}`,
                  borderRadius: 18,
                  padding: '20px 26px 22px',
                }}
              >
                <div style={{ fontFamily: font.display, fontWeight: 700, fontSize: 32, color: k.renk }}>{k.ad}</div>
                <ul style={{ margin: '10px 0 0', padding: 0, listStyle: 'none' }}>
                  {k.maddeler.map((m) => (
                    <li key={m} style={{ fontSize: 26, lineHeight: 1.42, color: c.fgMuted }}>
                      · {m}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </Gecis>
  );
}

export type Parca = { bas: number; son: number; hiz: number };
export type Altyazi = { t0: number; t1: number; metin: string };

/** Ham kliplerden kesit alıp hızlandırarak sahneye sığdırır. */
export const parcaKare = (p: Parca) => Math.round(((p.son - p.bas) / p.hiz) * FPS);

export function KlipSahnesi({
  duration,
  klip,
  parcalar,
  no,
  ad,
  analiz,
  altyazilar,
}: {
  duration: number;
  klip: string;
  parcalar: Parca[];
  no: string;
  ad: string;
  analiz: string;
  altyazilar: Altyazi[];
}) {
  const f = useCurrentFrame();
  const sn = f / FPS;
  let at = 0;
  const aktif = altyazilar.find((a) => sn >= a.t0 && sn < a.t1);
  return (
    <Gecis duration={duration}>
      <AbsoluteFill style={{ background: c.surfaceLowest }}>
        {parcalar.map((p, i) => {
          const len = parcaKare(p);
          const from = at;
          at += len;
          return (
            <Sequence key={i} from={from} durationInFrames={len}>
              <OffthreadVideo
                src={staticFile(`klipler/${klip}`)}
                startFrom={Math.round(p.bas * FPS)}
                playbackRate={p.hiz}
                muted
                style={{ width: 1920, height: 1080, objectFit: 'cover' }}
              />
              {p.hiz >= 2.5 && (
                <div style={{ position: 'absolute', right: 40, bottom: 40, padding: '8px 18px', borderRadius: 12, background: '#000000b0', color: c.secondary, fontFamily: font.mono, fontSize: 28 }}>
                  ▶▶ {Math.round(p.hiz)}× hızlı
                </div>
              )}
            </Sequence>
          );
        })}
        <AbsoluteFill style={{ background: 'linear-gradient(transparent 62%, #060e20ee 100%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', left: 36, top: 28, display: 'flex', gap: 14, ...rise(f, 4, 14) }}>
          <span style={{ background: `${c.primaryDeep}`, color: '#fff', fontFamily: font.display, fontWeight: 700, fontSize: 32, padding: '10px 22px', borderRadius: 14, boxShadow: '0 8px 30px #00000066' }}>
            {no} · {ad}
          </span>
          <span style={{ background: '#060e20e6', border: `1.5px solid ${c.secondary}`, color: c.secondary, fontFamily: font.mono, fontSize: 25, padding: '12px 20px', borderRadius: 14 }}>
            analiz: {analiz}
          </span>
        </div>
        {aktif && (
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 52, display: 'flex', justifyContent: 'center' }}>
            <div
              style={{
                opacity: Math.min(fade(f, Math.round(aktif.t0 * FPS), 8), 1 - fade(f, Math.round(aktif.t1 * FPS) - 8, 8)),
                background: '#060e20ef',
                border: `1.5px solid ${c.line}`,
                borderRadius: 18,
                padding: '18px 38px',
                fontFamily: font.display,
                fontWeight: 500,
                fontSize: 42,
                color: c.fg,
                boxShadow: '0 16px 50px #000000aa',
                maxWidth: 1600,
                textAlign: 'center',
              }}
            >
              {aktif.metin}
            </div>
          </div>
        )}
      </AbsoluteFill>
    </Gecis>
  );
}

export function Kapanis({ duration }: { duration: number }) {
  const f = useCurrentFrame();
  const maddeler = ['Veri bilgisayardan çıkmaz', '1568 referans vakayla doğrulanır', 'Ekrandaki sayıları üreten Python kodu'];
  return (
    <Gecis duration={duration}>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', gap: 36 }}>
        <div style={{ ...rise(f, 0, 30) }}>
          <Logo size={210} />
        </div>
        <h1 style={{ ...rise(f, 8), fontFamily: font.display, fontWeight: 700, fontSize: 96, letterSpacing: '-0.02em', margin: 0 }}>
          Stat<span style={{ color: c.primary }}>Advisor</span> AI
        </h1>
        <div style={{ display: 'flex', gap: 22 }}>
          {maddeler.map((m, i) => (
            <span key={m} style={{ ...rise(f, 20 + i * 10, 20), background: c.surfaceHigh, border: `1.5px solid ${c.line}`, borderRadius: 999, padding: '12px 28px', fontSize: 30, color: c.fgMuted }}>
              {m}
            </span>
          ))}
        </div>
        <div style={{ position: 'absolute', bottom: 44, left: 0, right: 0, textAlign: 'center', fontFamily: font.mono, fontSize: 21, color: c.fgSubtle, opacity: fade(f, 44, 18) }}>
          Müzik: “Floating Cities” · Kevin MacLeod (incompetech.com) · CC BY 4.0 (creativecommons.org/licenses/by/4.0)
        </div>
      </AbsoluteFill>
    </Gecis>
  );
}

void interpolate;
void clamp;
