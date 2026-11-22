import type { ReactNode } from 'react';
import { PlayCircle } from 'lucide-react';
import { useT } from '@/i18n';

export function ConsoleOutput({ lines, duration }: { lines: ReactNode[]; duration?: string }) {
  const t = useT();
  return (
    <div className="rounded-card border border-white/5 bg-surface-lowest p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-caption font-semibold text-fg-muted">
          <PlayCircle size={16} className="text-secondary" aria-hidden />
          {t('Beklenen konsol çıktısı')}
        </p>
        {duration && <p className="text-caption text-fg-subtle">{t('Çalışma süresi: ')}<span className="font-mono tabular">{duration}</span></p>}
      </div>
      <output className="block rounded-control bg-code p-3 font-mono text-data leading-6 text-secondary">
        {lines.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </output>
    </div>
  );
}
