import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Loader2,
  Search,
  Tag,
} from 'lucide-react';
import {
  CurrencyMode,
  Game,
  Language,
  Product,
  StorefrontConfig,
} from '../types.ts';
import { t } from '../i18n/translations.ts';
import { GameArtwork } from './GameArtwork.tsx';

export interface CheckoutDraft {
  game: Game;
  product: Product;
  playerId: string;
  serverId: string;
  playerName?: string;
  promoCode: string;
  promoDiscountUsd: number;
}

interface TopUpPageProps {
  game: Game;
  config: StorefrontConfig;
  lang: Language;
  currency: CurrencyMode;
  onBack: () => void;
  onContinueCheckout: (draft: CheckoutDraft) => void;
}

export const TopUpPage: React.FC<TopUpPageProps> = ({
  game,
  config,
  lang,
  currency,
  onBack,
  onContinueCheckout,
}) => {
  const copy = t(lang);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [playerId, setPlayerId] = useState('');
  const [serverId, setServerId] = useState('');
  const [verifyingPlayer, setVerifyingPlayer] = useState(false);
  const [verifiedPlayerName, setVerifiedPlayerName] = useState<string | null>(null);
  const [playerCheckNotice, setPlayerCheckNotice] = useState<{
    type: 'error' | 'unconfigured';
    text: string;
  } | null>(null);
  const [promoInput, setPromoInput] = useState('');
  const [appliedPromoCode, setAppliedPromoCode] = useState('');
  const [promoDiscountUsd, setPromoDiscountUsd] = useState(0);
  const [promoMessage, setPromoMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [validatingPromo, setValidatingPromo] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/games/${encodeURIComponent(game.slug)}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const list = (data.products || []) as Product[];
        setProducts(list);
        if (list.length > 0) {
          setSelectedProduct(list.find((p) => p.isPopular) || list[0]);
        }
      })
      .catch(() => {
        if (!cancelled) setProducts([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [game.slug]);

  const computeEffectiveUsd = (p: Product) => {
    const base = Number(p.priceUsd);
    const disc = Number(p.discountPercent || 0);
    return Number((base * (1 - disc / 100)).toFixed(2));
  };

  const formatMoney = (usd: number) => {
    if (currency === 'KHR') {
      return `${Math.round(usd * config.exchangeRateKhr).toLocaleString()} ៛`;
    }
    return `$${usd.toFixed(2)}`;
  };

  const subtotalUsd = selectedProduct ? computeEffectiveUsd(selectedProduct) : 0;
  const finalTotalUsd = Math.max(
    0.01,
    Number((subtotalUsd - promoDiscountUsd).toFixed(2))
  );

  const handleApplyPromo = async () => {
    if (!promoInput.trim() || !selectedProduct) return;
    setValidatingPromo(true);
    setPromoMessage(null);
    try {
      const res = await fetch('/api/promotions/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: promoInput.trim(),
          subtotalUsd,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAppliedPromoCode('');
        setPromoDiscountUsd(0);
        setPromoMessage(data.error || 'Invalid promo code');
      } else {
        setAppliedPromoCode(data.promotion.code);
        setPromoDiscountUsd(Number(data.discountUsd || 0));
        setPromoMessage(`Applied ${data.promotion.code} (-$${Number(data.discountUsd).toFixed(2)})`);
      }
    } catch {
      setPromoMessage('Could not validate promo code.');
    } finally {
      setValidatingPromo(false);
    }
  };

  const handleVerifyPlayer = async () => {
    setFormError(null);
    setPlayerCheckNotice(null);
    setVerifiedPlayerName(null);

    if (!playerId.trim() || playerId.trim().length < 2) {
      setPlayerCheckNotice({
        type: 'error',
        text: `Please enter a valid ${game.playerIdLabel}.`,
      });
      return;
    }
    if (game.requiresServerId && !serverId.trim()) {
      setPlayerCheckNotice({
        type: 'error',
        text: `Please enter your ${game.serverIdLabel || 'Server ID'}.`,
      });
      return;
    }

    setVerifyingPlayer(true);
    try {
      const res = await fetch('/api/games/verify-player', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameSlug: game.slug,
          playerId: playerId.trim(),
          serverId: serverId.trim() || null,
        }),
      });
      const data = await res.json();
      if (data.verified && data.playerName) {
        setVerifiedPlayerName(data.playerName);
      } else if (data.configured === false) {
        setPlayerCheckNotice({
          type: 'unconfigured',
          text:
            data.message ||
            'Player lookup API is not configured yet in Admin Settings.',
        });
      } else {
        setPlayerCheckNotice({
          type: 'error',
          text: data.error || 'Could not find matching player account.',
        });
      }
    } catch {
      setPlayerCheckNotice({
        type: 'error',
        text: 'Unable to reach player lookup service.',
      });
    } finally {
      setVerifyingPlayer(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!playerId.trim() || playerId.trim().length < 2) {
      setFormError(`Please enter a valid ${game.playerIdLabel}.`);
      return;
    }
    if (game.requiresServerId && !serverId.trim()) {
      setFormError(`Please enter your ${game.serverIdLabel || 'Server ID'}.`);
      return;
    }
    if (!selectedProduct) {
      setFormError('Please select a top-up package.');
      return;
    }

    onContinueCheckout({
      game,
      product: selectedProduct,
      playerId: playerId.trim(),
      serverId: serverId.trim(),
      playerName: verifiedPlayerName || undefined,
      promoCode: appliedPromoCode,
      promoDiscountUsd,
    });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm text-slate-300 hover:text-cyan-300 transition-colors mb-6 cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>{copy.backToCatalog}</span>
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Sticky Game Overview */}
        <div className="lg:col-span-4 lg:sticky lg:top-24 rounded-xl border border-slate-800/90 bg-[#0b1120] overflow-hidden">
          <div className="aspect-[4/3] w-full bg-slate-900">
            <GameArtwork
              src={game.imageUrl}
              alt={lang === 'km' ? game.nameKm : game.name}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="p-6 space-y-3">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span>{game.publisher || game.category}</span>
              <span aria-hidden="true">·</span>
              <span>
                {lang === 'km' ? game.currencyNameKm : game.currencyName}
              </span>
            </div>
            <h1 className="font-display text-2xl font-bold text-white">
              {lang === 'km' ? game.nameKm : game.name}
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed">
              {lang === 'km' ? game.descriptionKm : game.description}
            </p>
          </div>
        </div>

        {/* Right Contiguous Purchase Module */}
        <form onSubmit={handleSubmit} className="lg:col-span-8 space-y-6">
          {/* Step 1: Account Details */}
          <div className="rounded-xl border border-slate-800/90 bg-[#0b1120] p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-lg font-semibold text-white">
                {copy.stepAccount}
              </h2>
              <button
                type="button"
                disabled={verifyingPlayer || !playerId.trim() || (game.requiresServerId && !serverId.trim())}
                onClick={handleVerifyPlayer}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500 text-cyan-300 hover:text-[#060913] border border-cyan-500/40 disabled:opacity-40 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {verifyingPlayer ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Search className="w-3.5 h-3.5" />
                )}
                <span>
                  {verifyingPlayer ? copy.checkingPlayer : copy.checkPlayerBtn}
                </span>
              </button>
            </div>

            <div
              className={`grid grid-cols-1 ${
                game.requiresServerId ? 'sm:grid-cols-2' : ''
              } gap-4`}
            >
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  {game.playerIdLabel} *
                </label>
                <input
                  type="text"
                  value={playerId}
                  onChange={(e) => {
                    setPlayerId(e.target.value);
                    setVerifiedPlayerName(null);
                    setPlayerCheckNotice(null);
                  }}
                  placeholder={game.playerIdPlaceholder}
                  required
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[#060913] border border-slate-800 text-sm font-mono text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>
              {game.requiresServerId && (
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    {game.serverIdLabel || 'Server ID'} *
                  </label>
                  <input
                    type="text"
                    value={serverId}
                    onChange={(e) => {
                      setServerId(e.target.value);
                      setVerifiedPlayerName(null);
                      setPlayerCheckNotice(null);
                    }}
                    placeholder={game.serverIdPlaceholder || 'e.g. 2045'}
                    required
                    className="w-full px-3.5 py-2.5 rounded-lg bg-[#060913] border border-slate-800 text-sm font-mono text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              )}
            </div>

            {/* Verification Result Strip */}
            {verifiedPlayerName ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2.5 text-xs">
                <div className="flex items-center gap-2 text-emerald-300 font-medium">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{copy.playerNameLabel}:</span>
                </div>
                <span className="font-mono font-bold text-white">
                  {verifiedPlayerName}
                </span>
              </div>
            ) : playerCheckNotice ? (
              <div
                className={`flex items-start gap-2 rounded-lg border px-3.5 py-2.5 text-xs ${
                  playerCheckNotice.type === 'unconfigured'
                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                    : 'border-rose-500/40 bg-rose-500/10 text-rose-300'
                }`}
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{playerCheckNotice.text}</span>
              </div>
            ) : (
              <p className="text-xs text-slate-400">{copy.playerVerifyHint}</p>
            )}
          </div>

          {/* Step 2: Select Package */}
          <div className="rounded-xl border border-slate-800/90 bg-[#0b1120] p-6 space-y-4">
            <h2 className="font-display text-lg font-semibold text-white">
              {copy.stepPackage}
            </h2>

            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-24 rounded-lg bg-slate-800/60 animate-pulse"
                  />
                ))}
              </div>
            ) : products.length === 0 ? (
              <p className="text-sm text-slate-400">
                No top-up denominations available for this game yet.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {products.map((pkg) => {
                  const baseUsd = Number(pkg.priceUsd);
                  const discPct = Number(pkg.discountPercent || 0);
                  const finalUsd = computeEffectiveUsd(pkg);
                  const isSelected = selectedProduct?.id === pkg.id;

                  return (
                    <button
                      key={pkg.id}
                      type="button"
                      onClick={() => {
                        setSelectedProduct(pkg);
                        setAppliedPromoCode('');
                        setPromoDiscountUsd(0);
                        setPromoMessage(null);
                      }}
                      className={`text-left p-4 rounded-xl border transition-all duration-150 flex items-center justify-between gap-4 cursor-pointer ${
                        isSelected
                          ? 'border-cyan-400 bg-cyan-500/10'
                          : 'border-slate-800 bg-[#070b16] hover:border-slate-600'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-white">
                            {lang === 'km' ? pkg.nameKm : pkg.name}
                          </span>
                          {isSelected && (
                            <Check className="w-4 h-4 text-cyan-300 shrink-0" />
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <span>
                            {pkg.fulfillmentType === 'automatic'
                              ? copy.instantAuto
                              : copy.manualVerify}
                          </span>
                          {pkg.bonusAmount > 0 && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-violet-300">
                                +{pkg.bonusAmount} {copy.bonusLabel}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="font-mono text-base font-bold text-cyan-300 tabular-nums">
                          {formatMoney(finalUsd)}
                        </div>
                        {discPct > 0 && (
                          <div className="font-mono text-xs text-slate-500 line-through tabular-nums">
                            {formatMoney(baseUsd)}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Step 3: Promo & Order Summary */}
          <div className="rounded-xl border border-slate-800/90 bg-[#0b1120] p-6 space-y-5">
            <h2 className="font-display text-lg font-semibold text-white">
              {copy.stepSummary}
            </h2>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <Tag className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={promoInput}
                  onChange={(e) => setPromoInput(e.target.value)}
                  placeholder={copy.promoPlaceholder}
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-[#060913] border border-slate-800 text-sm font-mono uppercase text-white placeholder-slate-500 focus:outline-none focus:border-violet-500"
                />
              </div>
              <button
                type="button"
                disabled={validatingPromo || !promoInput.trim()}
                onClick={handleApplyPromo}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {copy.apply}
              </button>
            </div>
            {promoMessage && (
              <p
                className={`text-xs ${
                  appliedPromoCode ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {promoMessage}
              </p>
            )}

            <div className="space-y-2 pt-3 border-t border-slate-800/80 text-sm">
              <div className="flex justify-between text-slate-300">
                <span>{copy.subtotal}</span>
                <span className="font-mono tabular-nums">
                  ${subtotalUsd.toFixed(2)}
                </span>
              </div>
              {promoDiscountUsd > 0 && (
                <div className="flex justify-between text-emerald-400">
                  <span>{copy.discount}</span>
                  <span className="font-mono tabular-nums">
                    -${promoDiscountUsd.toFixed(2)}
                  </span>
                </div>
              )}
              <div className="flex justify-between items-baseline pt-2 border-t border-slate-800/80">
                <span className="font-semibold text-white">
                  {copy.totalPayable}
                </span>
                <div className="text-right">
                  <div className="font-mono text-xl font-bold text-cyan-300 tabular-nums">
                    ${finalTotalUsd.toFixed(2)}
                  </div>
                  <div className="font-mono text-xs text-slate-400 tabular-nums">
                    ≈ {Math.round(finalTotalUsd * config.exchangeRateKhr).toLocaleString()} KHR
                  </div>
                </div>
              </div>
            </div>

            {formError && (
              <p className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3.5 py-2.5">
                {formError}
              </p>
            )}

            <button
              type="submit"
              disabled={!selectedProduct}
              className="w-full py-3 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-[#060913] text-sm font-bold transition-colors cursor-pointer"
            >
              {copy.continueCheckout}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
