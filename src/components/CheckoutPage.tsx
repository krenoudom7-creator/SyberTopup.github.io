import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  CreditCard,
  QrCode,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.tsx';
import {
  Language,
  Order,
  PaymentInfo,
  StorefrontConfig,
} from '../types.ts';
import { t } from '../i18n/translations.ts';
import { CheckoutDraft } from './TopUpPage.tsx';

interface CheckoutPageProps {
  draft: CheckoutDraft;
  config: StorefrontConfig;
  lang: Language;
  onBack: () => void;
  onOrderComplete: (order: Order) => void;
}

export const CheckoutPage: React.FC<CheckoutPageProps> = ({
  draft,
  config,
  lang,
  onBack,
  onOrderComplete,
}) => {
  const copy = t(lang);
  const { getIdToken, user } = useAuth();
  const [paymentMethod, setPaymentMethod] = useState<'bakong_khqr' | 'aba_payway'>(
    'bakong_khqr'
  );
  const [customerEmail, setCustomerEmail] = useState(user?.email || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdOrder, setCreatedOrder] = useState<Order | null>(null);
  const [paymentSession, setPaymentSession] = useState<PaymentInfo | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyMessage, setVerifyMessage] = useState<string | null>(null);

  const baseUsd = Number(draft.product.priceUsd);
  const discPct = Number(draft.product.discountPercent || 0);
  const subtotalUsd = Number((baseUsd * (1 - discPct / 100)).toFixed(2));
  const totalUsd = Math.max(
    0.01,
    Number((subtotalUsd - draft.promoDiscountUsd).toFixed(2))
  );
  const totalKhr = Math.round(totalUsd * config.exchangeRateKhr);

  const handleCreateOrder = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const token = await getIdToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/orders', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          gameId: draft.game.id,
          productId: draft.product.id,
          playerId: draft.playerId,
          serverId: draft.serverId || null,
          customerEmail: customerEmail.trim(),
          promoCode: draft.promoCode || null,
          paymentMethod,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Unable to create order.');
        return;
      }

      setCreatedOrder(data.order);
      setPaymentSession(data.payment);
      setVerifyMessage(data.payment?.providerMessage || null);
    } catch {
      setError('Network error creating payment session.');
    } finally {
      setSubmitting(false);
    }
  };

  const checkVerification = async (orderCode: string) => {
    setVerifying(true);
    try {
      const res = await fetch(
        `/api/payments/${encodeURIComponent(orderCode)}/verify`
      );
      const data = await res.json();
      if (data.order) setCreatedOrder(data.order);
      if (data.payment) setPaymentSession((prev) => ({ ...prev, ...data.payment }));
      if (data.message) setVerifyMessage(data.message);
    } catch {
      setVerifyMessage('Unable to reach payment verification endpoint.');
    } finally {
      setVerifying(false);
    }
  };

  // Automatic backend polling for Bakong KHQR when credentials are configured
  useEffect(() => {
    if (
      !createdOrder ||
      createdOrder.paymentStatus === 'paid' ||
      paymentSession?.status === 'unconfigured' ||
      createdOrder.paymentMethod !== 'bakong_khqr'
    ) {
      return;
    }

    const timer = setInterval(() => {
      checkVerification(createdOrder.orderCode);
    }, 3500);
    return () => clearInterval(timer);
  }, [createdOrder?.orderCode, createdOrder?.paymentStatus, paymentSession?.status]);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {!createdOrder && (
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm text-slate-300 hover:text-cyan-300 transition-colors mb-6 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>
      )}

      <h1 className="font-display text-2xl sm:text-3xl font-bold text-white mb-6">
        {copy.checkoutTitle}
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        {/* Order Summary */}
        <div className="md:col-span-5 rounded-xl border border-slate-800/90 bg-[#0b1120] p-6 space-y-4">
          <h2 className="font-display text-base font-semibold text-white">
            Order Details
          </h2>
          <dl className="space-y-2.5 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-slate-400">Game</dt>
              <dd className="text-white font-medium text-right">
                {lang === 'km' ? draft.game.nameKm : draft.game.name}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-400">Package</dt>
              <dd className="text-white font-medium text-right">
                {lang === 'km' ? draft.product.nameKm : draft.product.name}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-400">{draft.game.playerIdLabel}</dt>
              <dd className="font-mono text-cyan-300">{draft.playerId}</dd>
            </div>
            {draft.serverId && (
              <div className="flex justify-between gap-2">
                <dt className="text-slate-400">
                  {draft.game.serverIdLabel || 'Server ID'}
                </dt>
                <dd className="font-mono text-cyan-300">{draft.serverId}</dd>
              </div>
            )}
            {draft.playerName && (
              <div className="flex justify-between gap-2">
                <dt className="text-slate-400">{copy.playerNameLabel}</dt>
                <dd className="font-mono text-emerald-300 font-semibold text-right">
                  {draft.playerName}
                </dd>
              </div>
            )}
            {draft.promoCode && (
              <div className="flex justify-between gap-2 text-emerald-400">
                <dt>Promo ({draft.promoCode})</dt>
                <dd className="font-mono tabular-nums">
                  -${draft.promoDiscountUsd.toFixed(2)}
                </dd>
              </div>
            )}
            <div className="pt-3 border-t border-slate-800 flex justify-between items-baseline">
              <dt className="font-semibold text-white">{copy.totalPayable}</dt>
              <dd className="text-right">
                <div className="font-mono text-xl font-bold text-cyan-300 tabular-nums">
                  ${totalUsd.toFixed(2)}
                </div>
                <div className="font-mono text-xs text-slate-400 tabular-nums">
                  {totalKhr.toLocaleString()} KHR
                </div>
              </dd>
            </div>
          </dl>
        </div>

        {/* Payment Method & Live Verification */}
        <div className="md:col-span-7 rounded-xl border border-slate-800/90 bg-[#0b1120] p-6 space-y-5">
          {!createdOrder ? (
            <>
              <h2 className="font-display text-base font-semibold text-white">
                {copy.selectPaymentMethod}
              </h2>

              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('bakong_khqr')}
                  className={`w-full text-left p-4 rounded-xl border transition-colors flex items-start gap-3.5 cursor-pointer ${
                    paymentMethod === 'bakong_khqr'
                      ? 'border-cyan-400 bg-cyan-500/10'
                      : 'border-slate-800 bg-[#070b16] hover:border-slate-700'
                  }`}
                >
                  <QrCode className="w-5 h-5 text-cyan-300 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-semibold text-white">
                      {copy.bakongTitle}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {copy.bakongDesc}
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod('aba_payway')}
                  className={`w-full text-left p-4 rounded-xl border transition-colors flex items-start gap-3.5 cursor-pointer ${
                    paymentMethod === 'aba_payway'
                      ? 'border-cyan-400 bg-cyan-500/10'
                      : 'border-slate-800 bg-[#070b16] hover:border-slate-700'
                  }`}
                >
                  <CreditCard className="w-5 h-5 text-violet-300 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-semibold text-white">
                      {copy.abaTitle}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {copy.abaDesc}
                    </p>
                  </div>
                </button>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Receipt Email (Optional)
                </label>
                <input
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="player@example.com"
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[#060913] border border-slate-800 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              {error && (
                <p className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3.5 py-2.5">
                  {error}
                </p>
              )}

              <button
                type="button"
                disabled={submitting}
                onClick={handleCreateOrder}
                className="w-full py-3 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-[#060913] text-sm font-bold transition-colors cursor-pointer"
              >
                {submitting ? 'Creating Order...' : copy.confirmOrder}
              </button>
            </>
          ) : (
            <div className="space-y-5">
              <div className="flex items-center justify-between gap-4 pb-3 border-b border-slate-800">
                <div>
                  <span className="text-xs text-slate-400 block">Order ID</span>
                  <span className="font-mono text-base font-bold text-white">
                    {createdOrder.orderCode}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-400 block">
                    Transaction Ref
                  </span>
                  <span className="font-mono text-xs text-slate-300">
                    {paymentSession?.transactionRef}
                  </span>
                </div>
              </div>

              {createdOrder.paymentStatus === 'paid' ? (
                <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-5 space-y-3">
                  <div className="flex items-center gap-2.5 text-emerald-300 font-semibold">
                    <CheckCircle2 className="w-5 h-5" />
                    <span>{copy.paymentVerifiedTitle}</span>
                  </div>
                  <p className="text-xs text-slate-200 leading-relaxed">
                    Fulfillment Status:{' '}
                    <strong className="uppercase">
                      {createdOrder.fulfillmentStatus}
                    </strong>{' '}
                    ({createdOrder.fulfillmentMode})
                  </p>
                  <button
                    type="button"
                    onClick={() => onOrderComplete(createdOrder)}
                    className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-[#060913] text-xs font-bold cursor-pointer"
                  >
                    View Order Receipt
                  </button>
                </div>
              ) : paymentSession?.status === 'unconfigured' ? (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-5 space-y-3">
                  <div className="flex items-center gap-2 text-amber-300 font-semibold text-sm">
                    <AlertTriangle className="w-5 h-5 shrink-0" />
                    <span>{copy.paymentUnconfiguredTitle}</span>
                  </div>
                  <p className="text-xs text-slate-200 leading-relaxed">
                    {verifyMessage ||
                      paymentSession.providerMessage ||
                      'Live gateway credentials are not yet configured in Admin Settings.'}
                  </p>
                  <p className="text-xs text-slate-400">
                    Order <span className="font-mono text-white">{createdOrder.orderCode}</span> is saved as{' '}
                    <span className="font-mono text-amber-300">PENDING</span>. No fake payment confirmation is permitted. An administrator can configure gateway keys or verify bank settlement from the Admin Dashboard.
                  </p>
                  <button
                    type="button"
                    onClick={() => onOrderComplete(createdOrder)}
                    className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white cursor-pointer"
                  >
                    Track in Order History
                  </button>
                </div>
              ) : createdOrder.paymentMethod === 'bakong_khqr' ? (
                <div className="space-y-4 text-center">
                  <div className="flex items-center justify-center gap-2 text-sm font-medium text-cyan-300">
                    <Clock className="w-4 h-4" />
                    <span>{copy.awaitingPayment}</span>
                  </div>
                  {paymentSession?.qrDataUrl && (
                    <div className="inline-block p-3 rounded-xl bg-white border border-slate-700">
                      <img
                        src={paymentSession.qrDataUrl}
                        alt="Bakong KHQR Payment Code"
                        className="w-56 h-56 mx-auto"
                      />
                    </div>
                  )}
                  <p className="font-mono text-lg font-bold text-white tabular-nums">
                    ${Number(createdOrder.totalUsd).toFixed(2)} USD
                  </p>
                  {verifyMessage && (
                    <p className="text-xs text-slate-400">{verifyMessage}</p>
                  )}
                  <div className="flex items-center justify-center gap-3 pt-2">
                    <button
                      type="button"
                      disabled={verifying}
                      onClick={() => checkVerification(createdOrder.orderCode)}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-[#060913] text-xs font-bold transition-colors cursor-pointer"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${verifying ? 'animate-spin' : ''}`}
                      />
                      <span>{copy.checkStatusNow}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onOrderComplete(createdOrder)}
                      className="px-4 py-2 rounded-lg border border-slate-700 text-xs font-medium text-slate-300 hover:text-white cursor-pointer"
                    >
                      {copy.navOrders}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {verifyMessage ||
                      'Your signed ABA PayWay Purchase request is ready. Submit below to complete payment on ABA PayWay.'}
                  </p>
                  {paymentSession?.abaCheckoutUrl &&
                    paymentSession?.abaFormFields && (
                      <form
                        method="POST"
                        action={paymentSession.abaCheckoutUrl}
                        className="space-y-3"
                      >
                        {Object.entries(paymentSession.abaFormFields).map(
                          ([key, val]) => (
                            <input key={key} type="hidden" name={key} value={val} />
                          )
                        )}
                        <button
                          type="submit"
                          className="w-full py-3 rounded-lg bg-violet-500 hover:bg-violet-400 text-white text-sm font-bold transition-colors cursor-pointer"
                        >
                          {copy.proceedAbaPayway}
                        </button>
                      </form>
                    )}
                  <button
                    type="button"
                    onClick={() => checkVerification(createdOrder.orderCode)}
                    className="w-full py-2.5 rounded-lg border border-slate-700 text-xs font-medium text-slate-300 hover:text-white cursor-pointer"
                  >
                    {copy.checkStatusNow}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
