import { spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Laptop, ShieldCheck, UserCheck } from 'lucide-react';
import { c, font } from '../theme';
import { Kicker, Scene, Title, rise } from '../ui';

const ITEMS = [
  { icon: Laptop, color: c.secondary, title: 'Veri sizde kalır', text: 'Program kendi bilgisayarınızda çalışır; veriyi internete göndermez.' },
  { icon: ShieldCheck, color: c.primary, title: 'Ham veri korunur', text: 'Satır çıkarmak ya da puan hesaplamak yeni bir sürüm oluşturur.' },
  { icon: UserCheck, color: c.tertiary, title: 'Son karar sizin', text: 'Program uyarır ve önerir; kuramsal yorumu araştırmacı yapar.' },
];

export function Principles({ duration }: { duration: number }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <Scene duration={duration}>
      <div style={rise(f, 4)}>
        <Kicker>04 · ilkeler</Kicker>
        <Title>Güvenle kullanın</Title>
      </div>
      <div style={{ display: 'flex', gap: 36, marginTop: 80 }}>
        {ITEMS.map((it, i) => {
          const s = spring({ frame: f - 25 - i * 20, fps, config: { damping: 14 } });
          const Icon = it.icon;
          return (
            <div
              key={it.title}
              style={{
                flex: 1,
                opacity: Math.min(1, s),
                transform: `translateY(${(1 - s) * 80}px)`,
                padding: 44,
                borderRadius: 26,
                background: c.surface,
                border: `1.5px solid ${c.line}88`,
                borderTop: `6px solid ${it.color}`,
              }}
            >
              <Icon size={72} color={it.color} strokeWidth={1.8} />
              <div style={{ fontFamily: font.display, fontWeight: 700, fontSize: 46, marginTop: 28 }}>{it.title}</div>
              <div style={{ fontSize: 30, lineHeight: 1.4, color: c.fgMuted, marginTop: 16 }}>{it.text}</div>
            </div>
          );
        })}
      </div>
    </Scene>
  );
}
