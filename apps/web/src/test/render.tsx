import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { AppProvider } from '@/context/AppContext';
import type { Expertise } from '@statadvisor/shared';

export function renderWithApp(ui: ReactElement, { expertise = 'novice' as Expertise } = {}) {
  return render(<AppProvider initialExpertise={expertise}>{ui}</AppProvider>);
}
