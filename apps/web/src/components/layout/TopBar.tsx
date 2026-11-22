import { useId } from 'react';
import { Bell, ChevronsUpDown, FolderOpen, Menu, SquareTerminal } from 'lucide-react';
import { IconButton } from '@/components/ui';
import { useActiveDataset, useApp } from '@/context/AppContext';
import { useT } from '@/i18n';
import { ExpertiseToggle } from './ExpertiseToggle';
import { LanguageToggle } from './LanguageToggle';

function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
      <path d="M16 4 4 28h5l7-14 7 14h5z" fill="var(--color-primary-strong)" />
      <circle cx="16" cy="21" r="2.6" fill="var(--color-secondary)" />
    </svg>
  );
}

function DatasetPicker() {
  const t = useT();
  const id = useId();
  const { setDatasetId } = useApp();
  const { dataset, datasets, loading } = useActiveDataset();
  return (
    <div className="relative flex min-w-0 items-center">
      <label htmlFor={id} className="sr-only">
        {t('Veri seti')}
      </label>
      <FolderOpen size={16} className="pointer-events-none absolute left-3 text-secondary" aria-hidden />
      <select
        id={id}
        value={dataset?.id ?? ''}
        disabled={loading || datasets.length === 0}
        onChange={(e) => setDatasetId(e.target.value)}
        className="h-10 max-w-72 min-w-0 appearance-none truncate rounded-card border border-line/40 bg-surface-low pr-8 pl-9 font-mono text-data text-fg hover:border-line-strong"
      >
        {datasets.length === 0 && <option value="">{loading ? t('Yükleniyor…') : t('Veri seti yok')}</option>}
        {datasets.map((d) => (
          <option key={d.id} value={d.id}>
            {t(d.name)}
          </option>
        ))}
      </select>
      <ChevronsUpDown size={14} className="pointer-events-none absolute right-2.5 text-fg-subtle" aria-hidden />
    </div>
  );
}

export function TopBar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const t = useT();
  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line/20 bg-canvas/90 px-4 py-3 backdrop-blur md:px-8">
      <IconButton icon={Menu} label={t('Menüyü aç')} onClick={onOpenMenu} className="lg:hidden" />
      <a href="/" className="flex shrink-0 items-center gap-2.5">
        <Logo />
        <span className="hidden font-display text-heading font-bold tracking-tight sm:inline">StatAdvisor</span>
      </a>
      <span className="hidden h-6 w-px bg-line/50 xl:block" aria-hidden />
      <div className="hidden min-w-0 xl:block">
        <DatasetPicker />
      </div>
      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        <LanguageToggle />
        <ExpertiseToggle className="hidden sm:inline-flex" />
        <IconButton icon={Bell} label={t('Bildirimler')} badge />
        <IconButton icon={SquareTerminal} label={t('Konsol')} className="hidden sm:inline-flex" />
        <span
          className="ml-1 inline-flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-primary-strong to-secondary-strong text-caption font-semibold text-white"
          role="img"
          aria-label="Eren Güzel"
        >
          EG
        </span>
      </div>
    </header>
  );
}

/** Dar ekranlarda üst çubuğa sığmayan kontroller. */
export function MobileControls() {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line/20 px-4 py-2 md:px-8 xl:hidden">
      <DatasetPicker />
      <ExpertiseToggle className="sm:hidden" />
    </div>
  );
}
