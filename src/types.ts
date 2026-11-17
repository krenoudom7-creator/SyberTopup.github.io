export type Language = 'en' | 'km';
export type CurrencyMode = 'USD' | 'KHR';

export interface AppUser {
  id: number;
  uid: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: 'customer' | 'admin';
  permissions: string[];
  isActive: boolean;
  createdAt?: string;
  orderCount?: number;
  totalSpentUsd?: number;
}

export interface Game {
  id: number;
  slug: string;
  name: string;
  nameKm: string;
  publisher: string;
  category: string;
  currencyName: string;
  currencyNameKm: string;
  imageUrl: string;
  description: string;
  descriptionKm: string;
  requiresServerId: boolean;
  playerIdLabel: string;
  playerIdPlaceholder: string;
  serverIdLabel: string | null;
  serverIdPlaceholder: string | null;
  isPopular: boolean;
  isActive: boolean;
  sortOrder: number;
  startingPriceUsd?: number;
  packageCount?: number;
}

export interface Product {
  id: number;
  gameId: number;
  supplierId: number | null;
  name: string;
  nameKm: string;
  currencyAmount: number;
  bonusAmount: number;
  priceUsd: string;
  discountPercent: string;
  fulfillmentType: 'automatic' | 'manual';
  supplierProductCode: string | null;
  isPopular: boolean;
  isActive: boolean;
  sortOrder: number;
}

export interface Promotion {
  id: number;
  title: string;
  titleKm: string;
  subtitle: string;
  subtitleKm: string;
  code: string | null;
  discountType: 'percent' | 'fixed';
  discountValue: string;
  minOrderUsd: string;
  bannerType: 'offer' | 'update';
  isActive: boolean;
  createdAt: string;
}

export interface PaymentInfo {
  id: number;
  orderId: number;
  provider: 'bakong_khqr' | 'aba_payway';
  transactionRef: string;
  khqrPayload: string | null;
  khqrMd5: string | null;
  abaHash: string | null;
  abaCheckoutUrl: string | null;
  amountUsd: string;
  amountKhr: number;
  currency: string;
  status: 'pending' | 'verified' | 'failed' | 'unconfigured';
  providerMessage: string | null;
  verifiedAt: string | null;
  expiresAt: string | null;
  qrDataUrl?: string | null;
  abaFormFields?: Record<string, string> | null;
}

export interface Order {
  id: number;
  orderCode: string;
  userId: number | null;
  gameId: number;
  productId: number;
  playerId: string;
  serverId: string | null;
  customerEmail: string | null;
  gameNameSnapshot: string;
  productNameSnapshot: string;
  currencyAmountSnapshot: number;
  subtotalUsd: string;
  discountUsd: string;
  totalUsd: string;
  totalKhr: number;
  promoCode: string | null;
  paymentMethod: 'bakong_khqr' | 'aba_payway';
  paymentStatus: 'pending' | 'paid' | 'failed' | 'expired';
  fulfillmentMode: 'automatic' | 'manual';
  fulfillmentStatus: 'queued' | 'processing' | 'completed' | 'failed';
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  payment?: PaymentInfo | null;
}

export interface Supplier {
  id: number;
  name: string;
  apiEndpoint: string;
  authType: 'bearer' | 'hmac' | 'api_key';
  apiKeyMasked: string;
  hasApiKey: boolean;
  hasApiSecret: boolean;
  connectionStatus: 'connected' | 'unconfigured' | 'error';
  lastCheckedAt: string | null;
  lastError: string | null;
  isActive: boolean;
}

export interface StorefrontConfig {
  exchangeRateKhr: number;
  supportTelegram: string;
  supportEmail: string;
  bakongConfigured: boolean;
  abaConfigured: boolean;
}
