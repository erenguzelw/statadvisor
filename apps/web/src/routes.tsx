import { lazy, Suspense } from 'react';
import { createBrowserRouter, Link, Navigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { DataSection } from '@/components/layout/DataSection';
import { DatasetsPage } from '@/features/datasets/DatasetsPage';
import { DecisionWizardPage } from '@/features/decision-wizard/DecisionWizardPage';
import { RegressionPage } from '@/features/regression/RegressionPage';
import { ModelComparisonPage } from '@/features/model-comparison/ModelComparisonPage';
import { DataQualityPage } from '@/features/data-quality/DataQualityPage';
import { CodeReportPage } from '@/features/code-report/CodeReportPage';

// Bileşen kataloğu yalnızca geliştirme sırasında paketlenir.
const ComponentCatalog = import.meta.env.DEV ? lazy(() => import('@/features/catalog/ComponentCatalog')) : null;

function NotFound() {
  return (
    <div className="flex flex-col items-start gap-3 py-16">
      <h1 className="text-title font-bold">Bu sayfa bulunamadı</h1>
      <p className="text-fg-muted">Adres yanlış yazılmış ya da sayfa kaldırılmış olabilir.</p>
      <Link to="/" className="text-secondary underline underline-offset-4">
        Karar Sihirbazı’na dön
      </Link>
    </div>
  );
}

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/karar-sihirbazi" replace /> },
      {
        path: 'veri',
        element: <DataSection />,
        children: [
          { index: true, element: <DatasetsPage /> },
          { path: 'kalite', element: <DataQualityPage /> },
        ],
      },
      { path: 'karar-sihirbazi', element: <DecisionWizardPage /> },
      { path: 'regresyon', element: <RegressionPage /> },
      { path: 'model-karsilastirma', element: <ModelComparisonPage /> },
      { path: 'veri-kalitesi', element: <Navigate to="/veri/kalite" replace /> },
      { path: 'kod-rapor', element: <CodeReportPage /> },
      ...(ComponentCatalog
        ? [
            {
              path: 'bilesenler',
              element: (
                <Suspense fallback={null}>
                  <ComponentCatalog />
                </Suspense>
              ),
            },
          ]
        : []),
      { path: '*', element: <NotFound /> },
    ],
  },
]);
