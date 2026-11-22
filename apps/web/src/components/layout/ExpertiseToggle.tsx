import { SegmentedControl } from '@/components/ui';
import { useApp } from '@/context/AppContext';
import { useT } from '@/i18n';
import type { Expertise } from '@statadvisor/shared';

const options: { value: Expertise; label: string }[] = [
  { value: 'novice', label: 'Yeni Başlayan' },
  { value: 'expert', label: 'Uzman' },
];

export function ExpertiseToggle({ className }: { className?: string }) {
  const { expertise, setExpertise } = useApp();
  const t = useT();
  return (
    <SegmentedControl
      label={t('Anlatım seviyesi')}
      options={options.map((o) => ({ ...o, label: t(o.label) }))}
      value={expertise}
      onChange={setExpertise}
      className={className}
    />
  );
}
