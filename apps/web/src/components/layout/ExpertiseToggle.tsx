import { SegmentedControl } from '@/components/ui';
import { useApp } from '@/context/AppContext';
import type { Expertise } from '@statadvisor/shared';

const options: { value: Expertise; label: string }[] = [
  { value: 'novice', label: 'Yeni Başlayan' },
  { value: 'expert', label: 'Uzman' },
];

export function ExpertiseToggle({ className }: { className?: string }) {
  const { expertise, setExpertise } = useApp();
  return (
    <SegmentedControl
      label="Anlatım seviyesi"
      options={options}
      value={expertise}
      onChange={setExpertise}
      className={className}
    />
  );
}
