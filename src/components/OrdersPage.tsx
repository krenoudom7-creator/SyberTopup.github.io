import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  RefreshCw,
  Search,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.tsx';
import { Language, Order } from '../types.ts';
import { t } from '../i18n/translations.ts';

interface OrdersPageProps {
  lang: Language;
  initialOrderCode?: string;
}

export const OrdersPage: React.FC<OrdersPageProps> = ({
  lang,
  initialOrderCode = '',
}) => {
  const copy = t(lang);
  const { user, getIdToken, signInWithGoogle } = useAuth();

  const [trackOrderCode, setTrackOrderCode] = useState(initialOrderCode);
  const [trackPlayerId, setTrackPlayerId] = useState('');
  const [trackedOrder, setTrackedOrder] = useState<Order | null>(null);
  const [trackError, setTrackError] = useState<string | null>(null);
  const [tracking, setTracking] = useState(false);

  const [myOrders, setMyOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  const fetchMyOrders = useCallback(async () => {
    if (!user) return;
    setLoadingOrders(true);
    try {
      const token = await getIdToken();
      const params = new URLSearchParams({
        page: String(page),
        limit: '10',
        search,
      });
      const res = await fetch(`/api/orders/mine?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMyOrders(data.orders || []);
        setTotal(data.total || 0);
      }
    } finally {
      setLoadingOrders(false);
    }
  }, [user, getIdToken, page, search]);

  useEffect(() => {
    fetchMyOrders();
  }, [fetchMyOrders]);

  const handleTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    setTrackError(null);
    setTrackedOrder(null);
    if (!trackOrderCode.trim()) return;
    setTracking(true);
    try {
      const token = await getIdToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const params = new URLSearchParams({
        orderCode: trackOrderCode.trim(),
        playerId: trackPlayerId.trim(),
      });
      const res = await fetch(`/api/orders/track?${params}`, { headers });
      const data = await res.json();
      if (!res.ok) {
        setTrackError(data.error || 'Order not found.');
      } else {
        setTrackedOrder({ ...data.order, payment: data.payment });
      }
    } catch {
      setTrackError('Unable to reach order lookup service.');
    } finally {
      setTracking(false);
    }
  };

  const renderStatus = (status: string) => {
    const lower = status.toLowerCase();
    if (lower === 'paid' || lower === 'completed' || lower === 'verified') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span className="capitalize">{lower}</span>
        </span>
      );
    }
    if (lower === 'failed' || lower === 'expired') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-400">
          <XCircle className="w-3.5 h-3.5" />
          <span className="capitalize">{lower}</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-300">
        <Clock className="w-3.5 h-3.5" />
        <span className="capitalize">{lower}</span>
      </span>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 space-y-10">
      <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">
        {copy.orderHistoryTitle}
      </h1>

      {/* Public / Quick Order Lookup */}
      <section className="rounded-xl border border-slate-800/90 bg-[#0b1120] p-6 space-y-4">
        <h2 className="font-display text-lg font-semibold text-white">
          {copy.trackOrderTitle}
        </h2>
        <form
          onSubmit={handleTrack}
          className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end"
        >
          <div className="md:col-span-5">
            <label className="block text-xs text-slate-400 mb-1.5">
              {copy.orderIdLabel}
            </label>
            <input
              type="text"
              value={trackOrderCode}
              onChange={(e) => setTrackOrderCode(e.target.value)}
              placeholder="e.g. NX-20261117-A1B2C3"
              required
              className="w-full px-3.5 py-2.5 rounded-lg bg-[#060913] border border-slate-800 text-sm font-mono text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>
          <div className="md:col-span-5">
            <label className="block text-xs text-slate-400 mb-1.5">
              {copy.playerIdLabel}
            </label>
            <input
              type="text"
              value={trackPlayerId}
              onChange={(e) => setTrackPlayerId(e.target.value)}
              placeholder="Player ID used during checkout"
              className="w-full px-3.5 py-2.5 rounded-lg bg-[#060913] border border-slate-800 text-sm font-mono text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>
          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={tracking}
              className="w-full py-2.5 px-4 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-[#060913] text-xs font-bold transition-colors whitespace-nowrap cursor-pointer"
            >
              {tracking ? 'Checking...' : copy.trackButton}
            </button>
          </div>
        </form>

        {trackError && <p className="text-xs text-rose-400">{trackError}</p>}

        {trackedOrder && (
          <div className="mt-4 pt-4 border-t border-slate-800 grid grid-cols-2 sm:grid-cols-5 gap-4 text-sm">
            <div>
              <span className="text-xs text-slate-400 block">Order ID</span>
              <span className="font-mono font-semibold text-white">
                {trackedOrder.orderCode}
              </span>
            </div>
            <div>
              <span className="text-xs text-slate-400 block">Game / Package</span>
              <span className="text-white font-medium block truncate">
                {trackedOrder.gameNameSnapshot}
              </span>
              <span className="text-xs text-slate-400">
                {trackedOrder.productNameSnapshot}
              </span>
            </div>
            <div>
              <span className="text-xs text-slate-400 block">Amount</span>
              <span className="font-mono text-cyan-300 tabular-nums">
                ${Number(trackedOrder.totalUsd).toFixed(2)}
              </span>
            </div>
            <div>
              <span className="text-xs text-slate-400 block">
                {copy.paymentStatus}
              </span>
              {renderStatus(trackedOrder.paymentStatus)}
            </div>
            <div>
              <span className="text-xs text-slate-400 block">
                {copy.fulfillmentStatus}
              </span>
              {renderStatus(trackedOrder.fulfillmentStatus)}
            </div>
          </div>
        )}
      </section>

      {/* Signed-in Customer Order History */}
      <section className="rounded-xl border border-slate-800/90 bg-[#0b1120] p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h2 className="font-display text-lg font-semibold text-white">
            {copy.myOrdersTitle}
          </h2>
          {user && (
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search Order ID or Game..."
                  className="pl-8 pr-3 py-1.5 rounded-lg bg-[#060913] border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>
              <button
                type="button"
                onClick={fetchMyOrders}
                aria-label="Refresh orders"
                className="p-2 rounded-lg border border-slate-800 text-slate-300 hover:text-white cursor-pointer"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${loadingOrders ? 'animate-spin' : ''}`}
                />
              </button>
            </div>
          )}
        </div>

        {!user ? (
          <div className="py-10 text-center space-y-3">
            <p className="text-sm text-slate-400">
              Sign in with Google to view all orders placed under your account.
            </p>
            <button
              type="button"
              onClick={() => signInWithGoogle()}
              className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-[#060913] text-xs font-bold cursor-pointer"
            >
              {copy.signIn}
            </button>
          </div>
        ) : loadingOrders ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 rounded bg-slate-800/50 animate-pulse" />
            ))}
          </div>
        ) : myOrders.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">
            {copy.emptyOrders}
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-xs text-slate-400">
                    <th className="py-2.5 pr-4 font-medium">Order ID</th>
                    <th className="py-2.5 pr-4 font-medium">Game</th>
                    <th className="py-2.5 pr-4 font-medium">Package</th>
                    <th className="py-2.5 pr-4 font-medium">Player ID</th>
                    <th className="py-2.5 pr-4 font-medium text-right">Amount</th>
                    <th className="py-2.5 pr-4 font-medium">Payment</th>
                    <th className="py-2.5 font-medium">Fulfillment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {myOrders.map((order) => (
                    <tr
                      key={order.id}
                      onClick={() => setSelectedOrder(order)}
                      className="hover:bg-slate-800/30 cursor-pointer transition-colors"
                    >
                      <td className="py-3 pr-4 font-mono text-xs font-semibold text-white">
                        {order.orderCode}
                      </td>
                      <td className="py-3 pr-4 text-slate-200">
                        {order.gameNameSnapshot}
                      </td>
                      <td className="py-3 pr-4 text-slate-300">
                        {order.productNameSnapshot}
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs text-slate-300">
                        {order.playerId}
                        {order.serverId ? ` (${order.serverId})` : ''}
                      </td>
                      <td className="py-3 pr-4 font-mono text-right text-cyan-300 tabular-nums">
                        ${Number(order.totalUsd).toFixed(2)}
                      </td>
                      <td className="py-3 pr-4">
                        {renderStatus(order.paymentStatus)}
                      </td>
                      <td className="py-3">
                        {renderStatus(order.fulfillmentStatus)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {total > 10 && (
              <div className="flex items-center justify-between pt-3 border-t border-slate-800 text-xs text-slate-400">
                <span className="tabular-nums">
                  Page {page} · {total} total orders
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                    className="px-3 py-1.5 rounded border border-slate-800 disabled:opacity-40 text-slate-200 cursor-pointer"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={page * 10 >= total}
                    onClick={() => setPage((p) => p + 1)}
                    className="px-3 py-1.5 rounded border border-slate-800 disabled:opacity-40 text-slate-200 cursor-pointer"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* Receipt Drawer / Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-xl border border-slate-700 bg-[#0b1120] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-white">
                Order Receipt
              </h3>
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="text-xs text-slate-400 hover:text-white cursor-pointer"
              >
                Close
              </button>
            </div>
            <dl className="space-y-2 text-xs">
              <div className="flex justify-between">
                <dt className="text-slate-400">Order Code</dt>
                <dd className="font-mono text-white">{selectedOrder.orderCode}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400">Game</dt>
                <dd className="text-white">{selectedOrder.gameNameSnapshot}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400">Product</dt>
                <dd className="text-white">{selectedOrder.productNameSnapshot}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400">Player ID</dt>
                <dd className="font-mono text-cyan-300">
                  {selectedOrder.playerId}
                  {selectedOrder.serverId ? ` / ${selectedOrder.serverId}` : ''}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400">Payment Method</dt>
                <dd className="uppercase text-slate-200">
                  {selectedOrder.paymentMethod.replace('_', ' ')}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400">Total Paid</dt>
                <dd className="font-mono text-cyan-300 tabular-nums">
                  ${Number(selectedOrder.totalUsd).toFixed(2)} (
                  {selectedOrder.totalKhr.toLocaleString()} KHR)
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400">Payment Status</dt>
                <dd>{renderStatus(selectedOrder.paymentStatus)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400">Top-Up Status</dt>
                <dd>{renderStatus(selectedOrder.fulfillmentStatus)}</dd>
              </div>
              {selectedOrder.notes && (
                <div className="pt-2 border-t border-slate-800">
                  <dt className="text-slate-400 mb-1">Notes</dt>
                  <dd className="text-slate-300">{selectedOrder.notes}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      )}
    </div>
  );
};
