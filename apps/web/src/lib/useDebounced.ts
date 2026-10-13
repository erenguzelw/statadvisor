import { useEffect, useState } from 'react';

/** Değer değişiminin `ms` kadar durulmasını bekler (art arda tıklamalarda gereksiz istek atmamak için). */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}
