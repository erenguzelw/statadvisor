/**
 * Dizinin en küçük ve en büyük değeri. `Math.min(...x)` yüz binlerce öğede çağrı
 * yığınını aşıp RangeError verir; bu yüzden büyük veri için döngüyle dolaşılır.
 * Boş dizide { lo: Infinity, hi: -Infinity } döner (Math.min/max ile aynı).
 */
export function extent(values: ArrayLike<number>): { lo: number; hi: number } {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return { lo, hi };
}
