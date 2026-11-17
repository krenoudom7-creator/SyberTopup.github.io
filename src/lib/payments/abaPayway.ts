import crypto from 'node:crypto';

export interface AbaPayWayPayloadInput {
  merchantId: string;
  apiKey: string;
  tranId: string;
  amountUsd: number;
  items: Array<{ name: string; quantity: number; price: number }>;
  email?: string;
  returnUrl: string;
  cancelUrl: string;
  continueSuccessUrl: string;
  env?: 'sandbox' | 'production';
}

function getUtcReqTime(): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const min = String(now.getUTCMinutes()).padStart(2, '0');
  const ss = String(now.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}${hh}${min}${ss}`;
}

export function buildAbaPayWayPurchaseRequest(input: AbaPayWayPayloadInput) {
  const reqTime = getUtcReqTime();
  const amount = input.amountUsd.toFixed(2);
  const itemsBase64 = Buffer.from(JSON.stringify(input.items)).toString('base64');
  const shipping = '0.00';
  const firstname = 'Nexus';
  const lastname = 'Gamer';
  const email = input.email || 'customer@nexustopup.kh';
  const phone = '';
  const type = 'purchase';
  const paymentOption = '';
  const returnUrlBase64 = Buffer.from(input.returnUrl).toString('base64');
  const cancelUrl = input.cancelUrl;
  const continueSuccessUrl = input.continueSuccessUrl;
  const returnDeeplink = '';
  const currency = 'USD';
  const customFields = '';
  const returnParams = input.tranId;
  const payout = '';
  const lifetime = '15';
  const additionalParams = '';
  const googlePayToken = '';
  const skipSuccessPage = '';

  const b4hash =
    reqTime +
    input.merchantId +
    input.tranId +
    amount +
    itemsBase64 +
    shipping +
    firstname +
    lastname +
    email +
    phone +
    type +
    paymentOption +
    returnUrlBase64 +
    cancelUrl +
    continueSuccessUrl +
    returnDeeplink +
    currency +
    customFields +
    returnParams +
    payout +
    lifetime +
    additionalParams +
    googlePayToken +
    skipSuccessPage;

  const hash = crypto
    .createHmac('sha512', input.apiKey)
    .update(b4hash)
    .digest('base64');

  const endpointUrl =
    input.env === 'production'
      ? 'https://checkout.payway.com.kh/api/payment-gateway/v1/payments/purchase'
      : 'https://checkout-sandbox.payway.com.kh/api/payment-gateway/v1/payments/purchase';

  return {
    endpointUrl,
    hash,
    formFields: {
      req_time: reqTime,
      merchant_id: input.merchantId,
      tran_id: input.tranId,
      amount,
      items: itemsBase64,
      shipping,
      firstname,
      lastname,
      email,
      phone,
      type,
      payment_option: paymentOption,
      return_url: returnUrlBase64,
      cancel_url: cancelUrl,
      continue_success_url: continueSuccessUrl,
      return_deeplink: returnDeeplink,
      currency,
      custom_fields: customFields,
      return_params: returnParams,
      payout,
      lifetime,
      additional_params: additionalParams,
      google_pay_token: googlePayToken,
      skip_success_page: skipSuccessPage,
      hash,
    },
  };
}

export function verifyAbaPayWayCallbackSignature(
  payload: Record<string, unknown>,
  headerSignature: string | undefined,
  apiKey: string
): boolean {
  if (!headerSignature || !apiKey) return false;

  const sortedKeys = Object.keys(payload).sort();
  const b4hash = sortedKeys
    .map((key) => {
      const value = payload[key];
      if (value === null || value === undefined) return '';
      if (typeof value === 'object') return JSON.stringify(value);
      return String(value);
    })
    .join('');

  const expectedSignature = crypto
    .createHmac('sha512', apiKey)
    .update(b4hash)
    .digest('base64');

  const sigBuf = Buffer.from(headerSignature);
  const expBuf = Buffer.from(expectedSignature);
  if (sigBuf.length !== expBuf.length) return false;

  return crypto.timingSafeEqual(sigBuf, expBuf);
}
