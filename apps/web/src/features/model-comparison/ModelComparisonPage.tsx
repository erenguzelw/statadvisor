import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDown, BrainCircuit, CheckCheck, Flag, LineChart, Scale, ShieldCheck, Table2 } from 'lucide-react';
import { HeaderStat, PageHeader } from '@/components/layout/PageHeader';
import { QueryView } from '@/components/layout/PageStatus';
import { Button, Callout, CodeBlock, Panel, SectionHeader, StatusChip, StatusLine, Tag } from '@/components/ui';
import { RocCurve } from '@/components/charts';
import { ModelCard, ModelComparisonTable, RedFlagCard, modelColors } from '@/components/domain';
import { useApp } from '@/context/AppContext';
import { useModelComparison } from '@/data/hooks';
import { SegmentedControl } from '@/components/ui';
import { RealDataComparison } from './RealDataComparison';

const pct = (x: number) => `%${(x * 100).toFixed(1)}`;

function SyntheticComparison() {
  const { narrate } = useApp();
  const navigate = useNavigate();
  const query = useModelComparison();
  const [selected, setSelected] = useState<string | null>(null);
  const [resolved, setResolved] = useState<Set<string>>(new Set());

  const resolve = (ids: string[]) => setResolved((prev) => new Set([...prev, ...ids]));

  return (
    <QueryView query={query}>
      {({ models, insight, facts, redFlags, pipeline, recommendedId }) => {
        const open = redFlags.length - resolved.size;
        const sel = selected ?? recommendedId;
        const selectedModel = models.find((m) => m.id === sel) ?? models[0]!;
        const topAuc = models.reduce((a, b) => (b.metrics.rocAuc > a.metrics.rocAuc ? b : a));
        return (
          <>
            <PageHeader
              features={['Özellik 06 & 07']}
              context={
                <span className="font-mono">
                  Tohumlu örnek veri · {facts.rows} gözlem · {facts.features} özellik
                </span>
              }
              title="Model Karşılaştırma ve Analitik Tuzak Radarı"
              description="Tek bir mutlak doğru model yoktur. Ölçütleri taban çizgisiyle birlikte okuyun; kritik istatistiksel tuzakları zamanında görün."
              aside={
                <HeaderStat label="Açık uyarılar" icon={<Flag size={18} className={open ? 'text-tertiary' : 'text-success'} aria-hidden />}>
                  <span aria-live="polite" className={open ? 'text-tertiary' : 'text-success'}>
                    {open ? `${open} kırmızı bayrak açık` : 'Tüm bayraklar çözüldü'}
                  </span>
                </HeaderStat>
              }
              actions={
                <Button variant="primary" icon={CheckCheck} disabled={!open} onClick={() => resolve(redFlags.map((f) => f.id))}>
                  Tümünü çözüldü olarak işaretle
                </Button>
              }
            />

            <Callout
              tone="neutral"
              icon={BrainCircuit}
              title="İnsan dilinde analitik yorum"
              meta={<StatusChip status={insight.headline.startsWith('Model azınlık') ? 'info' : 'danger'}>{insight.headline.startsWith('Model azınlık') ? 'Makul' : 'Azınlık sınıfı zayıf'}</StatusChip>}
              actions={
                <>
                  <div className="rounded-card bg-surface-lowest px-3 py-2">
                    <p className="text-caption text-fg-subtle">Azınlık sınıf desteği</p>
                    <p className="font-mono text-body font-semibold text-tertiary tabular">
                      {facts.positives} / {facts.rows} vaka
                    </p>
                  </div>
                  <Button icon={ArrowDown} onClick={() => document.getElementById('tuzaklar')?.scrollIntoView({ behavior: 'smooth' })}>
                    Uyarılara git
                  </Button>
                </>
              }
            >
              <p className="font-display text-heading font-semibold">
                <Tag tone="tertiary" className="mr-2 align-middle">
                  {insight.metric}
                </Tag>
                {insight.headline}
              </p>
              <p className="mt-2 max-w-prose text-body text-fg-muted" aria-live="polite">
                {narrate(insight.body)}
              </p>
            </Callout>

            <section className="mt-10" aria-labelledby="model-paneli">
              <SectionHeader
                icon={Scale}
                title={<span id="model-paneli">Karşılaştırmalı model paneli</span>}
                feature="Özellik 07"
                description="Tek bir en iyi yok: artılar ve eksiler yan yana. Hız ve yorumlanabilirlik niteliksel değerlendirmedir; diğer ölçütler test setinde hesaplanmıştır."
              />
              <div className="grid grid-cols-1 gap-6 pt-2 md:grid-cols-3">
                {models.map((m) => (
                  <ModelCard
                    key={m.id}
                    model={m}
                    selected={m.id === sel}
                    onSelect={() => setSelected(m.id)}
                    baselineAccuracy={facts.baselineAccuracy}
                  />
                ))}
              </div>
            </section>

            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
              <Panel className="lg:col-span-8">
                <SectionHeader
                  icon={Table2}
                  title="Ayrıntılı performans karşılaştırması"
                  level={3}
                  actions={
                    <span className="font-mono text-caption text-fg-subtle">
                      test n = {facts.testRows} (pozitif {facts.testPositives})
                    </span>
                  }
                />
                <ModelComparisonTable models={models} selectedId={sel} />
                <div className="mt-4 flex flex-col gap-2 rounded-card bg-surface-lowest p-3">
                  <StatusLine status="warning">
                    Doğruluk tek başına yanıltıcıdır: her zaman çoğunluk sınıfını tahmin eden bir model bu test setinde {pct(facts.baselineAccuracy)} doğruluk alır.
                    Dengesiz veride F1 ve PR-AUC’a bakın.
                  </StatusLine>
                  <StatusLine status="info">
                    PR-AUC için rastgele sıralamanın değeri pozitif oranıdır ({facts.prevalence.toFixed(2)}). Eşik: 0.5.
                  </StatusLine>
                </div>
              </Panel>
              <Panel className="lg:col-span-4">
                <SectionHeader
                  icon={LineChart}
                  title="ROC eğrisi"
                  level={3}
                  actions={<Tag tone="primary">AUC = {selectedModel.metrics.rocAuc.toFixed(2)}</Tag>}
                  description={`En yüksek ROC AUC: ${topAuc.name} (${topAuc.metrics.rocAuc.toFixed(2)}). Eğriler test setindeki gerçek tahmin olasılıklarından çizilir.`}
                />
                <RocCurve
                  series={models.map((m) => ({
                    id: m.id,
                    label: m.name,
                    auc: m.metrics.rocAuc,
                    points: m.roc,
                    color: modelColors[m.id] ?? 'var(--color-fg)',
                    emphasized: m.id === sel,
                  }))}
                />
              </Panel>
            </div>

            <section id="tuzaklar" className="mt-10 scroll-mt-24" aria-labelledby="tuzak-baslik">
              <SectionHeader
                icon={Flag}
                title={<span id="tuzak-baslik">Tuzak uyarıları ve kırmızı bayraklar</span>}
                feature="Özellik 06"
                description="Uyarıların metinleri yukarıdaki modellerin gerçek ölçütlerinden üretilir. Bir bayrağı çözüldü işaretlemek ölçütleri değiştirmez; düzeltmeyi kendi veri hattınızda uygulayın."
                actions={
                  open ? <StatusChip status="warning">{open} uyarı açık</StatusChip> : <StatusChip status="success">Tüm uyarılar çözüldü</StatusChip>
                }
              />
              <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                {redFlags.map((f) => (
                  <RedFlagCard key={f.id} flag={f} resolved={resolved.has(f.id)} onResolve={() => resolve([f.id])} />
                ))}
              </div>
            </section>

            <Panel className="mt-10">
              <SectionHeader
                icon={ShieldCheck}
                title="Düzeltme kod şablonu"
                level={3}
                description="SMOTE yalnızca eğitim katlarında uygulanır (Pipeline); çapraz doğrulama sızıntısını önler."
                actions={
                  <StatusChip status={open ? 'warning' : 'success'}>
                    {resolved.size} / {redFlags.length} işaretlendi
                  </StatusChip>
                }
              />
              <CodeBlock code={pipeline.code} filename={pipeline.filename} runtime={pipeline.runtime} />
            </Panel>

            <footer className="mt-6 flex flex-col gap-4 rounded-panel border border-line/30 bg-surface-low p-4 sm:flex-row sm:items-center">
              <StatusLine status="info" className="flex-1">
                Bu bir karar destek aracıdır; yöntem seçiminin ve sonuçların sorumluluğu kullanıcıdadır. Ölçütler örnek veriden gelir.
              </StatusLine>
              <Button variant="primary" onClick={() => navigate('/kod-rapor')}>
                Kod ve rapor merkezine git
              </Button>
            </footer>
          </>
        );
      }}
    </QueryView>
  );
}

/** Model Karşılaştırma: kendi verinizde çapraz doğrulama ya da sentetik örnek. */
export function ModelComparisonPage() {
  const [mode, setMode] = useState<'real' | 'sample'>('real');
  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <SegmentedControl
          label="Model karşılaştırma kaynağı"
          size="md"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'real', label: 'Kendi verim' },
            { value: 'sample', label: 'Örnek (sentetik)' },
          ]}
        />
      </div>
      {mode === 'real' ? <RealDataComparison /> : <SyntheticComparison />}
    </>
  );
}
