import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BookmarkPlus, Download, Eye, FolderOpen, Info, OctagonAlert, TriangleAlert } from 'lucide-react';
import type { RegressionNote } from '@statadvisor/shared';
import type { GeneratedCode } from '@statadvisor/shared';
import { Button, Callout, CodeBlock, Select, SegmentedControl, StatusLine } from '@/components/ui';
import type { SavedReportItem } from '@/data/api';
import { useCapabilities, useLevels, useSaveToReports } from '@/data/hooks';
import { fetchReport } from '@/lib/download';
import { langQuery, nf, tc, useI18n } from '@/i18n';

/** Python ve R kodunu seçiciyle gösterir (R kodu yoksa yalnızca Python). */
export function DualCodeBlock({ python, r, maxHeight = '28rem' }: { python: GeneratedCode; r?: GeneratedCode | null; maxHeight?: string }) {
  const { t } = useI18n();
  const [lang, setLang] = useState<'python' | 'r'>('python');
  const active = lang === 'r' && r ? r : python;
  const isR = active === r;
  return (
    <div className="flex flex-col gap-3">
      {r && <SegmentedControl label={t('Kod dili')} value={lang} onChange={setLang} options={[{ value: 'python', label: t('Python') }, { value: 'r', label: 'R' }]} />}
      <CodeBlock
        code={tc(active.code)}
        filename={active.filename}
        language={isR ? 'r' : 'python'}
        runtime={isR ? t('R · yalnızca temel R (ek paket gerekmez)') : `Python · ${active.requirements.join(', ')}`}
        lineNumbers
        maxHeight={maxHeight}
      />
    </div>
  );
}

export { nf };
export const n2 = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '–');

/** Kategorik yordayıcı için referans düzey seçimi (düzeyler sunucudan gelir). */
export function ReferenceSelect({ datasetId, column, value, onChange }: { datasetId: string; column: string; value: string | undefined; onChange: (v: string | undefined) => void }) {
  const { t } = useI18n();
  const q = useLevels(datasetId, column);
  const levels = q.data?.levels ?? [];
  // Sunucudaki varsayılan: sıralı düzey listesinde ilk düzey (kukla değişkeni olmayan düzey).
  const sorted = [...levels].map((l) => l.value).sort(new Intl.Collator(undefined, { numeric: true }).compare);
  const def = sorted[0];
  return (
    <Select
      label={t('“{column}” için referans düzey', { column: column })}
      value={value ?? def}
      onChange={(v) => onChange(v === def ? undefined : v)}
      options={sorted.map((v) => ({ value: v, label: t('{v} · {v2} gözlem', { v: v, v2: nf.format(levels.find((l) => l.value === v)?.count ?? 0) }) }))}
      hint={t('Diğer düzeylerin katsayıları bu düzeye göre okunur.')}
    />
  );
}

const noteIcon = { info: Info, warning: TriangleAlert, danger: OctagonAlert } as const;

export function NoteList({ notes }: { notes: RegressionNote[] }) {
  const { t } = useI18n();
  if (!notes.length) return <p className="text-body text-fg-muted">{t('Bu veride otomatik uyarı oluşmadı. Bu, varsayımların sağlandığının kanıtı değildir; grafiklere de bakın.')}</p>;
  return (
    <div className="flex flex-col gap-3">
      {notes.map((n) => (
        <Callout key={n.title} tone={n.level} icon={noteIcon[n.level]} title={t(n.title)}>
          <span className="text-body">{t(n.text)}</span>
        </Callout>
      ))}
    </div>
  );
}

/** Rapor düğmeleri: HTML (yeni sekme), Word ve PDF. Gövde POST ile gönderilir. */
export function ReportActions({ url, body, fileBase }: { url: string; body: unknown; fileBase: string }) {
  const { t } = useI18n();
  const caps = useCapabilities();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const run = async (format: 'html' | 'pdf' | 'docx') => {
    setBusy(format);
    setErr(null);
    try {
      await fetchReport(`${url}?format=${format}${langQuery()}`, body, format === 'html' ? null : `${fileBase}.${format}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('Rapor üretilemedi.'));
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <Button variant="tonal" icon={Eye} disabled={busy !== null} onClick={() => run('html')}>{busy === 'html' ? t('Hazırlanıyor…') : t('Raporu aç (HTML)')}</Button>
      <Button variant="primary" icon={Download} disabled={busy !== null} onClick={() => run('docx')}>{busy === 'docx' ? t('Hazırlanıyor…') : 'Word (.docx)'}</Button>
      <Button variant="secondary" icon={Download} disabled={busy !== null || caps.data?.pdf === false} title={caps.data?.pdf === false ? t('PDF için Chromium gerekir: npx playwright install chromium') : undefined} onClick={() => run('pdf')}>{busy === 'pdf' ? t('Hazırlanıyor…') : 'PDF'}</Button>
      {err && <StatusLine status="danger" className="text-caption">{err}</StatusLine>}
    </div>
  );
}

/**
 * “Rapor merkezine kaydet”: sonucu kalıcı olarak saklar ve kayıttan sonra rapor merkezine bağlantı gösterir.
 * resetKey değişince (ayarlar ya da iş değişti) düğme yeniden görünür.
 */
export function SaveToReports({ url, body, resetKey }: { url: string; body?: unknown; resetKey: string }) {
  const { t } = useI18n();
  const save = useSaveToReports();
  const [saved, setSaved] = useState<{ key: string; item: SavedReportItem } | null>(null);
  const done = saved?.key === resetKey ? saved.item : null;
  const failed = save.isError && save.variables?.url === url && !done;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      {done ? (
        <>
          <StatusLine status="success">{done.created ? 'Rapor merkezine kaydedildi.' : t('Bu sonuç rapor merkezinde zaten kayıtlı.')}</StatusLine>
          <Link className="inline-flex h-10 items-center gap-2 rounded-control border border-line-strong px-4 text-body text-fg transition hover:bg-surface-highest/60" to={`/kod-rapor?rapor=${done.id}`}>
            <FolderOpen size={16} aria-hidden /> {t('Rapor merkezinde aç')}</Link>
        </>
      ) : (
        <>
          <Button variant="primary" icon={BookmarkPlus} disabled={save.isPending} onClick={() => save.mutate({ url, body }, { onSuccess: (item) => setSaved({ key: resetKey, item }) })}>
            {save.isPending ? 'Kaydediliyor…' : 'Rapor merkezine kaydet'}
          </Button>
          <span className="text-caption text-fg-subtle">{t('Kaydedilen sonuç sunucu kapansa da kalır; kodu ve raporu rapor merkezinden indirilebilir.')}</span>
        </>
      )}
      {failed && <StatusLine status="danger" className="text-caption">{t(save.error.message)}</StatusLine>}
    </div>
  );
}
