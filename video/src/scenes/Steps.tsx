import type { ReactNode } from 'react';
import { random, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { ArrowRight, Check, FileSpreadsheet, FileText, Layers, ScanSearch, Upload, Wand2 } from 'lucide-react';
import { c, font } from '../theme';
import { Card, Kicker, Pill, Scene, fade, lerp, rise } from '../ui';

export const STEP_LEN = 144;

const STEPS = [
  { icon: Upload, title: 'Veriyi yükle', text: 'Excel ya da CSV' },
  { icon: ScanSearch, title: 'Yanıtları tara', text: 'Dikkatsiz yanıtları bul' },
  { icon: Layers, title: 'Ölçek puanı', text: 'Alt boyutları tanımla' },
  { icon: Wand2, title: 'Sorunu sor', text: 'Test otomatik seçilir' },
  { icon: FileText, title: 'Sonucu al', text: 'Anlatım, APA, rapor' },
];

/* ---------- 1. Yükleme ---------- */
function UploadVisual({ f }: { f: number }) {
  const rows = [
    ['2:Bazen katılıyorum', '2', 'Likert kodu'],
    ['4:Tamamen katılıyorum', '4', 'Likert kodu'],
    ['1-3 saat', '1', 'sıralı aralık'],
    ['7 saat ve üzeri', '3', 'sıralı aralık'],
  ];
  return (
    <>
      <Card style={{ ...rise(f, 4), display: 'flex', alignItems: 'center', gap: 24, padding: 26 }}>
        <FileSpreadsheet size={56} color={c.success} />
        <div>
          <div style={{ fontFamily: font.mono, fontSize: 32 }}>analiz verisi.xlsx</div>
          <div style={{ fontSize: 24, color: c.fgSubtle }}>310 satır · 34 sütun · Google Forms anketi</div>
        </div>
      </Card>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 30 }}>
        {rows.map(([from, to, kind], i) => {
          const t = fade(f, 28 + i * 14, 14);
          const conv = fade(f, 40 + i * 14, 10);
          return (
            <div key={from} style={{ opacity: t, transform: `translateX(${(1 - t) * 40}px)`, display: 'flex', alignItems: 'center', gap: 22, fontSize: 30 }}>
              <span style={{ width: 430, padding: '12px 20px', borderRadius: 12, background: c.surfaceHigh, fontFamily: font.mono, fontSize: 26 }}>{from}</span>
              <ArrowRight size={34} color={c.fgSubtle} style={{ opacity: conv }} />
              <span style={{ opacity: conv, width: 90, textAlign: 'center', padding: '12px 0', borderRadius: 12, background: c.primaryDeep, fontFamily: font.mono, fontWeight: 600 }}>{to}</span>
              <span style={{ opacity: conv, color: c.fgSubtle, fontSize: 24 }}>{kind}</span>
            </div>
          );
        })}
      </div>
      <div style={{ ...rise(f, 100), marginTop: 30 }}>
        <Pill color={c.success} bg={c.successBg}>
          <Check size={26} /> 28 sıralı, 6 kategorik sütun otomatik tanındı
        </Pill>
      </div>
    </>
  );
}

/* ---------- 2. Tarama ---------- */
const N_ROWS = 9;
const N_ITEMS = 26;
const STRAIGHT = 2;
const OUTLIER = 6;
const answer = (r: number, i: number) => {
  if (r === STRAIGHT) return 2;
  if (r === OUTLIER) return i % 2 ? 0 : 4;
  return Math.min(4, Math.max(0, Math.round(1.6 + random(`a${r}-${i}`) * 2.2 - 0.4)));
};
const SHADES = ['#2d3449', '#3b3f80', '#5a5dc4', '#8083ff', '#c0c1ff'];

function ScreenVisual({ f }: { f: number }) {
  const scan = lerp(f, [30, 85], [0, 1]);
  return (
    <>
      <Card style={{ ...rise(f, 4), position: 'relative', padding: '26px 30px', overflow: 'hidden' }}>
        <div style={{ fontSize: 22, color: c.fgSubtle, marginBottom: 14 }}>Her satır bir katılımcı · her nokta bir madde (0–4)</div>
        {Array.from({ length: N_ROWS }, (_, r) => {
          const flag = r === STRAIGHT ? 'düz çizgi' : r === OUTLIER ? 'Mahalanobis' : null;
          const flagged = flag ? fade(f, r === STRAIGHT ? 70 : 82, 10) : 0;
          const tone = r === STRAIGHT ? c.warning : c.danger;
          return (
            <div
              key={r}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                height: 46,
                padding: '0 10px',
                borderRadius: 10,
                outline: flagged ? `2px solid ${tone}` : 'none',
                background: flagged ? `${tone}18` : 'transparent',
                opacity: fade(f, 6 + r * 3, 10),
              }}
            >
              {Array.from({ length: N_ITEMS }, (_, i) => (
                <div key={i} style={{ width: 22, height: 22, borderRadius: '50%', background: SHADES[answer(r, i)] }} />
              ))}
              {flag && (
                <span style={{ opacity: flagged, marginLeft: 14, fontSize: 22, fontWeight: 600, color: tone, whiteSpace: 'nowrap' }}>{flag}</span>
              )}
            </div>
          );
        })}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 70 + scan * 400,
            height: 4,
            background: c.secondary,
            boxShadow: `0 0 24px ${c.secondary}`,
            opacity: scan > 0 && scan < 1 ? 1 : 0,
          }}
        />
      </Card>
      <div style={{ ...rise(f, 100), marginTop: 26, display: 'flex', gap: 16 }}>
        <Pill color={c.fg} bg={c.surfaceHigh}>310 yanıt tarandı</Pill>
        <Pill color={c.warning} bg={c.warningBg}>düz çizgi 7</Pill>
        <Pill color={c.danger} bg={c.dangerBg}>Mahalanobis 22</Pill>
      </div>
    </>
  );
}

/* ---------- 3. Ölçek puanı ---------- */
function ScaleVisual({ f }: { f: number }) {
  const { fps } = useVideoConfig();
  const alpha = lerp(f, [55, 100], [0, 0.921]);
  return (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {Array.from({ length: 12 }, (_, i) => {
          const s = spring({ frame: f - 4 - i * 3, fps, config: { damping: 14 } });
          return (
            <span
              key={i}
              style={{
                transform: `scale(${s})`,
                padding: '10px 18px',
                borderRadius: 12,
                background: c.surfaceHigh,
                fontFamily: font.mono,
                fontSize: 24,
                color: i === 4 || i === 9 ? c.tertiary : c.fg,
              }}
            >
              M{i + 1}
              {(i === 4 || i === 9) && <span style={{ fontSize: 18 }}> ters</span>}
            </span>
          );
        })}
        <span style={{ alignSelf: 'center', fontSize: 24, color: c.fgSubtle }}>… 26 madde</span>
      </div>
      <Card style={{ ...rise(f, 42), marginTop: 30 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div style={{ fontFamily: font.display, fontWeight: 700, fontSize: 38 }}>Toplam puan</div>
          <div style={{ fontSize: 24, color: c.fgSubtle }}>ters maddeler çevrildi</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 18, marginTop: 22 }}>
          <span style={{ fontSize: 28, color: c.fgMuted }}>Cronbach α</span>
          <span style={{ fontFamily: font.mono, fontWeight: 600, fontSize: 64, color: c.primary }}>{alpha.toFixed(2).replace('.', ',')}</span>
          <span style={{ opacity: fade(f, 100), fontSize: 28, color: c.success, fontWeight: 600 }}>mükemmel</span>
        </div>
        <div style={{ height: 16, borderRadius: 8, background: c.surfaceHighest, marginTop: 14, overflow: 'hidden' }}>
          <div style={{ width: `${alpha * 100}%`, height: '100%', background: `linear-gradient(90deg, ${c.primaryDeep}, ${c.primary})` }} />
        </div>
        <div style={{ opacity: fade(f, 108), marginTop: 22, fontSize: 26, color: c.fgMuted }}>
          Çarpıklık <span style={{ fontFamily: font.mono }}>0,87</span> · Basıklık <span style={{ fontFamily: font.mono }}>1,34</span> →{' '}
          <span style={{ color: c.success }}>normal kabul edilir (±1,5)</span>
        </div>
      </Card>
    </>
  );
}

/* ---------- 4. Sihirbaz ---------- */
function WizardVisual({ f }: { f: number }) {
  const options = ['Grupları karşılaştır', 'İlişki ara', 'Tahmin et'];
  const picked = f > 26;
  const checks = ['Sonuç: ölçek puanı (sayısal)', 'Grup: Cinsiyet (2 grup)', 'Normallik: çarpıklık-basıklık uygun'];
  return (
    <>
      <Card style={rise(f, 4)}>
        <div style={{ fontSize: 30, fontWeight: 600, marginBottom: 20 }}>Ne yapmak istiyorsunuz?</div>
        <div style={{ display: 'flex', gap: 16 }}>
          {options.map((o, i) => {
            const on = picked && i === 0;
            return (
              <div
                key={o}
                style={{
                  flex: 1,
                  padding: '18px 20px',
                  borderRadius: 14,
                  fontSize: 25,
                  border: `2px solid ${on ? c.primaryStrong : c.line}`,
                  background: on ? `${c.primaryStrong}33` : c.surfaceLow,
                  color: on ? c.primary : c.fgMuted,
                  transform: on ? `scale(${1 + 0.04 * (1 - fade(f, 26, 10))})` : 'none',
                }}
              >
                {o}
              </div>
            );
          })}
        </div>
      </Card>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 26 }}>
        {checks.map((t, i) => (
          <div key={t} style={{ ...rise(f, 45 + i * 13, 16), display: 'flex', alignItems: 'center', gap: 14, fontSize: 28 }}>
            <Check size={30} color={c.success} /> {t}
          </div>
        ))}
      </div>
      <div style={{ ...rise(f, 92), marginTop: 30, display: 'flex', alignItems: 'center', gap: 20, padding: '22px 30px', borderRadius: 18, background: c.successBg, border: `2px solid ${c.success}` }}>
        <span style={{ fontSize: 26, color: c.fgMuted }}>Önerilen test</span>
        <ArrowRight size={30} color={c.success} />
        <span style={{ fontFamily: font.display, fontWeight: 700, fontSize: 40, color: c.success }}>Bağımsız örneklem t-testi</span>
      </div>
    </>
  );
}

/* ---------- 5. Sonuç ---------- */
function ResultVisual({ f }: { f: number }) {
  const card = (start: number, title: string, body: ReactNode) => (
    <Card style={{ ...rise(f, start), padding: '24px 30px' }}>
      <div style={{ fontSize: 22, color: c.secondary, fontWeight: 600, marginBottom: 10 }}>{title}</div>
      {body}
    </Card>
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {card(4, 'Sade anlatım', <div style={{ fontSize: 30 }}>İki grubun puanları arasında anlamlı bir fark var; farkın büyüklüğü küçük.</div>)}
      {card(
        26,
        'APA cümlesi',
        <div style={{ fontFamily: font.mono, fontSize: 30, color: c.primary }}>t(308) = 2,41, p = .017, d = 0,27</div>,
      )}
      {card(
        48,
        'Dışa aktar',
        <div style={{ display: 'flex', gap: 14 }}>
          {['DOCX', 'PDF', 'HTML', 'Python kodu'].map((x, i) => (
            <span key={x} style={{ opacity: fade(f, 58 + i * 8, 8), padding: '10px 22px', borderRadius: 12, background: c.surfaceHigh, fontFamily: font.mono, fontSize: 26 }}>
              {x}
            </span>
          ))}
        </div>,
      )}
      <div style={{ opacity: fade(f, 95), fontSize: 20, color: c.fgSubtle }}>Değerler örnek çıktıdır.</div>
    </div>
  );
}

const VISUALS = [UploadVisual, ScreenVisual, ScaleVisual, WizardVisual, ResultVisual];

export function Steps({ duration }: { duration: number }) {
  const f = useCurrentFrame();
  const active = Math.min(STEPS.length - 1, Math.floor(f / STEP_LEN));
  const local = f - active * STEP_LEN;
  const Visual = VISUALS[active];
  const inOut = Math.min(fade(local, 0, 10), active === STEPS.length - 1 ? 1 : 1 - fade(local, STEP_LEN - 10, 10));
  return (
    <Scene duration={duration}>
      <Kicker>03 · beş adımda</Kicker>
      <div style={{ display: 'flex', gap: 70, marginTop: 10, flex: 1 }}>
        <div style={{ width: 480, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {STEPS.map((s, i) => {
            const on = i === active;
            const done = i < active;
            const Icon = s.icon;
            return (
              <div
                key={s.title}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 22,
                  padding: '20px 24px',
                  borderRadius: 18,
                  background: on ? c.surfaceHigh : 'transparent',
                  border: `2px solid ${on ? c.primaryStrong : 'transparent'}`,
                  opacity: on ? 1 : done ? 0.75 : 0.45,
                }}
              >
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 16,
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: done ? c.successBg : on ? c.primaryStrong : c.surface,
                  }}
                >
                  {done ? <Check size={34} color={c.success} /> : <Icon size={32} color={on ? '#fff' : c.fgMuted} />}
                </div>
                <div>
                  <div style={{ fontFamily: font.display, fontWeight: 700, fontSize: 34 }}>
                    <span style={{ fontFamily: font.mono, fontSize: 24, color: c.fgSubtle, marginRight: 12 }}>{i + 1}</span>
                    {s.title}
                  </div>
                  <div style={{ fontSize: 22, color: c.fgSubtle }}>{s.text}</div>
                </div>
              </div>
            );
          })}
          <div style={{ height: 6, borderRadius: 3, background: c.surfaceHigh, marginTop: 10 }}>
            <div style={{ height: '100%', width: `${(f / duration) * 100}%`, borderRadius: 3, background: c.secondary }} />
          </div>
        </div>
        <div style={{ flex: 1, opacity: inOut, transform: `translateX(${(1 - inOut) * 30}px)` }}>
          <Visual f={local} />
        </div>
      </div>
    </Scene>
  );
}
