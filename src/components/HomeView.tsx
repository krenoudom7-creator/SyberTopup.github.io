import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Globe,
  Mail,
  MessageCircle,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  CurrencyMode,
  Game,
  Language,
  Promotion,
  StorefrontConfig,
} from '../types.ts';
import { t } from '../i18n/translations.ts';
import { GameArtwork } from './GameArtwork.tsx';

interface HomeViewProps {
  games: Game[];
  offers: Promotion[];
  updates: Promotion[];
  config: StorefrontConfig;
  loading: boolean;
  lang: Language;
  currency: CurrencyMode;
  onChangeLang: (lang: Language) => void;
  onChangeCurrency: (currency: CurrencyMode) => void;
  onSelectGame: (game: Game) => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  games,
  offers,
  updates,
  config,
  loading,
  lang,
  currency,
  onChangeLang,
  onChangeCurrency,
  onSelectGame,
}) => {
  const copy = t(lang);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const categories = useMemo(() => {
    const unique = Array.from(new Set(games.map((g) => g.category)));
    return ['all', ...unique];
  }, [games]);

  const popularGames = useMemo(
    () => games.filter((g) => g.isPopular),
    [games]
  );

  const filteredGames = useMemo(() => {
    const q = search.trim().toLowerCase();
    return games.filter((g) => {
      const catMatch = category === 'all' || g.category === category;
      if (!catMatch) return false;
      if (!q) return true;
      return (
        g.name.toLowerCase().includes(q) ||
        g.nameKm.toLowerCase().includes(q) ||
        g.currencyName.toLowerCase().includes(q) ||
        g.category.toLowerCase().includes(q)
      );
    });
  }, [games, search, category]);

  const formatStartingPrice = (usd: number | undefined) => {
    const val = usd ?? 0;
    if (currency === 'KHR') {
      return `${Math.round(val * config.exchangeRateKhr).toLocaleString()} ៛`;
    }
    return `$${val.toFixed(2)}`;
  };

  const featuredOffer = offers[0];

  return (
    <div className="min-h-screen flex flex-col">
      {/* Slim Dismissible Top Promotion Bar */}
      {featuredOffer && !bannerDismissed && (
        <div className="bg-[#0d1428] border-b border-violet-500/30 px-4 py-2 text-xs text-slate-200">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            <p className="truncate font-medium">
              <span className="text-cyan-300 font-semibold mr-2">
                {lang === 'km' ? featuredOffer.titleKm : featuredOffer.title}
              </span>
              <span className="text-slate-400">
                {lang === 'km'
                  ? featuredOffer.subtitleKm
                  : featuredOffer.subtitle}
              </span>
            </p>
            <button
              type="button"
              onClick={() => setBannerDismissed(true)}
              aria-label="Dismiss promotion"
              className="text-slate-400 hover:text-white shrink-0 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Hero Section */}
      <section className="relative border-b border-slate-800/70 bg-[#070b16]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 lg:py-14">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-center space-y-6">
              <div className="space-y-4">
                <p className="text-xs font-medium text-cyan-300 tracking-wide">
                  NEXUS TOPUP · Bakong KHQR &amp; ABA PayWay
                </p>
                <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white leading-[1.12] max-w-xl">
                  {copy.heroTitle}
                </h1>
                <p className="text-base text-slate-300 leading-relaxed max-w-xl">
                  {copy.heroSubtitle}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <a
                  href="#all-games"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-[#060913] text-sm font-semibold transition-colors duration-150 whitespace-nowrap shrink-0"
                >
                  <span>{copy.heroCta}</span>
                  <ArrowRight className="w-4 h-4" />
                </a>
                <div className="flex items-center gap-2 text-xs text-slate-400 px-3 py-2">
                  <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span>1 USD = {config.exchangeRateKhr.toLocaleString()} KHR</span>
                </div>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="relative aspect-video lg:h-full rounded-xl overflow-hidden border border-slate-800/90 bg-slate-900">
                <GameArtwork
                  src="/src/assets/images/hero_nexus_arena_1794894934848.jpg"
                  alt="NEXUS TOPUP Gaming Arena"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#060913]/80 via-[#060913]/20 to-transparent" />
              </div>
            </div>
          </div>

          {/* Storefront Search & Display Controls Toolbar */}
          <div className="mt-8 pt-6 border-t border-slate-800/70 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-xl">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={copy.searchPlaceholder}
                className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-[#0d1424] border border-slate-800 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
              />
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              {/* Currency Switcher */}
              <div className="inline-flex items-center p-1 rounded-lg bg-[#0d1424] border border-slate-800">
                <button
                  type="button"
                  onClick={() => onChangeCurrency('USD')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    currency === 'USD'
                      ? 'bg-cyan-500 text-[#060913]'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  USD ($)
                </button>
                <button
                  type="button"
                  onClick={() => onChangeCurrency('KHR')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    currency === 'KHR'
                      ? 'bg-cyan-500 text-[#060913]'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  KHR (៛)
                </button>
              </div>

              {/* Language Switcher */}
              <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-[#0d1424] border border-slate-800">
                <Globe className="w-3.5 h-3.5 text-slate-400 ml-2 mr-1" />
                <button
                  type="button"
                  onClick={() => onChangeLang('en')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    lang === 'en'
                      ? 'bg-violet-500 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  English
                </button>
                <button
                  type="button"
                  onClick={() => onChangeLang('km')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    lang === 'km'
                      ? 'bg-violet-500 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  ភាសាខ្មែរ
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Popular Games Section */}
      {!search && category === 'all' && popularGames.length > 0 && (
        <section className="max-w-7xl w-full mx-auto px-4 sm:px-6 pt-12 pb-6">
          <div className="flex items-baseline justify-between mb-6">
            <h2 className="font-display text-2xl font-semibold text-white">
              {copy.popularGames}
            </h2>
            <span className="text-xs text-slate-400 tabular-nums">
              {popularGames.length} featured titles
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {popularGames.slice(0, 4).map((game) => (
              <button
                key={`pop-${game.id}`}
                type="button"
                onClick={() => onSelectGame(game)}
                className="group text-left rounded-xl border border-slate-800/90 bg-[#0c1222] hover:border-cyan-400/60 hover:-translate-y-0.5 transition-all duration-150 overflow-hidden flex flex-col cursor-pointer"
              >
                <div className="aspect-[4/3] w-full overflow-hidden bg-slate-900">
                  <GameArtwork
                    src={game.imageUrl}
                    alt={lang === 'km' ? game.nameKm : game.name}
                    className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                  />
                </div>
                <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                      <span>{game.category}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {lang === 'km' ? game.currencyNameKm : game.currencyName}
                      </span>
                    </div>
                    <h3 className="mt-1 text-base font-semibold text-white line-clamp-1">
                      {lang === 'km' ? game.nameKm : game.name}
                    </h3>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-800/70">
                    <span className="text-sm font-mono font-semibold text-cyan-300 tabular-nums">
                      {copy.startingFrom} {formatStartingPrice(game.startingPriceUsd)}
                    </span>
                    <span className="text-xs font-medium text-violet-300 group-hover:text-cyan-300 transition-colors whitespace-nowrap">
                      {copy.topUpNow} →
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* All Games Catalog Section */}
      <section
        id="all-games"
        className="max-w-7xl w-full mx-auto px-4 sm:px-6 py-12"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <h2 className="font-display text-2xl font-semibold text-white">
            {copy.allGames}
          </h2>

          {/* Category Filter Tabs */}
          <div className="flex items-center gap-1.5 p-1 rounded-lg bg-[#0c1222] border border-slate-800 overflow-x-auto">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  category === cat
                    ? 'bg-cyan-500 text-[#060913]'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {cat === 'all' ? copy.allCategories : cat}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {Array.from({ length: 8 }).map((_, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-slate-800 bg-[#0c1222] overflow-hidden animate-pulse"
              >
                <div className="aspect-[4/3] bg-slate-800/70" />
                <div className="p-4 space-y-2.5">
                  <div className="h-3 w-24 bg-slate-800 rounded" />
                  <div className="h-5 w-40 bg-slate-800 rounded" />
                  <div className="h-4 w-28 bg-slate-800 rounded mt-3" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredGames.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-[#0c1222] p-12 text-center space-y-4">
            <p className="text-slate-300 font-medium">{copy.noGamesFound}</p>
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setCategory('all');
              }}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm text-white font-medium transition-colors cursor-pointer"
            >
              {copy.resetFilters}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {filteredGames.map((game) => (
              <div
                key={game.id}
                className="group rounded-xl border border-slate-800/90 bg-[#0c1222] hover:border-violet-400/60 hover:-translate-y-0.5 transition-all duration-150 overflow-hidden flex flex-col"
              >
                <button
                  type="button"
                  onClick={() => onSelectGame(game)}
                  className="aspect-[4/3] w-full overflow-hidden bg-slate-900 text-left cursor-pointer"
                >
                  <GameArtwork
                    src={game.imageUrl}
                    alt={lang === 'km' ? game.nameKm : game.name}
                    className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                  />
                </button>
                <div className="p-4 flex-1 flex flex-col justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                      <span>{game.publisher || game.category}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {lang === 'km' ? game.currencyNameKm : game.currencyName}
                      </span>
                    </div>
                    <h3 className="mt-1 text-base font-semibold text-white line-clamp-1">
                      {lang === 'km' ? game.nameKm : game.name}
                    </h3>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-800/70">
                    <div>
                      <span className="block text-[11px] text-slate-400">
                        {copy.startingFrom}
                      </span>
                      <span className="font-mono text-sm font-semibold text-white tabular-nums">
                        {formatStartingPrice(game.startingPriceUsd)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onSelectGame(game)}
                      className="px-3.5 py-2 rounded-lg bg-cyan-500/15 hover:bg-cyan-500 text-cyan-300 hover:text-[#060913] border border-cyan-500/40 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {copy.topUpNow}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Special Offers & Latest Updates */}
      {(offers.length > 0 || updates.length > 0) && (
        <section className="max-w-7xl w-full mx-auto px-4 sm:px-6 pb-16 pt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Special Offers */}
            <div className="rounded-xl border border-slate-800/90 bg-[#0b1120] p-6 space-y-5">
              <h2 className="font-display text-xl font-semibold text-white">
                {copy.specialOffers}
              </h2>
              <div className="divide-y divide-slate-800/80">
                {offers.map((offer) => (
                  <div key={offer.id} className="py-4 first:pt-0 last:pb-0 space-y-1.5">
                    <div className="flex items-center justify-between gap-4">
                      <h3 className="text-sm font-semibold text-white">
                        {lang === 'km' ? offer.titleKm : offer.title}
                      </h3>
                      {offer.code && (
                        <code className="font-mono text-xs font-semibold text-cyan-300 bg-cyan-500/10 border border-cyan-500/30 px-2 py-0.5 rounded">
                          {offer.code}
                        </code>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      {lang === 'km' ? offer.subtitleKm : offer.subtitle}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Latest Updates */}
            <div className="rounded-xl border border-slate-800/90 bg-[#0b1120] p-6 space-y-5">
              <h2 className="font-display text-xl font-semibold text-white">
                {copy.latestUpdates}
              </h2>
              <div className="divide-y divide-slate-800/80">
                {updates.map((upd) => (
                  <div key={upd.id} className="py-4 first:pt-0 last:pb-0 space-y-1.5">
                    <div className="flex items-center justify-between gap-4">
                      <h3 className="text-sm font-semibold text-white">
                        {lang === 'km' ? upd.titleKm : upd.title}
                      </h3>
                      <span className="text-xs font-mono text-slate-500 tabular-nums shrink-0">
                        {new Date(upd.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      {lang === 'km' ? upd.subtitleKm : upd.subtitle}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-800/80 bg-[#050811]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 grid grid-cols-1 md:grid-cols-3 gap-8 text-sm">
          <div className="space-y-2">
            <span className="font-display text-lg font-bold text-white">
              NEXUS TOPUP
            </span>
            <p className="text-xs text-slate-400 leading-relaxed max-w-xs">
              {copy.footerTagline}
            </p>
          </div>

          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-slate-300">
              {copy.contactSupport}
            </h4>
            <div className="space-y-1.5 text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-3.5 h-3.5 text-cyan-400" />
                <span>Telegram: {config.supportTelegram}</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-cyan-400" />
                <span>{config.supportEmail}</span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-slate-300">
              {copy.paymentRails}
            </h4>
            <p className="text-xs text-slate-400">
              Bakong KHQR (NBC EMVCo) · ABA PayWay (HMAC-SHA512)
            </p>
            <p className="text-xs text-slate-500 pt-2">
              © {new Date().getFullYear()} NEXUS TOPUP. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};
