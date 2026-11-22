import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/space-grotesk/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/600.css';
import './styles/index.css';
import { AppProvider } from '@/context/AppContext';
import { I18nProvider } from '@/i18n';
import { router } from './routes';

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: 1 } } });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <AppProvider>
          <RouterProvider router={router} />
        </AppProvider>
      </I18nProvider>
    </QueryClientProvider>
  </StrictMode>,
);
