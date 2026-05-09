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

async function getPushRegistration() {
  if (!('serviceWorker' in navigator)) return null;
  const existing = await navigator.serviceWorker.getRegistration('/sw.js');
  if (existing) return existing;
  return navigator.serviceWorker.ready;
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
    throw new Error('O aplicativo ainda não terminou de preparar as notificações.');
  }

  const { publicKey } = await pushService.getPublicKey();
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

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
