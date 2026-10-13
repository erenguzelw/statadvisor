import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  Check,
  Database,
  Filter,
  GitFork,
  HelpCircle,
  Scissors,
  ShieldCheck,
  Sparkles,
  Table2,
  TriangleAlert,
  Undo2,
  Wrench,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { QueryView } from '@/components/layout/PageStatus';
import { Button, Callout, CodeBlock, MetricTile, Panel, RadioCardGroup, SectionHeader, StatusChip, StatusLine, Tag } from '@/components/ui';
import { BoxPlotGroup, HistogramWithNormal } from '@/components/charts';
import { RawDataMatrix } from '@/components/domain';
import { useApp } from '@/context/AppContext';
import { useDataQuality } from '@/data/queries';
import type { ImputationMethod } from '@/data/types';
import { formatP } from '@/lib/stats';

const nf = new Intl.NumberFormat('tr-TR');
const fmt1 = (x: number) => x.toFixed(1);

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
      {({ summary, rows, imputationMethods, boxes, boxesCleaned, histBefore, histAfter, skewBefore, skewAfter, cleaningSnippet, imputationCode }) => {
        const allApplied = outliersFixed && imputed;
        const imp = imputationCode[method];
        const code = cleaningSnippet.code.replace('{{IMPUTATION}}', imp.title).replace('{{IMPUTATION_CODE}}', imp.code);
        const hist = outliersFixed ? histAfter : histBefore;
        const shapiro = outliersFixed ? summary.shapiroAfter : summary.shapiroBefore;
        const skew = outliersFixed ? skewAfter : skewBefore;
        const flaggedCells = (outliersFixed ? 0 : summary.outliers) + (imputed ? 0 : summary.missing);
        const integrity = (1 - flaggedCells / summary.cells) * 100;
        return (
          <>
            <PageHeader
              features={['Özellik 08']}
              context="Diagnostik motor"
              title="Veri Kalitesi, Aykırı ve Eksik Değerler"
              description="Sorunlu hücreler Tukey sınırlarıyla işaretlenir; düzeltmeler uygulanmadan önce sonuçları nasıl etkileyeceği gösterilir."
              actions={
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
              }
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricTile label="Temiz hücre oranı" value={`%${fmt1(integrity)}`} tone="secondary" icon={ShieldCheck}>
                1 − (aykırı + eksik hücre) / toplam hücre
              </MetricTile>
              <MetricTile label="Toplam gözlem" value={nf.format(summary.observations)} unit="satır" icon={Database}>
                {summary.variables} değişken, {nf.format(summary.cells)} hücre
              </MetricTile>
              <MetricTile
                label="Aykırı hücre (Tukey 1.5×IQR)"
                value={outliersFixed ? 0 : summary.outliers}
                tone={outliersFixed ? 'secondary' : 'danger'}
                icon={TriangleAlert}
                badge={!outliersFixed && <Tag tone="danger">%{((summary.outliers / summary.cells) * 100).toFixed(2)} hücre</Tag>}
              >
                {outliersFixed
                  ? `${summary.removedRows} satır çıkarıldı.`
                  : summary.outlierColumns.map((c) => `${c.label}: ${c.count}`).join(' · ')}
              </MetricTile>
              <MetricTile
                label="Eksik değerler (NaN)"
                value={imputed ? 0 : summary.missing}
                tone={imputed ? 'secondary' : 'tertiary'}
                icon={HelpCircle}
                badge={!imputed && <Tag tone="tertiary">%{summary.missingRate.toFixed(1)} · {summary.missingColumn}</Tag>}
              >
                {imputed ? `${imp.title} ile dolduruldu.` : 'Eksiklik mekanizması test edilmedi (MCAR doğrulanmadı).'}
              </MetricTile>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Panel tone="danger">
                <SectionHeader
                  icon={Filter}
                  title={`${summary.outliers} aykırı hücre için öneri`}
                  description="Kan basıncı ve biyobelirteç değişkenleri"
                  level={3}
                  actions={<StatusChip status={outliersFixed ? 'success' : 'danger'}>{outliersFixed ? 'Düzeltildi' : 'Önemli risk'}</StatusChip>}
                />
                <p className="text-body text-fg-muted">
                  Tukey sınırlarının (Q1 − 1.5·IQR, Q3 + 1.5·IQR) dışında {summary.outliers} gözlem işaretlendi.{' '}
                  <strong className="text-fg">Silmeden önce klinik olarak geçerli olup olmadığını kontrol edin:</strong> gerçek ama uç değerleri silmek sonucu
                  yanıltabilir. Alternatifler: kırpma (winsorization) ya da dayanıklı yöntemler.
                </p>
                <dl className="mt-4 grid grid-cols-1 gap-3 rounded-card bg-surface-lowest p-3 text-caption sm:grid-cols-2">
                  {summary.outlierColumns.map((c) => (
                    <div key={c.column}>
                      <dt className="text-fg-subtle">
                        {c.label} sınırları ({c.count} sınır dışı)
                      </dt>
                      <dd className="font-mono text-secondary tabular">
                        {c.lower.toFixed(1)} – {c.upper.toFixed(1)}
                      </dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <StatusLine status="warning" className="text-caption">
                    {summary.removedRows} satır çıkarılacak (%{summary.removedRate.toFixed(1)})
                  </StatusLine>
                  <Button icon={outliersFixed ? Check : Scissors} disabled={outliersFixed} onClick={() => setOutliersFixed(true)}>
                    {outliersFixed ? 'Aykırılar çıkarıldı' : 'Aykırı gözlemleri çıkar'}
                  </Button>
                </div>
              </Panel>

              <Panel tone="warning">
                <SectionHeader
                  icon={Wrench}
                  title={`‘${summary.missingColumn}’ eksik veri imputasyonu`}
                  description={`${summary.missing} hücre eksik (%${summary.missingRate.toFixed(1)})`}
                  level={3}
                  actions={<StatusChip status={imputed ? 'success' : 'warning'}>{imputed ? 'Tamamlandı' : 'Orta düzey'}</StatusChip>}
                />
                <p className="text-body text-fg-muted">
                  Eksikliğin nedeni bilinmiyor: gelir gibi değişkenlerde eksiklik çoğu zaman değerin kendisine bağlıdır ve bu, doldurmayı yanlı kılar.
                  <strong className="text-fg"> KNN imputasyonu (k=5)</strong> ilişkileri korur; <strong className="text-fg">medyan ile doldurma</strong> hızlıdır
                  ama varyansı küçültür.
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
                    Doldurulan değerler belirsizlik taşır; mümkünse çoklu imputasyon düşünün.
                  </StatusLine>
                  <Button icon={imputed ? Check : Sparkles} disabled={imputed} onClick={() => setImputed(true)}>
                    {imputed ? 'İmputasyon tamamlandı' : 'İmputasyonu tamamla'}
                  </Button>
                </div>
              </Panel>
            </div>

            <Callout tone="warning" icon={GitFork} title="Dallanan yol uyarısı" className="mt-6">
              Kan basıncı kalıntılarında Shapiro-Wilk p değeri, aykırılar varken{' '}
              <span className="font-mono">{formatP(summary.shapiroBefore.p)}</span>, çıkarıldıktan sonra{' '}
              <span className="font-mono">{formatP(summary.shapiroAfter.p)}</span>. Temizlik, test seçimini değiştirebilir; bu yüzden
              yaptığınız temizliği ve nedenini raporunuzda belirtin.
            </Callout>

            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
              <Panel className="min-w-0 lg:col-span-7">
                <SectionHeader icon={Table2} title="Ham veri matrisi (önizleme)" level={3} actions={<Tag>İlk 7 gözlem</Tag>} />
                <RawDataMatrix rows={rows} />
              </Panel>
              <Panel className="lg:col-span-5">
                <SectionHeader
                  icon={BarChart3}
                  title="Dağılım ve kutu grafikleri"
                  description="Kan basıncı, grup A, B ve C"
                  level={3}
                  actions={<Tag tone="primary">{outliersFixed ? 'Sonrası' : 'Öncesi'}</Tag>}
                />
                <div className="rounded-card bg-surface-lowest p-3">
                  <p className="mb-1 text-caption text-fg-subtle">Grup bazlı kutu grafiği · bıyıklar grup içi Tukey sınırlarıdır</p>
                  <BoxPlotGroup
                    boxes={outliersFixed ? boxesCleaned : boxes}
                    unit="mmHg"
                    summary={
                      outliersFixed
                        ? 'Aykırı gözlemler çıkarıldıktan sonra üç grubun kan basıncı dağılımı.'
                        : `Üç grubun kan basıncı dağılımı; en uç gözlem ${Math.max(...boxes.flatMap((b) => b.outliers)).toFixed(0)} mmHg.`
                    }
                  />
                </div>
                <div className="mt-4 rounded-card bg-surface-lowest p-3">
                  <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-caption text-fg-subtle">Grup ortalamasından sapma (mmHg)</p>
                    <p className="font-mono text-caption text-secondary">
                      Shapiro-Wilk W = {shapiro.W.toFixed(3)}, p {formatP(shapiro.p).startsWith('<') ? formatP(shapiro.p) : `= ${formatP(shapiro.p)}`}
                    </p>
                  </div>
                  <HistogramWithNormal
                    bins={hist.bins}
                    normal={{ mean: hist.mean, sd: hist.sd }}
                    barTone="secondary"
                    compact
                    summary={`Kan basıncı kalıntılarının histogramı, çarpıklık ${skew.toFixed(2)}.`}
                    className="p-0!"
                  />
                  <p className="mt-2 text-caption text-fg-muted">
                    Çarpıklık <span className="font-mono">{skew.toFixed(2)}</span>.{' '}
                    {shapiro.p >= 0.05 ? 'Normallikten sapma saptanmadı.' : 'Normallik varsayımı reddedildi.'}
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
                      ? `${nf.format(summary.cleanedRows)} satır; ${summary.removedRows} satır çıkarıldı, ${summary.missing} eksik hücre dolduruldu.`
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
