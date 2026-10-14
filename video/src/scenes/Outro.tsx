import { useCurrentFrame } from 'remotion';
import { c, font } from '../theme';
import { Logo, Scene, fade, rise, usePop } from '../ui';

export function Outro({ duration }: { duration: number }) {
  const f = useCurrentFrame();
  const pop = usePop(2);
  const typed = 'npm start → http://127.0.0.1:3001';
  const shown = typed.slice(0, Math.max(0, Math.floor((f - 40) / 1.2)));
  return (
    <Scene duration={duration}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 36, transform: `scale(${0.8 + 0.2 * pop})`, opacity: pop }}>
          <Logo size={120} />
          <div style={{ fontFamily: font.display, fontWeight: 700, fontSize: 110, letterSpacing: '-0.03em' }}>
            StatAdvisor <span style={{ color: c.primary }}>AI</span>
          </div>
        </div>
        <div style={{ ...rise(f, 16), marginTop: 30, fontSize: 42, color: c.fgMuted }}>
          Doğru test, anlaşılır sonuç, tekrarlanabilir kod.
        </div>
        <div
          style={{
            opacity: fade(f, 34),
            marginTop: 60,
            padding: '22px 40px',
            minWidth: 820,
            textAlign: 'left',
            borderRadius: 16,
            background: c.surfaceLowest,
            border: `1.5px solid ${c.line}`,
            fontFamily: font.mono,
            fontSize: 36,
            color: c.secondary,
          }}
        >
          <span style={{ color: c.fgSubtle }}>$ </span>
          {shown}
          <span style={{ opacity: Math.floor(f / 15) % 2 ? 1 : 0, color: c.fg }}>▌</span>
        </div>
        <div style={{ opacity: fade(f, 110), marginTop: 40, fontSize: 28, color: c.fgSubtle }}>
          Yerelde çalışır · Türkçe arayüz · Word/PDF rapor ve Python kodu
        </div>
      </div>
    </Scene>
  );
}
