import { spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Navigation, TriangleAlert } from 'lucide-react';
import { c, font } from '../theme';
import { Kicker, Scene, Title, fade, lerp, rise } from '../ui';

const W = 300;
const H = 112;
const NODES = [
  { x: 170, y: 270, label: 'Amaç', value: 'Karşılaştırma', at: 20 },
  { x: 600, y: 270, label: 'Grup sayısı', value: '3 grup', at: 45 },
  { x: 1030, y: 270, label: 'Varsayım', value: 'Normal mi?', at: 70 },
  { x: 1480, y: 100, label: 'Parametrik', value: 'ANOVA', at: 95 },
  { x: 1480, y: 440, label: 'Parametrik olmayan', value: 'Kruskal-Wallis', at: 155 },
];
const EDGES = [
  { from: 0, to: 1, at: 30 },
  { from: 1, to: 2, at: 55 },
  { from: 2, to: 3, at: 80 },
  { from: 2, to: 4, at: 140 },
];
const FAIL = 115;

export function Route({ duration }: { duration: number }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const failed = fade(f, FAIL, 10);
  return (
    <Scene duration={duration}>
      <div style={rise(f, 4)}>
        <Kicker>02 · nasıl çalışır</Kicker>
        <Title>Bir navigasyon uygulaması gibi</Title>
      </div>
      <div style={{ position: 'relative', width: 1680, height: 560, marginTop: 40 }}>
        <svg width={1680} height={560} style={{ position: 'absolute', inset: 0 }}>
          {EDGES.map((e, i) => {
            const a = NODES[e.from];
            const b = NODES[e.to];
            const toAnova = e.to === 3;
            const stroke = toAnova ? (failed > 0.5 ? c.dangerStrong : c.primary) : e.to === 4 ? c.success : c.primary;
            return (
              <line
                key={i}
                x1={a.x + W / 2}
                y1={a.y}
                x2={b.x - W / 2}
                y2={b.y}
                stroke={stroke}
                strokeWidth={5}
                strokeLinecap="round"
                pathLength={1}
                strokeDasharray={toAnova && failed > 0.5 ? '0.03 0.03' : '1'}
                strokeDashoffset={toAnova && failed > 0.5 ? 0 : lerp(f, [e.at, e.at + 15], [1, 0])}
                opacity={toAnova ? 1 - failed * 0.4 : 1}
              />
            );
          })}
        </svg>
        {NODES.map((n, i) => {
          const s = spring({ frame: f - n.at, fps, config: { damping: 13 } });
          const isAnova = i === 3;
          const isKw = i === 4;
          const border = isAnova ? (failed > 0.5 ? c.dangerStrong : c.primary) : isKw ? c.success : c.line;
          return (
            <div
              key={n.value}
              style={{
                position: 'absolute',
                left: n.x - W / 2,
                top: n.y - H / 2,
                width: W,
                height: H,
                borderRadius: 18,
                background: isKw ? c.successBg : isAnova && failed > 0.5 ? c.dangerBg : c.surface,
                border: `2px solid ${border}`,
                boxShadow: isKw ? `0 0 ${40 * s}px ${c.success}66` : 'none',
                transform: `scale(${s})`,
                opacity: isAnova ? 1 - failed * 0.35 : 1,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                padding: '0 26px',
              }}
            >
              <div style={{ fontSize: 22, color: c.fgSubtle }}>{n.label}</div>
              <div
                style={{
                  fontFamily: font.display,
                  fontWeight: 700,
                  fontSize: 36,
                  color: isKw ? c.success : isAnova && failed > 0.5 ? c.danger : c.fg,
                  textDecoration: isAnova && failed > 0.5 ? 'line-through' : 'none',
                }}
              >
                {n.value}
              </div>
            </div>
          );
        })}
        <div
          style={{
            ...rise(f, FAIL + 5, 20),
            position: 'absolute',
            left: 300,
            top: 410,
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            padding: '18px 26px',
            borderRadius: 16,
            background: c.warningBg,
            border: `1.5px solid ${c.warning}88`,
            color: c.warning,
            fontSize: 26,
          }}
        >
          <TriangleAlert size={34} />
          <span>
            Veri normal dağılmıyor <span style={{ fontFamily: font.mono }}>(Shapiro-Wilk p &lt; .001)</span> → rota değişti
          </span>
        </div>
      </div>
      <div style={{ ...rise(f, 175), display: 'flex', alignItems: 'center', gap: 18, fontSize: 38, color: c.fgMuted }}>
        <Navigation size={40} color={c.secondary} />
        Varsayım bozulursa program yolu değiştirir ve <span style={{ color: c.fg, fontWeight: 600 }}>nedenini açıklar.</span>
      </div>
    </Scene>
  );
}
