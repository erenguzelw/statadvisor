import { SegmentedControl } from '@/components/ui';
import { useI18n, type Lang } from '@/i18n';

const options: { value: Lang; label: string }[] = [
  { value: 'tr', label: 'TR' },
  { value: 'en', label: 'EN' },
];

/** Arayüz dilini seçer (Türkçe / İngilizce); tercih tarayıcıda saklanır. */
export function LanguageToggle({ className }: { className?: string }) {
  const { lang, setLang, t } = useI18n();
  return <SegmentedControl label={t('Dil')} options={options} value={lang} onChange={setLang} className={className} />;
}
