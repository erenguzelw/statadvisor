import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { X } from 'lucide-react';
import { IconButton } from '@/components/ui';
import { useT } from '@/i18n';
import { Sidebar } from './Sidebar';
import { MobileControls, TopBar } from './TopBar';

export function AppShell() {
  const t = useT();
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement>(null);

  // Sayfa değişince odak ana içeriğe taşınır ve sayfa başa kaydırılır.
  useEffect(() => {
    setMenuOpen(false);
    window.scrollTo(0, 0);
    mainRef.current?.focus({ preventScroll: true });
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="sr-only z-50 rounded-control bg-primary-strong px-3 py-2 text-on-primary-strong focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        {t('İçeriğe geç')}
      </a>

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 lg:block">
        <Sidebar />
      </aside>

      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={t('Ana menü')}>
          <button
            type="button"
            aria-label={t('Menüyü kapat')}
            className="absolute inset-0 bg-black/60"
            onClick={() => setMenuOpen(false)}
          />
          <div className="relative h-full w-72 max-w-[85vw] shadow-3">
            <Sidebar onNavigate={() => setMenuOpen(false)} />
            <IconButton icon={X} label={t('Menüyü kapat')} onClick={() => setMenuOpen(false)} className="absolute top-3 right-3" autoFocus />
          </div>
        </div>
      )}

      <div className="lg:pl-72">
        <TopBar onOpenMenu={() => setMenuOpen(true)} />
        <MobileControls />
        <main id="main" ref={mainRef} tabIndex={-1} className="mx-auto max-w-[1440px] px-4 py-6 outline-none md:px-8 md:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
