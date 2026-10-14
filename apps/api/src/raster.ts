import { Resvg } from '@resvg/resvg-js';

export interface Png {
  data: Buffer;
  /** Görüntünün oranını korumak için piksel cinsinden genişlik ve yükseklik. */
  width: number;
  height: number;
}

/** Rapor SVG'sini PNG'ye çevirir (Word, SVG'yi güvenilir göstermez). Çıktı belirleyicidir. */
export function svgToPng(svg: string, width = 1040): Png {
  const r = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    background: '#ffffff',
    font: { loadSystemFonts: true, defaultFontFamily: 'Arial' },
  }).render();
  return { data: Buffer.from(r.asPng()), width: r.width, height: r.height };
}
