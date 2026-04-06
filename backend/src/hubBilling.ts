type HubConfig = {
  baseUrl: string;
  apiKey: string;
  adminEmail: string;
  adminPassword: string;
  productId: string;
};

export type HubResolveAccessResult = {
  customerId: string;
  productId: string;
  licenseId: string | null;
  accessStatus: 'trial' | 'licensed' | 'blocked' | 'no_license';
  trialStartedAt: string | null;
  trialEndAt: string | null;
  licenseEndAt: string | null;
  daysLeft: number | null;
  reason: string;
  features: Record<string, unknown> | null;
  canAccess: boolean;
  banner: string | null;
};

export type HubPlan = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  amount: number;
  currency: string;
  intervalUnit: string;
  intervalCount: number;
  status: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type HubCheckoutResult = {
  chargeId: string | null;
  externalChargeId: string | null;
  status: string | null;
  checkoutUrl: string | null;
  pixCode: string | null;
  pixQrCode: string | null;
  pixPayload: string | null;
  boletoUrl: string | null;
  amount: number | null;
  currency: string | null;
  dueDate: string | null;
};

type AdminTokenCache = {
  token: string;
  expiresAt: number;
};

let cachedAdminToken: AdminTokenCache | null = null;

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

function normalizeBaseUrl(baseUrl: string) {
  const trimmed = trimTrailingSlash(baseUrl.trim());
  if (/\/api\/v1$/i.test(trimmed)) return trimmed;
  if (/\/api$/i.test(trimmed)) return `${trimmed}/v1`;
  return `${trimmed}/api/v1`;
}

function buildUrl(config: HubConfig, pathname: string, params?: Record<string, string | number | boolean | undefined | null>) {
  const url = new URL(`${normalizeBaseUrl(config.baseUrl)}${pathname}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function parseErrorResponse(response: Response) {
  const text = await response.text();
  try {
    const data = JSON.parse(text);
    return data?.message || data?.error || text || `Hub Billing error ${response.status}`;
  } catch {
    return text || `Hub Billing error ${response.status}`;
  }
}

async function requestJson<T>(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  if (!response.ok) {
    const message = await parseErrorResponse(response);
    throw new Error(message);
  }
  return (await response.json()) as T;
}

function sanitizeDocument(document?: string | null) {
  const digits = String(document || '').replace(/\D/g, '');
  return digits || undefined;
}

export function isHubBillingEnabled(config: Partial<HubConfig>) {
  return !!(config.baseUrl && config.apiKey && config.adminEmail && config.adminPassword && config.productId);
}

async function getAdminToken(config: HubConfig) {
  const now = Date.now();
  if (cachedAdminToken && cachedAdminToken.expiresAt > now) {
    return cachedAdminToken.token;
  }

  const payload = await requestJson<{ accessToken?: string; token?: string }>(
    buildUrl(config, '/auth/login'),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: config.adminEmail, password: config.adminPassword }),
    }
  );
  const token = payload.accessToken || payload.token;
  if (!token) {
    throw new Error('Hub Billing nao retornou accessToken');
  }
  cachedAdminToken = { token, expiresAt: now + 10 * 60 * 1000 };
  return token;
}

function apiKeyHeaders(config: HubConfig) {
  return {
    'X-API-Key': config.apiKey,
    'Content-Type': 'application/json',
  };
}

async function adminHeaders(config: HubConfig) {
  const token = await getAdminToken(config);
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export async function resolveHubAccess(
  config: HubConfig,
  data: { email: string; name: string; document?: string | null; personType?: 'PF' | 'PJ' | null }
) {
  return requestJson<HubResolveAccessResult>(buildUrl(config, '/access/resolve'), {
    method: 'POST',
    headers: apiKeyHeaders(config),
    body: JSON.stringify({
      document: sanitizeDocument(data.document),
      personType: data.personType || undefined,
      productId: config.productId,
      name: data.name,
      email: data.email,
    }),
  });
}

export async function getHubAccessStatus(config: HubConfig, customerId: string) {
  return requestJson<HubResolveAccessResult>(
    buildUrl(config, '/access/status', { customerId, productId: config.productId }),
    { method: 'GET', headers: { 'X-API-Key': config.apiKey } }
  );
}

export async function listHubPlans(config: HubConfig) {
  return requestJson<HubPlan[]>(
    buildUrl(config, `/access/products/${config.productId}/plans`, { includeArchived: false }),
    { method: 'GET', headers: { 'X-API-Key': config.apiKey } }
  );
}

export async function upsertHubCustomer(
  config: HubConfig,
  data: {
    email: string;
    legalName: string;
    document?: string | null;
    personType?: 'PF' | 'PJ' | null;
    phone?: string | null;
    addressZip?: string | null;
    addressStreet?: string | null;
    addressNumber?: string | null;
    addressDistrict?: string | null;
    addressComplement?: string | null;
    addressCity?: string | null;
    addressState?: string | null;
  }
) {
  return requestJson<{ exists: boolean; source: string; customerId: string }>(
    buildUrl(config, '/access/customers/upsert'),
    {
      method: 'POST',
      headers: {
        ...apiKeyHeaders(config),
        'Idempotency-Key': `nosigilo:${data.email.toLowerCase()}:${config.productId}`,
      },
      body: JSON.stringify({
        personType: data.personType || 'PF',
        document: sanitizeDocument(data.document),
        legalName: data.legalName,
        email: data.email,
        phone: data.phone || undefined,
        addressZip: data.addressZip || undefined,
        addressStreet: data.addressStreet || undefined,
        addressNumber: data.addressNumber || undefined,
        addressDistrict: data.addressDistrict || undefined,
        addressComplement: data.addressComplement || undefined,
        addressCity: data.addressCity || undefined,
        addressState: data.addressState || undefined,
      }),
    }
  );
}

export async function createHubOrder(
  config: HubConfig,
  data: { customerId: string; planId: string; contractedAmount: number }
) {
  return requestJson<{ id?: string; orderId?: string }>(buildUrl(config, '/orders'), {
    method: 'POST',
    headers: await adminHeaders(config),
    body: JSON.stringify({
      customerId: data.customerId,
      productId: config.productId,
      planId: data.planId,
      contractedAmount: data.contractedAmount,
    }),
  });
}

export async function createHubCheckout(
  config: HubConfig,
  data: {
    orderId: string;
    billingType?: 'PIX' | 'BOLETO' | 'CREDIT_CARD';
    payerName?: string | null;
    payerDocument?: string | null;
  }
) {
  // The deployed Hub checkout currently rejects payerName/payerDocument.
  // Send only the billing type and let the Hub resolve payer data server-side.
  return requestJson<HubCheckoutResult>(buildUrl(config, `/orders/${data.orderId}/checkout`), {
    method: 'POST',
    headers: await adminHeaders(config),
    body: JSON.stringify({
      billingType: data.billingType || 'PIX',
    }),
  });
}
