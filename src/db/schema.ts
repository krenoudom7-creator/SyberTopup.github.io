import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

// 1. Users Table (synced with Firebase Auth UID + RBAC)
export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    uid: text('uid').notNull().unique(),
    email: text('email').notNull(),
    displayName: text('display_name').default(''),
    avatarUrl: text('avatar_url').default(''),
    role: text('role').notNull().default('customer'), // 'customer' | 'admin'
    permissions: jsonb('permissions').$type<string[]>().notNull().default([]),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('users_email_idx').on(table.email),
    index('users_role_idx').on(table.role),
  ]
);

// 2. Games Table
export const games = pgTable(
  'games',
  {
    id: serial('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    nameKm: text('name_km').notNull(),
    publisher: text('publisher').notNull().default(''),
    category: text('category').notNull().default('MOBA'),
    currencyName: text('currency_name').notNull(),
    currencyNameKm: text('currency_name_km').notNull(),
    imageUrl: text('image_url').notNull(),
    description: text('description').notNull().default(''),
    descriptionKm: text('description_km').notNull().default(''),
    requiresServerId: boolean('requires_server_id').notNull().default(false),
    playerIdLabel: text('player_id_label').notNull().default('Player ID'),
    playerIdPlaceholder: text('player_id_placeholder').notNull().default('e.g. 123456789'),
    serverIdLabel: text('server_id_label').default('Server ID'),
    serverIdPlaceholder: text('server_id_placeholder').default('e.g. 2045'),
    isPopular: boolean('is_popular').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('games_category_idx').on(table.category),
    index('games_active_popular_idx').on(table.isActive, table.isPopular),
  ]
);

// 3. Suppliers Table
export const suppliers = pgTable('suppliers', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  apiEndpoint: text('api_endpoint').notNull(),
  authType: text('auth_type').notNull().default('bearer'), // 'bearer' | 'hmac' | 'api_key'
  encryptedApiKey: text('encrypted_api_key').notNull().default(''),
  encryptedApiSecret: text('encrypted_api_secret').notNull().default(''),
  connectionStatus: text('connection_status').notNull().default('unconfigured'), // 'connected' | 'unconfigured' | 'error'
  lastCheckedAt: timestamp('last_checked_at'),
  lastError: text('last_error'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 4. Products Table (Diamonds, UC, Robux, CP, VP packages)
export const products = pgTable(
  'products',
  {
    id: serial('id').primaryKey(),
    gameId: integer('game_id')
      .references(() => games.id, { onDelete: 'cascade' })
      .notNull(),
    supplierId: integer('supplier_id').references(() => suppliers.id, {
      onDelete: 'set null',
    }),
    name: text('name').notNull(),
    nameKm: text('name_km').notNull(),
    currencyAmount: integer('currency_amount').notNull(),
    bonusAmount: integer('bonus_amount').notNull().default(0),
    priceUsd: numeric('price_usd', { precision: 10, scale: 2 }).notNull(),
    discountPercent: numeric('discount_percent', { precision: 5, scale: 2 })
      .notNull()
      .default('0.00'),
    fulfillmentType: text('fulfillment_type').notNull().default('manual'), // 'automatic' | 'manual'
    supplierProductCode: text('supplier_product_code').default(''),
    isPopular: boolean('is_popular').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('products_game_idx').on(table.gameId),
    index('products_active_idx').on(table.isActive),
  ]
);

// 5. Promotions & Updates Table
export const promotions = pgTable(
  'promotions',
  {
    id: serial('id').primaryKey(),
    title: text('title').notNull(),
    titleKm: text('title_km').notNull(),
    subtitle: text('subtitle').notNull().default(''),
    subtitleKm: text('subtitle_km').notNull().default(''),
    code: text('code').unique(),
    discountType: text('discount_type').notNull().default('percent'), // 'percent' | 'fixed'
    discountValue: numeric('discount_value', { precision: 10, scale: 2 })
      .notNull()
      .default('0.00'),
    minOrderUsd: numeric('min_order_usd', { precision: 10, scale: 2 })
      .notNull()
      .default('0.00'),
    bannerType: text('banner_type').notNull().default('offer'), // 'offer' | 'update'
    isActive: boolean('is_active').notNull().default(true),
    startsAt: timestamp('starts_at'),
    endsAt: timestamp('ends_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('promotions_active_idx').on(table.isActive)]
);

// 6. Orders Table
export const orders = pgTable(
  'orders',
  {
    id: serial('id').primaryKey(),
    orderCode: text('order_code').notNull().unique(),
    userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
    gameId: integer('game_id')
      .references(() => games.id, { onDelete: 'restrict' })
      .notNull(),
    productId: integer('product_id')
      .references(() => products.id, { onDelete: 'restrict' })
      .notNull(),
    playerId: text('player_id').notNull(),
    serverId: text('server_id'),
    customerEmail: text('customer_email'),
    gameNameSnapshot: text('game_name_snapshot').notNull(),
    productNameSnapshot: text('product_name_snapshot').notNull(),
    currencyAmountSnapshot: integer('currency_amount_snapshot').notNull(),
    subtotalUsd: numeric('subtotal_usd', { precision: 10, scale: 2 }).notNull(),
    discountUsd: numeric('discount_usd', { precision: 10, scale: 2 })
      .notNull()
      .default('0.00'),
    totalUsd: numeric('total_usd', { precision: 10, scale: 2 }).notNull(),
    totalKhr: integer('total_khr').notNull(),
    promoCode: text('promo_code'),
    paymentMethod: text('payment_method').notNull(), // 'bakong_khqr' | 'aba_payway'
    paymentStatus: text('payment_status').notNull().default('pending'), // 'pending' | 'paid' | 'failed' | 'expired'
    fulfillmentMode: text('fulfillment_mode').notNull().default('manual'), // 'automatic' | 'manual'
    fulfillmentStatus: text('fulfillment_status').notNull().default('queued'), // 'queued' | 'processing' | 'completed' | 'failed'
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('orders_user_idx').on(table.userId),
    index('orders_payment_status_idx').on(table.paymentStatus),
    index('orders_fulfillment_status_idx').on(table.fulfillmentStatus),
    index('orders_created_at_idx').on(table.createdAt),
    index('orders_player_id_idx').on(table.playerId),
  ]
);

// 7. Payments Table
export const payments = pgTable(
  'payments',
  {
    id: serial('id').primaryKey(),
    orderId: integer('order_id')
      .references(() => orders.id, { onDelete: 'cascade' })
      .notNull()
      .unique(),
    provider: text('provider').notNull(), // 'bakong_khqr' | 'aba_payway'
    transactionRef: text('transaction_ref').notNull().unique(),
    khqrPayload: text('khqr_payload'),
    khqrMd5: text('khqr_md5'),
    abaHash: text('aba_hash'),
    abaCheckoutUrl: text('aba_checkout_url'),
    amountUsd: numeric('amount_usd', { precision: 10, scale: 2 }).notNull(),
    amountKhr: integer('amount_khr').notNull(),
    currency: text('currency').notNull().default('USD'),
    status: text('status').notNull().default('pending'), // 'pending' | 'verified' | 'failed' | 'unconfigured'
    providerMessage: text('provider_message'),
    providerResponse: jsonb('provider_response'),
    verifiedAt: timestamp('verified_at'),
    expiresAt: timestamp('expires_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('payments_md5_idx').on(table.khqrMd5),
    index('payments_status_idx').on(table.status),
  ]
);

// 8. Fulfillment Jobs Table
export const fulfillmentJobs = pgTable(
  'fulfillment_jobs',
  {
    id: serial('id').primaryKey(),
    orderId: integer('order_id')
      .references(() => orders.id, { onDelete: 'cascade' })
      .notNull(),
    supplierId: integer('supplier_id').references(() => suppliers.id, {
      onDelete: 'set null',
    }),
    idempotencyKey: text('idempotency_key').notNull().unique(),
    mode: text('mode').notNull(), // 'automatic' | 'manual'
    status: text('status').notNull().default('queued'), // 'queued' | 'processing' | 'completed' | 'failed'
    attemptCount: integer('attempt_count').notNull().default(0),
    supplierTxId: text('supplier_tx_id'),
    apiResponse: jsonb('api_response'),
    errorMessage: text('error_message'),
    processedByUserId: integer('processed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('fulfillment_order_idx').on(table.orderId),
    index('fulfillment_status_idx').on(table.status),
  ]
);

// 9. Settings Table
export const settings = pgTable('settings', {
  id: serial('id').primaryKey(),
  key: text('key').notNull().unique(),
  value: text('value').notNull().default(''),
  isSecret: boolean('is_secret').notNull().default(false),
  description: text('description').default(''),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 10. Admin Logs Table
export const adminLogs = pgTable(
  'admin_logs',
  {
    id: serial('id').primaryKey(),
    adminUserId: integer('admin_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    adminEmail: text('admin_email').notNull(),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    details: jsonb('details'),
    ipAddress: text('ip_address'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('admin_logs_created_idx').on(table.createdAt)]
);

// Drizzle ORM Relations
export const usersRelations = relations(users, ({ many }) => ({
  orders: many(orders),
  adminLogs: many(adminLogs),
}));

export const gamesRelations = relations(games, ({ many }) => ({
  products: many(products),
  orders: many(orders),
}));

export const suppliersRelations = relations(suppliers, ({ many }) => ({
  products: many(products),
  fulfillmentJobs: many(fulfillmentJobs),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  game: one(games, { fields: [products.gameId], references: [games.id] }),
  supplier: one(suppliers, {
    fields: [products.supplierId],
    references: [suppliers.id],
  }),
  orders: many(orders),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, { fields: [orders.userId], references: [users.id] }),
  game: one(games, { fields: [orders.gameId], references: [games.id] }),
  product: one(products, { fields: [orders.productId], references: [products.id] }),
  payment: one(payments, { fields: [orders.id], references: [payments.orderId] }),
  fulfillmentJobs: many(fulfillmentJobs),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  order: one(orders, { fields: [payments.orderId], references: [orders.id] }),
}));

export const fulfillmentJobsRelations = relations(fulfillmentJobs, ({ one }) => ({
  order: one(orders, { fields: [fulfillmentJobs.orderId], references: [orders.id] }),
  supplier: one(suppliers, {
    fields: [fulfillmentJobs.supplierId],
    references: [suppliers.id],
  }),
  processedBy: one(users, {
    fields: [fulfillmentJobs.processedByUserId],
    references: [users.id],
  }),
}));

export const adminLogsRelations = relations(adminLogs, ({ one }) => ({
  adminUser: one(users, { fields: [adminLogs.adminUserId], references: [users.id] }),
}));
