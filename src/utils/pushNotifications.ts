import { pushService } from '@/services/api';

type BrowserPushSubscriptionPayload = {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
};

export type PushActivationState = {
  supported: boolean;
  permission: NotificationPermission | 'unsupported';
  enabled: boolean;
};

function isBrowserPushSupported() {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

/**
 * Returns the active service worker registration.
 * First tries to find an existing registration whose scope covers the page.
 * Falls back to navigator.serviceWorker.ready (resolves once any SW is active).
 * Adds a 5s timeout so the call never hangs indefinitely (e.g. SW stuck installing).
 */
async function getPushRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;

  // Try to get the registration for the current page scope
  const existing = await navigator.serviceWorker.getRegistration('/').catch(() => null);
  if (existing?.active) return existing;

  // Also try looking up by the sw.js script directly
  const bySw = await navigator.serviceWorker.getRegistration('/sw.js').catch(() => null);
  if (bySw?.active) return bySw;

  // Fall back to ready, but with a timeout to avoid hanging
  const readyWithTimeout = Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
  ]);

  const reg = await readyWithTimeout;
  return reg as ServiceWorkerRegistration | null;
}

function normalizeSubscription(
  subscriptionJson: PushSubscriptionJSON | null | undefined
): BrowserPushSubscriptionPayload | null {
  if (!subscriptionJson?.endpoint || !subscriptionJson.keys?.p256dh || !subscriptionJson.keys?.auth) {
    return null;
  }

  return {
    endpoint: subscriptionJson.endpoint,
    expirationTime: subscriptionJson.expirationTime ?? null,
    keys: {
      p256dh: subscriptionJson.keys.p256dh,
      auth: subscriptionJson.keys.auth,
    },
  };
}

export async function getPushActivationState(): Promise<PushActivationState> {
  if (!isBrowserPushSupported()) {
    return { supported: false, permission: 'unsupported', enabled: false };
  }

  const registration = await getPushRegistration();
  if (!registration) {
    return { supported: true, permission: Notification.permission, enabled: false };
  }

  const subscription = await registration.pushManager.getSubscription();
  return {
    supported: true,
    permission: Notification.permission,
    enabled: Notification.permission === 'granted' && !!subscription,
  };
}

/**
 * Ativa push notifications neste dispositivo.
 *
 * Sempre desinscreve a subscription anterior antes de criar uma nova.
 * Isso garante que a chave VAPID atual do servidor seja usada — evita
 * falhas silenciosas quando o servidor foi reiniciado com novas chaves
 * efêmeras e a subscription antiga (com chave diferente) seria rejeitada
 * com 401/403 ao tentar entregar a notificação.
 */
export async function enablePushNotifications() {
  if (!isBrowserPushSupported()) {
    throw new Error('Seu navegador não suporta notificações push neste dispositivo.');
  }

  const permission =
    Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Permissão de notificações não concedida.');
  }

  const registration = await getPushRegistration();
  if (!registration) {
    throw new Error('O aplicativo ainda não terminou de preparar as notificações. Tente recarregar a página.');
  }

  // Fetch the current VAPID public key from the server BEFORE subscribing
  const { publicKey } = await pushService.getPublicKey();

  // Unsubscribe any existing subscription so we always use the current server key.
  // This prevents silent failures when the server's VAPID key changed (e.g. restart
  // without persistent VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY env vars).
  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    await existing.unsubscribe().catch(() => {});
    // Also remove from backend so we don't accumulate stale subscriptions
    await pushService.unsubscribe(existing.endpoint).catch(() => {});
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

  const payload = normalizeSubscription(subscription.toJSON());
  if (!payload) {
    throw new Error('Não foi possível preparar este aparelho para receber notificações.');
  }

  await pushService.subscribe(payload);
  return true;
}

export async function disablePushNotifications() {
  if (!isBrowserPushSupported()) return false;
  const registration = await getPushRegistration();
  if (!registration) return false;

  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return true;

  await pushService.unsubscribe(subscription.endpoint).catch(() => {});
  await subscription.unsubscribe().catch(() => {});
  return true;
}

/**
 * Sincroniza a subscription existente com o backend (chamado no login/app load).
 * Não força re-subscribe — apenas garante que o backend tem a subscription atual.
 * Se não houver subscription ativa, não faz nada.
 */
export async function syncPushSubscription() {
  if (!isBrowserPushSupported() || Notification.permission !== 'granted') return false;
  const registration = await getPushRegistration();
  if (!registration) return false;

  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return false;

  const payload = normalizeSubscription(subscription.toJSON());
  if (!payload) return false;
  await pushService.subscribe(payload);
  return true;
}
