import { loadFont as loadDisplay } from '@remotion/google-fonts/SpaceGrotesk';
import { loadFont as loadSans } from '@remotion/google-fonts/Inter';
import { loadFont as loadMono } from '@remotion/google-fonts/JetBrainsMono';

// Uygulamadaki yazı tipleri; Türkçe karakterler için latin-ext alt kümesi gerekir.
export const font = {
  display: loadDisplay('normal', { weights: ['500', '700'], subsets: ['latin', 'latin-ext'] }).fontFamily,
  sans: loadSans('normal', { weights: ['400', '500', '600'], subsets: ['latin', 'latin-ext'] }).fontFamily,
  mono: loadMono('normal', { weights: ['400', '600'], subsets: ['latin', 'latin-ext'] }).fontFamily,
};

// apps/web/src/styles/tokens.css ile aynı renkler.
export const c = {
  canvas: '#0b1326',
  surfaceLowest: '#060e20',
  surfaceLow: '#131b2e',
  surface: '#171f33',
  surfaceHigh: '#222a3d',
  surfaceHighest: '#2d3449',
  fg: '#dae2fd',
  fgMuted: '#c7c4d7',
  fgSubtle: '#908fa0',
  line: '#464554',
  primary: '#c0c1ff',
  primaryStrong: '#8083ff',
  primaryDeep: '#494bd6',
  secondary: '#6bd8cb',
  tertiary: '#ffb95f',
  success: '#34d399',
  successBg: '#052e22',
  danger: '#fda4af',
  dangerStrong: '#ef4444',
  dangerBg: '#3b0a14',
  warning: '#fcd34d',
  warningBg: '#3a2604',
};

export const FPS = 30;
