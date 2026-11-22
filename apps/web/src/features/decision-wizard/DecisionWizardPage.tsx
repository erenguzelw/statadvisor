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
import { useI18n } from '@/i18n';
import { useDebounced } from '@/lib/useDebounced';
import { buildBody, columnTypeLabel, defaultPicks, groupColumns, missingHint, numericColumns, typeOf, type Answers, type Picks } from '@/lib/variables';
import { AnalysisView } from './AnalysisView';

function EmptyDataset() {
  const { t } = useI18n();
  return (
    <>
      <PageHeader features={['Özellik 01–03']} title={t('Hipotez Testi ve Model Danışmanı')} description={t('Sorularınızı yanıtlayın; kural motoru varsayım testlerinin sonucuna göre uygun testi önerir ve sonucu sade bir dille anlatır.')} />
      <Callout tone="info" icon={Database} title={t('Önce bir veri seti seçin')} actions={<Link className="rounded-control bg-primary-strong px-4 py-2 font-semibold text-on-primary-strong" to="/veri">{t('Veri setlerine git')}</Link>}>
        {t('Analiz için bir CSV dosyası yükleyin ya da örnek bir veri setiyle başlayın.')}
      </Callout>
    </>
  );
}

export function DecisionWizardPage() {
  const { t } = useI18n();
  const { dataset, loading, error } = useActiveDataset();
  if (loading) return <p className="text-fg-muted">{t('Yükleniyor…')}</p>;
  if (error) return <StatusLine status="danger">{t(error.message)}</StatusLine>;
  if (!dataset) return <EmptyDataset />;
  // Veri seti değişince seçimler sıfırlanır.
  return <Wizard key={dataset.id} dataset={dataset} />;
}

function Wizard({ dataset }: { dataset: DatasetInfo }) {
  const { t } = useI18n();
  const opt = (c: ColumnInfo) => ({ value: c.name, label: `${c.name} · ${t(columnTypeLabel[c.type])}` });
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

  // Kullanıcı bir alternatifi çalıştırdıysa istek buna göre kurulur; seçimler değişince öneri yeniden geçerli olur.
  const [forced, setForced] = useState<{ key: string; test: string } | null>(null);
  const baseBody = useMemo(() => {
    const b = buildBody(dataset.id, cols, answers, picks);
    if (!b || answers.target !== 'continuous') return b;
    return { ...b, normality, ...(independentCompare && variance === 'levene' ? { variance } : {}) };
  }, [dataset.id, cols, answers, picks, normality, variance, independentCompare]);
  const baseKey = JSON.stringify(baseBody);
  const forcedTest = forced?.key === baseKey ? forced.test : null;
  const body = useMemo(() => (baseBody && forcedTest ? { ...baseBody, test: forcedTest } : baseBody), [baseBody, forcedTest]);
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
    const ty = typeOf(cols, name);
    if (ty) setAnswers((a) => (a.goal === 'compare' && a.target !== 'categorical' ? { ...a, target: ty === 'categorical' ? 'categorical' : ty } : a));
  };

  const fieldsFor = () => {
    if (answers.goal === 'predict') return null;
    if (answers.goal === 'relate') {
      return answers.target === 'categorical' ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select label={t('Birinci kategorik sütun')} value={picks.rowVar} onChange={(v) => setPick({ rowVar: v })} options={groups.map(opt)} />
          <Select label={t('İkinci kategorik sütun')} value={picks.colVar} onChange={(v) => setPick({ colVar: v })} options={groups.map(opt)} />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select label={t('Birinci sayısal sütun (x)')} value={picks.x} onChange={(v) => setPick({ x: v })} options={nums.map(opt)} />
          <Select label={t('İkinci sayısal sütun (y)')} value={picks.y} onChange={(v) => setPick({ y: v })} options={nums.map(opt)} />
        </div>
      );
    }
    if (answers.design === 'paired') {
      const categorical = answers.target === 'categorical';
      const candidates = categorical ? groups.filter((c) => c.unique === 2) : nums;
      return (
        <CheckboxGroup
          legend={categorical ? t('Karşılaştırılacak ikili sütunlar (aynı kişilerin evet/hayır gibi sonuçları)') : t('Karşılaştırılacak sütunlar (aynı kişilerin ölçümleri; seçim sırası önemlidir)')}
          options={candidates.map((c) => ({ value: c.name, label: c.name, hint: categorical ? t('2 değer') : t(columnTypeLabel[c.type]) }))}
          values={picks.conditions}
          onChange={(v) => setPick({ conditions: v })}
          hint={categorical ? t('2 sütun: McNemar, 3+ sütun: Cochran Q. Her sütun aynı iki değeri içermeli; ikinci değer (sıralı) “olay” sayılır.') : t('En az 2 sütun seçin. Her satır aynı denekle ilgili olmalıdır.')}
        />
      );
    }
    return answers.target === 'categorical' ? (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Select label={t('Grup sütunu')} value={picks.group} onChange={(v) => setPick({ group: v })} options={groups.map(opt)} hint={t('2–12 farklı değer içermeli.')} />
        <Select label={t('Sonuç sütunu (kategorik)')} value={picks.value} onChange={(v) => setPick({ value: v })} options={groups.map(opt)} />
      </div>
    ) : (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Select label={t('Sonuç sütunu (sayısal)')} value={picks.value} onChange={onValue} options={nums.map(opt)} />
        <Select label={t('Grup sütunu')} value={picks.group} onChange={(v) => setPick({ group: v })} options={groups.map(opt)} hint={t('2–12 farklı değer içermeli.')} />
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
        context={<span className="font-mono">{t(dataset.name)}</span>}
        title={t('Hipotez Testi ve Model Danışmanı')}
        description={t('Sorularınızı yanıtlayın ve sütunları seçin; kural motoru varsayım testlerinin sonucuna göre uygun testi önerir, çalıştırır ve sonucu sade bir dille anlatır.')}
        actions={
          <Button variant="primary" icon={Save} disabled={!result || stale || save.isPending} onClick={saveAndOpen}>
            {save.isPending ? t('Kaydediliyor…') : t('Kaydet ve kod/rapor oluştur')}
          </Button>
        }
      />
      {save.error && <StatusLine status="danger" className="mb-4">{t(save.error.message)}</StatusLine>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-5">
          <Panel>
            <SectionHeader
              icon={Wand2}
              title={t('Karar sihirbazı')}
              feature="Özellik 02"
              description={t('Yanıtlarınız ve seçtiğiniz sütunlar değiştikçe analiz anında güncellenir. Grup sayısı seçtiğiniz sütundan belirlenir.')}
            />
            <DecisionWizard answers={{ ...answers, groups: '3+' }} onChange={setAnswer} inferred={answers.goal === 'compare' ? ['target'] : []} hide={['groups']} />
            <div className="mt-4 rounded-card border border-line/30 bg-surface-lowest p-4">
              <h3 className="mb-3 text-body font-semibold text-fg">{t('Değişkenler')}</h3>
              {fieldsFor() ?? (
                <StatusLine status="info">
                  {t('Yordama için hipotez testi değil, regresyon modeli gerekir.')}{' '}
                  <Link to="/regresyon" className="font-medium text-secondary underline underline-offset-2">
                    {t('Doğrusal Regresyon sayfasına gidin.')}
                  </Link>
                </StatusLine>
              )}
              {answers.goal !== 'predict' && answers.target === 'continuous' && (
                <div className="mt-4">
                  <Select
                    label={t('Normallik ölçütü')}
                    value={normality}
                    onChange={(v) => setNormality(v as NormalityMethod)}
                    options={[
                      { value: 'shapiro', label: t('Shapiro-Wilk (p ≥ α)') },
                      { value: 'skewkurt-1.5', label: t('Çarpıklık ve basıklık ±1.5 (Tabachnick ve Fidell)') },
                      { value: 'skewkurt-2', label: t('Çarpıklık ve basıklık ±2 (George ve Mallery)') },
                    ]}
                    hint={t('Anket ve ölçek puanlarında çarpıklık-basıklık ölçütü yaygındır; büyük örneklemde Shapiro-Wilk çok küçük sapmaları da reddeder.')}
                  />
                  {independentCompare && (
                    <Select
                      className="mt-4"
                      label={t('Varyans eşitliği yaklaşımı')}
                      value={variance}
                      onChange={(v) => setVariance(v as 'welch' | 'levene')}
                      options={[
                        { value: 'welch', label: t('Her zaman Welch (önerilen) · post-hoc: Games–Howell') },
                        { value: 'levene', label: t('Levene anlamsızsa klasik test · post-hoc: Tukey HSD') },
                      ]}
                      hint={t('Welch, varyanslar eşitken de güç kaybettirmez. İkinci seçenek SPSS alışkanlığıdır: Levene p ≥ α ise Student t / tek yönlü ANOVA ve Tukey, değilse Welch ve Games–Howell.')}
                    />
                  )}
                </div>
              )}
            </div>
            {result && (
              <div className="mt-4 rounded-card border border-line/30 bg-surface-lowest p-4">
                <p className="mb-3 text-caption font-medium text-fg-subtle">{t('Karar ağacında izlenen yol')}</p>
                <DecisionPath path={result.decision} />
              </div>
            )}
          </Panel>
          {result && <RecommendationNotes warnings={result.decision.warnings} />}
        </div>

        <div className="flex min-w-0 flex-col gap-6 lg:col-span-7" aria-live="polite" aria-busy={stale}>
          {answers.goal === 'predict' ? (
            <Callout tone="warning" icon={TriangleAlert} title={t('Hipotez testi uygulanmıyor')}>
              {t('Tahmin amaçlı çalışmalarda varsayım testleri yerine çapraz doğrulama ve dengesiz veriye uygun ölçütler (F1, PR-AUC) kullanılır.')}
            </Callout>
          ) : !body ? (
            <Callout tone="neutral" icon={FlaskConical} title={t('Analiz için eksik bilgi')}>
              {missingHint(answers, t)}
            </Callout>
          ) : preview.isError && !result ? (
            <Callout tone="danger" icon={TriangleAlert} title={t('Bu seçimle analiz yapılamadı')}>
              {t(preview.error.message)}
            </Callout>
          ) : !result ? (
            <p className="rounded-panel border border-line/30 bg-surface p-6 text-fg-muted">{t('Analiz hesaplanıyor…')}</p>
          ) : (
            <div className={stale ? 'flex flex-col gap-6 opacity-60 transition-opacity' : 'flex flex-col gap-6'}>
              {preview.isError && (
                <Callout tone="danger" icon={TriangleAlert} title={t('Son seçimle analiz yapılamadı')}>
                  {t(preview.error.message)} {t('Aşağıda önceki geçerli sonuç görünüyor.')}
                </Callout>
              )}
              <p className="flex flex-wrap items-center gap-2 text-caption text-fg-subtle">
                <Tag>{t(result.outcome.test)}</Tag> {t('hesaplandı:')} {result.variables.join(' · ')}
              </p>
              <AnalysisView result={result} onRunAlternative={(test) => setForced({ key: baseKey, test })} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
