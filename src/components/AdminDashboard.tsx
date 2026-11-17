import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  BarChart3,
  CheckCircle2,
  Database,
  Download,
  Gamepad2,
  Layers,
  Package,
  Plus,
  RefreshCw,
  Search,
  Server,
  Settings as SettingsIcon,
  Shield,
  Tag,
  Trash2,
  Users,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.tsx';
import { AppUser, Game, Order, Product, Promotion, Supplier } from '../types.ts';

type AdminTab =
  | 'overview'
  | 'games'
  | 'products'
  | 'orders'
  | 'suppliers'
  | 'promotions'
  | 'users'
  | 'settings';

interface OverviewData {
  kpis: {
    totalSalesUsd: number;
    totalOrders: number;
    totalCustomers: number;
    totalGames: number;
    pendingPayments: number;
    completedOrders: number;
    failedOrders: number;
  };
  revenueSeries: Array<{ day: string; revenue: number; ordersCount: number }>;
  recentOrders: Order[];
}

interface SettingRow {
  key: string;
  value: string;
  hasValue: boolean;
  isSecret: boolean;
  description: string;
}

interface AdminLogRow {
  id: number;
  adminEmail: string;
  action: string;
  entityType: string;
  entityId: string;
  createdAt: string;
}

export const AdminDashboard: React.FC<{
  onStorefrontRefresh: () => void;
}> = ({ onStorefrontRefresh }) => {
  const { getIdToken } = useAuth();
  const [tab, setTab] = useState<AdminTab>('overview');
  const [toast, setToast] = useState<string | null>(null);

  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderSearch, setOrderSearch] = useState('');
  const [orderPaymentFilter, setOrderPaymentFilter] = useState('all');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [settingsList, setSettingsList] = useState<SettingRow[]>([]);
  const [logs, setLogs] = useState<AdminLogRow[]>([]);

  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [manualTxId, setManualTxId] = useState('');
  const [manualNote, setManualNote] = useState('');

  // Game modal state
  const [editingGame, setEditingGame] = useState<Partial<Game> | null>(null);
  // Product modal state
  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);
  // Supplier modal state
  const [editingSupplier, setEditingSupplier] = useState<{
    id?: number;
    name: string;
    apiEndpoint: string;
    authType: 'bearer' | 'hmac' | 'api_key';
    apiKey: string;
    apiSecret: string;
    isActive: boolean;
  } | null>(null);
  // Promotion modal state
  const [editingPromo, setEditingPromo] = useState<Partial<Promotion> | null>(null);

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const apiFetch = useCallback(
    async (url: string, options: RequestInit = {}) => {
      const token = await getIdToken();
      return fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(options.headers || {}),
        },
      });
    },
    [getIdToken]
  );

  const loadTab = useCallback(
    async (targetTab: AdminTab) => {
      try {
        if (targetTab === 'overview') {
          const res = await apiFetch('/api/admin/overview');
          if (res.ok) setOverview(await res.json());
        } else if (targetTab === 'games') {
          const res = await apiFetch('/api/admin/games');
          if (res.ok) setGames((await res.json()).games || []);
        } else if (targetTab === 'products') {
          const [pRes, gRes, sRes] = await Promise.all([
            apiFetch('/api/admin/products'),
            apiFetch('/api/admin/games'),
            apiFetch('/api/admin/suppliers'),
          ]);
          if (pRes.ok) setProducts((await pRes.json()).products || []);
          if (gRes.ok) setGames((await gRes.json()).games || []);
          if (sRes.ok) setSuppliers((await sRes.json()).suppliers || []);
        } else if (targetTab === 'orders') {
          const params = new URLSearchParams({
            search: orderSearch,
            paymentStatus: orderPaymentFilter,
          });
          const res = await apiFetch(`/api/admin/orders?${params}`);
          if (res.ok) setOrders((await res.json()).orders || []);
        } else if (targetTab === 'suppliers') {
          const res = await apiFetch('/api/admin/suppliers');
          if (res.ok) setSuppliers((await res.json()).suppliers || []);
        } else if (targetTab === 'promotions') {
          const res = await apiFetch('/api/admin/promotions');
          if (res.ok) setPromotions((await res.json()).promotions || []);
        } else if (targetTab === 'users') {
          const res = await apiFetch('/api/admin/users');
          if (res.ok) setUsers((await res.json()).users || []);
        } else if (targetTab === 'settings') {
          const [sRes, lRes] = await Promise.all([
            apiFetch('/api/admin/settings'),
            apiFetch('/api/admin/logs'),
          ]);
          if (sRes.ok) setSettingsList((await sRes.json()).settings || []);
          if (lRes.ok) setLogs((await lRes.json()).logs || []);
        }
      } catch {
        notify('Failed to fetch dashboard data.');
      }
    },
    [apiFetch, orderSearch, orderPaymentFilter]
  );

  useEffect(() => {
    loadTab(tab);
  }, [tab, loadTab]);

  // Game Handlers
  const handleSaveGame = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGame) return;
    const isEdit = Boolean(editingGame.id);
    const res = await apiFetch(
      isEdit ? `/api/admin/games/${editingGame.id}` : '/api/admin/games',
      {
        method: isEdit ? 'PATCH' : 'POST',
        body: JSON.stringify(editingGame),
      }
    );
    if (res.ok) {
      setEditingGame(null);
      notify(isEdit ? 'Game updated.' : 'Game created.');
      loadTab('games');
      onStorefrontRefresh();
    } else {
      const err = await res.json().catch(() => ({}));
      notify(err.error || 'Failed to save game.');
    }
  };

  const handleGameImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1_500_000) {
      notify('Image file must be under 1.5MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setEditingGame((prev) => ({ ...prev, imageUrl: reader.result as string }));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDeleteGame = async (id: number) => {
    const res = await apiFetch(`/api/admin/games/${id}`, { method: 'DELETE' });
    if (res.ok) {
      notify('Game removed.');
      loadTab('games');
      onStorefrontRefresh();
    } else {
      const err = await res.json().catch(() => ({}));
      notify(err.error || 'Unable to delete game.');
    }
  };

  // Product Handlers
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    const isEdit = Boolean(editingProduct.id);
    const res = await apiFetch(
      isEdit
        ? `/api/admin/products/${editingProduct.id}`
        : '/api/admin/products',
      {
        method: isEdit ? 'PATCH' : 'POST',
        body: JSON.stringify(editingProduct),
      }
    );
    if (res.ok) {
      setEditingProduct(null);
      notify(isEdit ? 'Package updated.' : 'Package created.');
      loadTab('products');
      onStorefrontRefresh();
    } else {
      const err = await res.json().catch(() => ({}));
      notify(err.error || 'Failed to save package.');
    }
  };

  const handleDeleteProduct = async (id: number) => {
    const res = await apiFetch(`/api/admin/products/${id}`, { method: 'DELETE' });
    if (res.ok) {
      notify('Package deleted.');
      loadTab('products');
      onStorefrontRefresh();
    } else {
      const err = await res.json().catch(() => ({}));
      notify(err.error || 'Unable to delete package.');
    }
  };

  // Order & Fulfillment Handlers
  const handleAdminVerifyPayment = async (orderId: number) => {
    const res = await apiFetch(`/api/admin/orders/${orderId}/verify-payment`, {
      method: 'POST',
      body: JSON.stringify({
        note: manualNote || 'Verified via bank settlement slip by Admin',
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setSelectedOrder(data.order);
      notify('Payment verified and fulfillment dispatched.');
      loadTab('orders');
    } else {
      notify('Failed to verify payment.');
    }
  };

  const handleManualFulfillment = async (
    orderId: number,
    status: 'processing' | 'completed' | 'failed'
  ) => {
    const res = await apiFetch(`/api/admin/orders/${orderId}/fulfillment`, {
      method: 'POST',
      body: JSON.stringify({
        status,
        supplierTxId: manualTxId,
        notes: manualNote,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setSelectedOrder(data.order);
      notify(`Order marked ${status}.`);
      loadTab('orders');
    } else {
      const err = await res.json().catch(() => ({}));
      notify(err.error || 'Failed to update fulfillment.');
    }
  };

  const handleRetryFulfillment = async (orderId: number) => {
    const res = await apiFetch(`/api/admin/orders/${orderId}/retry`, {
      method: 'POST',
    });
    const data = await res.json();
    if (res.ok) {
      setSelectedOrder(data.order);
      notify(`Supplier retry result: ${data.result?.status}`);
      loadTab('orders');
    } else {
      notify(data.error || 'Retry failed.');
    }
  };

  // Supplier Handlers
  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSupplier) return;
    const isEdit = Boolean(editingSupplier.id);
    const res = await apiFetch(
      isEdit
        ? `/api/admin/suppliers/${editingSupplier.id}`
        : '/api/admin/suppliers',
      {
        method: isEdit ? 'PATCH' : 'POST',
        body: JSON.stringify(editingSupplier),
      }
    );
    if (res.ok) {
      setEditingSupplier(null);
      notify(isEdit ? 'Supplier updated.' : 'Supplier added.');
      loadTab('suppliers');
    } else {
      notify('Failed to save supplier.');
    }
  };

  const handleTestSupplier = async (id: number) => {
    const res = await apiFetch(`/api/admin/suppliers/${id}/test`, {
      method: 'POST',
    });
    const data = await res.json();
    notify(`Supplier connection: ${data.connectionStatus || 'checked'}`);
    loadTab('suppliers');
  };

  // Promotion Handlers
  const handleSavePromo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPromo) return;
    const isEdit = Boolean(editingPromo.id);
    const res = await apiFetch(
      isEdit
        ? `/api/admin/promotions/${editingPromo.id}`
        : '/api/admin/promotions',
      {
        method: isEdit ? 'PATCH' : 'POST',
        body: JSON.stringify(editingPromo),
      }
    );
    if (res.ok) {
      setEditingPromo(null);
      notify(isEdit ? 'Promotion updated.' : 'Promotion created.');
      loadTab('promotions');
      onStorefrontRefresh();
    } else {
      notify('Failed to save promotion.');
    }
  };

  // User Role/Status Handler
  const handleToggleUser = async (
    u: AppUser,
    patch: { role?: 'customer' | 'admin'; isActive?: boolean }
  ) => {
    const res = await apiFetch(`/api/admin/users/${u.id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      notify('User updated.');
      loadTab('users');
    } else {
      const err = await res.json().catch(() => ({}));
      notify(err.error || 'Failed to update user.');
    }
  };

  // Save Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await apiFetch('/api/admin/settings', {
      method: 'PUT',
      body: JSON.stringify({ settings: settingsList }),
    });
    if (res.ok) {
      notify('Gateway & storefront settings saved.');
      loadTab('settings');
      onStorefrontRefresh();
    } else {
      notify('Failed to save settings.');
    }
  };

  const handleDownloadBackup = async () => {
    const token = await getIdToken();
    const res = await fetch('/api/admin/backup', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      notify('Backup download failed.');
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nexus-topup-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    notify('Database backup downloaded.');
  };

  const navItems: Array<{ id: AdminTab; label: string; icon: React.ReactNode }> = [
    { id: 'overview', label: 'Overview', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'orders', label: 'Orders & Queue', icon: <Layers className="w-4 h-4" /> },
    { id: 'games', label: 'Games', icon: <Gamepad2 className="w-4 h-4" /> },
    { id: 'products', label: 'Packages', icon: <Package className="w-4 h-4" /> },
    { id: 'suppliers', label: 'Suppliers', icon: <Server className="w-4 h-4" /> },
    { id: 'promotions', label: 'Promotions', icon: <Tag className="w-4 h-4" /> },
    { id: 'users', label: 'Users', icon: <Users className="w-4 h-4" /> },
    { id: 'settings', label: 'Settings & Logs', icon: <SettingsIcon className="w-4 h-4" /> },
  ];

  const maxChartRevenue = Math.max(
    1,
    ...(overview?.revenueSeries.map((d) => d.revenue) || [1])
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-lg bg-cyan-500 text-[#060913] text-xs font-bold shadow-lg">
          {toast}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Sidebar */}
        <aside className="lg:col-span-3 rounded-xl border border-slate-800/90 bg-[#0b1120] p-3 space-y-1">
          <div className="px-3 py-2 mb-1 border-b border-slate-800/80">
            <h1 className="font-display text-sm font-bold text-white">
              Admin Console
            </h1>
            <p className="text-xs text-slate-400">NEXUS TOPUP Operations</p>
          </div>
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                tab === item.id
                  ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                  : 'text-slate-300 hover:bg-slate-800/50 border border-transparent'
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </aside>

        {/* Main Content */}
        <div className="lg:col-span-9 space-y-6">
          {/* OVERVIEW */}
          {tab === 'overview' && overview && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="rounded-xl border border-slate-800 bg-[#0b1120] p-4">
                  <span className="text-xs text-slate-400">Total Sales</span>
                  <div className="mt-1 font-mono text-2xl font-bold text-cyan-300 tabular-nums">
                    ${overview.kpis.totalSalesUsd.toFixed(2)}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-[#0b1120] p-4">
                  <span className="text-xs text-slate-400">Total Orders</span>
                  <div className="mt-1 font-mono text-2xl font-bold text-white tabular-nums">
                    {overview.kpis.totalOrders}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-[#0b1120] p-4">
                  <span className="text-xs text-slate-400">Customers</span>
                  <div className="mt-1 font-mono text-2xl font-bold text-white tabular-nums">
                    {overview.kpis.totalCustomers}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-[#0b1120] p-4">
                  <span className="text-xs text-slate-400">Active Games</span>
                  <div className="mt-1 font-mono text-2xl font-bold text-white tabular-nums">
                    {overview.kpis.totalGames}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-[#0b1120] p-4">
                  <span className="text-xs text-slate-400">Pending Payments</span>
                  <div className="mt-1 font-mono text-xl font-bold text-amber-300 tabular-nums">
                    {overview.kpis.pendingPayments}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-[#0b1120] p-4">
                  <span className="text-xs text-slate-400">Completed Orders</span>
                  <div className="mt-1 font-mono text-xl font-bold text-emerald-400 tabular-nums">
                    {overview.kpis.completedOrders}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-[#0b1120] p-4 col-span-2">
                  <span className="text-xs text-slate-400">Failed Orders</span>
                  <div className="mt-1 font-mono text-xl font-bold text-rose-400 tabular-nums">
                    {overview.kpis.failedOrders}
                  </div>
                </div>
              </div>

              {/* Revenue Chart */}
              <div className="rounded-xl border border-slate-800 bg-[#0b1120] p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-base font-semibold text-white">
                    Daily Revenue (Last 14 Active Days)
                  </h2>
                  <button
                    type="button"
                    onClick={() => loadTab('overview')}
                    className="text-xs text-slate-400 hover:text-white inline-flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Refresh</span>
                  </button>
                </div>
                {overview.revenueSeries.length === 0 ? (
                  <p className="text-xs text-slate-400 py-8 text-center">
                    Revenue bars will populate automatically once orders are placed.
                  </p>
                ) : (
                  <div className="h-44 flex items-end gap-2 pt-4">
                    {overview.revenueSeries.map((pt) => {
                      const heightPct = Math.max(
                        6,
                        Math.round((pt.revenue / maxChartRevenue) * 100)
                      );
                      return (
                        <div
                          key={pt.day}
                          className="flex-1 flex flex-col items-center gap-1.5 group"
                        >
                          <span className="text-[10px] font-mono text-cyan-300 opacity-0 group-hover:opacity-100 transition-opacity tabular-nums">
                            ${pt.revenue.toFixed(0)}
                          </span>
                          <div
                            style={{ height: `${heightPct}%` }}
                            className="w-full max-w-[36px] rounded-t bg-gradient-to-t from-violet-500/80 to-cyan-400"
                            title={`${pt.day}: $${pt.revenue.toFixed(2)} (${pt.ordersCount} orders)`}
                          />
                          <span className="text-[10px] font-mono text-slate-500 truncate max-w-full">
                            {pt.day.slice(5)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          {/* GAMES MANAGEMENT */}
          {tab === 'games' && (
            <div className="rounded-xl border border-slate-800 bg-[#0b1120] p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-semibold text-white">
                  Game Management
                </h2>
                <button
                  type="button"
                  onClick={() =>
                    setEditingGame({
                      slug: '',
                      name: '',
                      nameKm: '',
                      publisher: '',
                      category: 'MOBA',
                      currencyName: 'Diamonds',
                      currencyNameKm: 'ពេជ្រ',
                      imageUrl: '/src/assets/images/game_mobile_legends_1794894936722.jpg',
                      requiresServerId: false,
                      playerIdLabel: 'Player ID',
                      playerIdPlaceholder: 'e.g. 123456789',
                      isPopular: false,
                      isActive: true,
                      sortOrder: games.length + 1,
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-[#060913] text-xs font-bold cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Game</span>
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="py-2 pr-3">Game</th>
                      <th className="py-2 pr-3">Category</th>
                      <th className="py-2 pr-3">Currency</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {games.map((g) => (
                      <tr key={g.id}>
                        <td className="py-2.5 pr-3 font-medium text-white">
                          {g.name}
                        </td>
                        <td className="py-2.5 pr-3 text-slate-300">{g.category}</td>
                        <td className="py-2.5 pr-3 text-slate-300">
                          {g.currencyName}
                        </td>
                        <td className="py-2.5 pr-3">
                          <span
                            className={
                              g.isActive ? 'text-emerald-400' : 'text-slate-500'
                            }
                          >
                            {g.isActive ? 'Active' : 'Disabled'}
                          </span>
                        </td>
                        <td className="py-2.5 text-right space-x-2">
                          <button
                            type="button"
                            onClick={() => setEditingGame(g)}
                            className="text-cyan-300 hover:underline cursor-pointer"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteGame(g.id)}
                            className="text-rose-400 hover:underline cursor-pointer"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* PRODUCTS MANAGEMENT */}
          {tab === 'products' && (
            <div className="rounded-xl border border-slate-800 bg-[#0b1120] p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-semibold text-white">
                  Product Packages
                </h2>
                <button
                  type="button"
                  onClick={() =>
                    setEditingProduct({
                      gameId: games[0]?.id || 1,
                      supplierId: suppliers[0]?.id ?? null,
                      name: '',
                      nameKm: '',
                      currencyAmount: 100,
                      bonusAmount: 0,
                      priceUsd: '1.99',
                      discountPercent: '0',
                      fulfillmentType: 'manual',
                      supplierProductCode: '',
                      isPopular: false,
                      isActive: true,
                      sortOrder: 1,
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-[#060913] text-xs font-bold cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Package</span>
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="py-2 pr-3">Game</th>
                      <th className="py-2 pr-3">Package</th>
                      <th className="py-2 pr-3 text-right">Price</th>
                      <th className="py-2 pr-3 text-right">Discount</th>
                      <th className="py-2 pr-3">Fulfillment</th>
                      <th className="py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {products.map((p) => {
                      const g = games.find((gm) => gm.id === p.gameId);
                      return (
                        <tr key={p.id}>
                          <td className="py-2.5 pr-3 text-slate-300">
                            {g?.name || p.gameId}
                          </td>
                          <td className="py-2.5 pr-3 text-white font-medium">
                            {p.name}
                          </td>
                          <td className="py-2.5 pr-3 text-right font-mono text-cyan-300 tabular-nums">
                            ${Number(p.priceUsd).toFixed(2)}
                          </td>
                          <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-slate-300">
                            {Number(p.discountPercent).toFixed(0)}%
                          </td>
                          <td className="py-2.5 pr-3 capitalize text-slate-300">
                            {p.fulfillmentType}
                          </td>
                          <td className="py-2.5 text-right space-x-2">
                            <button
                              type="button"
                              onClick={() => setEditingProduct(p)}
                              className="text-cyan-300 hover:underline cursor-pointer"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteProduct(p.id)}
                              className="text-rose-400 hover:underline cursor-pointer"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ORDERS & FULFILLMENT QUEUE */}
          {tab === 'orders' && (
            <div className="rounded-xl border border-slate-800 bg-[#0b1120] p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h2 className="font-display text-lg font-semibold text-white">
                  Order &amp; Fulfillment Management
                </h2>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="search"
                      value={orderSearch}
                      onChange={(e) => setOrderSearch(e.target.value)}
                      placeholder="Order ID or Player ID..."
                      className="pl-8 pr-3 py-1.5 rounded-lg bg-[#060913] border border-slate-800 text-xs text-white"
                    />
                  </div>
                  <select
                    value={orderPaymentFilter}
                    onChange={(e) => setOrderPaymentFilter(e.target.value)}
                    className="px-2.5 py-1.5 rounded-lg bg-[#060913] border border-slate-800 text-xs text-white"
                  >
                    <option value="all">All Payments</option>
                    <option value="pending">Pending</option>
                    <option value="paid">Paid</option>
                    <option value="failed">Failed</option>
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="py-2 pr-3">Order ID</th>
                      <th className="py-2 pr-3">Game / Package</th>
                      <th className="py-2 pr-3">Player ID</th>
                      <th className="py-2 pr-3 text-right">Total</th>
                      <th className="py-2 pr-3">Payment</th>
                      <th className="py-2 pr-3">Top-Up</th>
                      <th className="py-2 text-right">Manage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {orders.map((o) => (
                      <tr key={o.id} className="hover:bg-slate-800/30">
                        <td className="py-2.5 pr-3 font-mono font-semibold text-white">
                          {o.orderCode}
                        </td>
                        <td className="py-2.5 pr-3">
                          <div className="text-white">{o.gameNameSnapshot}</div>
                          <div className="text-slate-400">{o.productNameSnapshot}</div>
                        </td>
                        <td className="py-2.5 pr-3 font-mono text-slate-300">
                          {o.playerId}
                          {o.serverId ? ` (${o.serverId})` : ''}
                        </td>
                        <td className="py-2.5 pr-3 font-mono text-right text-cyan-300 tabular-nums">
                          ${Number(o.totalUsd).toFixed(2)}
                        </td>
                        <td className="py-2.5 pr-3 capitalize">
                          <span
                            className={
                              o.paymentStatus === 'paid'
                                ? 'text-emerald-400'
                                : o.paymentStatus === 'failed'
                                  ? 'text-rose-400'
                                  : 'text-amber-300'
                            }
                          >
                            {o.paymentStatus}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 capitalize">
                          <span
                            className={
                              o.fulfillmentStatus === 'completed'
                                ? 'text-emerald-400'
                                : o.fulfillmentStatus === 'failed'
                                  ? 'text-rose-400'
                                  : 'text-amber-300'
                            }
                          >
                            {o.fulfillmentStatus}
                          </span>
                        </td>
                        <td className="py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedOrder(o);
                              setManualNote(o.notes || '');
                              setManualTxId('');
                            }}
                            className="text-cyan-300 hover:underline cursor-pointer"
                          >
                            Process
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {orders.length === 0 && (
                  <p className="text-xs text-slate-400 py-8 text-center">
                    No matching orders found.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* SUPPLIERS MANAGEMENT */}
          {tab === 'suppliers' && (
            <div className="rounded-xl border border-slate-800 bg-[#0b1120] p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-semibold text-white">
                  Supplier API Integrations
                </h2>
                <button
                  type="button"
                  onClick={() =>
                    setEditingSupplier({
                      name: '',
                      apiEndpoint: 'https://',
                      authType: 'bearer',
                      apiKey: '',
                      apiSecret: '',
                      isActive: true,
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-[#060913] text-xs font-bold cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Supplier</span>
                </button>
              </div>

              <div className="space-y-3">
                {suppliers.map((s) => (
                  <div
                    key={s.id}
                    className="rounded-lg border border-slate-800 bg-[#070b16] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white">
                          {s.name}
                        </span>
                        <span className="text-xs text-slate-400">
                          · {s.authType.toUpperCase()}
                        </span>
                        <span
                          className={`text-xs font-medium ${
                            s.connectionStatus === 'connected'
                              ? 'text-emerald-400'
                              : s.connectionStatus === 'error'
                                ? 'text-rose-400'
                                : 'text-amber-300'
                          }`}
                        >
                          · {s.connectionStatus}
                        </span>
                      </div>
                      <div className="font-mono text-xs text-slate-400 truncate max-w-md">
                        {s.apiEndpoint}
                      </div>
                      {s.lastError && (
                        <p className="text-xs text-rose-400">{s.lastError}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleTestSupplier(s.id)}
                        className="px-3 py-1.5 rounded-lg border border-cyan-500/40 text-cyan-300 text-xs font-medium hover:bg-cyan-500/10 cursor-pointer"
                      >
                        <Activity className="w-3.5 h-3.5 inline mr-1" />
                        Test API
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setEditingSupplier({
                            id: s.id,
                            name: s.name,
                            apiEndpoint: s.apiEndpoint,
                            authType: s.authType,
                            apiKey: '',
                            apiSecret: '',
                            isActive: s.isActive,
                          })
                        }
                        className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 text-xs hover:text-white cursor-pointer"
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                ))}
                {suppliers.length === 0 && (
                  <p className="text-xs text-slate-400 py-6 text-center">
                    No suppliers configured. Add an automatic fulfillment API supplier above.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* PROMOTIONS MANAGEMENT */}
          {tab === 'promotions' && (
            <div className="rounded-xl border border-slate-800 bg-[#0b1120] p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-semibold text-white">
                  Promotions &amp; Updates
                </h2>
                <button
                  type="button"
                  onClick={() =>
                    setEditingPromo({
                      title: '',
                      titleKm: '',
                      subtitle: '',
                      subtitleKm: '',
                      code: '',
                      discountType: 'percent',
                      discountValue: '10',
                      minOrderUsd: '5',
                      bannerType: 'offer',
                      isActive: true,
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-[#060913] text-xs font-bold cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Offer / Update</span>
                </button>
              </div>
              <div className="space-y-3">
                {promotions.map((pr) => (
                  <div
                    key={pr.id}
                    className="rounded-lg border border-slate-800 bg-[#070b16] p-4 flex items-center justify-between gap-4"
                  >
                    <div>
                      <div className="text-sm font-semibold text-white">
                        {pr.title}{' '}
                        {pr.code && (
                          <code className="ml-2 font-mono text-xs text-cyan-300">
                            [{pr.code}]
                          </code>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {pr.bannerType.toUpperCase()} · {pr.subtitle}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 text-xs shrink-0">
                      <button
                        type="button"
                        onClick={() => setEditingPromo(pr)}
                        className="text-cyan-300 hover:underline cursor-pointer"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch(`/api/admin/promotions/${pr.id}`, {
                            method: 'DELETE',
                          });
                          loadTab('promotions');
                          onStorefrontRefresh();
                        }}
                        className="text-rose-400 hover:underline cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* USERS MANAGEMENT */}
          {tab === 'users' && (
            <div className="rounded-xl border border-slate-800 bg-[#0b1120] p-6 space-y-4">
              <h2 className="font-display text-lg font-semibold text-white">
                Customer &amp; Admin Accounts
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="py-2 pr-3">Account</th>
                      <th className="py-2 pr-3">Role</th>
                      <th className="py-2 pr-3 text-right">Orders</th>
                      <th className="py-2 pr-3 text-right">Total Spent</th>
                      <th className="py-2 text-right">Controls</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td className="py-2.5 pr-3">
                          <div className="font-medium text-white">
                            {u.displayName || 'Customer'}
                          </div>
                          <div className="text-slate-400">{u.email}</div>
                        </td>
                        <td className="py-2.5 pr-3">
                          <span
                            className={
                              u.role === 'admin'
                                ? 'text-violet-300 font-semibold'
                                : 'text-slate-300'
                            }
                          >
                            {u.role}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-slate-300">
                          {u.orderCount ?? 0}
                        </td>
                        <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-cyan-300">
                          ${(u.totalSpentUsd ?? 0).toFixed(2)}
                        </td>
                        <td className="py-2.5 text-right space-x-2">
                          <button
                            type="button"
                            onClick={() =>
                              handleToggleUser(u, {
                                role: u.role === 'admin' ? 'customer' : 'admin',
                              })
                            }
                            className="text-cyan-300 hover:underline cursor-pointer"
                          >
                            <Shield className="w-3 h-3 inline mr-1" />
                            {u.role === 'admin' ? 'Set Customer' : 'Set Admin'}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleToggleUser(u, { isActive: !u.isActive })
                            }
                            className={
                              u.isActive
                                ? 'text-rose-400 hover:underline cursor-pointer'
                                : 'text-emerald-400 hover:underline cursor-pointer'
                            }
                          >
                            {u.isActive ? 'Suspend' : 'Activate'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* SETTINGS, AUDIT LOGS & BACKUP */}
          {tab === 'settings' && (
            <div className="space-y-6">
              <form
                onSubmit={handleSaveSettings}
                className="rounded-xl border border-slate-800 bg-[#0b1120] p-6 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-lg font-semibold text-white">
                    Payment Gateways &amp; Store Settings
                  </h2>
                  <button
                    type="button"
                    onClick={handleDownloadBackup}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-200 hover:text-white cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export DB Backup</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {settingsList.map((s, idx) => (
                    <div key={s.key}>
                      <label className="block text-xs font-mono text-slate-300 mb-1">
                        {s.key}
                      </label>
                      <input
                        type={s.isSecret ? 'password' : 'text'}
                        value={s.value}
                        onChange={(e) => {
                          const next = [...settingsList];
                          next[idx] = { ...s, value: e.target.value };
                          setSettingsList(next);
                        }}
                        placeholder={s.description}
                        className="w-full px-3 py-2 rounded-lg bg-[#060913] border border-slate-800 text-xs font-mono text-white"
                      />
                      <span className="text-[11px] text-slate-500">
                        {s.description}
                      </span>
                    </div>
                  ))}
                </div>

                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-[#060913] text-xs font-bold cursor-pointer"
                >
                  Save Gateway &amp; Store Settings
                </button>
              </form>

              <div className="rounded-xl border border-slate-800 bg-[#0b1120] p-6 space-y-3">
                <div className="flex items-center gap-2 text-white font-semibold text-sm">
                  <Database className="w-4 h-4 text-cyan-400" />
                  <span>Admin Activity Audit Trail</span>
                </div>
                <div className="max-h-72 overflow-y-auto divide-y divide-slate-800/60 text-xs">
                  {logs.map((l) => (
                    <div
                      key={l.id}
                      className="py-2 flex items-center justify-between gap-4"
                    >
                      <div>
                        <span className="font-mono text-cyan-300">
                          {l.action}
                        </span>{' '}
                        <span className="text-slate-400">
                          ({l.entityType} #{l.entityId}) by {l.adminEmail}
                        </span>
                      </div>
                      <span className="font-mono text-slate-500 shrink-0">
                        {new Date(l.createdAt).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ORDER PROCESS MODAL */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="max-w-lg w-full rounded-xl border border-slate-700 bg-[#0b1120] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-white">
                Process Order {selectedOrder.orderCode}
              </h3>
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="text-xs text-slate-400 hover:text-white cursor-pointer"
              >
                Close
              </button>
            </div>

            <div className="text-xs space-y-1 text-slate-300 bg-[#070b16] p-3.5 rounded-lg border border-slate-800">
              <div>
                Game: <strong className="text-white">{selectedOrder.gameNameSnapshot}</strong>
              </div>
              <div>
                Package: <strong className="text-white">{selectedOrder.productNameSnapshot}</strong>
              </div>
              <div>
                Target Account:{' '}
                <strong className="font-mono text-cyan-300">
                  {selectedOrder.playerId}
                  {selectedOrder.serverId ? ` (${selectedOrder.serverId})` : ''}
                </strong>
              </div>
              <div>
                Total:{' '}
                <strong className="font-mono text-white">
                  ${Number(selectedOrder.totalUsd).toFixed(2)}
                </strong>{' '}
                · Payment: <strong className="uppercase">{selectedOrder.paymentStatus}</strong> ·
                Top-Up: <strong className="uppercase">{selectedOrder.fulfillmentStatus}</strong>
              </div>
            </div>

            <div className="space-y-2.5">
              <input
                type="text"
                value={manualTxId}
                onChange={(e) => setManualTxId(e.target.value)}
                placeholder="Supplier / Top-Up Reference ID (optional)"
                className="w-full px-3 py-2 rounded-lg bg-[#060913] border border-slate-800 text-xs font-mono text-white"
              />
              <textarea
                value={manualNote}
                onChange={(e) => setManualNote(e.target.value)}
                placeholder="Verification or fulfillment note..."
                rows={2}
                className="w-full px-3 py-2 rounded-lg bg-[#060913] border border-slate-800 text-xs text-white"
              />
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              {selectedOrder.paymentStatus !== 'paid' && (
                <button
                  type="button"
                  onClick={() => handleAdminVerifyPayment(selectedOrder.id)}
                  className="px-3.5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-[#060913] text-xs font-bold cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" />
                  Confirm Payment &amp; Dispatch
                </button>
              )}
              {selectedOrder.paymentStatus === 'paid' && (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      handleManualFulfillment(selectedOrder.id, 'processing')
                    }
                    className="px-3 py-2 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-semibold cursor-pointer"
                  >
                    Mark Processing
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleManualFulfillment(selectedOrder.id, 'completed')
                    }
                    className="px-3 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-[#060913] text-xs font-bold cursor-pointer"
                  >
                    Mark Completed
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleManualFulfillment(selectedOrder.id, 'failed')
                    }
                    className="px-3 py-2 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs font-semibold cursor-pointer"
                  >
                    <XCircle className="w-3.5 h-3.5 inline mr-1" />
                    Mark Failed
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRetryFulfillment(selectedOrder.id)}
                    className="px-3 py-2 rounded-lg border border-cyan-500/40 text-cyan-300 text-xs font-semibold cursor-pointer"
                  >
                    Retry Supplier API
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* GAME MODAL */}
      {editingGame && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveGame}
            className="max-w-lg w-full max-h-[90vh] overflow-y-auto rounded-xl border border-slate-700 bg-[#0b1120] p-6 space-y-3 text-xs"
          >
            <h3 className="font-display text-base font-bold text-white">
              {editingGame.id ? 'Edit Game' : 'Add New Game'}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <input
                required
                placeholder="Slug (e.g. mobile-legends)"
                value={editingGame.slug || ''}
                onChange={(e) =>
                  setEditingGame({ ...editingGame, slug: e.target.value })
                }
                className="px-3 py-2 rounded-lg bg-[#060913] border border-slate-800 text-white"
              />
              <input
                required
                placeholder="Category (MOBA, RPG...)"
                value={editingGame.category || ''}
                onChange={(e) =>
                  setEditingGame({ ...editingGame, category: e.target.value })
                }
                className="px-3 py-2 rounded-lg bg-[#060913] border border-slate-800 text-white"
              />
              <input
                required
                placeholder="Game Name (English)"
                value={editingGame.name || ''}
                onChange={(e) =>
                  setEditingGame({ ...editingGame, name: e.target.value })
                }
                className="px-3 py-2 rounded-lg bg-[#060913] border border-slate-800 text-white"
              />
              <input
                required
                placeholder="Game Name (Khmer)"
                value={editingGame.nameKm || ''}
                onChange={(e) =>
                  setEditingGame({ ...editingGame, nameKm: e.target.value })
                }
                className="px-3 py-2 rounded-lg bg-[#060913] border border-slate-800 text-white"
              />
              <input
                required
                placeholder="Currency (Diamonds, UC)"
                value={editingGame.currencyName || ''}
                onChange={(e) =>
                  setEditingGame({ ...editingGame, currencyName: e.target.value })
                }
                className="px-3 py-2 rounded-lg bg-[#060913] border border-slate-800 text-white"
              />
              <input
                required
                placeholder="Currency (Khmer)"
                value={editingGame.currencyNameKm || ''}
                onChange={(e) =>
                  setEditingGame({ ...editingGame, currencyNameKm: e.target.value })
                }
                className="px-3 py-2 rounded-lg bg-[#060913] border border-slate-800 text-white"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-slate-400 block">
                Game Cover Image URL or Upload
              </label>
              <input
                required
                placeholder="/src/assets/images/..."
                value={editingGame.imageUrl || ''}
                onChange={(e) =>
                  setEditingGame({ ...editingGame, imageUrl: e.target.value })
                }
                className="w-full px-3 py-2 rounded-lg bg-[#060913] border border-slate-800 text-white"
              />
              <input
                type="file"
                accept="image/*"
                onChange={handleGameImageUpload}
                className="text-slate-400 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:bg-slate-800 file:text-white"
              />
            </div>

            <div className="flex items-center gap-4 pt-1">
              <label className="flex items-center gap-1.5 text-slate-300">
                <input
                  type="checkbox"
                  checked={Boolean(editingGame.requiresServerId)}
                  onChange={(e) =>
                    setEditingGame({
                      ...editingGame,
                      requiresServerId: e.target.checked,
                    })
                  }
                />
                Requires Server ID
              </label>
              <label className="flex items-center gap-1.5 text-slate-300">
                <input
                  type="checkbox"
                  checked={Boolean(editingGame.isPopular)}
                  onChange={(e) =>
                    setEditingGame({ ...editingGame, isPopular: e.target.checked })
                  }
                />
                Popular
              </label>
              <label className="flex items-center gap-1.5 text-slate-300">
                <input
                  type="checkbox"
                  checked={editingGame.isActive ?? true}
                  onChange={(e) =>
                    setEditingGame({ ...editingGame, isActive: e.target.checked })
                  }
                />
                Active
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-3">
              <button
                type="button"
                onClick={() => setEditingGame(null)}
                className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-cyan-500 text-[#060913] font-bold cursor-pointer"
              >
                Save Game
              </button>
            </div>
          </form>
        </div>
      )}

      {/* PRODUCT MODAL */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveProduct}
            className="max-w-lg w-full rounded-xl border border-slate-700 bg-[#0b1120] p-6 space-y-3 text-xs"
          >
            <h3 className="font-display text-base font-bold text-white">
              {editingProduct.id ? 'Edit Package' : 'Add Top-Up Package'}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <select
                value={editingProduct.gameId || ''}
                onChange={(e) =>
                  setEditingProduct({
                    ...editingProduct,
                    gameId: Number(e.target.value),
                  })
                }
                className="col-span-2 px-3 py-2 rounded-lg bg-[#060913] border border-slate-800 text-white"
              >
                {games.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
              <input
                required
                placeholder="Package Name (EN)"
                value={editingProduct.name || ''}
                onChange={(e) =>
                  setEditingProduct({ ...editingProduct, name: e.target.value })
                }
                className="px-3 py-2 rounded-lg bg-[#060913] border border-slate-800 text-white"
              />
              <input
                required
                placeholder="Package Name (KM)"
                value={editingProduct.nameKm || ''}
                onChange={(e) =>
                  setEditingProduct({ ...editingProduct, nameKm: e.target.value })
                }
                className="px-3 py-2 rounded-lg bg-[#060913] border border-slate-800 text-white"
              />
              <input
                required
                type="number"
                placeholder="Currency Amount"
                value={editingProduct.currencyAmount ?? 100}
                onChange={(e) =>
                  setEditingProduct({
                    ...editingProduct,
                    currencyAmount: Number(e.target.value),
                  })
                }
                className="px-3 py-2 rounded-lg bg-[#060913] border border-slate-800 text-white"
              />
              <input
                type="number"
                placeholder="Bonus Amount"
                value={editingProduct.bonusAmount ?? 0}
                onChange={(e) =>
                  setEditingProduct({
                    ...editingProduct,
                    bonusAmount: Number(e.target.value),
                  })
                }
                className="px-3 py-2 rounded-lg bg-[#060913] border border-slate-800 text-white"
              />
              <input
                required
                type="number"
                step="0.01"
                placeholder="Price USD"
                value={editingProduct.priceUsd ?? ''}
                onChange={(e) =>
                  setEditingProduct({ ...editingProduct, priceUsd: e.target.value })
                }
                className="px-3 py-2 rounded-lg bg-[#060913] border border-slate-800 text-white"
              />
              <input
                type="number"
                step="0.5"
                placeholder="Discount %"
                value={editingProduct.discountPercent ?? '0'}
                onChange={(e) =>
                  setEditingProduct({
                    ...editingProduct,
                    discountPercent: e.target.value,
                  })
                }
                className="px-3 py-2 rounded-lg bg-[#060913] border border-slate-800 text-white"
              />
              <select
                value={editingProduct.fulfillmentType || 'manual'}
                onChange={(e) =>
                  setEditingProduct({
                    ...editingProduct,
                    fulfillmentType: e.target.value as 'automatic' | 'manual',
                  })
                }
                className="px-3 py-2 rounded-lg bg-[#060913] border border-slate-800 text-white"
              >
                <option value="manual">Manual Fulfillment</option>
                <option value="automatic">Automatic Supplier API</option>
              </select>
              <select
                value={editingProduct.supplierId ?? ''}
                onChange={(e) =>
                  setEditingProduct({
                    ...editingProduct,
                    supplierId: e.target.value ? Number(e.target.value) : null,
                  })
                }
                className="px-3 py-2 rounded-lg bg-[#060913] border border-slate-800 text-white"
              >
                <option value="">No Supplier</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-3">
              <button
                type="button"
                onClick={() => setEditingProduct(null)}
                className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-cyan-500 text-[#060913] font-bold cursor-pointer"
              >
                Save Package
              </button>
            </div>
          </form>
        </div>
      )}

      {/* SUPPLIER MODAL */}
      {editingSupplier && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveSupplier}
            className="max-w-md w-full rounded-xl border border-slate-700 bg-[#0b1120] p-6 space-y-3 text-xs"
          >
            <h3 className="font-display text-base font-bold text-white">
              {editingSupplier.id ? 'Edit Supplier' : 'Add Supplier API'}
            </h3>
            <input
              required
              placeholder="Supplier Name"
              value={editingSupplier.name}
              onChange={(e) =>
                setEditingSupplier({ ...editingSupplier, name: e.target.value })
              }
              className="w-full px-3 py-2 rounded-lg bg-[#060913] border border-slate-800 text-white"
            />
            <input
              required
              type="url"
              placeholder="https://api.supplier.com/v1/topup"
              value={editingSupplier.apiEndpoint}
              onChange={(e) =>
                setEditingSupplier({
                  ...editingSupplier,
                  apiEndpoint: e.target.value,
                })
              }
              className="w-full px-3 py-2 rounded-lg bg-[#060913] border border-slate-800 text-white"
            />
            <select
              value={editingSupplier.authType}
              onChange={(e) =>
                setEditingSupplier({
                  ...editingSupplier,
                  authType: e.target.value as 'bearer' | 'hmac' | 'api_key',
                })
              }
              className="w-full px-3 py-2 rounded-lg bg-[#060913] border border-slate-800 text-white"
            >
              <option value="bearer">Bearer Token</option>
              <option value="api_key">X-API-Key Header</option>
              <option value="hmac">HMAC-SHA256 Signature</option>
            </select>
            <input
              type="password"
              placeholder={
                editingSupplier.id ? 'New API Key (leave blank to keep)' : 'API Key'
              }
              value={editingSupplier.apiKey}
              onChange={(e) =>
                setEditingSupplier({ ...editingSupplier, apiKey: e.target.value })
              }
              className="w-full px-3 py-2 rounded-lg bg-[#060913] border border-slate-800 text-white"
            />
            <input
              type="password"
              placeholder="API Secret (for HMAC)"
              value={editingSupplier.apiSecret}
              onChange={(e) =>
                setEditingSupplier({
                  ...editingSupplier,
                  apiSecret: e.target.value,
                })
              }
              className="w-full px-3 py-2 rounded-lg bg-[#060913] border border-slate-800 text-white"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingSupplier(null)}
                className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-cyan-500 text-[#060913] font-bold cursor-pointer"
              >
                Save Supplier
              </button>
            </div>
          </form>
        </div>
      )}

      {/* PROMOTION MODAL */}
      {editingPromo && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <form
            onSubmit={handleSavePromo}
            className="max-w-md w-full rounded-xl border border-slate-700 bg-[#0b1120] p-6 space-y-3 text-xs"
          >
            <h3 className="font-display text-base font-bold text-white">
              {editingPromo.id ? 'Edit Promotion' : 'Create Promotion / Update'}
            </h3>
            <input
              required
              placeholder="Title (English)"
              value={editingPromo.title || ''}
              onChange={(e) =>
                setEditingPromo({ ...editingPromo, title: e.target.value })
              }
              className="w-full px-3 py-2 rounded-lg bg-[#060913] border border-slate-800 text-white"
            />
            <input
              required
              placeholder="Title (Khmer)"
              value={editingPromo.titleKm || ''}
              onChange={(e) =>
                setEditingPromo({ ...editingPromo, titleKm: e.target.value })
              }
              className="w-full px-3 py-2 rounded-lg bg-[#060913] border border-slate-800 text-white"
            />
            <input
              placeholder="Subtitle (English)"
              value={editingPromo.subtitle || ''}
              onChange={(e) =>
                setEditingPromo({ ...editingPromo, subtitle: e.target.value })
              }
              className="w-full px-3 py-2 rounded-lg bg-[#060913] border border-slate-800 text-white"
            />
            <input
              placeholder="Subtitle (Khmer)"
              value={editingPromo.subtitleKm || ''}
              onChange={(e) =>
                setEditingPromo({ ...editingPromo, subtitleKm: e.target.value })
              }
              className="w-full px-3 py-2 rounded-lg bg-[#060913] border border-slate-800 text-white"
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                value={editingPromo.bannerType || 'offer'}
                onChange={(e) =>
                  setEditingPromo({
                    ...editingPromo,
                    bannerType: e.target.value as 'offer' | 'update',
                  })
                }
                className="px-3 py-2 rounded-lg bg-[#060913] border border-slate-800 text-white"
              >
                <option value="offer">Special Offer</option>
                <option value="update">Latest Update</option>
              </select>
              <input
                placeholder="Promo Code (optional)"
                value={editingPromo.code || ''}
                onChange={(e) =>
                  setEditingPromo({ ...editingPromo, code: e.target.value })
                }
                className="px-3 py-2 rounded-lg bg-[#060913] border border-slate-800 text-white font-mono uppercase"
              />
              <input
                type="number"
                step="0.01"
                placeholder="Discount Value"
                value={editingPromo.discountValue ?? '0'}
                onChange={(e) =>
                  setEditingPromo({
                    ...editingPromo,
                    discountValue: e.target.value,
                  })
                }
                className="px-3 py-2 rounded-lg bg-[#060913] border border-slate-800 text-white"
              />
              <input
                type="number"
                step="0.01"
                placeholder="Min Order USD"
                value={editingPromo.minOrderUsd ?? '0'}
                onChange={(e) =>
                  setEditingPromo({
                    ...editingPromo,
                    minOrderUsd: e.target.value,
                  })
                }
                className="px-3 py-2 rounded-lg bg-[#060913] border border-slate-800 text-white"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingPromo(null)}
                className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-cyan-500 text-[#060913] font-bold cursor-pointer"
              >
                Save
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
