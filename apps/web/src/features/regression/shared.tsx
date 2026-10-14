import { useState } from 'react';
import { Download, Eye, Info, OctagonAlert, TriangleAlert } from 'lucide-react';
import type { RegressionNote } from '@statadvisor/shared';
import { Button, Callout, Select, StatusLine } from '@/components/ui';
import { useCapabilities, useLevels } from '@/data/hooks';
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
