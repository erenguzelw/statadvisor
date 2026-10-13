import { useState } from 'react';
import { ScanSearch } from 'lucide-react';
import { Button, Panel, SectionHeader, StatusLine } from '@/components/ui';
import { useApp } from '@/context/AppContext';
import type { ColumnInfo } from '@/data/api';
import { useApplyScreen, useScreen, useScreenCode, type ScreenRequest } from '@/data/hooks';

const nf = new Intl.NumberFormat('tr-TR');

/** Anket yanıt taraması: düz çizgi yanıtlar ve Mahalanobis uzaklığına göre çok değişkenli aykırı değerler. */
export function ScreenPanel({ datasetId, columns }: { datasetId: string; columns: ColumnInfo[] }) {
  const { setDatasetId } = useApp();
  const available = columns.filter((c) => c.numeric && !c.likelyId);
  // Varsayılan: "2:Bazen katılıyorum" gibi kodlu Likert maddeleri.
  const [items, setItems] = useState<string[]>(() => available.filter((c) => c.prefixCoded).map((c) => c.name));
  const [straightLine, setStraightLine] = useState(true);
  const [mahalanobis, setMahalanobis] = useState(true);
  const run = useScreen(datasetId);
  const apply = useApplyScreen(datasetId);
  const code = useScreenCode(datasetId);
  const body: ScreenRequest = { items, straightLine, mahalanobis };
  const toggle = (n: string) => setItems((xs) => (xs.includes(n) ? xs.filter((x) => x !== n) : [...xs, n]));
  const r = run.data;
  const reason = (row: number) =>
    [r?.straightLiners.includes(row) && 'düz çizgi', r?.mahalanobis.some((m) => m.row === row) && 'Mahalanobis'].filter(Boolean).join(' + ');

  if (available.length < 2) return null;
  return (
    <Panel className="mt-6">
      <SectionHeader
        icon={ScanSearch}
        title="Anket yanıt taraması"
        description="Ölçek puanı oluşturmadan önce dikkatsiz ya da tutarsız yanıtları bulun: tüm maddelere aynı yanıtı verenler (düz çizgi) ve Mahalanobis uzaklığına göre çok değişkenli aykırı yanıtlar. Satırları çıkarmak yeni bir veri sürümü oluşturur."
      />
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-body text-fg">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={straightLine} onChange={(e) => setStraightLine(e.target.checked)} />
            Düz çizgi yanıtlar
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={mahalanobis} onChange={(e) => setMahalanobis(e.target.checked)} />
            Mahalanobis uzaklığı (p &lt; .001)
          </label>
        </div>
        <fieldset>
          <legend className="mb-1 text-caption text-fg-muted">
            Taranacak maddeler ({items.length} seçili).{' '}
            <button type="button" className="text-secondary underline underline-offset-2" onClick={() => setItems(available.map((c) => c.name))}>
              Tümünü seç
            </button>{' '}
            ·{' '}
            <button type="button" className="text-secondary underline underline-offset-2" onClick={() => setItems([])}>
              Temizle
            </button>
          </legend>
          <ul className="grid max-h-56 grid-cols-1 gap-x-4 gap-y-1 overflow-auto rounded-card border border-line/20 p-2 lg:grid-cols-2">
            {available.map((c) => (
              <li key={c.name} className="text-caption">
                <label className="flex min-w-0 items-center gap-2 text-fg">
                  <input type="checkbox" checked={items.includes(c.name)} onChange={() => toggle(c.name)} />
                  <span className="truncate" title={c.name}>{c.name}</span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
        <div className="flex flex-wrap gap-3">
          <Button variant="primary" disabled={run.isPending || items.length < 2} onClick={() => run.mutate(body)}>
            Yanıtları tara
          </Button>
          <Button variant="ghost" disabled={code.isPending || items.length < 2} onClick={() => code.mutate(body)}>
            Python kodunu göster
          </Button>
        </div>
        <div aria-live="polite" className="flex flex-col gap-2">
          {run.error && <StatusLine status="danger">{run.error.message}</StatusLine>}
          {apply.error && <StatusLine status="danger">{apply.error.message}</StatusLine>}
          {code.error && <StatusLine status="danger">{code.error.message}</StatusLine>}
          {apply.data && <StatusLine status="success">“{apply.data.name}” oluşturuldu ve etkin veri seti yapıldı ({nf.format(apply.data.rows)} satır).</StatusLine>}
          {r && (
            <div className="rounded-card border border-line/30 bg-surface-lowest p-3 text-body text-fg">
              <p>
                {nf.format(r.complete)} tam yanıtlı satır tarandı ({r.items} madde).
                {straightLine && <> Düz çizgi: <strong>{r.straightLiners.length}</strong>.</>}
                {mahalanobis && r.critical !== null && (
                  <>
                    {' '}
                    Mahalanobis: <strong>{r.mahalanobis.length}</strong> (χ²({r.items}) kritik değer {r.critical.toFixed(2)}, en büyük D² {r.maxD2?.toFixed(2)}).
                  </>
                )}
              </p>
              {r.notes.map((n) => (
                <p key={n} className="text-caption text-warning">{n}</p>
              ))}
              {r.flagged.length > 0 ? (
                <>
                  <p className="mt-2 text-caption text-fg-muted">
                    İşaretli satırlar (veri dosyasındaki sıra, 1’den başlar){r.flagged.length > 60 ? `; ilk 60 gösteriliyor` : ''}:
                  </p>
                  <ul className="mt-1 flex flex-wrap gap-2 text-caption">
                    {r.flagged.slice(0, 60).map((row) => (
                      <li key={row} className="rounded-control bg-surface px-2 py-0.5">
                        <span className="font-mono">{row + 1}</span> <span className="text-fg-muted">{reason(row)}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="mt-3"
                    variant="secondary"
                    disabled={apply.isPending}
                    onClick={() => apply.mutate(body, { onSuccess: (d) => setDatasetId(d.id) })}
                  >
                    İşaretli {r.flagged.length} satırı çıkararak yeni sürüm oluştur
                  </Button>
                  <p className="mt-1 text-caption text-fg-muted">Çıkarmadan önce bu yanıtları inceleyin; aykırı olmak tek başına hatalı yanıt anlamına gelmez.</p>
                </>
              ) : (
                <StatusLine status="success" className="mt-2">İşaretlenen satır yok.</StatusLine>
              )}
            </div>
          )}
        </div>
        {code.data && (
          <pre className="max-h-96 overflow-auto rounded-card border border-line/30 bg-surface-lowest p-3 font-mono text-data text-fg" aria-label="Tarama Python kodu">
            {code.data.code}
          </pre>
        )}
      </div>
    </Panel>
  );
}
