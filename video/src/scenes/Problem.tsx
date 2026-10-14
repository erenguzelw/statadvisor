import { spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { HelpCircle } from 'lucide-react';
import { c, font } from '../theme';
import { Kicker, Scene, Title, rise } from '../ui';

const QUESTIONS = [
  't-testi mi, Mann-Whitney mi?',
  'Normalliğe bakmam gerekir mi?',
  'p = 0,03 çıktı, bu ne demek?',
  'Bunu tezde nasıl yazarım?',
];

export function Problem({ duration }: { duration: number }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <Scene duration={duration}>
      <div style={rise(f, 4)}>
        <Kicker>01 · sorun</Kicker>
        <Title>Veriyi topladınız. Peki şimdi?</Title>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 36, marginTop: 70 }}>
        {QUESTIONS.map((q, i) => {
          const s = spring({ frame: f - 30 - i * 16, fps, config: { damping: 12 } });
          const float = Math.sin((f + i * 25) / 18) * 6;
          return (
            <div
              key={q}
              style={{
                opacity: Math.min(1, s),
                transform: `translateY(${float}px) scale(${0.7 + 0.3 * s}) rotate(${(i % 2 ? 1 : -1) * (1 - s) * 6}deg)`,
                display: 'flex',
                alignItems: 'center',
                gap: 24,
                padding: '34px 40px',
                borderRadius: 24,
                background: c.surface,
                border: `1.5px solid ${c.line}88`,
                fontSize: 42,
                fontWeight: 500,
              }}
            >
              <HelpCircle size={52} color={c.tertiary} style={{ flexShrink: 0 }} />
              {q}
            </div>
          );
        })}
      </div>
      <div style={{ ...rise(f, 150), marginTop: 70, fontSize: 40, color: c.fgMuted }}>
        Bu sorular için genelde bir <span style={{ color: c.fg, fontWeight: 600 }}>istatistik danışmanına</span> gidilir.{' '}
        <span style={{ fontFamily: font.display, fontWeight: 700, color: c.primary }}>StatAdvisor bu işi adım adım yapar.</span>
      </div>
    </Scene>
  );
}
