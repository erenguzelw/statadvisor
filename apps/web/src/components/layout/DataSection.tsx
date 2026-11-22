import { NavLink, Outlet } from 'react-router-dom';
import { useT } from '@/i18n';
import { cn } from '@/lib/cn';

const tabs = [
  { to: '/veri', label: 'Veri Setleri', end: true },
  { to: '/veri/kalite', label: 'Kalite & aykırılık', end: false },
];

/** “Veri Setleri” bölümü: veri yönetimi ve veri kalitesi aynı menü öğesinin alt sekmeleridir. */
export function DataSection() {
  const t = useT();
  return (
    <>
      <nav aria-label={t('Veri bölümleri')} className="mb-6 border-b border-line">
        <ul className="-mb-px flex gap-1">
          {tabs.map(({ to, label, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'block border-b-2 px-4 py-2.5 text-body transition-colors',
                    isActive ? 'border-primary font-semibold text-fg' : 'border-transparent text-fg-muted hover:text-fg',
                  )
                }
              >
                {t(label)}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <Outlet />
    </>
  );
}
