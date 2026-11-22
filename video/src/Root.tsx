import { Composition } from 'remotion';
import { TOTAL, Tanitim } from './Tanitim';
import { OZELLIK_TOPLAM, Ozellik } from './ozellik/Ozellik';
import { SES_TOPLAM, Ses } from './ozellik/Ses';
import { FPS } from './theme';

export function Root() {
  return (
    <>
      <Composition id="Tanitim" component={Tanitim} durationInFrames={TOTAL} fps={FPS} width={1920} height={1080} />
      <Composition id="Ozellik" component={Ozellik} durationInFrames={OZELLIK_TOPLAM} fps={FPS} width={1920} height={1080} />
      <Composition id="Ses" component={Ses} durationInFrames={SES_TOPLAM} fps={FPS} width={1920} height={1080} />
    </>
  );
}
