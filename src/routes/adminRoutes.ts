import { Router, Response } from 'express';
import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.ts';
import {
  adminLogs,
  fulfillmentJobs,
  games,
  orders,
  payments,
  products,
  promotions,
  settings,
  suppliers,
  users,
} from '../db/schema.ts';
import { AuthRequest, requireAdmin, requireAuth } from '../middleware/auth.ts';
import { decryptSecret, encryptSecret, maskSecret } from '../lib/crypto.ts';
import { dispatchOrderFulfillment } from '../lib/fulfillment.ts';

export const adminRoutes = Router();

adminRoutes.use(requireAuth, requireAdmin);

async function writeAdminLog(
  req: AuthRequest,
  action: string,
  entityType: string,
  entityId: string | number,
  details?: Record<string, unknown>
) {
  try {
    await db.insert(adminLogs).values({
      adminUserId: req.dbUser?.id ?? null,
      adminEmail: req.dbUser?.email || 'admin',
      action,
      entityType,
      entityId: String(entityId),
      details: details ?? null,
      ipAddress: req.ip || '',
    });
  } catch (err) {
    console.error('Failed to record admin log:', err);
  }
}

// 1. Overview Analytics
adminRoutes.get('/overview', async (_req: AuthRequest, res: Response) => {
  try {
    const [
      salesRes,
      orderCountRes,
      customerCountRes,
      gameCountRes,
      pendingPayRes,
      completedRes,
      failedRes,
      dailyChartRes,
      recentOrders,
    ] = await Promise.all([
      db
        .select({
          total: sql<string>`COALESCE(SUM(total_usd), 0)::text`,
        })
        .from(orders)
        .where(eq(orders.paymentStatus, 'paid')),
      db.select({ count: sql<number>`count(*)::int` }).from(orders),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(users)
        .where(eq(users.role, 'customer')),
      db.select({ count: sql<number>`count(*)::int` }).from(games),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(orders)
        .where(eq(orders.paymentStatus, 'pending')),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(orders)
        .where(eq(orders.fulfillmentStatus, 'completed')),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(orders)
        .where(
          or(
            eq(orders.paymentStatus, 'failed'),
            eq(orders.fulfillmentStatus, 'failed')
          )
        ),
      db
        .select({
          day: sql<string>`to_char(created_at, 'YYYY-MM-DD')`,
          revenue: sql<number>`COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN total_usd ELSE 0 END), 0)::float`,
          ordersCount: sql<number>`count(*)::int`,
        })
        .from(orders)
        .groupBy(sql`to_char(created_at, 'YYYY-MM-DD')`)
        .orderBy(sql`to_char(created_at, 'YYYY-MM-DD') DESC`)
        .limit(14),
      db.select().from(orders).orderBy(desc(orders.createdAt)).limit(8),
    ]);

    res.json({
      kpis: {
        totalSalesUsd: Number(salesRes[0]?.total || 0),
        totalOrders: orderCountRes[0]?.count ?? 0,
        totalCustomers: customerCountRes[0]?.count ?? 0,
        totalGames: gameCountRes[0]?.count ?? 0,
        pendingPayments: pendingPayRes[0]?.count ?? 0,
        completedOrders: completedRes[0]?.count ?? 0,
        failedOrders: failedRes[0]?.count ?? 0,
      },
      revenueSeries: dailyChartRes.reverse(),
      recentOrders,
    });
  } catch (error) {
    console.error('Admin overview failed:', error);
    res.status(500).json({ error: 'Unable to load dashboard analytics.' });
  }
});

// 2. Game Management
const gameSchema = z.object({
  slug: z.string().trim().min(2).max(64),
  name: z.string().trim().min(2).max(120),
  nameKm: z.string().trim().min(1).max(120),
  publisher: z.string().trim().max(100).default(''),
  category: z.string().trim().min(2).max(40).default('MOBA'),
  currencyName: z.string().trim().min(1).max(50),
  currencyNameKm: z.string().trim().min(1).max(80),
  imageUrl: z.string().trim().min(1),
  description: z.string().trim().max(500).default(''),
  descriptionKm: z.string().trim().max(500).default(''),
  requiresServerId: z.boolean().default(false),
  playerIdLabel: z.string().trim().max(60).default('Player ID'),
  playerIdPlaceholder: z.string().trim().max(60).default('e.g. 123456789'),
  serverIdLabel: z.string().trim().max(60).optional().nullable(),
  serverIdPlaceholder: z.string().trim().max(60).optional().nullable(),
  isPopular: z.boolean().default(false),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

adminRoutes.get('/games', async (_req: AuthRequest, res: Response) => {
  try {
    const rows = await db
      .select()
      .from(games)
      .orderBy(asc(games.sortOrder), asc(games.id));
    res.json({ games: rows });
  } catch (error) {
    console.error('Admin games fetch failed:', error);
    res.status(500).json({ error: 'Failed to load games.' });
  }
});

adminRoutes.post('/games', async (req: AuthRequest, res: Response) => {
  try {
    const parsed = gameSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid game payload.', details: parsed.error.flatten() });
    }
    const [created] = await db.insert(games).values(parsed.data).returning();
    await writeAdminLog(req, 'CREATE_GAME', 'game', created.id, { name: created.name });
    res.status(201).json({ game: created });
  } catch (error) {
    console.error('Create game failed:', error);
    res.status(500).json({ error: 'Failed to create game. Ensure slug is unique.' });
  }
});

adminRoutes.patch('/games/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const parsed = gameSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid update payload.' });
    }
    const [updated] = await db
      .update(games)
      .set(parsed.data)
      .where(eq(games.id, id))
      .returning();
    if (!updated) {
      return res.status(404).json({ error: 'Game not found.' });
    }
    await writeAdminLog(req, 'UPDATE_GAME', 'game', id, parsed.data);
    res.json({ game: updated });
  } catch (error) {
    console.error('Update game failed:', error);
    res.status(500).json({ error: 'Failed to update game.' });
  }
});

adminRoutes.delete('/games/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const [deleted] = await db.delete(games).where(eq(games.id, id)).returning();
    if (!deleted) {
      return res.status(404).json({ error: 'Game not found.' });
    }
    await writeAdminLog(req, 'DELETE_GAME', 'game', id, { name: deleted.name });
    res.json({ deleted: true });
  } catch (error) {
    console.error('Delete game failed:', error);
    res.status(400).json({
      error: 'Cannot delete game with existing orders. Disable it instead.',
    });
  }
});

// 3. Product Management
const productSchema = z.object({
  gameId: z.number().int().positive(),
  supplierId: z.number().int().positive().nullable().optional(),
  name: z.string().trim().min(1).max(120),
  nameKm: z.string().trim().min(1).max(120),
  currencyAmount: z.number().int().positive(),
  bonusAmount: z.number().int().min(0).default(0),
  priceUsd: z.union([z.number().positive(), z.string()]),
  discountPercent: z.union([z.number().min(0).max(95), z.string()]).default(0),
  fulfillmentType: z.enum(['automatic', 'manual']).default('manual'),
  supplierProductCode: z.string().trim().max(80).optional().default(''),
  isPopular: z.boolean().default(false),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

adminRoutes.get('/products', async (req: AuthRequest, res: Response) => {
  try {
    const gameId = req.query.gameId ? Number(req.query.gameId) : null;
    const rows = gameId
      ? await db
          .select()
          .from(products)
          .where(eq(products.gameId, gameId))
          .orderBy(asc(products.sortOrder), asc(products.id))
      : await db
          .select()
          .from(products)
          .orderBy(asc(products.gameId), asc(products.sortOrder), asc(products.id));
    res.json({ products: rows });
  } catch (error) {
    console.error('Admin products failed:', error);
    res.status(500).json({ error: 'Failed to load products.' });
  }
});

adminRoutes.post('/products', async (req: AuthRequest, res: Response) => {
  try {
    const parsed = productSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid product payload.', details: parsed.error.flatten() });
    }
    const d = parsed.data;
    const [created] = await db
      .insert(products)
      .values({
        ...d,
        priceUsd: Number(d.priceUsd).toFixed(2),
        discountPercent: Number(d.discountPercent).toFixed(2),
      })
      .returning();
    await writeAdminLog(req, 'CREATE_PRODUCT', 'product', created.id, { name: created.name });
    res.status(201).json({ product: created });
  } catch (error) {
    console.error('Create product failed:', error);
    res.status(500).json({ error: 'Failed to create product.' });
  }
});

adminRoutes.patch('/products/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const parsed = productSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid product update.' });
    }
    const d = parsed.data;
    const updateData: Record<string, unknown> = { ...d };
    if (d.priceUsd !== undefined) updateData.priceUsd = Number(d.priceUsd).toFixed(2);
    if (d.discountPercent !== undefined)
      updateData.discountPercent = Number(d.discountPercent).toFixed(2);

    const [updated] = await db
      .update(products)
      .set(updateData)
      .where(eq(products.id, id))
      .returning();
    if (!updated) {
      return res.status(404).json({ error: 'Product not found.' });
    }
    await writeAdminLog(req, 'UPDATE_PRODUCT', 'product', id, updateData);
    res.json({ product: updated });
  } catch (error) {
    console.error('Update product failed:', error);
    res.status(500).json({ error: 'Failed to update product.' });
  }
});

adminRoutes.delete('/products/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const [deleted] = await db
      .delete(products)
      .where(eq(products.id, id))
      .returning();
    if (!deleted) {
      return res.status(404).json({ error: 'Product not found.' });
    }
    await writeAdminLog(req, 'DELETE_PRODUCT', 'product', id, { name: deleted.name });
    res.json({ deleted: true });
  } catch (error) {
    console.error('Delete product failed:', error);
    res.status(400).json({
      error: 'Cannot delete product referenced by existing orders. Disable it instead.',
    });
  }
});

// 4. Order & Fulfillment Management
adminRoutes.get('/orders', async (req: AuthRequest, res: Response) => {
  try {
    const search = String(req.query.search || '').trim();
    const paymentStatus = String(req.query.paymentStatus || '').trim();
    const fulfillmentStatus = String(req.query.fulfillmentStatus || '').trim();
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(50, Math.max(10, Number(req.query.limit || 20)));
    const offset = (page - 1) * limit;

    const conditions = [];
    if (search) {
      const pattern = `%${search}%`;
      conditions.push(
        or(
          ilike(orders.orderCode, pattern),
          ilike(orders.playerId, pattern),
          ilike(orders.customerEmail, pattern),
          ilike(orders.gameNameSnapshot, pattern)
        )!
      );
    }
    if (paymentStatus && paymentStatus !== 'all') {
      conditions.push(eq(orders.paymentStatus, paymentStatus));
    }
    if (fulfillmentStatus && fulfillmentStatus !== 'all') {
      conditions.push(eq(orders.fulfillmentStatus, fulfillmentStatus));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, totalRes] = await Promise.all([
      db
        .select()
        .from(orders)
        .where(whereClause)
        .orderBy(desc(orders.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(orders)
        .where(whereClause),
    ]);

    const orderIds = rows.map((r) => r.id);
    const paymentMap = new Map<number, typeof payments.$inferSelect>();
    if (orderIds.length > 0) {
      const payRows = await db
        .select()
        .from(payments)
        .where(
          sql`${payments.orderId} IN (${sql.join(
            orderIds.map((id) => sql`${id}`),
            sql`, `
          )})`
        );
      for (const p of payRows) {
        paymentMap.set(p.orderId, p);
      }
    }

    res.json({
      orders: rows.map((o) => ({
        ...o,
        payment: paymentMap.get(o.id) ?? null,
      })),
      total: totalRes[0]?.count ?? 0,
      page,
      limit,
    });
  } catch (error) {
    console.error('Admin orders failed:', error);
    res.status(500).json({ error: 'Failed to load orders.' });
  }
});

adminRoutes.get('/orders/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const [orderRows, paymentRows, jobRows] = await Promise.all([
      db.select().from(orders).where(eq(orders.id, id)).limit(1),
      db.select().from(payments).where(eq(payments.orderId, id)).limit(1),
      db
        .select()
        .from(fulfillmentJobs)
        .where(eq(fulfillmentJobs.orderId, id))
        .orderBy(desc(fulfillmentJobs.id)),
    ]);
    if (!orderRows[0]) {
      return res.status(404).json({ error: 'Order not found.' });
    }
    res.json({
      order: orderRows[0],
      payment: paymentRows[0] ?? null,
      jobs: jobRows,
    });
  } catch (error) {
    console.error('Order detail failed:', error);
    res.status(500).json({ error: 'Failed to load order details.' });
  }
});

adminRoutes.post(
  '/orders/:id/verify-payment',
  async (req: AuthRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      const note = String(req.body?.note || 'Manually verified by Admin');

      const orderRows = await db
        .select()
        .from(orders)
        .where(eq(orders.id, id))
        .limit(1);
      if (!orderRows[0]) {
        return res.status(404).json({ error: 'Order not found.' });
      }

      await db
        .update(payments)
        .set({
          status: 'verified',
          providerMessage: note,
          verifiedAt: new Date(),
        })
        .where(eq(payments.orderId, id));

      await db
        .update(orders)
        .set({
          paymentStatus: 'paid',
          notes: note,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, id));

      const fulfillment = await dispatchOrderFulfillment(id);
      await writeAdminLog(req, 'ADMIN_VERIFY_PAYMENT', 'order', id, {
        orderCode: orderRows[0].orderCode,
        note,
        fulfillment,
      });

      const [updated] = await db
        .select()
        .from(orders)
        .where(eq(orders.id, id))
        .limit(1);

      res.json({ order: updated, fulfillment });
    } catch (error) {
      console.error('Admin verify payment failed:', error);
      res.status(500).json({ error: 'Failed to verify payment.' });
    }
  }
);

const manualFulfillSchema = z.object({
  status: z.enum(['processing', 'completed', 'failed']),
  supplierTxId: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
});

adminRoutes.post(
  '/orders/:id/fulfillment',
  async (req: AuthRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      const parsed = manualFulfillSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid fulfillment status update.' });
      }

      const orderRows = await db
        .select()
        .from(orders)
        .where(eq(orders.id, id))
        .limit(1);
      const order = orderRows[0];
      if (!order) {
        return res.status(404).json({ error: 'Order not found.' });
      }
      if (order.paymentStatus !== 'paid') {
        return res.status(400).json({
          error: 'Payment must be verified before updating fulfillment status.',
        });
      }

      const { status, supplierTxId, notes } = parsed.data;

      await db
        .update(orders)
        .set({
          fulfillmentStatus: status,
          notes: notes ?? order.notes,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, id));

      const existingJobs = await db
        .select()
        .from(fulfillmentJobs)
        .where(eq(fulfillmentJobs.orderId, id))
        .orderBy(desc(fulfillmentJobs.id));

      if (existingJobs[0]) {
        await db
          .update(fulfillmentJobs)
          .set({
            status,
            supplierTxId: supplierTxId || existingJobs[0].supplierTxId,
            errorMessage: status === 'failed' ? notes || 'Marked failed by admin' : null,
            processedByUserId: req.dbUser!.id,
            updatedAt: new Date(),
          })
          .where(eq(fulfillmentJobs.id, existingJobs[0].id));
      } else {
        await db.insert(fulfillmentJobs).values({
          orderId: id,
          idempotencyKey: `nx-manual-${order.orderCode}-${Date.now()}`,
          mode: 'manual',
          status,
          attemptCount: 1,
          supplierTxId: supplierTxId || null,
          errorMessage: status === 'failed' ? notes || 'Marked failed by admin' : null,
          processedByUserId: req.dbUser!.id,
        });
      }

      await writeAdminLog(req, 'MANUAL_FULFILLMENT_UPDATE', 'order', id, {
        orderCode: order.orderCode,
        status,
        supplierTxId,
        notes,
      });

      const [updated] = await db
        .select()
        .from(orders)
        .where(eq(orders.id, id))
        .limit(1);
      res.json({ order: updated });
    } catch (error) {
      console.error('Manual fulfillment update failed:', error);
      res.status(500).json({ error: 'Failed to update fulfillment.' });
    }
  }
);

adminRoutes.post('/orders/:id/retry', async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const result = await dispatchOrderFulfillment(id, { isRetry: true });
    await writeAdminLog(req, 'RETRY_FULFILLMENT', 'order', id, result);
    const [updated] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, id))
      .limit(1);
    res.json({ order: updated, result });
  } catch (error: unknown) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Retry failed.',
    });
  }
});

// 5. Supplier Management
const supplierSchema = z.object({
  name: z.string().trim().min(2).max(100),
  apiEndpoint: z.string().url(),
  authType: z.enum(['bearer', 'hmac', 'api_key']).default('bearer'),
  apiKey: z.string().trim().optional(),
  apiSecret: z.string().trim().optional(),
  isActive: z.boolean().default(true),
});

adminRoutes.get('/suppliers', async (_req: AuthRequest, res: Response) => {
  try {
    const rows = await db.select().from(suppliers).orderBy(asc(suppliers.id));
    res.json({
      suppliers: rows.map((s) => ({
        id: s.id,
        name: s.name,
        apiEndpoint: s.apiEndpoint,
        authType: s.authType,
        apiKeyMasked: maskSecret(decryptSecret(s.encryptedApiKey)),
        hasApiKey: Boolean(s.encryptedApiKey),
        hasApiSecret: Boolean(s.encryptedApiSecret),
        connectionStatus: s.connectionStatus,
        lastCheckedAt: s.lastCheckedAt,
        lastError: s.lastError,
        isActive: s.isActive,
        createdAt: s.createdAt,
      })),
    });
  } catch (error) {
    console.error('Admin suppliers failed:', error);
    res.status(500).json({ error: 'Failed to load suppliers.' });
  }
});

adminRoutes.post('/suppliers', async (req: AuthRequest, res: Response) => {
  try {
    const parsed = supplierSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid supplier details.' });
    }
    const d = parsed.data;
    const [created] = await db
      .insert(suppliers)
      .values({
        name: d.name,
        apiEndpoint: d.apiEndpoint,
        authType: d.authType,
        encryptedApiKey: d.apiKey ? encryptSecret(d.apiKey) : '',
        encryptedApiSecret: d.apiSecret ? encryptSecret(d.apiSecret) : '',
        connectionStatus: d.apiKey ? 'unconfigured' : 'unconfigured',
        isActive: d.isActive,
      })
      .returning();
    await writeAdminLog(req, 'CREATE_SUPPLIER', 'supplier', created.id, {
      name: created.name,
    });
    res.status(201).json({ supplier: created });
  } catch (error) {
    console.error('Create supplier failed:', error);
    res.status(500).json({ error: 'Failed to add supplier.' });
  }
});

adminRoutes.patch('/suppliers/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const parsed = supplierSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid supplier update.' });
    }
    const d = parsed.data;
    const updateValues: Record<string, unknown> = {};
    if (d.name !== undefined) updateValues.name = d.name;
    if (d.apiEndpoint !== undefined) updateValues.apiEndpoint = d.apiEndpoint;
    if (d.authType !== undefined) updateValues.authType = d.authType;
    if (d.isActive !== undefined) updateValues.isActive = d.isActive;
    if (d.apiKey) updateValues.encryptedApiKey = encryptSecret(d.apiKey);
    if (d.apiSecret) updateValues.encryptedApiSecret = encryptSecret(d.apiSecret);

    const [updated] = await db
      .update(suppliers)
      .set(updateValues)
      .where(eq(suppliers.id, id))
      .returning();
    if (!updated) {
      return res.status(404).json({ error: 'Supplier not found.' });
    }
    await writeAdminLog(req, 'UPDATE_SUPPLIER', 'supplier', id, { name: updated.name });
    res.json({ supplier: updated });
  } catch (error) {
    console.error('Update supplier failed:', error);
    res.status(500).json({ error: 'Failed to update supplier.' });
  }
});

adminRoutes.delete('/suppliers/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const [deleted] = await db
      .delete(suppliers)
      .where(eq(suppliers.id, id))
      .returning();
    if (!deleted) {
      return res.status(404).json({ error: 'Supplier not found.' });
    }
    await writeAdminLog(req, 'DELETE_SUPPLIER', 'supplier', id, { name: deleted.name });
    res.json({ deleted: true });
  } catch (error) {
    console.error('Delete supplier failed:', error);
    res.status(500).json({ error: 'Failed to delete supplier.' });
  }
});

adminRoutes.post('/suppliers/:id/test', async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const rows = await db
      .select()
      .from(suppliers)
      .where(eq(suppliers.id, id))
      .limit(1);
    const supplier = rows[0];
    if (!supplier) {
      return res.status(404).json({ error: 'Supplier not found.' });
    }

    const apiKey = decryptSecret(supplier.encryptedApiKey);
    let status: 'connected' | 'error' = 'error';
    let lastError: string | null = null;

    if (!apiKey) {
      lastError = 'No API key configured for this supplier.';
    } else {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const headers: Record<string, string> = {};
        if (supplier.authType === 'bearer') {
          headers['Authorization'] = `Bearer ${apiKey}`;
        } else {
          headers['X-API-Key'] = apiKey;
        }
        const ping = await fetch(supplier.apiEndpoint, {
          method: 'HEAD',
          headers,
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (ping.ok || ping.status === 405) {
          status = 'connected';
        } else {
          lastError = `Endpoint returned HTTP ${ping.status}`;
        }
      } catch (err: unknown) {
        lastError =
          err instanceof Error ? err.message : 'Unable to reach supplier endpoint';
      }
    }

    const [updated] = await db
      .update(suppliers)
      .set({
        connectionStatus: status,
        lastCheckedAt: new Date(),
        lastError,
      })
      .where(eq(suppliers.id, id))
      .returning();

    await writeAdminLog(req, 'TEST_SUPPLIER_CONNECTION', 'supplier', id, {
      status,
      lastError,
    });
    res.json({
      connectionStatus: updated.connectionStatus,
      lastCheckedAt: updated.lastCheckedAt,
      lastError: updated.lastError,
    });
  } catch (error) {
    console.error('Supplier test failed:', error);
    res.status(500).json({ error: 'Connection test failed.' });
  }
});

// 6. Promotions Management
const promotionSchema = z.object({
  title: z.string().trim().min(2).max(150),
  titleKm: z.string().trim().min(1).max(150),
  subtitle: z.string().trim().max(300).default(''),
  subtitleKm: z.string().trim().max(300).default(''),
  code: z.string().trim().max(32).nullable().optional(),
  discountType: z.enum(['percent', 'fixed']).default('percent'),
  discountValue: z.union([z.number().min(0), z.string()]).default(0),
  minOrderUsd: z.union([z.number().min(0), z.string()]).default(0),
  bannerType: z.enum(['offer', 'update']).default('offer'),
  isActive: z.boolean().default(true),
});

adminRoutes.get('/promotions', async (_req: AuthRequest, res: Response) => {
  try {
    const rows = await db.select().from(promotions).orderBy(desc(promotions.id));
    res.json({ promotions: rows });
  } catch (error) {
    console.error('Promotions fetch failed:', error);
    res.status(500).json({ error: 'Failed to load promotions.' });
  }
});

adminRoutes.post('/promotions', async (req: AuthRequest, res: Response) => {
  try {
    const parsed = promotionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid promotion data.' });
    }
    const d = parsed.data;
    const [created] = await db
      .insert(promotions)
      .values({
        ...d,
        code: d.code ? d.code.toUpperCase() : null,
        discountValue: Number(d.discountValue).toFixed(2),
        minOrderUsd: Number(d.minOrderUsd).toFixed(2),
      })
      .returning();
    await writeAdminLog(req, 'CREATE_PROMOTION', 'promotion', created.id, {
      title: created.title,
    });
    res.status(201).json({ promotion: created });
  } catch (error) {
    console.error('Create promotion failed:', error);
    res.status(500).json({ error: 'Failed to create promotion.' });
  }
});

adminRoutes.patch('/promotions/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const parsed = promotionSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid promotion update.' });
    }
    const d = parsed.data;
    const updateData: Record<string, unknown> = { ...d };
    if (d.code !== undefined) updateData.code = d.code ? d.code.toUpperCase() : null;
    if (d.discountValue !== undefined)
      updateData.discountValue = Number(d.discountValue).toFixed(2);
    if (d.minOrderUsd !== undefined)
      updateData.minOrderUsd = Number(d.minOrderUsd).toFixed(2);

    const [updated] = await db
      .update(promotions)
      .set(updateData)
      .where(eq(promotions.id, id))
      .returning();
    if (!updated) {
      return res.status(404).json({ error: 'Promotion not found.' });
    }
    await writeAdminLog(req, 'UPDATE_PROMOTION', 'promotion', id, updateData);
    res.json({ promotion: updated });
  } catch (error) {
    console.error('Update promotion failed:', error);
    res.status(500).json({ error: 'Failed to update promotion.' });
  }
});

adminRoutes.delete('/promotions/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const [deleted] = await db
      .delete(promotions)
      .where(eq(promotions.id, id))
      .returning();
    if (!deleted) {
      return res.status(404).json({ error: 'Promotion not found.' });
    }
    await writeAdminLog(req, 'DELETE_PROMOTION', 'promotion', id, {
      title: deleted.title,
    });
    res.json({ deleted: true });
  } catch (error) {
    console.error('Delete promotion failed:', error);
    res.status(500).json({ error: 'Failed to delete promotion.' });
  }
});

// 7. User Management
adminRoutes.get('/users', async (_req: AuthRequest, res: Response) => {
  try {
    const [userRows, orderStats] = await Promise.all([
      db.select().from(users).orderBy(desc(users.createdAt)),
      db
        .select({
          userId: orders.userId,
          orderCount: sql<number>`count(*)::int`,
          totalSpent: sql<number>`COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN total_usd ELSE 0 END), 0)::float`,
        })
        .from(orders)
        .groupBy(orders.userId),
    ]);

    const statMap = new Map<number, { orderCount: number; totalSpent: number }>();
    for (const s of orderStats) {
      if (s.userId) {
        statMap.set(s.userId, {
          orderCount: s.orderCount,
          totalSpent: s.totalSpent,
        });
      }
    }

    res.json({
      users: userRows.map((u) => ({
        ...u,
        orderCount: statMap.get(u.id)?.orderCount ?? 0,
        totalSpentUsd: statMap.get(u.id)?.totalSpent ?? 0,
      })),
    });
  } catch (error) {
    console.error('Admin users failed:', error);
    res.status(500).json({ error: 'Failed to load users.' });
  }
});

const userUpdateSchema = z.object({
  role: z.enum(['customer', 'admin']).optional(),
  isActive: z.boolean().optional(),
  permissions: z.array(z.string()).optional(),
});

adminRoutes.patch('/users/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    const parsed = userUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid user update.' });
    }
    if (req.dbUser?.id === id && parsed.data.role === 'customer') {
      return res.status(400).json({
        error: 'You cannot demote your own currently signed-in admin account.',
      });
    }
    const [updated] = await db
      .update(users)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    if (!updated) {
      return res.status(404).json({ error: 'User not found.' });
    }
    await writeAdminLog(req, 'UPDATE_USER', 'user', id, parsed.data);
    res.json({ user: updated });
  } catch (error) {
    console.error('Update user failed:', error);
    res.status(500).json({ error: 'Failed to update user.' });
  }
});

// 8. Gateway & Storefront Settings + Logs + Backup
adminRoutes.get('/settings', async (_req: AuthRequest, res: Response) => {
  try {
    const rows = await db.select().from(settings).orderBy(asc(settings.key));
    res.json({
      settings: rows.map((s) => ({
        key: s.key,
        value: s.isSecret ? maskSecret(decryptSecret(s.value)) : s.value,
        hasValue: Boolean(s.value),
        isSecret: s.isSecret,
        description: s.description,
        updatedAt: s.updatedAt,
      })),
    });
  } catch (error) {
    console.error('Load settings failed:', error);
    res.status(500).json({ error: 'Failed to load settings.' });
  }
});

adminRoutes.put('/settings', async (req: AuthRequest, res: Response) => {
  try {
    const entries = req.body?.settings as Array<{
      key: string;
      value: string;
      isSecret?: boolean;
    }>;
    if (!Array.isArray(entries)) {
      return res.status(400).json({ error: 'Invalid settings payload.' });
    }

    for (const item of entries) {
      if (!item.key) continue;
      // Do not overwrite secret with masked placeholder
      if (item.isSecret && item.value.startsWith('••••')) continue;

      const existing = await db
        .select()
        .from(settings)
        .where(eq(settings.key, item.key))
        .limit(1);

      const isSecret = existing[0]?.isSecret ?? Boolean(item.isSecret);
      const storedValue = isSecret && item.value ? encryptSecret(item.value) : item.value;

      await db
        .insert(settings)
        .values({
          key: item.key,
          value: storedValue,
          isSecret,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: settings.key,
          set: {
            value: storedValue,
            updatedAt: new Date(),
          },
        });
    }

    await writeAdminLog(req, 'UPDATE_SETTINGS', 'settings', 'global', {
      keysUpdated: entries.map((e) => e.key),
    });
    res.json({ saved: true });
  } catch (error) {
    console.error('Save settings failed:', error);
    res.status(500).json({ error: 'Failed to update settings.' });
  }
});

adminRoutes.get('/logs', async (_req: AuthRequest, res: Response) => {
  try {
    const rows = await db
      .select()
      .from(adminLogs)
      .orderBy(desc(adminLogs.createdAt))
      .limit(100);
    res.json({ logs: rows });
  } catch (error) {
    console.error('Admin logs failed:', error);
    res.status(500).json({ error: 'Failed to load admin logs.' });
  }
});

adminRoutes.get('/backup', async (req: AuthRequest, res: Response) => {
  try {
    const [allGames, allProducts, allOrders, allPromos, allUsers] =
      await Promise.all([
        db.select().from(games),
        db.select().from(products),
        db.select().from(orders),
        db.select().from(promotions),
        db.select({
          id: users.id,
          email: users.email,
          displayName: users.displayName,
          role: users.role,
          isActive: users.isActive,
          createdAt: users.createdAt,
        }).from(users),
      ]);

    await writeAdminLog(req, 'EXPORT_DATABASE_BACKUP', 'system', 'backup', {
      ordersCount: allOrders.length,
    });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="nexus-topup-backup-${new Date().toISOString().slice(0, 10)}.json"`
    );
    res.send(
      JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          games: allGames,
          products: allProducts,
          promotions: allPromos,
          orders: allOrders,
          users: allUsers,
        },
        null,
        2
      )
    );
  } catch (error) {
    console.error('Backup export failed:', error);
    res.status(500).json({ error: 'Failed to export database backup.' });
  }
});
