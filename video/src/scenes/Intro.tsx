import { useCurrentFrame } from 'remotion';
import { c, font } from '../theme';
import { Logo, Scene, fade, lerp, rise, usePop } from '../ui';

const BARS = Array.from({ length: 15 }, (_, i) => Math.exp(-((i - 7) ** 2) / 12));

function Histogram() {
  const f = useCurrentFrame();
  const w = 1100;
  const h = 300;
  const bw = w / BARS.length;
  // Normal eğrisi: çubukların üzerinden geçer, soldan sağa çizilir.
  const pts = Array.from({ length: 101 }, (_, i) => {
    const x = (i / 100) * w;
    const z = (x / bw - 7.5) ** 2 / 12;
    return `${x.toFixed(1)},${(h - Math.exp(-z) * h * 0.92).toFixed(1)}`;
  });
  const draw = lerp(f, [40, 95], [1, 0]);
  return (
    <svg width={w} height={h} style={{ position: 'absolute', left: (1920 - w) / 2, bottom: 70, opacity: 0.55 }}>
      {BARS.map((b, i) => {
        const g = lerp(f, [10 + i * 3, 40 + i * 3], [0, 1]);
        const bh = b * h * 0.85 * g;
        return <rect key={i} x={i * bw + 6} y={h - bh} width={bw - 12} height={bh} rx={6} fill={i === 7 ? c.primaryStrong : c.surfaceHighest} />;
      })}
      <polyline points={pts.join(' ')} fill="none" stroke={c.secondary} strokeWidth={4} pathLength={1} strokeDasharray={1} strokeDashoffset={draw} />
    </svg>
  );
}

export function Intro({ duration }: { duration: number }) {
  const f = useCurrentFrame();
  const pop = usePop(4);
  return (
    <Scene duration={duration}>
      <Histogram />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 120, textAlign: 'center' }}>
        <div style={{ transform: `scale(${pop}) rotate(${(1 - pop) * -25}deg)` }}>
          <Logo size={140} />
        </div>
        <div style={{ ...rise(f, 18, 40), marginTop: 44, fontFamily: font.display, fontWeight: 700, fontSize: 132, letterSpacing: '-0.03em', lineHeight: 1 }}>
          StatAdvisor <span style={{ color: c.primary }}>AI</span>
        </div>
        <div style={{ ...rise(f, 34), marginTop: 26, fontSize: 40, color: c.fgMuted }}>Akıllı Hipotez Testi ve Model Seçim Danışmanı</div>
        <div style={{ opacity: fade(f, 75), marginTop: 40, fontFamily: font.mono, fontSize: 30, color: c.secondary }}>
          doğru testi seçer · çalıştırır · sade dille anlatır
        </div>
      </div>
    </Scene>
  );
}
