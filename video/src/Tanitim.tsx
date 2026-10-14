import { AbsoluteFill, Sequence } from 'remotion';
import { Background } from './ui';
import { Intro } from './scenes/Intro';
import { Problem } from './scenes/Problem';
import { Route } from './scenes/Route';
import { STEP_LEN, Steps } from './scenes/Steps';
import { Principles } from './scenes/Principles';
import { Outro } from './scenes/Outro';
import { FPS } from './theme';

// Sahne süreleri (kare, 30 fps). Toplam 1800 kare = 60 sn.
const SCENES = [
  { C: Intro, len: 6 * FPS },
  { C: Problem, len: 8 * FPS },
  { C: Route, len: 8 * FPS },
  { C: Steps, len: 5 * STEP_LEN },
  { C: Principles, len: 8 * FPS },
  { C: Outro, len: 6 * FPS },
];

export const TOTAL = SCENES.reduce((s, x) => s + x.len, 0);

export function Tanitim() {
  let from = 0;
  return (
    <AbsoluteFill>
      <Background />
      {SCENES.map(({ C, len }, i) => {
        const at = from;
        from += len;
        return (
          <Sequence key={i} from={at} durationInFrames={len}>
            <C duration={len} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}
