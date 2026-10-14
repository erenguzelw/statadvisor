import { Composition } from 'remotion';
import { TOTAL, Tanitim } from './Tanitim';
import { FPS } from './theme';

export function Root() {
  return <Composition id="Tanitim" component={Tanitim} durationInFrames={TOTAL} fps={FPS} width={1920} height={1080} />;
}
