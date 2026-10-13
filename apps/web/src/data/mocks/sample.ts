import { median } from '@/lib/assumptions';
import { histogram, kruskalWallis, meanSd, skewness } from '@/lib/stats';

export { median };

/**
 * Ekranlardaki tüm sayıların tek kaynağı: her grupta 15 gözlemlik örnek (biyobelirteç X).
 * H, p, ε², histogram ve çarpıklık bu veriden hesaplanır; kod örneklerinin çıktıları da buna dayanır.
 */
export const sampleGroups = {
  A: [2.6, 4.3, 3.2, 2.3, 3, 5.6, 6.1, 3.4, 4.5, 2.1, 2.9, 4.2, 2.4, 4.3, 5.3],
  B: [4.3, 4.4, 4.6, 3.1, 5.8, 6.4, 3.1, 5.9, 7.7, 3.2, 6, 2.5, 5.2, 3.6, 3.3],
  C: [4.7, 6.2, 4, 5.4, 13.2, 11.4, 8.3, 7.3, 7.4, 4.4, 4.9, 5.4, 3.6, 7.4, 3.5],
};

export const groupList = [sampleGroups.A, sampleGroups.B, sampleGroups.C];
export const pooled = groupList.flat();

export const kruskal = kruskalWallis(groupList);
export const sampleStats = { ...meanSd(pooled), skewness: skewness(pooled), n: pooled.length };
export const sampleBins = histogram(pooled, 14);

/** Python / R kaynak kodunda kullanılan dizi gösterimi. */
export const pyList = (values: number[]) => `[${values.map((v) => v.toFixed(1)).join(', ')}]`;

