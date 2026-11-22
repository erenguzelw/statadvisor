import { NavLink } from 'react-router-dom';
import { Settings } from 'lucide-react';
import { cn } from '@/lib/cn';
import { IconButton } from '@/components/ui';
import { useT } from '@/i18n';
import { navItems } from './navigation';

export function Sidebar({ onNavigate, className }: { onNavigate?: () => void; className?: string }) {
  const t = useT();
  return (
    <div className={cn('flex h-full flex-col justify-between gap-6 bg-surface-low px-4 py-6', className)}>
      <div className="flex flex-col gap-6">
        <p className="flex items-center gap-2 px-3 text-caption text-fg-subtle">
          <span className="size-2 rounded-full bg-secondary motion-safe:animate-pulse" aria-hidden />
          {t('İstatistik çekirdeği')} <span className="font-mono">v0.1</span>
        </p>
        <nav aria-label={t('Ana menü')}>
          <ul className="flex flex-col gap-1.5">
            {navItems.map(({ to, label, icon: Icon }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-card px-3.5 py-3 text-body transition-colors',
                      isActive
                        ? 'bg-primary-strong font-semibold text-on-primary-strong'
                        : 'text-fg-muted hover:bg-surface-high hover:text-fg',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon size={18} className={isActive ? 'text-on-primary-strong' : 'text-primary'} aria-hidden />
                      {t(label)}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="flex flex-col gap-3">
        <div className="rounded-card bg-surface-lowest p-3">
          <p className="mb-1.5 text-caption font-medium text-fg-subtle">{t('Hesaplama')}</p>
          <p className="text-caption text-fg-muted">{t('Tüm hesaplar bu bilgisayardaki yerel sunucuda yapılır; verileriniz dışarı gönderilmez.')}</p>
        </div>
        <div className="flex items-center justify-between px-1">
          <p className="font-mono text-caption text-fg-subtle">{t('Yerel çalışma')}</p>
          <IconButton icon={Settings} label={t('Ayarlar')} className="size-8" />
        </div>
      </div>
    </div>
  );
}
