import type { CSSProperties, ReactNode } from 'react';
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { BarChart3 } from 'lucide-react';
import { c, font } from './theme';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/** start karesinden itibaren dur kare içinde 0→1. */
export const fade = (f: number, start: number, dur = 15) =>
  interpolate(f, [start, start + dur], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });

/** Aşağıdan yükselerek görünme. */
export const rise = (f: number, start: number, dist = 30): CSSProperties => {
  const t = fade(f, start, 18);
  return { opacity: t, transform: `translateY(${(1 - t) * dist}px)` };
};

/** Yaylı büyüme (0→1). */
export function usePop(start: number, damping = 13) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: f - start, fps, config: { damping } });
}

export const lerp = (f: number, input: number[], output: number[]) => interpolate(f, input, output, clamp);

/** Sahne: başta ve sonda yumuşak geçiş. */
export function Scene({ duration, children }: { duration: number; children: ReactNode }) {
  const f = useCurrentFrame();
  const opacity = Math.min(fade(f, 0, 12), 1 - fade(f, duration - 12, 12));
  const scale = interpolate(f, [0, duration], [1.015, 1], clamp);
  return (
    <AbsoluteFill style={{ opacity, transform: `scale(${scale})`, padding: '90px 120px', fontFamily: font.sans, color: c.fg }}>
      {children}
    </AbsoluteFill>
  );
}

/** Tüm video boyunca süren arka plan: yavaşça kayan ızgara ve renk lekeleri. */
export function Background() {
  const f = useCurrentFrame();
  const x = Math.sin(f / 90) * 120;
  const y = Math.cos(f / 110) * 80;
  return (
    <AbsoluteFill style={{ background: c.canvas, overflow: 'hidden' }}>
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(${c.surfaceHigh}55 1px, transparent 1px), linear-gradient(90deg, ${c.surfaceHigh}55 1px, transparent 1px)`,
          backgroundSize: '64px 64px',
          backgroundPosition: `${(f * 0.4) % 64}px ${(f * 0.25) % 64}px`,
          maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
        }}
      />
      <div style={{ position: 'absolute', left: 1250 + x, top: -250 + y, width: 900, height: 900, borderRadius: '50%', background: `radial-gradient(circle, ${c.primaryDeep}55, transparent 65%)` }} />
      <div style={{ position: 'absolute', left: -300 - x, top: 550 - y, width: 900, height: 900, borderRadius: '50%', background: `radial-gradient(circle, ${c.secondary}22, transparent 65%)` }} />
    </AbsoluteFill>
  );
}

export function Logo({ size = 96 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.25,
        background: `linear-gradient(135deg, ${c.primaryStrong}, ${c.primaryDeep})`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: `0 20px 60px ${c.primaryStrong}55`,
      }}
    >
      <BarChart3 size={size * 0.55} color="#fff" strokeWidth={2.2} />
    </div>
  );
}

export function Kicker({ children, color = c.secondary }: { children: ReactNode; color?: string }) {
  return (
    <div style={{ fontFamily: font.mono, fontSize: 26, color, letterSpacing: '0.04em', marginBottom: 18 }}>{children}</div>
  );
}

export function Title({ children, size = 76 }: { children: ReactNode; size?: number }) {
  return (
    <h1 style={{ fontFamily: font.display, fontWeight: 700, fontSize: size, lineHeight: 1.08, letterSpacing: '-0.02em', margin: 0, color: c.fg }}>
      {children}
    </h1>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        background: `${c.surface}ee`,
        border: `1.5px solid ${c.line}88`,
        borderRadius: 20,
        padding: 32,
        boxShadow: '0 24px 60px #00000055',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Pill({ children, color, bg }: { children: ReactNode; color: string; bg: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 16px', borderRadius: 999, background: bg, color, fontSize: 24, fontWeight: 600, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  );
}
