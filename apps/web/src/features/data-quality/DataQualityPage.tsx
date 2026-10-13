import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  Check,
  Database,
  Filter,
  HelpCircle,
  Scissors,
  Settings2,
  ShieldCheck,
  Sparkles,
  Table2,
  TriangleAlert,
  Undo2,
  Wrench,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { QueryView } from '@/components/layout/PageStatus';
import {
  Button,
  CodeBlock,
  MetricTile,
  Panel,
  RadioCardGroup,
  SectionHeader,
  StatusChip,
  StatusLine,
  Tag,
} from '@/components/ui';
import { BoxPlotGroup, HistogramWithNormal } from '@/components/charts';
import { RawDataMatrix } from '@/components/domain';
import { useApp } from '@/context/AppContext';
import { useDataQuality } from '@/data/queries';
import type { ImputationMethod } from '@/data/types';

const nf = new Intl.NumberFormat('tr-TR');

export function DataQualityPage() {
  const { datasetId } = useApp();
  const navigate = useNavigate();
  const query = useDataQuality(datasetId);
  const [method, setMethod] = useState<ImputationMethod['id']>('median');
  const [outliersFixed, setOutliersFixed] = useState(false);
  const [imputed, setImputed] = useState(false);

  const reset = () => {
    setOutliersFixed(false);
    setImputed(false);
  };

  return (
    <QueryView query={query}>
      {({ summary, rows, imputationMethods, boxes, cleanedBins, cleanedStats, cleaningSnippet, imputationCode }) => {
        const allApplied = outliersFixed && imputed;
        const imp = imputationCode[method];
        const code = cleaningSnippet.code.replace('{{IMPUTATION}}', imp.title).replace('{{IMPUTATION_CODE}}', imp.code);
        return (
          <>
            <PageHeader
              features={['Özellik 08']}
              context="Diagnostik motor"
              title="Veri Kalitesi, Aykırı ve Eksik Değerler"
              description="Sorunlu hücreler otomatik işaretlenir, IQR ve KNN algoritmalarıyla incelenir ve veri bütünlüğü bozulmadan düzeltilir."
              actions={
                <>
                  <Button icon={Settings2}>Parametreler</Button>
                  <Button
                    variant="primary"
                    icon={allApplied ? Check : Sparkles}
                    disabled={allApplied}
                    onClick={() => {
                      setOutliersFixed(true);
                      setImputed(true);
                    }}
                  >
                    {allApplied ? 'Öneriler uygulandı' : 'Önerilenleri tek tıkla uygula'}
                  </Button>
                </>
              }
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricTile
                label="Veri kalite skoru"
                value={`%${allApplied ? summary.projectedScore : summary.score}`}
                tone="secondary"
                icon={ShieldCheck}
                badge={<Tag tone="secondary">{allApplied ? 'A+' : summary.grade} notu</Tag>}
              >
                {allApplied ? 'Temizleme tamamlandı.' : `Temizleme sonrası öngörülen: %${summary.projectedScore}`}
              </MetricTile>
              <MetricTile label="Toplam gözlem" value={nf.format(summary.observations)} unit="satır" icon={Database}>
                {summary.variables} değişken, {nf.format(summary.dataPoints)} veri noktası
              </MetricTile>
              <MetricTile
                label="Tespit edilen aykırı (IQR)"
                value={outliersFixed ? 0 : summary.outliers}
                tone={outliersFixed ? 'secondary' : 'danger'}
                icon={TriangleAlert}
                badge={!outliersFixed && <Tag tone="danger">%{summary.outlierRate} anomali</Tag>}
              >
                {outliersFixed ? 'IQR filtresi uygulandı.' : `${summary.outlierColumns.join(' ve ')} sütunlarında kümelenmiş.`}
              </MetricTile>
              <MetricTile
                label="Eksik değerler (NaN)"
                value={imputed ? 0 : summary.missing}
                tone={imputed ? 'secondary' : 'tertiary'}
                icon={HelpCircle}
                badge={!imputed && <Tag tone="tertiary">%{summary.missingRate} · {summary.missingColumn}</Tag>}
              >
                {imputed ? `${imp.title} ile dolduruldu.` : `${summary.missingPattern} paterni saptandı.`}
              </MetricTile>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Panel tone="danger">
                <SectionHeader
                  icon={Filter}
                  title={`${summary.outliers} aykırı değer için öneri`}
                  description="Kan basıncı ve biyobelirteç değişkenleri"
                  level={3}
                  actions={<StatusChip status={outliersFixed ? 'success' : 'danger'}>{outliersFixed ? 'Düzeltildi' : 'Önemli risk'}</StatusChip>}
                />
                <p className="text-body text-fg-muted">
                  Normallik varsayımını bozan {summary.outliers} aşırı uç gözlem tespit edildi. Parametrik testlerin sapmasını engellemek için{' '}
                  <strong className="text-fg">IQR filtresi ile budama</strong> veya <strong className="text-fg">medyan winsorization</strong> önerilir.
                </p>
                <dl className="mt-4 grid grid-cols-2 gap-3 rounded-card bg-surface-lowest p-3 text-caption">
                  <div>
                    <dt className="text-fg-subtle">Alt sınır</dt>
                    <dd className="font-mono text-secondary">Q1 − 1.5 × IQR</dd>
                  </div>
                  <div>
                    <dt className="text-fg-subtle">Üst sınır</dt>
                    <dd className="font-mono text-secondary">Q3 + 1.5 × IQR</dd>
                  </div>
                </dl>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <StatusLine status="success" className="text-caption">
                    İstatistiksel güç kaybı &lt; %0.4
                  </StatusLine>
                  <Button icon={outliersFixed ? Check : Scissors} disabled={outliersFixed} onClick={() => setOutliersFixed(true)}>
                    {outliersFixed ? 'IQR ile düzeltildi' : 'IQR ile sınırla ve düzelt'}
                  </Button>
                </div>
              </Panel>

              <Panel tone="warning">
                <SectionHeader
                  icon={Wrench}
                  title={`‘${summary.missingColumn}’ eksik veri imputasyonu`}
                  description={`${summary.missing} hücre eksik (%${summary.missingRate})`}
                  level={3}
                  actions={<StatusChip status={imputed ? 'success' : 'warning'}>{imputed ? 'Tamamlandı' : 'Orta düzey'}</StatusChip>}
                />
                <p className="text-body text-fg-muted">
                  Eksiklik paterni tamamen rastlantısal (MCAR). Satır silmek yerine varyansı koruyan <strong className="text-fg">KNN imputasyonu (k=5)</strong>{' '}
                  veya grup bazlı <strong className="text-fg">medyan ile doldurma</strong> önerilir.
                </p>
                <RadioCardGroup
                  className="mt-4"
                  legend="İmputasyon yöntemi"
                  hideLegend
                  options={imputationMethods.map((m) => ({ value: m.id, title: m.label, hint: m.hint }))}
                  value={method}
                  onChange={(v) => {
                    setMethod(v);
                    setImputed(false);
                  }}
                />
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <StatusLine status="info" className="text-caption">
                    Korelasyon kaybı sıfır
                  </StatusLine>
                  <Button icon={imputed ? Check : Sparkles} disabled={imputed} onClick={() => setImputed(true)}>
                    {imputed ? 'İmputasyon tamamlandı' : 'İmputasyonu tamamla'}
                  </Button>
                </div>
              </Panel>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
              <Panel className="min-w-0 lg:col-span-7">
                <SectionHeader icon={Table2} title="Ham veri matrisi (önizleme)" level={3} actions={<Tag>İlk 7 gözlem</Tag>} />
                <RawDataMatrix rows={rows} />
              </Panel>
              <Panel className="lg:col-span-5">
                <SectionHeader
                  icon={BarChart3}
                  title="Temizlenmiş dağılım ve kutu grafikleri"
                  description="Grup A, B ve C karşılaştırması"
                  level={3}
                  actions={<Tag tone="primary">{outliersFixed ? 'Sonrası' : 'Öncesi'}</Tag>}
                />
                <div className="rounded-card bg-surface-lowest p-3">
                  <p className="mb-1 text-caption text-fg-subtle">Grup bazlı kutu grafiği · tansiyon</p>
                  <BoxPlotGroup
                    boxes={boxes}
                    hideOutliers={outliersFixed}
                    summary={outliersFixed ? 'Aykırı değer budandıktan sonra üç grubun tansiyon dağılımı.' : 'Grup B’de 248 mmHg değerinde bir aykırı değer var.'}
                  />
                </div>
                <div className="mt-4 rounded-card bg-surface-lowest p-3">
                  <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-caption text-fg-subtle">Temizlenmiş frekans histogramı</p>
                    <p className="font-mono text-caption text-secondary">Shapiro-Wilk p = {cleanedStats.shapiroP}</p>
                  </div>
                  <HistogramWithNormal
                    bins={cleanedBins}
                    normal={{ mean: 5.5, sd: 2 }}
                    barTone="secondary"
                    compact
                    summary="Temizlenmiş veri normal dağılıma yakın."
                    className="p-0!"
                  />
                  <p className="mt-2 text-caption text-fg-muted">
                    Budama sonrası asimetri <span className="font-mono">{cleanedStats.skewness}</span>.{' '}
                    <span className="text-secondary">ANOVA parametrik şartı sağlandı.</span>
                  </p>
                </div>
              </Panel>
            </div>

            <CodeBlock className="mt-6" code={code} filename={cleaningSnippet.filename} runtime={cleaningSnippet.runtime} />

            <footer className="mt-6 flex flex-col gap-4 rounded-panel border border-line/30 bg-surface-low p-4 sm:flex-row sm:items-center">
              <div className="flex flex-1 items-start gap-3">
                <ShieldCheck size={22} className={allApplied ? 'text-success' : 'text-fg-subtle'} aria-hidden />
                <div>
                  <p className="text-body-lg font-semibold text-fg">
                    {allApplied ? 'Temizlenmiş veri seti analize hazır' : 'Önerileri uygulayınca veri seti analize hazır olacak'}
                  </p>
                  <p className="text-caption text-fg-subtle">
                    {allApplied
                      ? `${nf.format(cleanedStats.validRows)} geçerli satır, 0 eksik veri. ANOVA varsayımları karşılandı.`
                      : `${summary.outliers} aykırı ve ${summary.missing} eksik hücre bekliyor.`}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button variant="ghost" icon={Undo2} onClick={reset} disabled={!outliersFixed && !imputed}>
                  Geri al (ham veri)
                </Button>
                <Button variant="primary" iconEnd={ArrowRight} onClick={() => navigate('/karar-sihirbazi')}>
                  Hipotez testine geç
                </Button>
              </div>
            </footer>
          </>
        );
      }}
    </QueryView>
  );
}
