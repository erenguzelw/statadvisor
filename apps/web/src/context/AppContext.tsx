import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Expertise, Narrated } from '@statadvisor/shared';

const STORAGE_KEY = 'statadvisor.expertise';

function readStored(): Expertise {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'expert' ? 'expert' : 'novice';
  } catch {
    return 'novice';
  }
}

interface AppState {
  expertise: Expertise;
  setExpertise: (value: Expertise) => void;
  /** Uzmanlık seviyesine uygun metni seçer. */
  narrate: (text: Narrated) => string;
  datasetId: string;
  setDatasetId: (id: string) => void;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children, initialExpertise }: { children: ReactNode; initialExpertise?: Expertise }) {
  const [expertise, setExpertiseState] = useState<Expertise>(() => initialExpertise ?? readStored());
  const [datasetId, setDatasetId] = useState('klinik-faz3');

  const setExpertise = useCallback((value: Expertise) => {
    setExpertiseState(value);
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // Depolama kapalıysa tercih yalnızca bu oturumda geçerli olur.
    }
  }, []);

  const value = useMemo<AppState>(
    () => ({ expertise, setExpertise, narrate: (t) => t[expertise], datasetId, setDatasetId }),
    [expertise, setExpertise, datasetId],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp, AppProvider içinde kullanılmalı');
  return ctx;
}
