import { AbsoluteFill, Audio, staticFile } from 'remotion';
import { FPS } from '../theme';

// Yalnızca ses: müzik 2 sn yumuşak girer, son 4 sn'de söner. `npm run ses` ile aac olarak render edilir.
export const SES_TOPLAM = Math.round(179.733 * FPS);
const BAZ = 0.55;

export function Ses() {
  return (
    <AbsoluteFill>
      <Audio
        src={staticFile('muzik.mp3')}
        volume={(f) => {
          const girisCarpan = Math.min(1, f / (2 * FPS));
          const cikisCarpan = Math.min(1, Math.max(0, (SES_TOPLAM - f) / (4 * FPS)));
          return BAZ * girisCarpan * cikisCarpan;
        }}
      />
    </AbsoluteFill>
  );
}
