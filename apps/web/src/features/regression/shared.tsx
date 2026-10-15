import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BookmarkPlus, Download, Eye, FolderOpen, Info, OctagonAlert, TriangleAlert } from 'lucide-react';
import type { RegressionNote } from '@statadvisor/shared';
import { Button, Callout, Select, StatusLine } from '@/components/ui';
import type { SavedReportItem } from '@/data/api';
import { useCapabilities, useLevels, useSaveToReports } from '@/data/hooks';
import { fetchReport } from '@/lib/download';

export const nf = new Intl.NumberFormat('tr-TR');
export const n2 = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '–');

/** Kategorik yordayıcı için referans düzey seçimi (düzeyler sunucudan gelir). */
export function ReferenceSelect({ datasetId, column, value, onChange }: { datasetId: string; column: string; value: string | undefined; onChange: (v: string | undefined) => void }) {
  const q = useLevels(datasetId, column);
  const levels = q.data?.levels ?? [];
  // Sunucudaki varsayılan: sıralı düzey listesinde ilk düzey (kukla değişkeni olmayan düzey).
  const sorted = [...levels].map((l) => l.value).sort(new Intl.Collator('tr', { numeric: true }).compare);
  const def = sorted[0];
  return (
    <Select
      label={`“${column}” için referans düzey`}
      value={value ?? def}
      onChange={(v) => onChange(v === def ? undefined : v)}
      options={sorted.map((v) => ({ value: v, label: `${v} · ${nf.format(levels.find((l) => l.value === v)?.count ?? 0)} gözlem` }))}
      hint="Diğer düzeylerin katsayıları bu düzeye göre okunur."
    />
  );
}

const noteIcon = { info: Info, warning: TriangleAlert, danger: OctagonAlert } as const;

export function NoteList({ notes }: { notes: RegressionNote[] }) {
  if (!notes.length) return <p className="text-body text-fg-muted">Bu veride otomatik uyarı oluşmadı. Bu, varsayımların sağlandığının kanıtı değildir; grafiklere de bakın.</p>;
  return (
    <div className="flex flex-col gap-3">
      {notes.map((n) => (
        <Callout key={n.title} tone={n.level} icon={noteIcon[n.level]} title={n.title}>
          <span className="text-body">{n.text}</span>
        </Callout>
      ))}
    </div>
  );
}

/** Rapor düğmeleri: HTML (yeni sekme), Word ve PDF. Gövde POST ile gönderilir. */
export function ReportActions({ url, body, fileBase }: { url: string; body: unknown; fileBase: string }) {
  const caps = useCapabilities();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const run = async (format: 'html' | 'pdf' | 'docx') => {
    setBusy(format);
    setErr(null);
    try {
      await fetchReport(`${url}?format=${format}`, body, format === 'html' ? null : `${fileBase}.${format}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Rapor üretilemedi.');
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <Button variant="tonal" icon={Eye} disabled={busy !== null} onClick={() => run('html')}>{busy === 'html' ? 'Hazırlanıyor…' : 'Raporu aç (HTML)'}</Button>
      <Button variant="primary" icon={Download} disabled={busy !== null} onClick={() => run('docx')}>{busy === 'docx' ? 'Hazırlanıyor…' : 'Word (.docx)'}</Button>
      <Button variant="secondary" icon={Download} disabled={busy !== null || caps.data?.pdf === false} title={caps.data?.pdf === false ? 'PDF için Chromium gerekir: npx playwright install chromium' : undefined} onClick={() => run('pdf')}>{busy === 'pdf' ? 'Hazırlanıyor…' : 'PDF'}</Button>
      {err && <StatusLine status="danger" className="text-caption">{err}</StatusLine>}
    </div>
  );
}

/**
 * “Rapor merkezine kaydet”: sonucu kalıcı olarak saklar ve kayıttan sonra rapor merkezine bağlantı gösterir.
 * resetKey değişince (ayarlar ya da iş değişti) düğme yeniden görünür.
 */
export function SaveToReports({ url, body, resetKey }: { url: string; body?: unknown; resetKey: string }) {
  const save = useSaveToReports();
  const [saved, setSaved] = useState<{ key: string; item: SavedReportItem } | null>(null);
  const done = saved?.key === resetKey ? saved.item : null;
  const failed = save.isError && save.variables?.url === url && !done;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      {done ? (
        <>
          <StatusLine status="success">{done.created ? 'Rapor merkezine kaydedildi.' : 'Bu sonuç rapor merkezinde zaten kayıtlı.'}</StatusLine>
          <Link className="inline-flex h-10 items-center gap-2 rounded-control border border-line-strong px-4 text-body text-fg transition hover:bg-surface-highest/60" to={`/kod-rapor?rapor=${done.id}`}>
            <FolderOpen size={16} aria-hidden /> Rapor merkezinde aç
          </Link>
        </>
      ) : (
        <>
          <Button variant="primary" icon={BookmarkPlus} disabled={save.isPending} onClick={() => save.mutate({ url, body }, { onSuccess: (item) => setSaved({ key: resetKey, item }) })}>
            {save.isPending ? 'Kaydediliyor…' : 'Rapor merkezine kaydet'}
          </Button>
          <span className="text-caption text-fg-subtle">Kaydedilen sonuç sunucu kapansa da kalır; kodu ve raporu rapor merkezinden indirilebilir.</span>
        </>
      )}
      {failed && <StatusLine status="danger" className="text-caption">{save.error.message}</StatusLine>}
    </div>
  );
}
