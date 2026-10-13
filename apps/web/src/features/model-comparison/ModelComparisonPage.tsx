import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDown, BrainCircuit, Download, Flag, LineChart, Rocket, Scale, ShieldCheck, Table2, Wand2 } from 'lucide-react';
import { HeaderStat, PageHeader } from '@/components/layout/PageHeader';
import { QueryView } from '@/components/layout/PageStatus';
import { Button, Callout, CodeBlock, Panel, SectionHeader, StatusChip, StatusLine, Tag } from '@/components/ui';
import { RocCurve } from '@/components/charts';
import { ModelCard, ModelComparisonTable, RedFlagCard, modelColors } from '@/components/domain';
import { useApp } from '@/context/AppContext';
import { useModelComparison } from '@/data/queries';

export function ModelComparisonPage() {
  const { datasetId, narrate } = useApp();
  const navigate = useNavigate();
  const query = useModelComparison(datasetId);
  const [selected, setSelected] = useState('rf');
  const [resolved, setResolved] = useState<Set<string>>(new Set());

  const resolve = (ids: string[]) => setResolved((prev) => new Set([...prev, ...ids]));

  return (
    <QueryView query={query}>
      {({ models, insight, minoritySupport, redFlags, pipeline }) => {
        const open = redFlags.length - resolved.size;
        return (
          <>
            <PageHeader
              features={['Özellik 06 & 07']}
              context={<span className="font-mono">Klinik_Faz3_Sonuc.parquet</span>}
              title="Model Karşılaştırma ve Analitik Tuzak Radarı"
              description="Tek bir mutlak doğru model yoktur. Yorumlanabilirlik, hız ve hata toleransı dengesini değerlendirin; kritik istatistiksel tuzakları zamanında görün."
              aside={
                <HeaderStat label="Aktif tuzak riski" icon={<Flag size={18} className={open ? 'text-tertiary' : 'text-success'} aria-hidden />}>
                  <span aria-live="polite" className={open ? 'text-tertiary' : 'text-success'}>
                    {open ? `${open} kritik kırmızı bayrak` : 'Tüm bayraklar çözüldü'}
                  </span>
                </HeaderStat>
              }
              actions={
                <Button variant="primary" icon={Wand2} disabled={!open} onClick={() => resolve(redFlags.map((f) => f.id))}>
                  Otomatik düzeltmeleri uygula
                </Button>
              }
            />

            <Callout
              tone="neutral"
              icon={BrainCircuit}
              title="İnsan dilinde analitik yorum"
              meta={<StatusChip status="danger">Kritik sınıf zayıflığı</StatusChip>}
              actions={
                <>
                  <div className="rounded-card bg-surface-lowest px-3 py-2">
                    <p className="text-caption text-fg-subtle">Azınlık sınıf desteği</p>
                    <p className="font-mono text-body font-semibold text-tertiary tabular">
                      {minoritySupport.minority} / {minoritySupport.total} vaka
                    </p>
                  </div>
                  <Button
                    icon={ArrowDown}
                    onClick={() => document.getElementById('tuzaklar')?.scrollIntoView({ behavior: 'smooth' })}
                  >
                    Tuzakları çöz
                  </Button>
                </>
              }
            >
              <p className="font-display text-heading font-semibold">
                <Tag tone="tertiary" className="mr-2 align-middle">{insight.metric}</Tag>
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
                description="Tek bir en iyi yok: artılar ve eksiler yan yana."
                actions={
                  <span className="text-caption text-fg-subtle">
                    Optimizasyon hedefi: <span className="text-secondary">dengeli F1 ve yorumlanabilirlik</span>
                  </span>
                }
              />
              <div className="grid grid-cols-1 gap-6 pt-2 md:grid-cols-3">
                {models.map((m) => (
                  <ModelCard key={m.id} model={m} selected={m.id === selected} onSelect={() => setSelected(m.id)} />
                ))}
              </div>
            </section>

            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
              <Panel className="lg:col-span-7">
                <SectionHeader
                  icon={Table2}
                  title="Ayrıntılı performans ve hata matrisi"
                  level={3}
                  actions={<span className="font-mono text-caption text-fg-subtle">N = {minoritySupport.total}</span>}
                />
                <ModelComparisonTable models={models} selectedId={selected} detailed />
                <div className="mt-4 rounded-card bg-surface-lowest p-3">
                  <StatusLine status="success">Veri sızıntısı (data leakage) taraması: temiz.</StatusLine>
                  <p className="mt-1 pl-6 text-caption text-fg-subtle">
                    Ağırlıklı karar indeksi: <span className="text-secondary">Random Forest, +14.2% üstün</span>
                  </p>
                </div>
              </Panel>
              <Panel className="lg:col-span-5">
                <SectionHeader
                  icon={LineChart}
                  title="ROC eğrisi önizlemesi"
                  level={3}
                  actions={<Tag tone="primary">AUC = 0.91</Tag>}
                  description="XGBoost ve Random Forest, tüm yanlış pozitif oranlarında lojistik regresyon taban çizgisinin üzerinde."
                />
                <RocCurve
                  series={models.map((m) => ({
                    id: m.id,
                    label: m.name,
                    auc: m.rocAuc,
                    points: m.roc,
                    color: modelColors[m.id] ?? 'var(--color-fg)',
                    emphasized: m.id === selected,
                  }))}
                />
              </Panel>
            </div>

            <section id="tuzaklar" className="mt-10 scroll-mt-24" aria-labelledby="tuzak-baslik">
              <SectionHeader
                icon={Flag}
                title={<span id="tuzak-baslik">Tuzak uyarıları ve kırmızı bayraklar</span>}
                feature="Özellik 06"
                description="Doğru görselleştirme, istatistiksel geçerlilik kontrolleri ve zamanında müdahale."
                actions={
                  open ? (
                    <StatusChip status="danger">Kritik hata seviyesi: yüksek</StatusChip>
                  ) : (
                    <StatusChip status="success">Tüm riskler giderildi</StatusChip>
                  )
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
                title="Düzeltme ve karar simülasyon çekirdeği"
                level={3}
                description="Kırmızı bayraklar çözüldükçe metrik sapması ve Scikit-learn işlem hattı güncellenir."
                actions={
                  <StatusChip status={open ? 'warning' : 'success'}>
                    Düzeltmeler: {resolved.size} / {redFlags.length} uygulandı
                  </StatusChip>
                }
              />
              <CodeBlock code={pipeline.code} filename={pipeline.filename} runtime={pipeline.runtime} />
            </Panel>

            <footer className="mt-6 flex flex-col gap-4 rounded-panel border border-line/30 bg-surface-low p-4 sm:flex-row sm:items-center">
              <StatusLine status="success" className="flex-1">
                Tüm modeller ve varsayım testleri IEEE / APA klinik standartlarına uygun.
              </StatusLine>
              <div className="flex flex-wrap gap-3">
                <Button icon={Download} onClick={() => navigate('/kod-rapor')}>
                  Raporu PDF olarak indir
                </Button>
                <Button variant="primary" icon={Rocket} disabled={open > 0} title={open ? 'Önce kırmızı bayrakları çözün' : undefined}>
                  Modeli üretime aktar
                </Button>
              </div>
            </footer>
          </>
        );
      }}
    </QueryView>
  );
}
