import { analyze } from '@statadvisor/shared';

const A = [2.6, 4.3, 3.2, 2.3, 3, 5.6, 6.1, 3.4, 4.5, 2.1, 2.9, 4.2, 2.4, 4.3, 5.3];
const B = [4.3, 4.4, 4.6, 3.1, 5.8, 6.4, 3.1, 5.9, 7.7, 3.2, 6, 2.5, 5.2, 3.6, 3.3];
const C = [4.7, 6.2, 4, 5.4, 13.2, 11.4, 8.3, 7.3, 7.4, 4.4, 4.9, 5.4, 3.6, 7.4, 3.5];

/** Bileşen testlerinde kullanılan gerçek bir analiz sonucu (3 grup, çarpık veri → Kruskal-Wallis). */
export const analysisResult = analyze({
  goal: 'compare',
  design: 'independent',
  target: 'continuous',
  datasetName: 'test.csv',
  value: { name: 'biyobelirtec', values: [...A, ...B, ...C] },
  group: { name: 'grup', values: [...A.map(() => 'A'), ...B.map(() => 'B'), ...C.map(() => 'C')] },
});
