// pos-mvp/src/utils/pushNotification.ts
/**
 * Askar POS & PWA Push Notification Client
 * Handles:
 * 1. Registering the Service Worker (`/sw.js`)
 * 2. Requesting user permission for browser / system notifications
 * 3. Displaying native OS notifications via ServiceWorkerRegistration.showNotification
 * 4. Playing the crisp payment / transaction sound
 */

import { playPaymentSuccessChime } from './sound';

let swRegistration: ServiceWorkerRegistration | null = null;
let isInitialized = false;

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }
  try {
    const perm = await Notification.requestPermission();
    return perm;
  } catch (err) {
    console.warn('Failed to request notification permission:', err);
    return Notification.permission;
  }
}

export function getNotificationPermissionStatus(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function subscribeCustomerToWebPush(customerId?: string, customerName?: string): Promise<boolean> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('⚠️ Web Push is not supported in this browser context.');
    return false;
  }

  try {
    const reg = await navigator.serviceWorker.ready;
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return false;

    // Fetch VAPID public key from backend
    const apiBase = typeof window !== 'undefined' && window.location.port === '3000'
      ? ''
      : (localStorage.getItem('master_server_url') || 'http://192.168.8.7:3000');

    const keyRes = await fetch(`${apiBase}/api/notifications/vapid-public-key`);
    if (!keyRes.ok) throw new Error('Failed to fetch VAPID public key');
    const { publicKey } = await keyRes.json();

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource
      });
    }

    // Register subscription on backend
    const subJson = sub.toJSON();
    await fetch(`${apiBase}/api/notifications/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: sub.endpoint,
        keys: subJson.keys,
        customerId: customerId || null,
        customerName: customerName || null
      })
    });

    console.log(`✅ [PWA Push] Successfully subscribed customer [${customerId || 'ALL'}] for native phone push!`);
    return true;
  } catch (err: any) {
    console.warn('⚠️ [PWA Push] Subscription error:', err.message);
    return false;
  }
}

export async function initPushNotifications(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (isInitialized) return true;
  isInitialized = true;

  // 1. Register Service Worker if supported
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      swRegistration = reg;
      console.log('✅ [PWA] Service Worker registered for push notifications');
    } catch (err) {
      console.warn('⚠️ [PWA] Service Worker registration failed:', err);
    }
  }

  // 2. Auto-request permission on user interaction or if already granted
  if ('Notification' in window) {
    if (Notification.permission === 'default') {
      const requestOnGesture = () => {
        Notification.requestPermission().catch(() => {});
        window.removeEventListener('click', requestOnGesture);
        window.removeEventListener('keydown', requestOnGesture);
      };
      window.addEventListener('click', requestOnGesture, { once: true });
      window.addEventListener('keydown', requestOnGesture, { once: true });
    }
  }

  return true;
}

export interface TransactionNotificationPayload {
  id?: string;
  txType: 'SALE' | 'KHATA_PAYMENT' | 'KHATA_CHARGE' | 'REFUND' | 'EXPENSE';
  title: string;
  message: string;
  amount: number;
  formattedAmount?: string;
  reference?: string;
  invoiceNo?: string;
  paymentMethod?: string;
  customerId?: string | null;
  customerName?: string | null;
  timestamp?: string;
  metadata?: Record<string, any>;
}

/**
 * Triggers a native system push notification and acoustic chime for any transaction
 */
export async function showTransactionNotification(payload: TransactionNotificationPayload) {
  if (typeof window === 'undefined') return;

  // 1. Play transaction chime
  try {
    playPaymentSuccessChime();
  } catch (_) {}

  // 2. Tactile vibration feedback
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate([80, 40, 80]);
    } catch (_) {}
  }

  const title = payload.title || 'Transaction Notice';
  const body = payload.message || `${payload.formattedAmount || payload.amount + ' BHD'}`;

  // 3. Display OS notification banner
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      if (swRegistration && swRegistration.showNotification) {
        await swRegistration.showNotification(title, {
          body,
          icon: '/vite.svg',
          badge: '/vite.svg',
          tag: payload.id || `tx-${Date.now()}`,
          data: payload
        } as NotificationOptions);
        return;
      }

      // Fallback: Web Notification constructor
      new Notification(title, {
        body,
        icon: '/vite.svg',
        tag: payload.id || `tx-${Date.now()}`
      });
    } catch (err) {
      console.warn('Failed to display native notification:', err);
    }
  }
}

/**
 * Triggers an instant test transaction notification across the network & locally
 */
export async function triggerTestTransactionNotification(custom?: Partial<TransactionNotificationPayload>): Promise<void> {
  const samplePayload: TransactionNotificationPayload = {
    id: `test-${Date.now()}`,
    txType: custom?.txType || 'SALE',
    title: custom?.title || (custom?.customerName ? `🔔 Alert: ${custom.customerName}` : '🔔 Transaction Notice: SALE'),
    message: custom?.message || `Recorded ${custom?.formattedAmount || (custom?.amount ? custom.amount.toFixed(3) + ' BHD' : '2.500 BHD')} on account`,
    amount: custom?.amount ?? 2.500,
    formattedAmount: custom?.formattedAmount || `${(custom?.amount ?? 2.5).toFixed(3)} BHD`,
    reference: custom?.reference || 'TEST-' + Math.floor(1000 + Math.random() * 9000),
    invoiceNo: custom?.invoiceNo || 'INV-' + Math.floor(10000 + Math.random() * 90000),
    paymentMethod: custom?.paymentMethod || 'BenefitPay',
    customerId: custom?.customerId,
    customerName: custom?.customerName || 'Customer Test',
    timestamp: new Date().toLocaleTimeString()
  };

  // 1. Fire local UI event + audio chime
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pwa-transaction-notification', { detail: samplePayload }));
  }
  showTransactionNotification(samplePayload).catch(() => {});

  // 2. Broadcast via POS backend server so all other connected devices ring simultaneously
  try {
    const apiBase = typeof window !== 'undefined' && window.location.port === '3000'
      ? ''
      : 'http://192.168.8.7:3000';
    await fetch(`${apiBase}/api/notifications/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(samplePayload)
    });
  } catch (err) {
    console.warn('Backend broadcast test notification request failed:', err);
  }
}
