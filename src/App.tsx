import React, { useCallback, useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext.tsx';
import { ActiveRoute, Header } from './components/Header.tsx';
import { HomeView } from './components/HomeView.tsx';
import { CheckoutDraft, TopUpPage } from './components/TopUpPage.tsx';
import { CheckoutPage } from './components/CheckoutPage.tsx';
import { OrdersPage } from './components/OrdersPage.tsx';
import { AdminDashboard } from './components/AdminDashboard.tsx';
import {
  CurrencyMode,
  Game,
  Language,
  Order,
  Promotion,
  StorefrontConfig,
} from './types.ts';

function NexusAppShell() {
  const { user, signInWithGoogle } = useAuth();
  const [route, setRoute] = useState<ActiveRoute>('home');
  const [lang, setLang] = useState<Language>('en');
  const [currency, setCurrency] = useState<CurrencyMode>('USD');

  const [games, setGames] = useState<Game[]>([]);
  const [offers, setOffers] = useState<Promotion[]>([]);
  const [updates, setUpdates] = useState<Promotion[]>([]);
  const [config, setConfig] = useState<StorefrontConfig>({
    exchangeRateKhr: 4050,
    supportTelegram: '@nexustopup_kh',
    supportEmail: 'support@nexustopup.kh',
    bakongConfigured: false,
    abaConfigured: false,
  });
  const [loadingStorefront, setLoadingStorefront] = useState(true);
  const [storefrontError, setStorefrontError] = useState<string | null>(null);

  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [checkoutDraft, setCheckoutDraft] = useState<CheckoutDraft | null>(null);
  const [initialOrderCode, setInitialOrderCode] = useState('');

  const loadStorefront = useCallback(async () => {
    setLoadingStorefront(true);
    setStorefrontError(null);
    try {
      const res = await fetch('/api/storefront');
      if (!res.ok) {
        throw new Error('Storefront API error');
      }
      const data = await res.json();
      setGames(data.games || []);
      setOffers(data.offers || []);
      setUpdates(data.updates || []);
      if (data.config) setConfig(data.config);
    } catch {
      setStorefrontError('Unable to load the NEXUS TOPUP catalog right now.');
    } finally {
      setLoadingStorefront(false);
    }
  }, []);

  useEffect(() => {
    loadStorefront();
    const params = new URLSearchParams(window.location.search);
    const viewParam = params.get('view');
    const orderParam = params.get('order');
    if (viewParam === 'orders') {
      setRoute('orders');
      if (orderParam) setInitialOrderCode(orderParam);
    }
  }, [loadStorefront]);

  const handleNavigate = (target: ActiveRoute, sectionId?: string) => {
    setRoute(target);
    if (target === 'catalog' || target === 'home') {
      setTimeout(() => {
        if (sectionId) {
          document
            .getElementById(sectionId)
            ?.scrollIntoView({ behavior: 'smooth' });
        } else {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }, 40);
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleSelectGame = (game: Game) => {
    setSelectedGame(game);
    setRoute('topup');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleContinueCheckout = (draft: CheckoutDraft) => {
    setCheckoutDraft(draft);
    setRoute('checkout');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOrderComplete = (order: Order) => {
    setInitialOrderCode(order.orderCode);
    setRoute('orders');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[#060913] text-slate-100">
      <Header activeRoute={route} onNavigate={handleNavigate} lang={lang} />

      {storefrontError && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-4">
          <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-200 flex items-center justify-between">
            <span>{storefrontError}</span>
            <button
              type="button"
              onClick={loadStorefront}
              className="underline font-semibold cursor-pointer"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      <main>
        {(route === 'home' || route === 'catalog') && (
          <HomeView
            games={games}
            offers={offers}
            updates={updates}
            config={config}
            loading={loadingStorefront}
            lang={lang}
            currency={currency}
            onChangeLang={setLang}
            onChangeCurrency={setCurrency}
            onSelectGame={handleSelectGame}
          />
        )}

        {route === 'topup' && selectedGame && (
          <TopUpPage
            game={selectedGame}
            config={config}
            lang={lang}
            currency={currency}
            onBack={() => setRoute('home')}
            onContinueCheckout={handleContinueCheckout}
          />
        )}

        {route === 'checkout' && checkoutDraft && (
          <CheckoutPage
            draft={checkoutDraft}
            config={config}
            lang={lang}
            onBack={() => setRoute('topup')}
            onOrderComplete={handleOrderComplete}
          />
        )}

        {route === 'orders' && (
          <OrdersPage lang={lang} initialOrderCode={initialOrderCode} />
        )}

        {route === 'admin' && (
          <>
            {user?.role === 'admin' ? (
              <AdminDashboard onStorefrontRefresh={loadStorefront} />
            ) : (
              <div className="max-w-lg mx-auto px-4 py-20 text-center space-y-4">
                <h1 className="font-display text-2xl font-bold text-white">
                  Administrator Access Required
                </h1>
                <p className="text-sm text-slate-400">
                  Please sign in with an authorized Administrator account to manage games, orders, payment gateways, and suppliers.
                </p>
                {!user && (
                  <button
                    type="button"
                    onClick={() => signInWithGoogle()}
                    className="px-5 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-[#060913] text-xs font-bold cursor-pointer"
                  >
                    Sign In
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <NexusAppShell />
    </AuthProvider>
  );
}
