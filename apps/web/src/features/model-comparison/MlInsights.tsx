import { useState } from 'react';
import { Link2, Target } from 'lucide-react';
import type { CvResult, MlInterpretation, ModelCv } from '@statadvisor/shared';
import { RocCurve } from '@/components/charts';
import { DataTable, Panel, SectionHeader, Select, Tag, type Column } from '@/components/ui';

const pct = (x: number, d = 1) => (Number.isFinite(x) ? `%${(x * 100).toFixed(d)}` : '–');
const n3 = (x: number | undefined) => (x !== undefined && Number.isFinite(x) ? x.toFixed(3) : '–');
const nf = new Intl.NumberFormat('tr-TR');

const CLASS_COLORS = ['var(--color-primary-strong)', 'var(--color-tertiary)', 'var(--color-secondary)', 'var(--color-danger)', 'var(--color-info)', 'var(--color-success)'];

type Result = Omit<CvResult, 'foldOf'>;

/** Karışıklık matrisi: hücre rengi, satır içi oranı gösterir (köşegen = doğru sınıflama). */
function ConfusionMatrix({ model, classes }: { model: ModelCv; classes: string[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[22rem] border-collapse text-body">
        <caption className="sr-only">Karışıklık matrisi: satır gerçek sınıf, sütun yordanan sınıf</caption>
        <thead>
          <tr>
            <th className="p-2 text-left text-caption font-medium text-fg-subtle">Gerçek ↓ / Yordanan →</th>
            {classes.map((c) => (
              <th key={c} scope="col" className="p-2 text-right text-caption font-medium text-fg-subtle">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {model.confusion.map((row, i) => {
            const total = row.reduce((s, v) => s + v, 0) || 1;
            return (
              <tr key={classes[i]}>
                <th scope="row" className="p-2 text-left font-medium text-fg">{classes[i]}</th>
                {row.map((v, j) => {
                  const share = v / total;
                  return (
                    <td
                      key={j}
                      className="p-2 text-right font-mono text-data tabular text-fg"
                      style={{ background: `color-mix(in srgb, ${i === j ? 'var(--color-secondary)' : 'var(--color-tertiary)'} ${Math.round(share * 70)}%, transparent)` }}
                      title={`${classes[i]} → ${classes[j]}: ${v} gözlem (satırın ${pct(share)}'i)`}
                    >
                      {nf.format(v)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-1 text-caption text-fg-subtle">Yeşil köşegen: doğru sınıflama; turuncu: yanlış. Renk yoğunluğu satır içi oranı gösterir.</p>
    </div>
  );
}

/** Sınıf bazında sonuçlar: model seçilir; karışıklık matrisi, sınıf tablosu ve bire-karşı-hepsi ROC eğrileri. */
export function ClassDetail({ result, defaultId }: { result: Result; defaultId?: string }) {
  const models = result.models.filter((m) => !m.skipped && m.id !== 'baseline');
  const [id, setId] = useState(defaultId ?? models[0]?.id);
  const model = models.find((m) => m.id === id) ?? models[0];
  if (!model) return null;
  const cols: Column<ModelCv['perClass'][number] & { auc?: number }>[] = [
    { key: 'cls', header: 'Sınıf', cell: (c) => <span className="font-medium text-fg">{c.cls}</span> },
    { key: 'p', header: 'Kesinlik', align: 'right', numeric: true, cell: (c) => n3(c.precision) },
    { key: 'r', header: 'Duyarlılık', align: 'right', numeric: true, cell: (c) => n3(c.recall) },
    { key: 'f', header: 'F1', align: 'right', numeric: true, cell: (c) => n3(c.f1) },
    { key: 's', header: 'Destek', align: 'right', numeric: true, cell: (c) => nf.format(c.support) },
    { key: 'a', header: 'AUC', align: 'right', numeric: true, cell: (c) => n3(c.auc) },
  ];
  const rows = model.perClass.map((c, i) => ({ ...c, auc: model.aucPerClass?.[i] }));
  return (
    <Panel>
      <SectionHeader icon={Target} title="Sınıf bazında sonuçlar" level={3} description="Tüm test katmanlarının birleşik tahminlerinden. Kesinlik: “X dediğinde ne kadar haklı”; duyarlılık: “gerçek X'lerin ne kadarını yakaladı”. AUC bire-karşı-hepsi tanımlıdır." />
      <div className="mb-4 max-w-sm">
        <Select label="Model" value={model.id} onChange={setId} options={models.map((m) => ({ value: m.id, label: m.label }))} />
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="flex flex-col gap-4">
          <div>
            <h3 className="mb-2 text-body-lg font-semibold text-fg">Karışıklık matrisi</h3>
            <ConfusionMatrix model={model} classes={result.classes} />
          </div>
          <div>
            <h3 className="mb-2 text-body-lg font-semibold text-fg">Sınıf tablosu</h3>
            <DataTable caption="Sınıf bazında sonuçlar" columns={cols} rows={rows} rowKey={(c) => c.cls} density="compact" />
          </div>
        </div>
        <div>
          <h3 className="mb-2 flex flex-wrap items-center gap-2 text-body-lg font-semibold text-fg">
            Bire-karşı-hepsi ROC eğrileri {model.auc && <Tag tone="primary">makro AUC = {model.auc.mean.toFixed(3)}</Tag>}
          </h3>
          {model.roc ? (
            <div className="max-w-md">
              <RocCurve series={model.roc.map((c, i) => ({ id: c.cls, label: `Sınıf ${c.cls}`, auc: model.aucPerClass?.[i] ?? NaN, points: c.points, color: CLASS_COLORS[i % CLASS_COLORS.length]!, emphasized: false }))} />
              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-caption text-fg-muted">
                {model.roc.map((c, i) => (
                  <li key={c.cls} className="flex items-center gap-1.5">
                    <span aria-hidden className="inline-block h-2 w-4 rounded-sm" style={{ background: CLASS_COLORS[i % CLASS_COLORS.length] }} />
                    {c.cls}: AUC {n3(model.aucPerClass?.[i])}
                  </li>
                ))}
              </ul>
              {model.id === 'svm' && <p className="mt-2 text-caption text-fg-subtle">SVM olasılık üretmez; eğriler karar skorlarından (scikit-learn decision_function, ovr) çizilir.</p>}
            </div>
          ) : (
            <p className="text-body text-fg-muted">Bu model sıralama skoru üretmediği için ROC çizilemedi.</p>
          )}
        </div>
      </div>
    </Panel>
  );
}

/** Değişkenler arası ilişkiler: korelasyonların yönü ve sıralaması ile hedefle ilişki. */
export function AssociationPanel({ result, interp }: { result: Result; interp: MlInterpretation }) {
  const pairs = result.associations.pairs.slice(0, 8);
  const cols: Column<(typeof pairs)[number]>[] = [
    { key: 'a', header: 'Özellik A', cell: (p) => <span className="font-medium text-fg">{p.a}</span> },
    { key: 'b', header: 'Özellik B', cell: (p) => <span className="font-medium text-fg">{p.b}</span> },
    { key: 'r', header: 'r', align: 'right', numeric: true, cell: (p) => p.r.toFixed(2) },
    { key: 'd', header: 'Yön', cell: (p) => p.direction },
    { key: 's', header: 'Büyüklük', cell: (p) => p.strength },
  ];
  return (
    <Panel>
      <SectionHeader icon={Link2} title="Değişkenler arası ilişkiler" level={3} description="Cümleler tablodaki sayılardan üretilir: yön r'nin işaretinden, sıralama |r|'dan gelir. Büyüklük etiketleri Cohen başparmak kuralıdır; çok büyük örneklemde küçük ilişkiler de anlamlı çıkar, bu yüzden büyüklüğe bakılır." />
      <ul className="mb-4 flex list-disc flex-col gap-1.5 pl-5 text-body text-fg">
        {interp.correlations.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
      {pairs.length > 0 && <DataTable caption="En güçlü sayısal özellik çiftleri" columns={cols} rows={pairs} rowKey={(p) => `${p.a}|${p.b}`} density="compact" />}
      {interp.targetAssoc.length > 0 && (
        <>
          <h3 className="mt-5 mb-2 text-body-lg font-semibold text-fg">Hedef sınıflarla ilişki (tek tek özellikler)</h3>
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-body text-fg">
            {interp.targetAssoc.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}
