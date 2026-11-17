import crypto from 'node:crypto';
import QRCode from 'qrcode';

function formatTlv(tag: string, value: string): string {
  const length = value.length.toString().padStart(2, '0');
  return `${tag}${length}${value}`;
}

function crc16Ccitt(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export interface BakongKhqrInput {
  bakongAccountId: string;
  merchantName: string;
  merchantCity: string;
  amountUsd: number;
  orderCode: string;
  expirationMs?: number;
}

export async function buildBakongKhqrSession(input: BakongKhqrInput): Promise<{
  khqrPayload: string;
  khqrMd5: string;
  qrDataUrl: string;
}> {
  const cleanMerchantName = (input.merchantName || 'NEXUS TOPUP').slice(0, 25);
  const cleanCity = (input.merchantCity || 'Phnom Penh').slice(0, 15);
  const amountStr = input.amountUsd.toFixed(2);
  const nowMs = Date.now();
  const expMs = input.expirationMs ?? nowMs + 15 * 60 * 1000;

  // EMVCo Tag 29 (Bakong Individual/Merchant Account)
  const tag29Value = formatTlv('00', input.bakongAccountId);
  // EMVCo Tag 62 (Additional Data Field Template)
  const tag62Value =
    formatTlv('01', input.orderCode.slice(0, 25)) +
    formatTlv('07', 'NEXUSTOPUP');
  // EMVCo Tag 99 (Bakong Timestamp)
  const tag99Value =
    formatTlv('00', String(nowMs)) + formatTlv('01', String(expMs));

  const body =
    formatTlv('00', '01') +
    formatTlv('01', '12') + // Dynamic QR
    formatTlv('29', tag29Value) +
    formatTlv('52', '5999') +
    formatTlv('53', '840') + // 840 = USD
    formatTlv('54', amountStr) +
    formatTlv('58', 'KH') +
    formatTlv('59', cleanMerchantName) +
    formatTlv('60', cleanCity) +
    formatTlv('62', tag62Value) +
    formatTlv('99', tag99Value) +
    '6304';

  const crc = crc16Ccitt(body);
  const khqrPayload = body + crc;
  const khqrMd5 = crypto.createHash('md5').update(khqrPayload).digest('hex');
  const qrDataUrl = await QRCode.toDataURL(khqrPayload, {
    width: 300,
    margin: 2,
    color: {
      dark: '#060913',
      light: '#FFFFFF',
    },
  });

  return { khqrPayload, khqrMd5, qrDataUrl };
}

export async function verifyBakongTransactionByMd5(
  md5: string,
  apiToken: string,
  env: 'production' | 'sit' = 'production'
): Promise<{
  paid: boolean;
  configured: boolean;
  statusCode?: number;
  message: string;
  raw?: unknown;
}> {
  if (!apiToken) {
    return {
      paid: false,
      configured: false,
      message:
        'Bakong Open API Bearer Token is not configured. Add it in Admin Settings or server environment variables.',
    };
  }

  const baseUrl =
    env === 'sit'
      ? 'https://sit-api-bakong.nbc.gov.kh'
      : 'https://api-bakong.nbc.gov.kh';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(`${baseUrl}/v1/check_transaction_by_md5`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ md5 }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data = (await response.json()) as {
      responseCode?: number;
      status?: { code?: number; message?: string; description?: string };
      data?: Record<string, unknown> | null;
    };

    const code = data.status?.code ?? data.responseCode;
    if (response.ok && code === 0 && data.data) {
      return {
        paid: true,
        configured: true,
        statusCode: 0,
        message: 'Bakong KHQR transaction verified.',
        raw: data,
      };
    }

    return {
      paid: false,
      configured: true,
      statusCode: code,
      message:
        data.status?.description ||
        data.status?.message ||
        'Awaiting customer Bakong KHQR payment.',
      raw: data,
    };
  } catch (error: unknown) {
    const errMsg =
      error instanceof Error ? error.message : 'Unable to reach Bakong API';
    return {
      paid: false,
      configured: true,
      message: `Bakong verification request error: ${errMsg}`,
    };
  }
}
