import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, BarChart3, Database, Download, Filter, GitFork, HelpCircle, History, ListChecks, ShieldCheck, SlidersHorizontal, Sparkles, Table2, TriangleAlert, Wrench } from 'lucide-react';
import { formatP, type CleanAction, type CleanRule, type ColumnKind, type DatasetQuality, type IssueKind } from '@statadvisor/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { QueryView } from '@/components/layout/PageStatus';
import {
  Button,
  Callout,
  CodeBlock,
  DataTable,
  MetricTile,
  Panel,
  RadioCardGroup,
  SectionHeader,
  SegmentedControl,
  Select,
  StatusLine,
  Tag,
  type Column,
} from '@/components/ui';
import { BoxPlotGroup, HistogramWithNormal } from '@/components/charts';
import { DataPreview } from '@/components/domain';
import { useActiveDataset, useApp } from '@/context/AppContext';
import type { ColumnInfo, ColumnType, DatasetInfo, DatasetOperations } from '@/data/api';
import { useCleanDataset, useCleaningCode, useDataset, useQuality, useUpdateProfile, type ProfileEntry } from '@/data/hooks';
import { columnTypeLabel, groupColumns, numericColumns } from '@/lib/variables';

const nf = new Intl.NumberFormat('tr-TR');
const MISSING = new Set(['', 'na', 'n/a', 'nan', 'null', 'none', '-', '?', '#n/a']);
const KNN_MAX = 5000;

type Choice = 'none' | CleanAction;
type RuleSel = Record<string, Partial<Record<IssueKind, CleanAction>>>;
type ColQ = DatasetQuality['columns'][number];

const ACTION_LABEL: Record<CleanAction, string> = { setMissing: 'Hücreyi eksik işaretle', removeRow: 'Satırı sil' };
const ISSUE_LABEL: Record<IssueKind, string> = { invalid: 'Geçersiz hücre', extreme: 'İncelenecek uç değer' };
const KIND_LABEL: Record<ColumnKind, string> = columnTypeLabel;
const inputClass = 'h-10 w-full rounded-card border border-line/40 bg-surface-lowest px-3 text-body text-fg hover:border-line-strong disabled:opacity-50';

/** Seçimden kural listesi: sütun sırası ve sorun sırası sabittir (aynı seçim → aynı istek). */
function toRules(sel: RuleSel): CleanRule[] {
  return Object.entries(sel).flatMap(([column, v]) => (['invalid', 'extreme'] as const).flatMap((issue) => (v[issue] ? [{ column, issue, action: v[issue]! }] : [])));
}

const fmtNum = (x: number | undefined) => (x === undefined ? '–' : Number.isInteger(x) ? String(x) : x.toFixed(2));

export function DataQualityPage() {
  const { dataset, loading, error } = useActiveDataset();
  const [created, setCreated] = useState<DatasetInfo | null>(null);
  if (loading) return <p className="text-fg-muted">Yükleniyor…</p>;
  if (error) return <StatusLine status="danger">{error.message}</StatusLine>;
  if (!dataset) {
    return (
      <>
        <PageHeader features={['Özellik 08']} title="Veri Kalitesi, Aykırı ve Eksik Değerler" description="Sorunlu hücreleri bulun ve isterseniz düzeltilmiş bir veri sürümü oluşturun." />
        <Callout tone="info" icon={Database} title="Önce bir veri seti seçin" actions={<Link className="rounded-control bg-primary-strong px-4 py-2 font-semibold text-on-primary-strong" to="/veri">Veri setlerine git</Link>}>
          Kalite analizi için bir CSV dosyası yükleyin ya da örnek bir veri setiyle başlayın.
        </Callout>
      </>
    );
  }
  // Veri seti değişince sayfa yeniden kurulur: eski seçimler ve kurallar yeni veriye taşınmaz.
  return <Quality key={dataset.id} dataset={dataset} created={created} onCreated={setCreated} />;
}

function ActionSelect({ label, value, onChange, disabled, title }: { label: string; value: Choice; onChange: (v: Choice) => void; disabled?: boolean; title?: string }) {
  return (
    <select
      aria-label={label}
      title={title}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as Choice)}
      className="h-8 max-w-44 rounded-control border border-line/40 bg-surface-lowest px-2 text-caption text-fg hover:border-line-strong disabled:opacity-40"
    >
      <option value="none">Dokunma</option>
      <option value="setMissing">{ACTION_LABEL.setMissing}</option>
      <option value="removeRow">{ACTION_LABEL.removeRow}</option>
    </select>
  );
}

function validityText(c: ColQ): string {
  if (c.validity === 'range' && c.validRange) return `doğrulanmış aralık ${fmtNum(c.validRange.min)}–${fmtNum(c.validRange.max)}`;
  if (c.validity === 'categories') return `${c.validCategoryCount} doğrulanmış kategori`;
  return 'kural doğrulanmadı';
}

function ProfileEditor({
  info,
  qcol,
  allCols,
  saving,
  error,
  onSave,
  onClose,
}: {
  info: ColumnInfo;
  qcol: ColQ | undefined;
  allCols: ColumnInfo[];
  saving: boolean;
  error: string | undefined;
  onSave: (columns: Record<string, ProfileEntry>, editedColumn: string) => void;
  onClose: () => void;
}) {
  const [type, setType] = useState<ColumnType>(info.type);
  const [min, setMin] = useState(info.profile?.validRange ? String(info.profile.validRange.min) : '');
  const [max, setMax] = useState(info.profile?.validRange ? String(info.profile.validRange.max) : '');
  const [cats, setCats] = useState((info.profile?.validCategories ?? []).join('\n'));
  const categorical = type === 'categorical';
  const rangeGiven = min.trim() !== '' || max.trim() !== '';
  const rangeOk = !rangeGiven || (min.trim() !== '' && max.trim() !== '' && Number.isFinite(Number(min)) && Number.isFinite(Number(max)) && Number(min) <= Number(max));
  const categories = cats.split('\n').map((s) => s.trim()).filter(Boolean);

  const entryFor = (c: ColumnInfo): ProfileEntry | null => {
    if (c.name === info.name) return null;
    const e: ProfileEntry = {};
    if (c.typeOverridden) e.type = c.type;
    if (c.profile?.validRange) e.validRange = c.profile.validRange;
    if (c.profile?.validCategories) e.validCategories = c.profile.validCategories;
    return Object.keys(e).length ? e : {};
  };
  const save = (clearValidity: boolean) => {
    const columns: Record<string, ProfileEntry> = {};
    for (const c of allCols) {
      const e = entryFor(c);
      if (e && Object.keys(e).length) columns[c.name] = e;
    }
    const mine: ProfileEntry = { type: type === (info.inferredType ?? info.type) ? null : type };
    if (!clearValidity) {
      if (!categorical && rangeGiven) mine.validRange = { min: Number(min), max: Number(max) };
      if (categorical && categories.length) mine.validCategories = categories;
    }
    columns[info.name] = mine;
    onSave(columns, info.name);
  };
  const typeOptions = (['continuous', 'ordinal', 'categorical'] as const).map((t) => ({ value: t, label: columnTypeLabel[t], disabled: t !== 'categorical' && !info.numeric }));

  return (
    <div className="mt-4 rounded-card border border-line/40 bg-surface-lowest p-4" role="group" aria-label={`${info.name} sütununun türü ve geçerli değerleri`}>
      <p className="mb-3 text-body font-semibold text-fg">
        <span className="font-mono">{info.name}</span> · tür ve geçerli değerler
      </p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Select
          label="Sütun türü"
          value={type}
          onChange={(v) => setType(v as ColumnType)}
          options={typeOptions}
          hint={`Dosyadan çıkarılan tür: ${columnTypeLabel[info.inferredType ?? info.type]}. Sayısal kodlar (ör. 1 = Kadın, 2 = Erkek) için “Kategorik” seçin; Tukey yalnızca sürekli ölçümlere uygulanır.`}
        />
        {!categorical && info.numeric && (
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5 text-caption font-medium text-fg-subtle">
              Geçerli en küçük değer
              <input className={inputClass} inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} placeholder="ör. 1" />
            </label>
            <label className="flex flex-col gap-1.5 text-caption font-medium text-fg-subtle">
              Geçerli en büyük değer
              <input className={inputClass} inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} placeholder="ör. 5" />
            </label>
            <div className="col-span-2 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={qcol?.observedMin === undefined}
                onClick={() => {
                  setMin(String(qcol?.observedMin ?? ''));
                  setMax(String(qcol?.observedMax ?? ''));
                }}
              >
                Gözlenen aralığı öneri olarak doldur
              </Button>
              <span className="text-caption text-fg-subtle">Gözlenen değerler geçerli değerler olmak zorunda değildir; yalnızca siz Kaydet’e basınca doğrulanmış sayılır.</span>
            </div>
            {info.scaleRange && !info.profile?.validRange && (
              <p className="col-span-2 text-caption text-info">Ölçek tanımınızdan beklenen aralık {fmtNum(info.scaleRange.min)}–{fmtNum(info.scaleRange.max)} otomatik uygulanır; burada değiştirebilirsiniz.</p>
            )}
          </div>
        )}
        {categorical && (
          <label className="flex flex-col gap-1.5 text-caption font-medium text-fg-subtle">
            Geçerli kategoriler (her satıra bir tane)
            <textarea className={`${inputClass} h-28 py-2`} value={cats} onChange={(e) => setCats(e.target.value)} placeholder={info.numeric ? '1\n2' : 'Kadın\nErkek'} />
            <span className="font-normal text-fg-subtle">Örnek değerler: {info.examples.join(', ') || '–'}. Boş bırakırsanız tanımlı kategoriler dışı değer aranmaz.</span>
          </label>
        )}
      </div>
      {!rangeOk && <StatusLine status="danger" className="mt-3 text-caption">Aralık için iki sayı girin; en küçük değer en büyük değerden büyük olamaz.</StatusLine>}
      {error && <StatusLine status="danger" className="mt-3 text-caption">{error}</StatusLine>}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" variant="primary" disabled={saving || !rangeOk} onClick={() => save(false)}>
          {saving ? 'Kaydediliyor…' : 'Kaydet'}
        </Button>
        <Button size="sm" variant="secondary" disabled={saving} onClick={() => save(true)}>
          Geçerli değer kuralını kaldır
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Kapat
        </Button>
      </div>
    </div>
  );
}

function VersionHistory({ dataset }: { dataset: DatasetInfo }) {
  const ops = dataset.operations;
  if (!ops) return null;
  const entries: { title: string; ops: Omit<DatasetOperations, 'history'> }[] = [...(ops.history ?? []).map((h) => ({ title: `${h.dataset} · ${new Date(h.createdAt).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}`, ops: h.operations })), { title: `${dataset.name} (bu sürüm)`, ops }];
  return (
    <Panel className="mt-6">
      <SectionHeader icon={History} title="Sürüm geçmişi" level={3} description="Ham veri değişmez. Bu sürüme gelen işlemler, kurallar ve kullanıcı seçimleri en eskiden en yeniye listelenir." />
      <ol className="flex flex-col gap-3">
        {entries.map((e, i) => (
          <li key={i} className="rounded-card border border-line/30 bg-surface-lowest p-3">
            <p className="text-body font-semibold text-fg">{i + 1}. {e.title}</p>
            {e.ops.rules && e.ops.rules.length > 0 && (
              <p className="mt-1 text-caption text-fg-muted">
                Kurallar: {e.ops.rules.map((r) => `${r.column} · ${ISSUE_LABEL[r.issue]} → ${ACTION_LABEL[r.action]}`).join('; ')}
              </p>
            )}
            {e.ops.impute && <p className="text-caption text-fg-muted">Doldurma: {e.ops.impute === 'none' ? 'yapılmadı' : e.ops.impute === 'median' ? 'medyan/mod' : 'KNN'}</p>}
            {e.ops.loss && e.ops.removedRows ? (
              <p className="text-caption text-fg-muted">
                Satır kaybı: {e.ops.removedRows} satır (%{(e.ops.removedRate ?? 0).toFixed(1)}); uyarı seviyesi: {e.ops.loss.level === 'none' ? 'yok' : e.ops.loss.level === 'review' ? 'inceleme' : 'onay gerekti'}.
              </p>
            ) : null}
            {e.ops.acknowledgement && <p className="text-caption text-fg-muted">Kullanıcı gerekçesi: “{e.ops.acknowledgement.reason}”</p>}
            <ul className="mt-1 list-disc pl-5 text-caption text-fg-muted">
              {e.ops.log.map((l, j) => (
                <li key={j}>{l}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

function Quality({ dataset, created, onCreated }: { dataset: DatasetInfo; created: DatasetInfo | null; onCreated: (d: DatasetInfo) => void }) {
  const navigate = useNavigate();
  const { setDatasetId } = useApp();
  const cols = dataset.columns;
  const nums = numericColumns(cols);
  const groups = groupColumns(cols);
  const [value, setValue] = useState<string | undefined>(() => (nums.find((c) => c.type === 'continuous') ?? nums[0])?.name);
  const [group, setGroup] = useState<string | undefined>(() => groups.find((c) => !c.numeric && c.name !== value)?.name ?? groups.find((c) => c.name !== value)?.name);
  // Başlangıçta hiçbir kural ve doldurma seçili değildir: tarama silme kararından bağımsızdır.
  const [sel, setSel] = useState<RuleSel>({});
  const [impute, setImpute] = useState<'none' | 'median' | 'knn'>('none');
  const [view, setView] = useState<'before' | 'after'>('before');
  const [editCol, setEditCol] = useState<string | null>(null);
  const [ack, setAck] = useState({ confirmed: false, reason: '' });

  const rules = useMemo(() => toRules(sel), [sel]);
  const quality = useQuality(dataset.id, { value, group, rules });
  const code = useCleaningCode(dataset.id, { rules, impute });
  const detail = useDataset(dataset.id);
  const clean = useCleanDataset(dataset.id);
  const profile = useUpdateProfile(dataset.id);

  const setChoice = (column: string, issue: IssueKind, v: Choice) =>
    setSel((s) => {
      const next = { ...s, [column]: { ...s[column] } };
      if (v === 'none') delete next[column]![issue];
      else next[column]![issue] = v;
      if (Object.keys(next[column]!).length === 0) delete next[column];
      return next;
    });

  const q = quality.data;
  const plan = q?.plan;
  const hasAction = rules.length > 0 || impute !== 'none';
  const cleanedRows = plan?.cleanedRows ?? dataset.rows;
  const knnBlocked = impute === 'knn' && cleanedRows > KNN_MAX;
  const needsAck = plan?.level === 'confirm';
  const ackOk = !needsAck || (ack.confirmed && ack.reason.trim().length >= 10);
  const canCreate = Boolean(q) && !quality.isError && hasAction && !knnBlocked && ackOk && !clean.isPending;

  const create = () =>
    clean.mutate(
      { rules, impute, groupColumn: group, acknowledgement: needsAck ? { reason: ack.reason.trim() } : undefined },
      {
        onSuccess: (d) => {
          onCreated(d);
          setDatasetId(d.id);
        },
      },
    );

  const saveProfile = (columns: Record<string, ProfileEntry>, edited: string) =>
    profile.mutate(columns, {
      onSuccess: () => {
        // Türü ya da geçerlilik kuralı değişen sütunun seçili kuralları artık geçerli olmayabilir; yeniden seçilsin.
        setSel((s) => {
          const next = { ...s };
          delete next[edited];
          return next;
        });
        setAck({ confirmed: false, reason: '' });
        setEditCol(null);
      },
    });

  const infoOf = (name: string) => cols.find((c) => c.name === name);
  const edited = editCol ? infoOf(editCol) : undefined;

  return (
    <>
      <PageHeader
        features={['Özellik 08']}
        context={<span className="font-mono">{dataset.name}</span>}
        title="Veri Kalitesi, Aykırı ve Eksik Değerler"
        description="Önce taranır, sonra siz karar verirsiniz: sorunlu hücreler işaretlenir ama hiçbir hücre ya da satır kendiliğinden silinmez. Ham veri değişmez; işlem yeni bir veri sürümü üretir. Tarama kural tabanlıdır ve verinin doğruluğunu garanti etmez."
        actions={
          <Button variant="primary" icon={Sparkles} disabled={!canCreate} onClick={create}>
            {clean.isPending ? 'Oluşturuluyor…' : 'Temizlenmiş sürümü oluştur'}
          </Button>
        }
      />
      {clean.error && <StatusLine status="danger" className="mb-4">{clean.error.message}</StatusLine>}
      {created && (
        <Callout
          tone="success"
          icon={ShieldCheck}
          title={created.duplicate ? 'Bu temizlenmiş sürüm zaten vardı' : 'Temizlenmiş sürüm oluşturuldu ve etkin veri seti yapıldı'}
          actions={
            <Button variant="primary" iconEnd={ArrowRight} onClick={() => navigate('/karar-sihirbazi')}>
              Hipotez testine geç
            </Button>
          }
          className="mb-6"
        >
          <span className="font-semibold">{created.name}</span>: {nf.format(created.rows)} satır.
          {created.operations && <span className="mt-1 block text-body text-fg-muted">{created.operations.log.join(' ')}</span>}
        </Callout>
      )}

      {(dataset.parentId || dataset.operations) && (
        <StatusLine status="info" className="mb-4 text-caption">
          Bu veri, daha önce işlenmiş bir sürümdür. Tukey sınırları bu sürümün verisinden yeniden hesaplanır: önceki turda uç değerler çıkarıldıysa dağılım daralmıştır ve yeni sınırlar ek gözlemleri işaretleyebilir.
        </StatusLine>
      )}

      <Panel className="mb-6">
        <SectionHeader title="İncelenecek sütunlar" level={3} description="Kutu grafiği, normallik önizlemesi ve grup başına kayıp, seçilen sütun ve grup üzerinden hesaplanır." />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select label="Sonuç sütunu (sayısal)" value={value} onChange={setValue} options={nums.map((c) => ({ value: c.name, label: `${c.name} · ${columnTypeLabel[c.type]}` }))} />
          <Select label="Grup sütunu" value={group} onChange={setGroup} options={groups.filter((c) => c.name !== value).map((c) => ({ value: c.name, label: `${c.name} · ${columnTypeLabel[c.type]}` }))} />
        </div>
      </Panel>

      <QueryView query={quality}>
        {(q) => {
          const after = view === 'after';
          const f = q.focus;
          const shapiro = f ? (after ? f.shapiroAfter : f.shapiroBefore) : null;
          const hist = f ? (after ? f.histAfter : f.histBefore) : null;
          const skew = f ? (after ? f.skewAfter : f.skewBefore) : 0;
          const confirmedCols = q.columns.filter((c) => c.validity !== 'unconfirmed').length;
          const tukeyCols = q.columns.filter((c) => c.tukeyApplied).length;
          const colInfo = new Map(cols.map((c) => [c.name, c]));

          const rowsFor = (score: boolean) => q.columns.filter((c) => !c.skipped && c.score === score);
          const actionColumns = (): Column<ColQ>[] => [
            {
              key: 'name',
              header: 'Sütun',
              cell: (c) => {
                const info = colInfo.get(c.name);
                const uncertain = info?.warnings.some((w) => w.includes('Tamsayı kodlu'));
                return (
                  <span className="flex flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-data text-fg">{c.name}</span>
                      <Tag>{KIND_LABEL[c.kind]}</Tag>
                      {info?.typeOverridden && <Tag tone="primary">tür düzeltildi</Tag>}
                    </span>
                    {uncertain && !info?.typeOverridden && <span className="text-caption text-tertiary">Sayısal kod olabilir; türü doğrulayın.</span>}
                  </span>
                );
              },
            },
            { key: 'missing', header: 'Eksik', numeric: true, align: 'right', cell: (c) => (c.missing ? `${nf.format(c.missing)} (%${c.missingRate.toFixed(1)})` : '0') },
            {
              key: 'invalid',
              header: 'Geçersiz hücre',
              numeric: true,
              align: 'right',
              cell: (c) => (
                <span className="flex flex-col items-end">
                  <span className={c.invalid ? 'font-semibold text-danger' : undefined}>{c.validity === 'unconfirmed' ? '–' : nf.format(c.invalid)}</span>
                  <span className="text-caption text-fg-subtle">{validityText(c)}</span>
                </span>
              ),
            },
            {
              key: 'extreme',
              header: 'İncelenecek uç değer',
              numeric: true,
              align: 'right',
              cell: (c) =>
                c.kind !== 'continuous' ? (
                  <span className="text-caption text-fg-subtle">Tukey uygulanmaz ({KIND_LABEL[c.kind].toLowerCase()})</span>
                ) : (
                  <span className="flex flex-col items-end">
                    <span className={c.extremes ? 'font-semibold text-info' : undefined}>{nf.format(c.extremes)}</span>
                    <span className="text-caption text-fg-subtle">{c.lower === undefined ? 'n < 4' : `sınırlar ${c.lower.toFixed(1)} – ${c.upper!.toFixed(1)}`}</span>
                  </span>
                ),
            },
            { key: 'obs', header: 'Gözlenen aralık (bilgi)', numeric: true, align: 'right', cell: (c) => (c.observedMin === undefined ? '–' : `${fmtNum(c.observedMin)} – ${fmtNum(c.observedMax)}`) },
            {
              key: 'ai',
              header: 'Geçersiz için eylem',
              cell: (c) => (
                <ActionSelect
                  label={`${c.name} sütunu geçersiz hücre eylemi`}
                  value={sel[c.name]?.invalid ?? 'none'}
                  disabled={c.validity === 'unconfirmed' || c.invalid === 0}
                  title={c.validity === 'unconfirmed' ? 'Önce geçerli aralığı/kategorileri doğrulayın' : c.invalid === 0 ? 'Geçersiz hücre yok' : undefined}
                  onChange={(v) => setChoice(c.name, 'invalid', v)}
                />
              ),
            },
            {
              key: 'ae',
              header: 'Uç değer için eylem',
              cell: (c) => (
                <ActionSelect
                  label={`${c.name} sütunu uç değer eylemi`}
                  value={sel[c.name]?.extreme ?? 'none'}
                  disabled={c.kind !== 'continuous' || c.extremes === 0}
                  title={c.kind !== 'continuous' ? 'Tukey yalnızca sürekli ölçümlere uygulanır' : c.extremes === 0 ? 'İncelenecek uç değer yok' : undefined}
                  onChange={(v) => setChoice(c.name, 'extreme', v)}
                />
              ),
            },
          ];

          const profileColumns: Column<ColQ>[] = [
            { key: 'name', header: 'Sütun', cell: (c) => <span className="font-mono text-data text-fg">{c.name}</span> },
            { key: 'inf', header: 'Çıkarılan tür', cell: (c) => { const i = colInfo.get(c.name); return i ? columnTypeLabel[i.inferredType ?? i.type] : ''; } },
            { key: 'eff', header: 'Etkin tür', cell: (c) => KIND_LABEL[c.kind] },
            { key: 'val', header: 'Geçerlilik kuralı', cell: (c) => <span className={c.validity === 'unconfirmed' ? 'text-fg-subtle' : 'text-fg'}>{validityText(c)}</span> },
            {
              key: 'edit',
              header: <span className="sr-only">Düzenle</span>,
              align: 'right',
              cell: (c) => (
                <Button size="sm" variant={editCol === c.name ? 'tonal' : 'secondary'} onClick={() => setEditCol(editCol === c.name ? null : c.name)} aria-label={`${c.name} türünü ve geçerli değerlerini düzenle`}>
                  Düzenle
                </Button>
              ),
            },
          ];

          const fences = new Map(q.columns.filter((c) => c.lower !== undefined).map((c) => [c.name, c]));
          const pv = detail.data;
          const delimiter = pv?.delimiter ?? ',';
          const state = (r: number, c: number) => {
            const tok = (pv?.preview[r + 1]?.[c] ?? '').trim();
            if (MISSING.has(tok.toLowerCase())) return 'missing' as const;
            const name = pv?.preview[0]?.[c] ?? '';
            const qc = q.columns.find((x) => x.name === name);
            const info = colInfo.get(name);
            if (!qc || qc.skipped || info?.prefixCoded || info?.rankLabels) return undefined;
            const n = Number(delimiter !== ',' && /^-?\d+,\d+$/.test(tok) ? tok.replace(',', '.') : tok);
            if (qc.validity === 'range' && qc.validRange && Number.isFinite(n) && (n < qc.validRange.min || n > qc.validRange.max)) return 'invalid' as const;
            if (qc.validity === 'categories') {
              const set = info?.profile?.validCategories;
              if (set && (info?.numeric ? Number.isFinite(n) && !set.map(Number).includes(n) : !set.includes(tok))) return 'invalid' as const;
            }
            const fe = fences.get(name);
            if (fe && Number.isFinite(n) && (n < fe.lower! || n > fe.upper!)) return 'extreme' as const;
            return undefined;
          };

          const p = q.plan;
          const lossTone = p.level === 'confirm' ? 'danger' : 'warning';
          return (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-caption text-fg-subtle">Aşağıdaki sayılar {nf.format(q.rows)} satırlık veriden hesaplanır. Üç sayı ayrıdır: geçersiz hücre, incelenecek uç değer ve eksik değer.</p>
                <SegmentedControl
                  label="Grafik görünümü"
                  value={view}
                  onChange={setView}
                  options={[
                    { value: 'before', label: 'Öncesi' },
                    { value: 'after', label: 'Sonrası (önizleme)' },
                  ]}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <MetricTile label="Toplam gözlem" value={nf.format(q.rows)} unit="satır" icon={Database}>
                  {q.variables} değişken, {nf.format(q.cells)} hücre
                </MetricTile>
                <MetricTile label="Geçersiz hücre" value={q.invalidCells} tone={q.invalidCells ? 'danger' : 'secondary'} icon={TriangleAlert}>
                  {confirmedCols === 0 ? 'Doğrulanmış geçerlilik kuralı yok; bu yüzden geçersiz hücre aranmadı.' : `${confirmedCols} sütunda doğrulanmış kurala göre.`}
                </MetricTile>
                <MetricTile label="İncelenecek uç değer" value={q.extremeCells} tone={q.extremeCells ? 'tertiary' : 'secondary'} icon={Filter}>
                  Tukey 1.5×IQR, {tukeyCols} sürekli sütunda. Hata olduğu varsayılmaz.
                </MetricTile>
                <MetricTile label="Eksik değer" value={q.missingCells} tone={q.missingCells ? 'tertiary' : 'secondary'} icon={HelpCircle}>
                  Eksiklik mekanizması test edilmedi (MCAR doğrulanmadı).
                </MetricTile>
              </div>

              <Panel className="mt-6">
                <SectionHeader
                  icon={ListChecks}
                  title="Maddeler ve ölçümler"
                  level={3}
                  description="Her sütun türüne göre denetlenir: Tukey yalnızca sürekli ölçümlere uygulanır; sıralı maddeler ve kategorik kodlarda geçerli uç cevaplar silinmez. Eylem seçmediğiniz hiçbir hücreye dokunulmaz."
                />
                <DataTable caption="Madde ve ölçüm sütunları" columns={actionColumns()} rows={rowsFor(false)} rowKey={(c) => c.name} density="compact" />
                <p className="mt-3 text-caption text-fg-subtle">
                  Tukey sınırları (Q1 − 1.5·IQR, Q3 + 1.5·IQR) bir işaretleme kuralıdır (Tukey, 1977; Hoaglin, Iglewicz ve Tukey, 1986); sınır dışı bir değer hata olmak zorunda değildir. Silmeden önce kaynağı doğrulayın ya da hücreyi eksik işaretlemeyi değerlendirin.
                </p>
              </Panel>

              {rowsFor(true).length > 0 && (
                <Panel className="mt-6">
                  <SectionHeader icon={BarChart3} title="Ölçek puanları" level={3} description="Toplam/ortalama puanlar tek tek maddelerden ayrı değerlendirilir; beklenen aralık ölçek tanımından gelir." />
                  <DataTable caption="Ölçek puanı sütunları" columns={actionColumns()} rows={rowsFor(true)} rowKey={(c) => c.name} density="compact" />
                </Panel>
              )}

              <Panel className="mt-6">
                <SectionHeader icon={SlidersHorizontal} title="Sütun türleri ve geçerli değerler" level={3} description="Tür çıkarımı kesin değildir. Türü düzeltin ve geçerli aralığı ya da kategorileri siz doğrulayın; uygulama bunları gözlenen en küçük/en büyük değerden üretmez." />
                <DataTable caption="Sütun türleri" columns={profileColumns} rows={q.columns.filter((c) => !c.skipped)} rowKey={(c) => c.name} density="compact" />
                {edited && (
                  <ProfileEditor
                    key={edited.name}
                    info={edited}
                    qcol={q.columns.find((c) => c.name === edited.name)}
                    allCols={cols}
                    saving={profile.isPending}
                    error={profile.error?.message}
                    onSave={saveProfile}
                    onClose={() => setEditCol(null)}
                  />
                )}
              </Panel>

              <Panel tone="warning" className="mt-6">
                <SectionHeader icon={Wrench} title="Eksik veri doldurma" description={`${nf.format(q.missingCells)} eksik hücre`} level={3} />
                <p className="mb-3 text-body text-fg-muted">
                  Doldurma varsayılan olarak <strong className="text-fg">kapalıdır</strong>; yalnızca siz seçerseniz yapılır. Eksikliğin nedeni bilinmiyor: eksiklik çoğu zaman değerin kendisine bağlıdır ve bu, doldurmayı yanlı kılar (Schafer ve Graham, 2002).{' '}
                  Sürekli ölçümlerde <strong className="text-fg">medyan</strong> ya da <strong className="text-fg">KNN</strong>; sıralı ve kategorik sütunlarda <strong className="text-fg">mod</strong> kullanılır (ara değerler geçerli bir cevap olmayabilir).
                </p>
                <RadioCardGroup
                  legend="Doldurma yöntemi"
                  hideLegend
                  options={[
                    { value: 'none', title: 'Doldurma', hint: 'Eksikler kalır (varsayılan)' },
                    { value: 'median', title: 'Medyan / mod', hint: 'Hızlı' },
                    { value: 'knn', title: 'KNN (k=5)', hint: cleanedRows <= KNN_MAX ? 'Yalnızca sürekli sütunlar' : `≤ ${nf.format(KNN_MAX)} satır`, disabled: cleanedRows > KNN_MAX },
                  ]}
                  value={impute}
                  onChange={setImpute}
                />
                {cleanedRows > KNN_MAX && (
                  <StatusLine status="info" className="mt-3 text-caption">
                    KNN en fazla {nf.format(KNN_MAX)} satırda desteklenir; işlem sonrası {nf.format(cleanedRows)} satır kalacağı için seçilemez. Başka bir yöntem seçmediğiniz sürece doldurma yapılmaz.
                  </StatusLine>
                )}
                {knnBlocked && <StatusLine status="danger" className="mt-3 text-caption">KNN seçili ama kalan satır sayısı sınırı aşıyor; başka bir yöntem seçin.</StatusLine>}
              </Panel>

              <Panel className="mt-6" tone={p.level === 'none' ? undefined : lossTone}>
                <SectionHeader icon={Table2} title="Uygulanacak işlem (önizleme)" level={3} description="Silme ya da doldurma kararını vermeden önce ne olacağını gösterir." />
                {rules.length === 0 && impute === 'none' ? (
                  <StatusLine status="info">Henüz bir eylem seçilmedi: hiçbir satır silinmez, hiçbir hücre değişmez. Yukarıdaki tablolarda sorunlu hücreler için bir eylem seçin.</StatusLine>
                ) : (
                  <>
                    <ul className="mb-3 grid gap-1 text-body text-fg">
                      <li>
                        Silinecek benzersiz satır: <strong>{nf.format(p.removedRows)}</strong> (%{p.removedRate.toFixed(1)}) · Kalan satır: <strong>{nf.format(p.cleanedRows)}</strong>
                      </li>
                      <li>
                        Eksik işaretlenecek hücre: <strong>{nf.format(p.setMissingCells)}</strong>
                      </li>
                      <li>
                        Doldurma: <strong>{impute === 'none' ? 'yapılmayacak' : impute === 'median' ? 'medyan / mod' : 'KNN (sürekli) + mod'}</strong>
                      </li>
                    </ul>
                    {p.byRule.length > 0 && (
                      <>
                        <DataTable
                          caption="Seçilen kurallar"
                          columns={[
                            { key: 'c', header: 'Sütun', cell: (r: (typeof p.byRule)[number]) => <span className="font-mono text-data">{r.column}</span> },
                            { key: 'i', header: 'Sorun', cell: (r) => ISSUE_LABEL[r.issue] },
                            { key: 'a', header: 'Eylem', cell: (r) => ACTION_LABEL[r.action] },
                            { key: 'n', header: 'İşaretli hücre', numeric: true, align: 'right', cell: (r) => nf.format(r.cells) },
                          ]}
                          rows={p.byRule}
                          rowKey={(r) => `${r.column}-${r.issue}`}
                          density="compact"
                        />
                        <p className="mt-2 text-caption text-fg-subtle">Birden fazla sütunda işaretli kişi satır kaybında yalnızca bir kez sayılır; bu yüzden hücre toplamı satır toplamından büyük olabilir.</p>
                      </>
                    )}
                    {p.groupLoss && p.removedRows > 0 && (
                      <div className="mt-4">
                        <DataTable
                          caption={`Grup başına satır kaybı (${f?.groupColumn ?? group})`}
                          columns={[
                            { key: 'g', header: 'Grup', cell: (r: (typeof p.groupLoss extends (infer T)[] | undefined ? T : never)) => r.group },
                            { key: 'n', header: 'Satır', numeric: true, align: 'right', cell: (r) => nf.format(r.n) },
                            { key: 'r', header: 'Silinecek', numeric: true, align: 'right', cell: (r) => nf.format(r.removed) },
                            { key: 'p', header: 'Kayıp oranı', numeric: true, align: 'right', cell: (r) => `%${r.rate.toFixed(1)}` },
                          ]}
                          rows={p.groupLoss!}
                          rowKey={(r) => r.group}
                          density="compact"
                        />
                      </div>
                    )}
                    {p.level !== 'none' && (
                      <div className="mt-4">
                        <StatusLine status={p.level === 'confirm' ? 'danger' : 'warning'}>
                          {p.level === 'confirm'
                            ? `Satır kaybı %${p.worstRate.toFixed(1)} (${p.worstScope}); %${p.confirmThreshold} üzerinde gerekçe ve açık onay gerekir.`
                            : `Satır kaybı %${p.worstRate.toFixed(1)} (${p.worstScope}); %${p.reviewThreshold} üzerinde: silinecek satırları ve nedenlerini gözden geçirin.`}
                        </StatusLine>
                        {p.level === 'confirm' && (
                          <div className="mt-3 grid gap-3">
                            <label className="flex flex-col gap-1.5 text-caption font-medium text-fg-subtle">
                              Gerekçe (en az 10 karakter; sürüm geçmişine yazılır)
                              <textarea className={`${inputClass} h-20 py-2`} value={ack.reason} onChange={(e) => setAck({ ...ack, reason: e.target.value })} placeholder="Neden bu kadar satırın çıkarılmasının uygun olduğunu açıklayın." />
                            </label>
                            <label className="flex items-start gap-2 text-body text-fg">
                              <input type="checkbox" className="mt-1 accent-[var(--color-primary-strong)]" checked={ack.confirmed} onChange={(e) => setAck({ ...ack, confirmed: e.target.checked })} />
                              Örneklemin değişeceğini anladım; bu satır kaybını gerekçemle birlikte onaylıyorum.
                            </label>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
                <p className="mt-4 text-caption text-fg-subtle">
                  %{p.reviewThreshold} (inceleme) ve %{p.confirmThreshold} (onay) eşikleri bilimsel eşikler değildir: ürünün koruyucu tasarım eşikleridir. Satır silme (listwise deletion) yalnızca eksiklik tamamen rastgeleyse sonuçları yanlılaştırmaz; bunu bu araç sınamaz.
                </p>
              </Panel>

              {f && shapiro && (rules.length > 0) && (
                <Callout tone="warning" icon={GitFork} title="Dallanan yol uyarısı" className="mt-6">
                  “{f.valueColumn}” kalıntılarında Shapiro-Wilk p değeri, işlem uygulanmadan önce{' '}
                  <span className="font-mono">{f.shapiroBefore ? formatP(f.shapiroBefore.p) : '–'}</span>, seçtiğiniz işlemden sonra{' '}
                  <span className="font-mono">{f.shapiroAfter ? formatP(f.shapiroAfter.p) : '–'}</span>. Temizlik, test seçimini değiştirebilir; yaptığınız işlemi ve nedenini raporunuzda belirtin.
                </Callout>
              )}

              <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
                <Panel className="min-w-0 lg:col-span-7">
                  <SectionHeader icon={Table2} title="Ham veri (önizleme)" level={3} actions={<Tag>İlk 20 satır</Tag>} />
                  <p className="mb-2 text-caption text-fg-subtle">Kırmızı: geçersiz hücre · mavi: incelenecek uç değer · sarı: eksik. Renk dışında simge ve metinle de işaretlenir.</p>
                  {pv ? (
                    <DataPreview caption="Ham veri önizlemesi" header={pv.preview[0]!} rows={pv.preview.slice(1)} cellState={state} />
                  ) : (
                    <p className="text-fg-muted">Yükleniyor…</p>
                  )}
                </Panel>
                {f && hist && (
                  <Panel className="lg:col-span-5">
                    <SectionHeader icon={BarChart3} title="Dağılım ve kutu grafikleri" description={`${f.valueColumn}, gruplara göre (${f.groupColumn})`} level={3} actions={<Tag tone="primary">{after ? 'Sonrası' : 'Öncesi'}</Tag>} />
                    <div className="rounded-card bg-surface-lowest p-3">
                      <p className="mb-1 text-caption text-fg-subtle">Bıyıklar grup içi Tukey sınırlarıdır; sınır dışı gözlemler tek tek gösterilir.</p>
                      <BoxPlotGroup
                        boxes={after ? f.boxesAfter : f.boxesBefore}
                        summary={`${f.valueColumn} değerinin ${f.groupColumn} gruplarına göre kutu grafiği, ${after ? 'seçilen işlemden sonra' : 'ham veri'}.`}
                      />
                    </div>
                    <div className="mt-4 rounded-card bg-surface-lowest p-3">
                      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-caption text-fg-subtle">Grup ortalamasından sapma</p>
                        {shapiro && (
                          <p className="font-mono text-caption text-secondary">
                            Shapiro-Wilk W = {shapiro.W.toFixed(3)}, p {formatP(shapiro.p).startsWith('<') ? formatP(shapiro.p) : `= ${formatP(shapiro.p)}`}
                          </p>
                        )}
                      </div>
                      <HistogramWithNormal
                        bins={hist.bins}
                        normal={{ mean: hist.mean, sd: hist.sd }}
                        barTone="secondary"
                        compact
                        summary={`${f.valueColumn} kalıntılarının histogramı, çarpıklık ${skew.toFixed(2)}.`}
                        className="p-0!"
                      />
                      <p className="mt-2 text-caption text-fg-muted">
                        Çarpıklık <span className="font-mono">{skew.toFixed(2)}</span>.{' '}
                        {shapiro ? (shapiro.p >= 0.05 ? 'Normallikten sapma saptanmadı.' : 'Normallik varsayımı reddedildi.') : ''}
                      </p>
                    </div>
                  </Panel>
                )}
              </div>
            </>
          );
        }}
      </QueryView>

      <VersionHistory dataset={dataset} />

      {!quality.isError && (
        <QueryView query={code}>
          {(c) => (
            <Panel className="mt-6">
              <SectionHeader
                title="Temizleme kodu (Python)"
                level={3}
                description="Bu betik, uygulamanın seçtiğiniz kurallarla oluşturacağı veriyi üretir (otomatik testle doğrulanır)."
                actions={
                  <a
                    className="inline-flex h-8 items-center gap-1.5 rounded-control bg-surface-highest px-3 text-caption text-fg hover:bg-surface-bright"
                    href={`/api/datasets/${dataset.id}/download`}
                    download
                  >
                    <Download size={14} aria-hidden />
                    Veri dosyasını indir
                  </a>
                }
              />
              <CodeBlock code={c.code} filename={c.filename} runtime={`Gerekli paketler: ${c.requirements.join(', ')}`} maxHeight="24rem" />
            </Panel>
          )}
        </QueryView>
      )}
    </>
  );
}
