import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Expertise, Narrated } from '@statadvisor/shared';
import { useDatasets } from '@/data/hooks';
import type { DatasetInfo } from '@/data/api';

const EXPERTISE_KEY = 'statadvisor.expertise';
const DATASET_KEY = 'statadvisor.dataset';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Depolama kapalıysa tercih yalnızca bu oturumda geçerli olur.
  }
}

interface AppState {
  expertise: Expertise;
  setExpertise: (value: Expertise) => void;
  /** Uzmanlık seviyesine uygun metni seçer. */
  narrate: (text: Narrated) => string;
  /** Kullanıcının seçtiği veri seti kimliği (geçerli olup olmadığı sunucu listesine göre `useActiveDataset` ile çözülür). */
  datasetId: string | null;
  setDatasetId: (id: string | null) => void;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children, initialExpertise }: { children: ReactNode; initialExpertise?: Expertise }) {
  const [expertise, setExpertiseState] = useState<Expertise>(() => initialExpertise ?? (read(EXPERTISE_KEY) === 'expert' ? 'expert' : 'novice'));
  const [datasetId, setDatasetIdState] = useState<string | null>(() => read(DATASET_KEY));

  const setExpertise = useCallback((value: Expertise) => {
    setExpertiseState(value);
    write(EXPERTISE_KEY, value);
  }, []);
  const setDatasetId = useCallback((id: string | null) => {
    setDatasetIdState(id);
    write(DATASET_KEY, id);
  }, []);

  const value = useMemo<AppState>(
    () => ({ expertise, setExpertise, narrate: (t) => t[expertise], datasetId, setDatasetId }),
    [expertise, setExpertise, datasetId, setDatasetId],
  );
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp, AppProvider içinde kullanılmalı');
  return ctx;
}

/** Etkin veri seti: seçili olan; yoksa ya da silinmişse en yeni veri seti. Veri seti yoksa null. */
export function useActiveDataset(): { dataset: DatasetInfo | null; loading: boolean; error: Error | null; datasets: DatasetInfo[] } {
  const { datasetId } = useApp();
  const q = useDatasets();
  const list = q.data ?? [];
  const dataset = list.find((d) => d.id === datasetId) ?? list[0] ?? null;
  return { dataset, loading: q.isPending, error: q.error, datasets: list };
}
