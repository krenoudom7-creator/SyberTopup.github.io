import crypto from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  fulfillmentJobs,
  orders,
  products,
  suppliers,
} from '../db/schema.ts';
import { decryptSecret } from './crypto.ts';

export async function dispatchOrderFulfillment(
  orderId: number,
  options?: { isRetry?: boolean }
) {
  const orderRows = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  const order = orderRows[0];
  if (!order) {
    throw new Error('Order not found for fulfillment.');
  }
  if (order.paymentStatus !== 'paid') {
    throw new Error('Payment must be verified before fulfilling top-up.');
  }

  // Prevent duplicate top-up if already completed or actively processing
  if (order.fulfillmentStatus === 'completed') {
    return { status: 'completed', message: 'Order already fulfilled.' };
  }

  const existingJobs = await db
    .select()
    .from(fulfillmentJobs)
    .where(eq(fulfillmentJobs.orderId, order.id))
    .orderBy(desc(fulfillmentJobs.id));

  if (
    !options?.isRetry &&
    existingJobs.some((j) => j.status === 'completed' || j.status === 'processing')
  ) {
    return {
      status: order.fulfillmentStatus,
      message: 'Fulfillment job already active or completed.',
    };
  }

  const productRows = await db
    .select()
    .from(products)
    .where(eq(products.id, order.productId))
    .limit(1);
  const product = productRows[0];

  const attemptNumber = existingJobs.length + 1;
  if (attemptNumber > 3 && options?.isRetry) {
    throw new Error('Maximum automatic retry attempts (3) reached.');
  }

  const idempotencyKey = `nx-${order.orderCode}-attempt-${attemptNumber}`;
  const mode =
    product?.fulfillmentType === 'automatic' && product?.supplierId
      ? 'automatic'
      : 'manual';

  if (mode === 'manual' || !product?.supplierId) {
    const existingQueued = existingJobs.find((j) => j.status === 'queued');
    if (!existingQueued) {
      await db.insert(fulfillmentJobs).values({
        orderId: order.id,
        supplierId: product?.supplierId ?? null,
        idempotencyKey,
        mode: 'manual',
        status: 'queued',
        attemptCount: attemptNumber,
      });
    }
    await db
      .update(orders)
      .set({
        fulfillmentMode: 'manual',
        fulfillmentStatus: 'queued',
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id));

    return {
      status: 'queued',
      mode: 'manual',
      message: 'Queued for Admin Manual Top-Up.',
    };
  }

  // Automatic Supplier API Dispatch
  const supplierRows = await db
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.id, product.supplierId), eq(suppliers.isActive, true)))
    .limit(1);
  const supplier = supplierRows[0];

  if (!supplier) {
    await db.insert(fulfillmentJobs).values({
      orderId: order.id,
      supplierId: product.supplierId,
      idempotencyKey,
      mode: 'manual',
      status: 'queued',
      attemptCount: attemptNumber,
      errorMessage: 'Assigned supplier is inactive or missing; routed to manual queue.',
    });
    await db
      .update(orders)
      .set({
        fulfillmentMode: 'manual',
        fulfillmentStatus: 'queued',
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id));

    return {
      status: 'queued',
      mode: 'manual',
      message: 'Supplier inactive; routed to manual queue.',
    };
  }

  const apiKey = decryptSecret(supplier.encryptedApiKey);
  const apiSecret = decryptSecret(supplier.encryptedApiSecret);

  if (!apiKey || !supplier.apiEndpoint) {
    await db.insert(fulfillmentJobs).values({
      orderId: order.id,
      supplierId: supplier.id,
      idempotencyKey,
      mode: 'automatic',
      status: 'failed',
      attemptCount: attemptNumber,
      errorMessage: 'Supplier API credentials are not configured.',
    });
    await db
      .update(orders)
      .set({
        fulfillmentMode: 'automatic',
        fulfillmentStatus: 'failed',
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id));
    return {
      status: 'failed',
      mode: 'automatic',
      message: 'Supplier API credentials missing.',
    };
  }

  const [job] = await db
    .insert(fulfillmentJobs)
    .values({
      orderId: order.id,
      supplierId: supplier.id,
      idempotencyKey,
      mode: 'automatic',
      status: 'processing',
      attemptCount: attemptNumber,
    })
    .returning();

  await db
    .update(orders)
    .set({
      fulfillmentMode: 'automatic',
      fulfillmentStatus: 'processing',
      updatedAt: new Date(),
    })
    .where(eq(orders.id, order.id));

  const payload = {
    orderCode: order.orderCode,
    idempotencyKey,
    productCode: product.supplierProductCode || String(product.id),
    playerId: order.playerId,
    serverId: order.serverId || undefined,
    amount: product.currencyAmount + product.bonusAmount,
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Idempotency-Key': idempotencyKey,
  };

  if (supplier.authType === 'bearer') {
    headers['Authorization'] = `Bearer ${apiKey}`;
  } else if (supplier.authType === 'api_key') {
    headers['X-API-Key'] = apiKey;
  } else if (supplier.authType === 'hmac') {
    const signature = crypto
      .createHmac('sha256', apiSecret || apiKey)
      .update(JSON.stringify(payload))
      .digest('hex');
    headers['X-API-Key'] = apiKey;
    headers['X-Signature'] = signature;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const resp = await fetch(supplier.apiEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const rawText = await resp.text();
    let parsed: Record<string, unknown> = { rawText };
    try {
      parsed = JSON.parse(rawText);
    } catch {
      // keep rawText wrapper
    }

    if (resp.ok) {
      const supplierTxId =
        String(
          parsed.transactionId ||
            parsed.txId ||
            parsed.reference ||
            `SUP-${Date.now()}`
        );

      await db
        .update(fulfillmentJobs)
        .set({
          status: 'completed',
          supplierTxId,
          apiResponse: parsed,
          updatedAt: new Date(),
        })
        .where(eq(fulfillmentJobs.id, job.id));

      await db
        .update(orders)
        .set({
          fulfillmentStatus: 'completed',
          updatedAt: new Date(),
        })
        .where(eq(orders.id, order.id));

      return {
        status: 'completed',
        mode: 'automatic',
        supplierTxId,
        message: 'Automatic top-up delivered via supplier API.',
      };
    }

    const errMsg = `Supplier HTTP ${resp.status}: ${rawText.slice(0, 240)}`;
    await db
      .update(fulfillmentJobs)
      .set({
        status: 'failed',
        apiResponse: parsed,
        errorMessage: errMsg,
        updatedAt: new Date(),
      })
      .where(eq(fulfillmentJobs.id, job.id));

    await db
      .update(orders)
      .set({
        fulfillmentStatus: 'failed',
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id));

    return { status: 'failed', mode: 'automatic', message: errMsg };
  } catch (err: unknown) {
    const errMsg =
      err instanceof Error ? err.message : 'Supplier API connection failed';
    await db
      .update(fulfillmentJobs)
      .set({
        status: 'failed',
        errorMessage: errMsg,
        updatedAt: new Date(),
      })
      .where(eq(fulfillmentJobs.id, job.id));

    await db
      .update(orders)
      .set({
        fulfillmentStatus: 'failed',
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id));

    return { status: 'failed', mode: 'automatic', message: errMsg };
  }
}
