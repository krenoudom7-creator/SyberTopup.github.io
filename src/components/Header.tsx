import React from 'react';
import { LogOut, User as UserIcon } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.tsx';
import { Language } from '../types.ts';
import { t } from '../i18n/translations.ts';

export type ActiveRoute = 'home' | 'catalog' | 'topup' | 'checkout' | 'orders' | 'admin';

interface HeaderProps {
  activeRoute: ActiveRoute;
  onNavigate: (route: ActiveRoute, sectionId?: string) => void;
  lang: Language;
}

export const Header: React.FC<HeaderProps> = ({
  activeRoute,
  onNavigate,
  lang,
}) => {
  const { user, signInWithGoogle, signOut, loading } = useAuth();
  const copy = t(lang);

  const linkClass = (isActive: boolean) =>
    `text-sm font-medium transition-colors duration-150 whitespace-nowrap shrink-0 pb-0.5 border-b ${
      isActive
        ? 'text-cyan-300 border-cyan-400'
        : 'text-slate-300 border-transparent hover:text-white hover:border-slate-500'
    }`;

  return (
    <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-[#060913]/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Single-line Brand Wordmark */}
        <button
          type="button"
          onClick={() => onNavigate('home')}
          className="font-display text-lg sm:text-xl font-bold tracking-tight text-white hover:text-cyan-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          NEXUS TOPUP
        </button>

        {/* Zone 2: Concise Single-Line Navigation Links */}
        <nav
          aria-label="Primary Navigation"
          className="hidden md:flex items-center gap-7"
        >
          <button
            type="button"
            onClick={() => onNavigate('home')}
            className={`${linkClass(activeRoute === 'home')} cursor-pointer`}
          >
            {copy.navHome}
          </button>
          <button
            type="button"
            onClick={() => onNavigate('catalog', 'all-games')}
            className={`${linkClass(activeRoute === 'catalog' || activeRoute === 'topup')} cursor-pointer`}
          >
            {copy.navGames}
          </button>
          <button
            type="button"
            onClick={() => onNavigate('orders')}
            className={`${linkClass(activeRoute === 'orders' || activeRoute === 'checkout')} cursor-pointer`}
          >
            {copy.navOrders}
          </button>
          {user?.role === 'admin' && (
            <button
              type="button"
              onClick={() => onNavigate('admin')}
              className={`${linkClass(activeRoute === 'admin')} cursor-pointer`}
            >
              {copy.navAdmin}
            </button>
          )}
        </nav>

        {/* Zone 3: Single Primary Action */}
        <div className="flex items-center gap-3 shrink-0">
          {loading ? (
            <div className="h-9 w-24 rounded-lg bg-slate-800/80 animate-pulse" />
          ) : user ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onNavigate(user.role === 'admin' ? 'admin' : 'orders')}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-700/80 bg-slate-900/80 text-xs font-medium text-slate-200 hover:border-cyan-500/60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <UserIcon className="w-3.5 h-3.5 text-cyan-400" />
                <span className="max-w-[110px] truncate">
                  {user.displayName || user.email}
                </span>
              </button>
              <button
                type="button"
                onClick={() => signOut()}
                aria-label={copy.signOut}
                title={copy.signOut}
                className="p-2 rounded-lg border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => signInWithGoogle()}
              className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-[#060913] text-xs font-semibold transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {copy.signIn}
            </button>
          )}
        </div>
      </div>

      {/* Mobile Navigation Row */}
      <div className="flex md:hidden items-center justify-around border-t border-slate-800/60 px-2 py-2 bg-[#070b17]">
        <button
          type="button"
          onClick={() => onNavigate('home')}
          className={`px-3 py-1 text-xs font-medium whitespace-nowrap shrink-0 ${
            activeRoute === 'home' ? 'text-cyan-300' : 'text-slate-400'
          }`}
        >
          {copy.navHome}
        </button>
        <button
          type="button"
          onClick={() => onNavigate('catalog', 'all-games')}
          className={`px-3 py-1 text-xs font-medium whitespace-nowrap shrink-0 ${
            activeRoute === 'catalog' || activeRoute === 'topup'
              ? 'text-cyan-300'
              : 'text-slate-400'
          }`}
        >
          {copy.navGames}
        </button>
        <button
          type="button"
          onClick={() => onNavigate('orders')}
          className={`px-3 py-1 text-xs font-medium whitespace-nowrap shrink-0 ${
            activeRoute === 'orders' ? 'text-cyan-300' : 'text-slate-400'
          }`}
        >
          {copy.navOrders}
        </button>
        {user?.role === 'admin' && (
          <button
            type="button"
            onClick={() => onNavigate('admin')}
            className={`px-3 py-1 text-xs font-medium whitespace-nowrap shrink-0 ${
              activeRoute === 'admin' ? 'text-cyan-300' : 'text-slate-400'
            }`}
          >
            {copy.navAdmin}
          </button>
        )}
      </div>
    </header>
  );
};
