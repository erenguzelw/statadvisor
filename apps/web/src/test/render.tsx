import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { AppProvider } from '@/context/AppContext';
import type { Expertise } from '@/data/types';

export function renderWithApp(ui: ReactElement, { expertise = 'novice' as Expertise } = {}) {
  return render(<AppProvider initialExpertise={expertise}>{ui}</AppProvider>);
}
