import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, Languages, RefreshCw, Scale, SquareTerminal, Wand2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { QueryView } from '@/components/layout/PageStatus';
import { ExpertiseToggle } from '@/components/layout/ExpertiseToggle';
import { Button, CodeBlock, Panel, SectionHeader } from '@/components/ui';
import { ChartLegend, HistogramWithNormal } from '@/components/charts';
import {
  AssumptionTestCard,
  DecisionPath,
  InterpretationCard,
  ModelComparisonTable,
  RerouteBanner,
  WizardSteps,
} from '@/components/domain';
import { useApp } from '@/context/AppContext';
import { useAnalysis, useCodeReport, useModelComparison } from '@/data/queries';

export function DecisionWizardPage() {
  const { datasetId } = useApp();
  const navigate = useNavigate();
  const analysis = useAnalysis(datasetId);
  const models = useModelComparison(datasetId);
  const code = useCodeReport(datasetId);
  const [selectedModel, setSelectedModel] = useState('rf');

  return (
    <QueryView query={analysis}>
      {(a) => (
        <>
          <PageHeader
            features={['Özellik 01–03']}
            context="Parametrik ve non-parametrik dönüşüm"
            title="Hipotez Testi ve Model Danışmanı"
            description="Otomatik varsayım denetimi, karar motoru ve insan dilinde istatistiksel çıkarım."
            actions={
              <>
                <Button icon={RefreshCw}>Yeniden test et</Button>
                <Button variant="primary" icon={SquareTerminal} onClick={() => navigate('/kod-rapor')}>
                  Kodu çalıştır
                </Button>
              </>
            }
          />

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="flex min-w-0 flex-col gap-6 lg:col-span-5">
              <Panel>
                <SectionHeader
                  icon={Wand2}
                  title="Karar sihirbazı"
                  feature="Özellik 02"
                  description="Teknik terim bilmeden, birkaç basit soruyla uygun analiz yolunu belirleyin."
                />
                <WizardSteps steps={a.wizard} />
                <div className="mt-4 rounded-card border border-line/30 bg-surface-lowest p-4">
                  <p className="mb-3 text-caption font-medium text-fg-subtle">Karar ağacında izlenen yol</p>
                  <DecisionPath path={a.decision} />
                </div>
              </Panel>
              {code.data?.snippets[0] && (
                <CodeBlock
                  code={code.data.snippets[0].code}
                  maxHeight="22rem"
                  filename="analiz.py"
                  runtime="SciPy Stats 1.11"
                />
              )}
            </div>

            <div className="flex min-w-0 flex-col gap-6 lg:col-span-7">
              <RerouteBanner path={a.decision} />

              <Panel>
                <SectionHeader icon={Activity} title="Otomatik varsayım kontrolü" feature="Özellik 01" />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {a.assumptions.map((t) => (
                    <AssumptionTestCard key={t.id} test={t} />
                  ))}
                </div>
                <div className="mt-4 rounded-card border border-line/30 bg-surface-lowest p-4">
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-body-lg font-semibold text-fg">Örneklem histogramı ve kuramsal normal eğri</h3>
                      <p className="text-caption text-fg-subtle">
                        Pozitif çarpıklık gözlemleniyor (skewness = <span className="font-mono">+{a.distribution.skewness}</span>).
                      </p>
                    </div>
                    <ChartLegend
                      items={[
                        { label: 'Gözlenen veri', swatch: 'bar', color: 'var(--color-primary-strong)' },
                        { label: 'Beklenen normal', swatch: 'dash', color: 'var(--color-tertiary)' },
                      ]}
                    />
                  </div>
                  <HistogramWithNormal
                    bins={a.distribution.bins}
                    normal={{ mean: a.distribution.mean, sd: a.distribution.sd }}
                    annotation="Sağa çarpık (uzun sağ kuyruk)"
                    summary="Gözlenen veri sağa çarpık; tepe noktası beklenen normal eğrinin solunda."
                    className="p-0!"
                  />
                </div>
              </Panel>

              <Panel>
                <SectionHeader
                  icon={Languages}
                  title="İnsan dilinde sonuçlar"
                  feature="Özellik 03 & 10"
                  actions={<ExpertiseToggle />}
                />
                <InterpretationCard result={a.result} />
              </Panel>
            </div>
          </div>

          {models.data && (
            <Panel className="mt-6">
              <SectionHeader
                icon={Scale}
                title="Karşılaştırmalı model paneli"
                feature="Özellik 07"
                description="Tek bir “en iyi” yok: iş yükünüze en uygun yaklaşımı seçin."
              />
              <ModelComparisonTable models={models.data.models} selectedId={selectedModel} onSelect={setSelectedModel} />
            </Panel>
          )}
        </>
      )}
    </QueryView>
  );
}
