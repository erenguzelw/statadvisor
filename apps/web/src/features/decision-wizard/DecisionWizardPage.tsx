import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Database, FlaskConical, Save, TriangleAlert, Wand2 } from 'lucide-react';
import type { NormalityMethod, WizardAnswers } from '@statadvisor/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, Callout, CheckboxGroup, Panel, SectionHeader, Select, StatusLine, Tag } from '@/components/ui';
import { DecisionPath, DecisionWizard, RecommendationNotes } from '@/components/domain';
import { useActiveDataset } from '@/context/AppContext';
import type { ColumnInfo, DatasetInfo } from '@/data/api';
import { useAnalysisPreview, useSaveAnalysis } from '@/data/hooks';
import { useDebounced } from '@/lib/useDebounced';
import { buildBody, columnTypeLabel, defaultPicks, groupColumns, missingHint, numericColumns, typeOf, type Answers, type Picks } from '@/lib/variables';
import { AnalysisView } from './AnalysisView';

const opt = (c: ColumnInfo) => ({ value: c.name, label: `${c.name} · ${columnTypeLabel[c.type]}` });

function EmptyDataset() {
  return (
    <>
      <PageHeader features={['Özellik 01–03']} title="Hipotez Testi ve Model Danışmanı" description="Sorularınızı yanıtlayın; kural motoru varsayım testlerinin sonucuna göre uygun testi önerir ve sonucu sade bir dille anlatır." />
      <Callout tone="info" icon={Database} title="Önce bir veri seti seçin" actions={<Link className="rounded-control bg-primary-strong px-4 py-2 font-semibold text-on-primary-strong" to="/veri">Veri setlerine git</Link>}>
        Analiz için bir CSV dosyası yükleyin ya da örnek bir veri setiyle başlayın.
      </Callout>
    </>
  );
}

export function DecisionWizardPage() {
  const { dataset, loading, error } = useActiveDataset();
  if (loading) return <p className="text-fg-muted">Yükleniyor…</p>;
  if (error) return <StatusLine status="danger">{error.message}</StatusLine>;
  if (!dataset) return <EmptyDataset />;
  // Veri seti değişince seçimler sıfırlanır.
  return <Wizard key={dataset.id} dataset={dataset} />;
}

function Wizard({ dataset }: { dataset: DatasetInfo }) {
  const navigate = useNavigate();
  const cols = dataset.columns;
  const init = useMemo(() => defaultPicks(cols), [cols]);
  const [answers, setAnswers] = useState<Answers>({ goal: 'compare', design: 'unknown', target: init.target });
  const [picks, setPicks] = useState<Picks>(init.picks);
  const save = useSaveAnalysis();
  // Ölçek puanı içeren (anket) veri setlerinde varsayılan ölçüt çarpıklık-basıklıktır.
  const [normality, setNormality] = useState<NormalityMethod>(dataset.operations?.scales ? 'skewkurt-1.5' : 'shapiro');
  const [variance, setVariance] = useState<'welch' | 'levene'>('welch');
  // Varyans yaklaşımı yalnızca bağımsız grupların sürekli karşılaştırmasında anlamlıdır; varsayılan (welch) gövdeye yazılmaz.
  const independentCompare = answers.goal === 'compare' && answers.design !== 'paired' && answers.target === 'continuous';

  const body = useMemo(() => {
    const b = buildBody(dataset.id, cols, answers, picks);
    if (!b || answers.target !== 'continuous') return b;
    return { ...b, normality, ...(independentCompare && variance === 'levene' ? { variance } : {}) };
  }, [dataset.id, cols, answers, picks, normality, variance, independentCompare]);
  const settled = useDebounced(body, 350);
  const preview = useAnalysisPreview(settled);
  const result = preview.data?.result;
  const stale = body !== settled || preview.isFetching;

  const nums = numericColumns(cols);
  const groups = groupColumns(cols);
  const setPick = (patch: Partial<Picks>) => setPicks((p) => ({ ...p, ...patch }));
  const setAnswer = (next: WizardAnswers | Answers) => setAnswers({ goal: next.goal, design: next.design, target: next.target });
  const onValue = (name: string) => {
    setPick({ value: name });
    const t = typeOf(cols, name);
    if (t) setAnswers((a) => (a.goal === 'compare' && a.target !== 'categorical' ? { ...a, target: t === 'categorical' ? 'categorical' : t } : a));
  };

  const fieldsFor = () => {
    if (answers.goal === 'predict') return null;
    if (answers.goal === 'relate') {
      return answers.target === 'categorical' ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select label="Birinci kategorik sütun" value={picks.rowVar} onChange={(v) => setPick({ rowVar: v })} options={groups.map(opt)} />
          <Select label="İkinci kategorik sütun" value={picks.colVar} onChange={(v) => setPick({ colVar: v })} options={groups.map(opt)} />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select label="Birinci sayısal sütun (x)" value={picks.x} onChange={(v) => setPick({ x: v })} options={nums.map(opt)} />
          <Select label="İkinci sayısal sütun (y)" value={picks.y} onChange={(v) => setPick({ y: v })} options={nums.map(opt)} />
        </div>
      );
    }
    if (answers.design === 'paired' && answers.target !== 'categorical') {
      return (
        <CheckboxGroup
          legend="Karşılaştırılacak sütunlar (aynı kişilerin ölçümleri; seçim sırası önemlidir)"
          options={nums.map((c) => ({ value: c.name, label: c.name, hint: columnTypeLabel[c.type] }))}
          values={picks.conditions}
          onChange={(v) => setPick({ conditions: v })}
          hint="En az 2 sütun seçin. Her satır aynı denekle ilgili olmalıdır."
        />
      );
    }
    return answers.target === 'categorical' ? (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Select label="Grup sütunu" value={picks.group} onChange={(v) => setPick({ group: v })} options={groups.map(opt)} hint="2–12 farklı değer içermeli." />
        <Select label="Sonuç sütunu (kategorik)" value={picks.value} onChange={(v) => setPick({ value: v })} options={groups.map(opt)} />
      </div>
    ) : (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Select label="Sonuç sütunu (sayısal)" value={picks.value} onChange={onValue} options={nums.map(opt)} />
        <Select label="Grup sütunu" value={picks.group} onChange={(v) => setPick({ group: v })} options={groups.map(opt)} hint="2–12 farklı değer içermeli." />
      </div>
    );
  };

  const saveAndOpen = () => {
    if (!body) return;
    save.mutate(body, { onSuccess: (r) => navigate(`/kod-rapor?analiz=${r.id}`) });
  };

  return (
    <>
      <PageHeader
        features={['Özellik 01–03']}
        context={<span className="font-mono">{dataset.name}</span>}
        title="Hipotez Testi ve Model Danışmanı"
        description="Sorularınızı yanıtlayın ve sütunları seçin; kural motoru varsayım testlerinin sonucuna göre uygun testi önerir, çalıştırır ve sonucu sade bir dille anlatır."
        actions={
          <Button variant="primary" icon={Save} disabled={!result || stale || save.isPending} onClick={saveAndOpen}>
            {save.isPending ? 'Kaydediliyor…' : 'Kaydet ve kod/rapor oluştur'}
          </Button>
        }
      />
      {save.error && <StatusLine status="danger" className="mb-4">{save.error.message}</StatusLine>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-5">
          <Panel>
            <SectionHeader
              icon={Wand2}
              title="Karar sihirbazı"
              feature="Özellik 02"
              description="Yanıtlarınız ve seçtiğiniz sütunlar değiştikçe analiz anında güncellenir. Grup sayısı seçtiğiniz sütundan belirlenir."
            />
            <DecisionWizard answers={{ ...answers, groups: '3+' }} onChange={setAnswer} inferred={answers.goal === 'compare' ? ['target'] : []} hide={['groups']} />
            <div className="mt-4 rounded-card border border-line/30 bg-surface-lowest p-4">
              <h3 className="mb-3 text-body font-semibold text-fg">Değişkenler</h3>
              {fieldsFor() ?? (
                <StatusLine status="info">
                  Tahmin için hipotez testi değil, model karşılaştırması gerekir.{' '}
                  <Link to="/model-karsilastirma" className="font-medium text-secondary underline underline-offset-2">
                    Model Karşılaştırma sayfasına gidin.
                  </Link>
                </StatusLine>
              )}
              {answers.goal !== 'predict' && answers.target === 'continuous' && (
                <div className="mt-4">
                  <Select
                    label="Normallik ölçütü"
                    value={normality}
                    onChange={(v) => setNormality(v as NormalityMethod)}
                    options={[
                      { value: 'shapiro', label: 'Shapiro-Wilk (p ≥ α)' },
                      { value: 'skewkurt-1.5', label: 'Çarpıklık ve basıklık ±1.5 (Tabachnick ve Fidell)' },
                      { value: 'skewkurt-2', label: 'Çarpıklık ve basıklık ±2 (George ve Mallery)' },
                    ]}
                    hint="Anket ve ölçek puanlarında çarpıklık-basıklık ölçütü yaygındır; büyük örneklemde Shapiro-Wilk çok küçük sapmaları da reddeder."
                  />
                  {independentCompare && (
                    <Select
                      className="mt-4"
                      label="Varyans eşitliği yaklaşımı"
                      value={variance}
                      onChange={(v) => setVariance(v as 'welch' | 'levene')}
                      options={[
                        { value: 'welch', label: 'Her zaman Welch (önerilen) · post-hoc: Games–Howell' },
                        { value: 'levene', label: 'Levene anlamsızsa klasik test · post-hoc: Tukey HSD' },
                      ]}
                      hint="Welch, varyanslar eşitken de güç kaybettirmez. İkinci seçenek SPSS alışkanlığıdır: Levene p ≥ α ise Student t / tek yönlü ANOVA ve Tukey, değilse Welch ve Games–Howell."
                    />
                  )}
                </div>
              )}
            </div>
            {result && (
              <div className="mt-4 rounded-card border border-line/30 bg-surface-lowest p-4">
                <p className="mb-3 text-caption font-medium text-fg-subtle">Karar ağacında izlenen yol</p>
                <DecisionPath path={result.decision} />
              </div>
            )}
          </Panel>
          {result && <RecommendationNotes warnings={result.decision.warnings} />}
        </div>

        <div className="flex min-w-0 flex-col gap-6 lg:col-span-7" aria-live="polite" aria-busy={stale}>
          {answers.goal === 'predict' ? (
            <Callout tone="warning" icon={TriangleAlert} title="Hipotez testi uygulanmıyor">
              Tahmin amaçlı çalışmalarda varsayım testleri yerine çapraz doğrulama ve dengesiz veriye uygun ölçütler (F1, PR-AUC) kullanılır.
            </Callout>
          ) : !body ? (
            <Callout tone="neutral" icon={FlaskConical} title="Analiz için eksik bilgi">
              {missingHint(answers)}
            </Callout>
          ) : preview.isError && !result ? (
            <Callout tone="danger" icon={TriangleAlert} title="Bu seçimle analiz yapılamadı">
              {preview.error.message}
            </Callout>
          ) : !result ? (
            <p className="rounded-panel border border-line/30 bg-surface p-6 text-fg-muted">Analiz hesaplanıyor…</p>
          ) : (
            <div className={stale ? 'flex flex-col gap-6 opacity-60 transition-opacity' : 'flex flex-col gap-6'}>
              {preview.isError && (
                <Callout tone="danger" icon={TriangleAlert} title="Son seçimle analiz yapılamadı">
                  {preview.error.message} Aşağıda önceki geçerli sonuç görünüyor.
                </Callout>
              )}
              <p className="flex flex-wrap items-center gap-2 text-caption text-fg-subtle">
                <Tag>{result.outcome.test}</Tag> hesaplandı: {result.variables.join(' · ')}
              </p>
              <AnalysisView result={result} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
