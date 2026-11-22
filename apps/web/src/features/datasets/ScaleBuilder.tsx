import { useState } from 'react';
import { Layers, Plus, Trash2 } from 'lucide-react';
import { ITEM_TOTAL_MIN, type ItemStat } from '@statadvisor/shared';
import { Button, DataTable, Panel, SectionHeader, StatusLine, Tag, type Column } from '@/components/ui';
import { useApp } from '@/context/AppContext';
import type { ColumnInfo } from '@/data/api';
import { useCreateScales, useScalesCode, type CodeLang, type ScaleRequest, type ScaleResultInfo } from '@/data/hooks';
import { tc, tl, useI18n } from '@/i18n';

interface Draft {
  key: number;
  name: string;
  items: string[];
  reverse: string[];
  method: 'mean' | 'sum';
  min: string;
  max: string;
  share: string;
}

const emptyDraft = (key: number): Draft => ({ key, name: '', items: [], reverse: [], method: 'mean', min: '', max: '', share: '1' });
const inputCls = 'w-full rounded-control border border-line-strong bg-surface-lowest px-3 py-2 text-body text-fg focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary';

function alphaLabel(a: number | null) {
  if (a === null) return tl('hesaplanamadı');
  if (a >= 0.9) return tl('mükemmel');
  if (a >= 0.8) return tl('iyi');
  if (a >= 0.7) return tl('kabul edilebilir');
  if (a >= 0.6) return tl('şüpheli');
  if (a >= 0.5) return tl('zayıf');
  return tl('kabul edilemez');
}

const num = (x: number | null, d = 2) => (x === null ? '–' : x.toFixed(d));

/** Madde analizi tablosu (SPSS “Item-Total Statistics”): zayıf maddeler ve alfayı artıracak çıkarımlar vurgulanır. */
function ItemTable({ result }: { result: ScaleResultInfo }) {
  const { t } = useI18n();
  if (!result.itemStats.length) return null;
  const weak = (s: ItemStat) => s.itemTotalR !== null && s.itemTotalR < ITEM_TOTAL_MIN;
  const raises = (s: ItemStat) => result.alpha !== null && s.alphaIfDeleted !== null && s.alphaIfDeleted > result.alpha;
  const columns: Column<ItemStat>[] = [
    {
      key: 'item',
      header: t('Madde'),
      cell: (s) => (
        <span className="inline-flex items-center gap-2">
          <span className="truncate" title={s.item}>{s.item}</span>
          {s.reversed && <Tag>{t('ters')}</Tag>}
        </span>
      ),
    },
    { key: 'mean', header: t('Ortalama'), numeric: true, align: 'right', cell: (s) => num(s.mean) },
    { key: 'sd', header: t('SS'), numeric: true, align: 'right', cell: (s) => num(s.sd) },
    {
      key: 'r',
      header: t('Düzeltilmiş madde-toplam r'),
      numeric: true,
      align: 'right',
      cell: (s) => num(s.itemTotalR),
      cellClassName: (s) => (weak(s) ? 'text-danger font-semibold' : undefined),
    },
    {
      key: 'aid',
      header: t('Madde silinirse α'),
      numeric: true,
      align: 'right',
      cell: (s) => num(s.alphaIfDeleted),
      cellClassName: (s) => (raises(s) ? 'text-warning font-semibold' : undefined),
    },
  ];
  return (
    <div className="mt-2">
      <DataTable caption={tl('“{name}” madde analizi', { name: result.name })} columns={columns} rows={result.itemStats} rowKey={(s) => s.item} density="compact" isRowHighlighted={(s) => weak(s)} />
      <p className="mt-1 text-caption text-fg-muted">
        {t('Tüm maddeleri yanıtlayan')} {result.nAlpha} {t('satır; ters maddeler çevrilmiş halde. Düzeltilmiş madde-toplam r .30’un altındaysa madde zayıf sayılır (kırmızı); “madde silinirse α” mevcut alfadan yüksekse madde ölçeği zayıflatıyor olabilir (turuncu).')}
      </p>
    </div>
  );
}

function toRequest(d: Draft): ScaleRequest | string {
  const min = Number(d.min);
  const max = Number(d.max);
  if (!d.name.trim()) return tl('Her ölçeğe bir ad verin.');
  if (d.items.length < 2) return tl('“{name}”: en az 2 madde seçin.', { name: d.name });
  if (d.min.trim() === '' || d.max.trim() === '' || !Number.isFinite(min) || !Number.isFinite(max) || min >= max) return tl('“{name}”: yanıt ölçeğinin en küçük ve en büyük değerini girin (ör. 0 ve 4).', { name: d.name });
  return { name: d.name.trim(), items: d.items, reverse: d.reverse, method: d.method, min, max, minValidShare: Number(d.share) };
}

/** Alt boyutları elle tanımlanan ölçek puanları: maddelerden toplam/ortalama puan ve Cronbach alfa. */
export function ScaleBuilder({ datasetId, columns }: { datasetId: string; columns: ColumnInfo[] }) {
  const { t } = useI18n();
  const { setDatasetId } = useApp();
  const create = useCreateScales(datasetId);
  const codeFor = useScalesCode(datasetId);
  const [drafts, setDrafts] = useState<Draft[]>([emptyDraft(1)]);
  const [problem, setProblem] = useState('');
  const itemsAvailable = columns.filter((c) => c.numeric && !c.likelyId);

  const patch = (key: number, p: Partial<Draft>) => setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, ...p } : d)));
  const toggle = (d: Draft, field: 'items' | 'reverse', name: string) => {
    const has = d[field].includes(name);
    const next = has ? d[field].filter((x) => x !== name) : [...d[field], name];
    patch(d.key, field === 'items' ? { items: next, reverse: has ? d.reverse.filter((x) => x !== name) : d.reverse } : { reverse: next });
  };

  const requests = () => {
    const out: ScaleRequest[] = [];
    for (const d of drafts) {
      const r = toRequest(d);
      if (typeof r === 'string') {
        setProblem(r);
        return null;
      }
      out.push(r);
    }
    setProblem('');
    return out;
  };

  const submit = () => {
    const scales = requests();
    if (scales) create.mutate(scales, { onSuccess: (d) => setDatasetId(d.id) });
  };
  const showCode = (lang: CodeLang) => {
    const scales = requests();
    if (scales) codeFor.mutate({ scales, lang });
  };

  return (
    <Panel className="mt-6">
      <SectionHeader
        icon={Layers}
        title={t('Ölçek puanı oluştur')}
        description={t('Anket maddelerini tek tek karşılaştırmak yerine alt boyutlarınızı tanımlayın; her biri için toplam ya da ortalama puan ve Cronbach alfa hesaplanır. Yeni bir veri sürümü oluşur, ham veri değişmez.')}
      />
      {itemsAvailable.length < 2 ? (
        <p className="text-body text-fg-muted">{t('Ölçek oluşturmak için en az 2 sayısal ya da sıralı sütun gerekir.')}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {drafts.map((d, n) => (
            <fieldset key={d.key} className="rounded-card border border-line/30 bg-surface-lowest p-4">
              <legend className="px-1 text-body font-semibold text-fg">{t('Ölçek')}{' '}{n + 1}</legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="flex flex-col gap-1 text-caption text-fg-muted">
                  {t('Ölçek adı')}<input className={inputCls} value={d.name} onChange={(e) => patch(d.key, { name: e.target.value })} placeholder={t('ör. Davranışsal ayrışma')} />
                </label>
                <label className="flex flex-col gap-1 text-caption text-fg-muted">
                  {t('Puan')}<select className={inputCls} value={d.method} onChange={(e) => patch(d.key, { method: e.target.value as 'mean' | 'sum' })}>
                    <option value="mean">{t('Ortalama')}</option>
                    <option value="sum">{t('Toplam')}</option>
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1 text-caption text-fg-muted">
                    {t('En küçük yanıt')}<input className={inputCls} inputMode="decimal" value={d.min} onChange={(e) => patch(d.key, { min: e.target.value })} placeholder="0" />
                  </label>
                  <label className="flex flex-col gap-1 text-caption text-fg-muted">
                    {t('En büyük yanıt')}<input className={inputCls} inputMode="decimal" value={d.max} onChange={(e) => patch(d.key, { max: e.target.value })} placeholder="4" />
                  </label>
                </div>
                <label className="flex flex-col gap-1 text-caption text-fg-muted">
                  {t('Eksik madde kuralı')}<select className={inputCls} value={d.share} onChange={(e) => patch(d.key, { share: e.target.value })}>
                    <option value="1">{t('Tüm maddeler yanıtlanmalı')}</option>
                    <option value="0.8">{t('En az %80’i yanıtlanmalı')}</option>
                    <option value="0.5">{t('En az %50’si yanıtlanmalı')}</option>
                  </select>
                </label>
              </div>
              <p className="mb-1 mt-4 text-caption text-fg-muted">
                {t('Maddeler (')}{d.items.length} {t('seçili). Ters kodlu maddeleri işaretleyin; bunlar')}{' '}<span className="font-mono">{t('en küçük + en büyük − yanıt')}</span> {t('ile çevrilir.')}</p>
              <ul className="grid max-h-64 grid-cols-1 gap-x-4 gap-y-1 overflow-auto rounded-card border border-line/20 p-2 lg:grid-cols-2">
                {itemsAvailable.map((c) => (
                  <li key={c.name} className="flex items-center justify-between gap-2 text-caption">
                    <label className="flex min-w-0 items-center gap-2 text-fg">
                      <input type="checkbox" checked={d.items.includes(c.name)} onChange={() => toggle(d, 'items', c.name)} />
                      <span className="truncate" title={c.name}>{c.name}</span>
                    </label>
                    {d.items.includes(c.name) && (
                      <label className="flex shrink-0 items-center gap-1 text-fg-muted">
                        <input type="checkbox" checked={d.reverse.includes(c.name)} onChange={() => toggle(d, 'reverse', c.name)} />
                        {t('ters')}</label>
                    )}
                  </li>
                ))}
              </ul>
              {drafts.length > 1 && (
                <Button className="mt-3" size="sm" variant="ghost" icon={Trash2} onClick={() => setDrafts((ds) => ds.filter((x) => x.key !== d.key))}>
                  {t('Bu ölçeği kaldır')}</Button>
              )}
            </fieldset>
          ))}
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" icon={Plus} onClick={() => setDrafts((ds) => [...ds, emptyDraft(Math.max(...ds.map((x) => x.key)) + 1)])}>
              {t('Ölçek ekle')}</Button>
            <Button variant="primary" disabled={create.isPending} onClick={submit}>
              {t('Puanları hesapla')}</Button>
            <Button variant="ghost" disabled={codeFor.isPending} onClick={() => showCode('python')}>
              {t('Python kodunu göster')}</Button>
            <Button variant="ghost" disabled={codeFor.isPending} onClick={() => showCode('r')}>
              {t('R kodunu göster')}</Button>
          </div>
          <div aria-live="polite" className="flex flex-col gap-2">
            {problem && <StatusLine status="danger">{problem}</StatusLine>}
            {create.error && <StatusLine status="danger">{t(create.error.message)}</StatusLine>}
            {codeFor.error && <StatusLine status="danger">{t(codeFor.error.message)}</StatusLine>}
            {create.data && (
              <div className="rounded-card border border-line/30 bg-surface-lowest p-3">
                <StatusLine status="success">
                  “{create.data.name}{t('” oluşturuldu ve etkin veri seti yapıldı. Yeni ölçek sütunları “Karar Sihirbazı”nda sürekli değişken olarak seçilebilir.')}</StatusLine>
                <ul className="mt-2 flex flex-col gap-1 text-body text-fg">
                  {create.data.scaleResults.map((r) => (
                    <li key={r.name}>
                      <span className="font-semibold">{r.name}</span>{t(': Cronbach α =')}{' '}
                      <span className="font-mono">{r.alpha === null ? '–' : r.alpha.toFixed(2)}</span> ({alphaLabel(r.alpha)}{t('), geçerli puan')}{' '}{r.nValid}
                      {r.skewness !== null && r.kurtosis !== null && (
                        <span className="block text-caption text-fg-muted">
                          {t('Puanın normalliği: çarpıklık')}{' '}<span className="font-mono">{r.skewness.toFixed(2)}</span>{t(', basıklık')}{' '}
                          <span className="font-mono">{r.kurtosis.toFixed(2)}</span> —{' '}
                          {Math.abs(r.skewness) <= 1.5 && Math.abs(r.kurtosis) <= 1.5 ? t('normal kabul edilir (±1.5)') :Math.abs(r.skewness) <= 2 && Math.abs(r.kurtosis) <= 2 ? t('±1.5 dışında, ±2 içinde') : t('normal kabul edilmez (±2 dışında)')}
                          {r.shapiroP !== null && (
                            <>
                              {t('; Shapiro-Wilk')}{' '}<span className="font-mono">W = {r.shapiroW!.toFixed(3)}, p {r.shapiroP < 0.001 ? '< .001' : '= ' + r.shapiroP.toFixed(3)}</span>
                            </>
                          )}
                        </span>
                      )}
                      {r.notes.map((line) => (
                        <span key={line} className="block text-caption text-warning">{t(line)}</span>
                      ))}
                      <ItemTable result={r} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          {codeFor.data && (
            <pre className="max-h-96 overflow-auto rounded-card border border-line/30 bg-surface-lowest p-3 font-mono text-data text-fg" aria-label={t('Ölçek puanı kodu')}>
              {tc(codeFor.data.code)}
            </pre>
          )}
        </div>
      )}
    </Panel>
  );
}
