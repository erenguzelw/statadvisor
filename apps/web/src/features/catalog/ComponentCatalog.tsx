import { useState, type ReactNode } from 'react';
import { Bell, FileText, Globe, Info, Sparkles, Zap } from 'lucide-react';
import {
  Button,
  Callout,
  Checklist,
  CodeBlock,
  IconButton,
  MeterBar,
  MetricTile,
  Panel,
  ProgressBar,
  RadioCardGroup,
  SectionHeader,
  SegmentedControl,
  StatusChip,
  Tabs,
  Tag,
} from '@/components/ui';
import { PValue } from '@/components/domain';

function Row({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-line/30 py-6">
      <h2 className="text-body font-semibold text-fg-subtle">{title}</h2>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </section>
  );
}

/** Geliştirme ortamında /bilesenler adresinde açılan bileşen kataloğu. */
export default function ComponentCatalog() {
  const [seg, setSeg] = useState<'a' | 'b'>('a');
  const [tab, setTab] = useState<'x' | 'y' | 'z'>('x');
  const [radio, setRadio] = useState<'pdf' | 'html'>('pdf');
  return (
    <div>
      <h1 className="text-display font-bold">Bileşen kataloğu</h1>
      <p className="mt-2 text-body-lg text-fg-muted">Tüm jenerik bileşenlerin varyantları. Yalnızca geliştirme ortamında görünür.</p>

      <Row title="Button">
        <Button variant="primary" icon={Sparkles}>Primary</Button>
        <Button>Secondary</Button>
        <Button variant="tonal">Tonal</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="success">Success</Button>
        <Button variant="primary" size="sm">Küçük</Button>
        <Button variant="primary" disabled>Devre dışı</Button>
        <IconButton icon={Bell} label="Bildirimler" badge />
      </Row>
      <Row title="StatusChip ve Tag">
        {(['success', 'danger', 'warning', 'info', 'neutral'] as const).map((s) => (
          <StatusChip key={s} status={s}>{s}</StatusChip>
        ))}
        {(['neutral', 'primary', 'secondary', 'tertiary', 'danger'] as const).map((t) => (
          <Tag key={t} tone={t}>H(2) = 11.6</Tag>
        ))}
        <PValue p={0.0004} /> <PValue p={0.012} /> <PValue p={0.41} /> <PValue p={0.003} apa />
      </Row>
      <Row title="SegmentedControl ve Tabs">
        <SegmentedControl label="Örnek" value={seg} onChange={setSeg} options={[{ value: 'a', label: 'Yeni Başlayan' }, { value: 'b', label: 'Uzman' }]} />
        <Tabs label="Örnek sekmeler" value={tab} onChange={setTab} items={[{ value: 'x', label: 'Python' }, { value: 'y', label: 'Statsmodels' }, { value: 'z', label: 'R' }]}>
          <p className="text-fg-muted">Seçili sekme: {tab}</p>
        </Tabs>
      </Row>
      <Row title="MeterBar, ProgressBar, MetricTile">
        <div className="flex w-64 flex-col gap-2">
          <MeterBar value={95} label="Yüksek" />
          <MeterBar value={62} label="Orta" />
          <MeterBar value={35} label="Düşük" />
          <ProgressBar value={60} label="İlerleme" />
        </div>
        <MetricTile label="Toplam gözlem" value="1.420" unit="satır" icon={Zap}>8 değişken</MetricTile>
      </Row>
      <Row title="RadioCardGroup">
        <RadioCardGroup
          className="w-full max-w-md"
          legend="Biçim"
          value={radio}
          onChange={setRadio}
          options={[
            { value: 'pdf', title: 'PDF', description: 'APA 7', icon: FileText },
            { value: 'html', title: 'HTML', description: 'Web', icon: Globe },
          ]}
        />
      </Row>
      <Row title="Panel, SectionHeader, Callout, Checklist">
        <Panel className="w-full max-w-xl">
          <SectionHeader icon={Info} title="Bölüm başlığı" description="Açıklama metni" feature="Özellik 01" />
          <Checklist items={[{ id: '1', label: 'Birinci madde', meta: 'Sayfa 1' }, { id: '2', label: 'İkinci madde', meta: 'Sayfa 2' }]} />
        </Panel>
        <Callout tone="warning" icon={Info} title="Uyarı başlığı" className="w-full">
          Callout içeriği.
        </Callout>
      </Row>
      <Row title="CodeBlock">
        <CodeBlock className="w-full" filename="ornek.py" runtime="Python 3.11" lineNumbers code={'from scipy import stats\nprint(stats.kruskal([1, 2], [3, 4]))'} />
      </Row>
    </div>
  );
}
