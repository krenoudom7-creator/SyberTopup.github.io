import crypto from 'node:crypto';
import { Router, Request, Response } from 'express';
import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.ts';
import {
  fulfillmentJobs,
  games,
  orders,
  payments,
  products,
  promotions,
  settings,
} from '../db/schema.ts';
import { AuthRequest, optionalAuth, requireAuth } from '../middleware/auth.ts';
import { decryptSecret } from '../lib/crypto.ts';
import {
  buildBakongKhqrSession,
  verifyBakongTransactionByMd5,
} from '../lib/payments/bakong.ts';
import {
  buildAbaPayWayPurchaseRequest,
  verifyAbaPayWayCallbackSignature,
} from '../lib/payments/abaPayway.ts';
import { dispatchOrderFulfillment } from '../lib/fulfillment.ts';

export const publicRoutes = Router();

async function getSettingsMap(): Promise<Record<string, string>> {
  const rows = await db.select().from(settings);
  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.key] = row.isSecret ? decryptSecret(row.value) : row.value;
  }
  return map;
}

publicRoutes.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'nexus-topup' });
});

publicRoutes.get('/auth/me', requireAuth, (req: AuthRequest, res: Response) => {
  res.json({ user: req.dbUser });
});

publicRoutes.get('/storefront', async (_req: Request, res: Response) => {
  try {
    const [activeGames, activeProducts, activePromos, settingsMap] =
      await Promise.all([
        db
          .select()
          .from(games)
          .where(eq(games.isActive, true))
          .orderBy(asc(games.sortOrder), asc(games.id)),
        db.select().from(products).where(eq(products.isActive, true)),
        db
          .select()
          .from(promotions)
          .where(eq(promotions.isActive, true))
          .orderBy(desc(promotions.id)),
        getSettingsMap(),
      ]);

    const minPriceByGame = new Map<number, number>();
    const countByGame = new Map<number, number>();
    for (const prod of activeProducts) {
      const base = Number(prod.priceUsd);
      const disc = Number(prod.discountPercent || 0);
      const effective = Number((base * (1 - disc / 100)).toFixed(2));
      const curr = minPriceByGame.get(prod.gameId);
      if (curr === undefined || effective < curr) {
        minPriceByGame.set(prod.gameId, effective);
      }
      countByGame.set(prod.gameId, (countByGame.get(prod.gameId) ?? 0) + 1);
    }

    const enrichedGames = activeGames.map((g) => ({
      ...g,
      startingPriceUsd: minPriceByGame.get(g.id) ?? 0,
      packageCount: countByGame.get(g.id) ?? 0,
    }));

    const exchangeRateKhr = Number(settingsMap.exchange_rate_khr || 4050);
    const bakongAccount =
      process.env.BAKONG_ACCOUNT_ID || settingsMap.bakong_account_id || '';
    const bakongToken =
      process.env.BAKONG_API_TOKEN || settingsMap.bakong_api_token || '';
    const abaMerchantId =
      process.env.ABA_MERCHANT_ID || settingsMap.aba_merchant_id || '';
    const abaApiKey = process.env.ABA_API_KEY || settingsMap.aba_api_key || '';

    res.json({
      games: enrichedGames,
      offers: activePromos.filter((p) => p.bannerType === 'offer'),
      updates: activePromos.filter((p) => p.bannerType === 'update'),
      config: {
        exchangeRateKhr,
        supportTelegram: settingsMap.support_telegram || '@nexustopup_kh',
        supportEmail: settingsMap.support_email || 'support@nexustopup.kh',
        bakongConfigured: Boolean(bakongAccount && bakongToken),
        abaConfigured: Boolean(abaMerchantId && abaApiKey),
      },
    });
  } catch (error) {
    console.error('Storefront load failed:', error);
    res.status(500).json({ error: 'Unable to load storefront catalog.' });
  }
});

publicRoutes.get('/games', async (req: Request, res: Response) => {
  try {
    const search = String(req.query.search || '').trim();
    const category = String(req.query.category || '').trim();
    const popularOnly = req.query.popular === 'true';

    const conditions = [eq(games.isActive, true)];
    if (category && category !== 'all') {
      conditions.push(eq(games.category, category));
    }
    if (popularOnly) {
      conditions.push(eq(games.isPopular, true));
    }
    if (search) {
      const pattern = `%${search}%`;
      conditions.push(
        or(
          ilike(games.name, pattern),
          ilike(games.nameKm, pattern),
          ilike(games.currencyName, pattern),
          ilike(games.category, pattern)
        )!
      );
    }

    const [rows, activeProducts] = await Promise.all([
      db
        .select()
        .from(games)
        .where(and(...conditions))
        .orderBy(asc(games.sortOrder), asc(games.id)),
      db.select().from(products).where(eq(products.isActive, true)),
    ]);

    const minPriceByGame = new Map<number, number>();
    const countByGame = new Map<number, number>();
    for (const prod of activeProducts) {
      const effective = Number(
        (
          Number(prod.priceUsd) *
          (1 - Number(prod.discountPercent || 0) / 100)
        ).toFixed(2)
      );
      const curr = minPriceByGame.get(prod.gameId);
      if (curr === undefined || effective < curr) {
        minPriceByGame.set(prod.gameId, effective);
      }
      countByGame.set(prod.gameId, (countByGame.get(prod.gameId) ?? 0) + 1);
    }

    res.json({
      games: rows.map((g) => ({
        ...g,
        startingPriceUsd: minPriceByGame.get(g.id) ?? 0,
        packageCount: countByGame.get(g.id) ?? 0,
      })),
    });
  } catch (error) {
    console.error('Games query failed:', error);
    res.status(500).json({ error: 'Unable to fetch games.' });
  }
});

publicRoutes.get('/games/:slug', async (req: Request, res: Response) => {
  try {
    const slug = String(req.params.slug || '');
    const gameRows = await db
      .select()
      .from(games)
      .where(and(eq(games.slug, slug), eq(games.isActive, true)))
      .limit(1);

    const game = gameRows[0];
    if (!game) {
      return res.status(404).json({ error: 'Game not found.' });
    }

    const packageRows = await db
      .select()
      .from(products)
      .where(and(eq(products.gameId, game.id), eq(products.isActive, true)))
      .orderBy(asc(products.sortOrder), asc(products.priceUsd));

    res.json({ game, products: packageRows });
  } catch (error) {
    console.error('Game detail failed:', error);
    res.status(500).json({ error: 'Unable to load game packages.' });
  }
});

const verifyPlayerSchema = z.object({
  gameSlug: z.string().trim().min(1).max(64),
  playerId: z.string().trim().min(2).max(80),
  serverId: z.string().trim().max(60).optional().nullable(),
});

publicRoutes.post('/games/verify-player', async (req: Request, res: Response) => {
  try {
    const parsed = verifyPlayerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        verified: false,
        configured: true,
        error: 'Please enter a valid Player ID.',
      });
    }

    const { gameSlug, playerId, serverId } = parsed.data;
    const gameRows = await db
      .select()
      .from(games)
      .where(and(eq(games.slug, gameSlug), eq(games.isActive, true)))
      .limit(1);
    const game = gameRows[0];
    if (!game) {
      return res.status(404).json({
        verified: false,
        configured: true,
        error: 'Game not found.',
      });
    }

    if (game.requiresServerId && !serverId?.trim()) {
      return res.status(400).json({
        verified: false,
        configured: true,
        error: `${game.serverIdLabel || 'Server ID'} is required for ${game.name}.`,
      });
    }

    // 1. Official Roblox Public Users API lookup
    if (game.slug === 'roblox') {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const rbRes = await fetch('https://users.roblox.com/v1/usernames/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            usernames: [playerId],
            excludeBannedUsers: false,
          }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (rbRes.ok) {
          const rbData = (await rbRes.json()) as {
            data?: Array<{
              id: number;
              name: string;
              displayName: string;
            }>;
          };
          const matched = rbData.data?.[0];
          if (matched) {
            return res.json({
              verified: true,
              configured: true,
              playerName: `${matched.displayName} (@${matched.name})`,
              accountId: String(matched.id),
            });
          }
          return res.status(404).json({
            verified: false,
            configured: true,
            error: 'Roblox username not found.',
          });
        }
      } catch (err) {
        clearTimeout(timeout);
        console.warn('Roblox lookup failed:', (err as Error).message);
      }
    }

    // 2. Configurable External Player Checker API (from env or Admin Settings)
    const settingsMap = await getSettingsMap();
    const checkerUrl =
      process.env.PLAYER_CHECKER_API_URL ||
      settingsMap.player_checker_api_url ||
      '';
    const checkerKey =
      process.env.PLAYER_CHECKER_API_KEY ||
      settingsMap.player_checker_api_key ||
      '';

    if (!checkerUrl) {
      return res.json({
        verified: false,
        configured: false,
        message:
          'Live nickname checker API is not configured yet. Add player_checker_api_url & player_checker_api_key in Admin Settings to resolve in-game names.',
      });
    }

    const hasPlaceholders =
      checkerUrl.includes('{game}') ||
      checkerUrl.includes('{playerId}') ||
      checkerUrl.includes('{serverId}');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (checkerKey) {
        headers['x-api-key'] = checkerKey;
        headers['Authorization'] = `Bearer ${checkerKey}`;
      }

      let apiRes: globalThis.Response;
      if (hasPlaceholders) {
        const resolvedUrl = checkerUrl
          .replace('{game}', encodeURIComponent(game.slug))
          .replace('{playerId}', encodeURIComponent(playerId))
          .replace('{serverId}', encodeURIComponent(serverId || ''));
        apiRes = await fetch(resolvedUrl, { method: 'GET', headers, signal: controller.signal });
      } else {
        apiRes = await fetch(checkerUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            game: game.slug,
            playerId,
            serverId: serverId || undefined,
          }),
          signal: controller.signal,
        });
      }
      clearTimeout(timeout);

      const payload = (await apiRes.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      const nested = (payload.data || payload.result || payload) as Record<
        string,
        unknown
      >;
      const resolvedName =
        nested.nickname ||
        nested.username ||
        nested.playerName ||
        nested.ign ||
        nested.name;

      if (apiRes.ok && typeof resolvedName === 'string' && resolvedName.trim()) {
        return res.json({
          verified: true,
          configured: true,
          playerName: resolvedName.trim(),
        });
      }

      return res.status(404).json({
        verified: false,
        configured: true,
        error:
          String(
            payload.message || payload.error || 'Player ID could not be found.'
          ),
      });
    } catch (err) {
      clearTimeout(timeout);
      const errMsg =
        err instanceof Error ? err.message : 'Checker API unreachable';
      return res.status(502).json({
        verified: false,
        configured: true,
        error: `Player verification service error: ${errMsg}`,
      });
    }
  } catch (error) {
    console.error('Player verification failed:', error);
    res.status(500).json({
      verified: false,
      configured: true,
      error: 'Unable to verify player account.',
    });
  }
});

const promoSchema = z.object({
  code: z.string().trim().min(2).max(32),
  subtotalUsd: z.number().positive(),
});

publicRoutes.post('/promotions/validate', async (req: Request, res: Response) => {
  try {
    const parsed = promoSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid promo code format.' });
    }

    const codeUpper = parsed.data.code.toUpperCase();
    const rows = await db
      .select()
      .from(promotions)
      .where(and(eq(promotions.code, codeUpper), eq(promotions.isActive, true)))
      .limit(1);

    const promo = rows[0];
    if (!promo) {
      return res.status(404).json({ error: 'Promo code is invalid or expired.' });
    }

    const now = new Date();
    if (promo.startsAt && now < promo.startsAt) {
      return res.status(400).json({ error: 'Promotion has not started yet.' });
    }
    if (promo.endsAt && now > promo.endsAt) {
      return res.status(400).json({ error: 'Promotion has expired.' });
    }

    const minOrder = Number(promo.minOrderUsd || 0);
    if (parsed.data.subtotalUsd < minOrder) {
      return res.status(400).json({
        error: `Minimum order of $${minOrder.toFixed(2)} required for this code.`,
      });
    }

    let discountUsd = 0;
    if (promo.discountType === 'percent') {
      discountUsd = Number(
        ((parsed.data.subtotalUsd * Number(promo.discountValue)) / 100).toFixed(2)
      );
    } else {
      discountUsd = Math.min(
        parsed.data.subtotalUsd,
        Number(promo.discountValue)
      );
    }

    res.json({
      valid: true,
      discountUsd,
      promotion: {
        code: promo.code,
        title: promo.title,
        titleKm: promo.titleKm,
        discountType: promo.discountType,
        discountValue: Number(promo.discountValue),
      },
    });
  } catch (error) {
    console.error('Promo validation error:', error);
    res.status(500).json({ error: 'Unable to validate promo code.' });
  }
});

const createOrderSchema = z.object({
  gameId: z.number().int().positive(),
  productId: z.number().int().positive(),
  playerId: z.string().trim().min(2).max(80),
  serverId: z.string().trim().max(60).optional().nullable(),
  customerEmail: z.string().email().optional().or(z.literal('')),
  promoCode: z.string().trim().max(32).optional().nullable(),
  paymentMethod: z.enum(['bakong_khqr', 'aba_payway']),
});

publicRoutes.post(
  '/orders',
  optionalAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const parsed = createOrderSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Please check your Player ID and selected package.',
          details: parsed.error.flatten(),
        });
      }

      const data = parsed.data;
      const [gameRows, productRows, settingsMap] = await Promise.all([
        db
          .select()
          .from(games)
          .where(and(eq(games.id, data.gameId), eq(games.isActive, true)))
          .limit(1),
        db
          .select()
          .from(products)
          .where(
            and(
              eq(products.id, data.productId),
              eq(products.gameId, data.gameId),
              eq(products.isActive, true)
            )
          )
          .limit(1),
        getSettingsMap(),
      ]);

      const game = gameRows[0];
      const product = productRows[0];
      if (!game || !product) {
        return res.status(404).json({ error: 'Selected game or package unavailable.' });
      }

      if (game.requiresServerId && !data.serverId?.trim()) {
        return res.status(400).json({
          error: `${game.serverIdLabel || 'Server ID'} is required for ${game.name}.`,
        });
      }

      const basePrice = Number(product.priceUsd);
      const pkgDiscount = Number(product.discountPercent || 0);
      const subtotalUsd = Number((basePrice * (1 - pkgDiscount / 100)).toFixed(2));

      let promoDiscountUsd = 0;
      let appliedPromoCode: string | null = null;
      if (data.promoCode?.trim()) {
        const codeUpper = data.promoCode.trim().toUpperCase();
        const promoRows = await db
          .select()
          .from(promotions)
          .where(and(eq(promotions.code, codeUpper), eq(promotions.isActive, true)))
          .limit(1);
        const promo = promoRows[0];
        if (promo && subtotalUsd >= Number(promo.minOrderUsd || 0)) {
          appliedPromoCode = promo.code;
          promoDiscountUsd =
            promo.discountType === 'percent'
              ? Number(
                  ((subtotalUsd * Number(promo.discountValue)) / 100).toFixed(2)
                )
              : Math.min(subtotalUsd, Number(promo.discountValue));
        }
      }

      const totalUsd = Math.max(0.01, Number((subtotalUsd - promoDiscountUsd).toFixed(2)));
      const exchangeRateKhr = Number(settingsMap.exchange_rate_khr || 4050);
      const totalKhr = Math.round(totalUsd * exchangeRateKhr);

      const dateTag = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const randHex = crypto.randomBytes(3).toString('hex').toUpperCase();
      const orderCode = `NX-${dateTag}-${randHex}`;
      const transactionRef = `TXN-${dateTag}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

      let khqrPayload: string | null = null;
      let khqrMd5: string | null = null;
      let qrDataUrl: string | null = null;
      let abaHash: string | null = null;
      let abaFormFields: Record<string, string> | null = null;
      let abaCheckoutUrl: string | null = null;
      let paymentGatewayStatus: 'pending' | 'unconfigured' = 'pending';
      let providerMessage = '';

      if (data.paymentMethod === 'bakong_khqr') {
        const bakongAccount =
          process.env.BAKONG_ACCOUNT_ID || settingsMap.bakong_account_id || '';
        const bakongToken =
          process.env.BAKONG_API_TOKEN || settingsMap.bakong_api_token || '';
        const merchantName = settingsMap.bakong_merchant_name || 'NEXUS TOPUP';
        const merchantCity = settingsMap.bakong_merchant_city || 'Phnom Penh';

        if (bakongAccount) {
          const khqr = await buildBakongKhqrSession({
            bakongAccountId: bakongAccount,
            merchantName,
            merchantCity,
            amountUsd: totalUsd,
            orderCode,
          });
          khqrPayload = khqr.khqrPayload;
          khqrMd5 = khqr.khqrMd5;
          qrDataUrl = khqr.qrDataUrl;
        }

        if (!bakongAccount || !bakongToken) {
          paymentGatewayStatus = 'unconfigured';
          providerMessage =
            'Bakong KHQR merchant credentials are not configured yet. Configure BAKONG_ACCOUNT_ID and BAKONG_API_TOKEN in Admin Settings to enable live KHQR verification.';
        } else {
          providerMessage = 'Scan QR with Bakong or any Cambodian mobile banking app.';
        }
      } else {
        const abaMerchantId =
          process.env.ABA_MERCHANT_ID || settingsMap.aba_merchant_id || '';
        const abaApiKey = process.env.ABA_API_KEY || settingsMap.aba_api_key || '';
        const abaEnv =
          (process.env.ABA_ENV || settingsMap.aba_env || 'sandbox') === 'production'
            ? 'production'
            : 'sandbox';
        const appUrl =
          process.env.APP_URL || `${req.protocol}://${req.get('host')}`;

        if (abaMerchantId && abaApiKey) {
          const abaReq = buildAbaPayWayPurchaseRequest({
            merchantId: abaMerchantId,
            apiKey: abaApiKey,
            tranId: orderCode,
            amountUsd: totalUsd,
            items: [
              {
                name: `${game.name} - ${product.name}`,
                quantity: 1,
                price: totalUsd,
              },
            ],
            email: data.customerEmail || req.dbUser?.email,
            returnUrl: `${appUrl}/api/payments/aba/callback`,
            cancelUrl: `${appUrl}/?view=orders&order=${orderCode}`,
            continueSuccessUrl: `${appUrl}/?view=orders&order=${orderCode}`,
            env: abaEnv,
          });
          abaHash = abaReq.hash;
          abaFormFields = abaReq.formFields;
          abaCheckoutUrl = abaReq.endpointUrl;
          providerMessage = 'Ready to redirect to ABA PayWay secure checkout.';
        } else {
          paymentGatewayStatus = 'unconfigured';
          providerMessage =
            'ABA PayWay merchant credentials are not configured yet. Configure ABA_MERCHANT_ID and ABA_API_KEY in Admin Settings to enable live ABA checkout.';
        }
      }

      const created = await db.transaction(async (tx) => {
        const [newOrder] = await tx
          .insert(orders)
          .values({
            orderCode,
            userId: req.dbUser?.id ?? null,
            gameId: game.id,
            productId: product.id,
            playerId: data.playerId,
            serverId: data.serverId?.trim() || null,
            customerEmail: data.customerEmail || req.dbUser?.email || null,
            gameNameSnapshot: game.name,
            productNameSnapshot: product.name,
            currencyAmountSnapshot: product.currencyAmount + product.bonusAmount,
            subtotalUsd: subtotalUsd.toFixed(2),
            discountUsd: promoDiscountUsd.toFixed(2),
            totalUsd: totalUsd.toFixed(2),
            totalKhr,
            promoCode: appliedPromoCode,
            paymentMethod: data.paymentMethod,
            paymentStatus: 'pending',
            fulfillmentMode: product.fulfillmentType,
            fulfillmentStatus: 'queued',
          })
          .returning();

        const [newPayment] = await tx
          .insert(payments)
          .values({
            orderId: newOrder.id,
            provider: data.paymentMethod,
            transactionRef,
            khqrPayload,
            khqrMd5,
            abaHash,
            abaCheckoutUrl,
            amountUsd: totalUsd.toFixed(2),
            amountKhr: totalKhr,
            currency: 'USD',
            status: paymentGatewayStatus,
            providerMessage,
            expiresAt: new Date(Date.now() + 15 * 60 * 1000),
          })
          .returning();

        return { order: newOrder, payment: newPayment };
      });

      res.status(201).json({
        order: created.order,
        payment: {
          ...created.payment,
          qrDataUrl,
          abaFormFields,
        },
      });
    } catch (error) {
      console.error('Order creation failed:', error);
      res.status(500).json({ error: 'Failed to create top-up order.' });
    }
  }
);

publicRoutes.get('/orders/mine', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(50, Math.max(5, Number(req.query.limit || 15)));
    const search = String(req.query.search || '').trim();
    const offset = (page - 1) * limit;

    const conditions = [eq(orders.userId, req.dbUser!.id)];
    if (search) {
      const pattern = `%${search}%`;
      conditions.push(
        or(
          ilike(orders.orderCode, pattern),
          ilike(orders.playerId, pattern),
          ilike(orders.gameNameSnapshot, pattern)
        )!
      );
    }

    const [rows, countRes] = await Promise.all([
      db
        .select()
        .from(orders)
        .where(and(...conditions))
        .orderBy(desc(orders.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(orders)
        .where(and(...conditions)),
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
      total: countRes[0]?.count ?? 0,
      page,
      limit,
    });
  } catch (error) {
    console.error('Order history fetch failed:', error);
    res.status(500).json({ error: 'Unable to load your order history.' });
  }
});

publicRoutes.get(
  '/orders/track',
  optionalAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const orderCode = String(req.query.orderCode || '').trim();
      const playerId = String(req.query.playerId || '').trim();

      if (!orderCode) {
        return res.status(400).json({ error: 'Order ID is required.' });
      }

      const orderRows = await db
        .select()
        .from(orders)
        .where(eq(orders.orderCode, orderCode))
        .limit(1);

      const order = orderRows[0];
      if (!order) {
        return res.status(404).json({ error: 'Order not found.' });
      }

      const isOwner = req.dbUser && order.userId === req.dbUser.id;
      const isAdmin = req.dbUser?.role === 'admin';
      if (!isOwner && !isAdmin) {
        if (!playerId || order.playerId.toLowerCase() !== playerId.toLowerCase()) {
          return res.status(403).json({
            error: 'Player ID does not match this Order ID.',
          });
        }
      }

      const [paymentRows, jobRows] = await Promise.all([
        db.select().from(payments).where(eq(payments.orderId, order.id)).limit(1),
        db
          .select()
          .from(fulfillmentJobs)
          .where(eq(fulfillmentJobs.orderId, order.id))
          .orderBy(desc(fulfillmentJobs.id)),
      ]);

      res.json({
        order,
        payment: paymentRows[0] ?? null,
        jobs: jobRows,
      });
    } catch (error) {
      console.error('Track order failed:', error);
      res.status(500).json({ error: 'Unable to look up order.' });
    }
  }
);

publicRoutes.get(
  '/payments/:orderCode/verify',
  async (req: Request, res: Response) => {
    try {
      const orderCode = String(req.params.orderCode || '').trim();
      const orderRows = await db
        .select()
        .from(orders)
        .where(eq(orders.orderCode, orderCode))
        .limit(1);
      const order = orderRows[0];
      if (!order) {
        return res.status(404).json({ error: 'Order not found.' });
      }

      const paymentRows = await db
        .select()
        .from(payments)
        .where(eq(payments.orderId, order.id))
        .limit(1);
      const payment = paymentRows[0];
      if (!payment) {
        return res.status(404).json({ error: 'Payment session not found.' });
      }

      if (order.paymentStatus === 'paid' && payment.status === 'verified') {
        return res.json({
          paid: true,
          configured: true,
          status: 'verified',
          message: 'Payment already verified.',
          order,
          payment,
        });
      }

      if (payment.provider === 'bakong_khqr') {
        const settingsMap = await getSettingsMap();
        const bakongToken =
          process.env.BAKONG_API_TOKEN || settingsMap.bakong_api_token || '';
        const bakongEnv =
          (process.env.BAKONG_ENV || settingsMap.bakong_env || 'production') === 'sit'
            ? 'sit'
            : 'production';

        if (!payment.khqrMd5 || !bakongToken) {
          return res.json({
            paid: false,
            configured: false,
            status: 'unconfigured',
            message:
              'Bakong Open API credentials are not configured. Payment cannot be auto-verified until credentials are added in Admin Settings.',
            order,
            payment,
          });
        }

        const result = await verifyBakongTransactionByMd5(
          payment.khqrMd5,
          bakongToken,
          bakongEnv
        );

        if (result.paid) {
          await db
            .update(payments)
            .set({
              status: 'verified',
              providerMessage: result.message,
              providerResponse: result.raw ?? null,
              verifiedAt: new Date(),
            })
            .where(eq(payments.id, payment.id));

          await db
            .update(orders)
            .set({
              paymentStatus: 'paid',
              updatedAt: new Date(),
            })
            .where(eq(orders.id, order.id));

          await dispatchOrderFulfillment(order.id);
          const [updatedOrder] = await db
            .select()
            .from(orders)
            .where(eq(orders.id, order.id))
            .limit(1);

          return res.json({
            paid: true,
            configured: true,
            status: 'verified',
            message: result.message,
            order: updatedOrder,
            payment: { ...payment, status: 'verified' },
          });
        }

        return res.json({
          paid: false,
          configured: result.configured,
          status: payment.status,
          message: result.message,
          order,
          payment,
        });
      }

      // For ABA PayWay, verification occurs via signed callback webhook
      return res.json({
        paid: false,
        configured: payment.status !== 'unconfigured',
        status: payment.status,
        message:
          payment.providerMessage ||
          'Awaiting ABA PayWay payment confirmation callback.',
        order,
        payment,
      });
    } catch (error) {
      console.error('Payment verification error:', error);
      res.status(500).json({ error: 'Payment verification check failed.' });
    }
  }
);

publicRoutes.post(
  '/payments/aba/callback',
  async (req: Request, res: Response) => {
    try {
      const settingsMap = await getSettingsMap();
      const abaApiKey = process.env.ABA_API_KEY || settingsMap.aba_api_key || '';
      const signature = req.header('X-PayWay-HMAC-SHA512');
      const body = (req.body || {}) as Record<string, unknown>;

      if (!abaApiKey) {
        return res.status(503).json({
          error: 'ABA PayWay secret key is not configured on server.',
        });
      }

      const valid = verifyAbaPayWayCallbackSignature(body, signature, abaApiKey);
      if (!valid) {
        return res.status(401).json({ error: 'Invalid PayWay HMAC signature.' });
      }

      const tranId = String(body.tran_id || '');
      const statusVal = String(body.status ?? '');
      if (!tranId) {
        return res.status(400).json({ error: 'Missing tran_id in callback.' });
      }

      const orderRows = await db
        .select()
        .from(orders)
        .where(eq(orders.orderCode, tranId))
        .limit(1);
      const order = orderRows[0];
      if (!order) {
        return res.status(404).json({ error: 'Order not found.' });
      }

      const isApproved = statusVal === '0' || statusVal.toUpperCase() === 'APPROVED';

      await db
        .update(payments)
        .set({
          status: isApproved ? 'verified' : 'failed',
          providerMessage: isApproved
            ? 'ABA PayWay payment verified via signed callback.'
            : `ABA PayWay status: ${statusVal}`,
          providerResponse: body,
          verifiedAt: isApproved ? new Date() : null,
        })
        .where(eq(payments.orderId, order.id));

      await db
        .update(orders)
        .set({
          paymentStatus: isApproved ? 'paid' : 'failed',
          updatedAt: new Date(),
        })
        .where(eq(orders.id, order.id));

      if (isApproved) {
        await dispatchOrderFulfillment(order.id);
      }

      res.json({ received: true, verified: isApproved });
    } catch (error) {
      console.error('ABA callback handling error:', error);
      res.status(500).json({ error: 'Callback processing failed.' });
    }
  }
);
