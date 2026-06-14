import { hasSupabaseConfig, supabase } from './supabaseClient';

// VAPID public key is safe to ship to the client (it only authenticates the
// sender to push services). The matching private key lives as a Supabase secret.
export const VAPID_PUBLIC_KEY = 'BGG66RJ2CSNANevlGnoPGUU_YvsOEtNxR6ygE56BDviYIZrY9UE21JkwkoeF0b7YLmzB8aetzRuUr3i6K_gmTZw';

export function isPushSupported() {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

export function pushPermission() {
  return isPushSupported() ? Notification.permission : 'unsupported';
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export async function registerServiceWorker() {
  if (!isPushSupported()) return null;
  return navigator.serviceWorker.register('/sw.js');
}

// Request permission, subscribe, and persist the subscription. Returns the
// resulting permission state ('granted' | 'denied' | 'default' | 'unsupported').
export async function enablePushNotifications(userId, organizationId) {
  if (!isPushSupported() || !hasSupabaseConfig || !userId) return 'unsupported';

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission;

  const registration = await registerServiceWorker();
  if (!registration) return 'unsupported';
  await navigator.serviceWorker.ready;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const json = subscription.toJSON();
  await supabase.from('push_subscriptions').upsert({
    user_id: userId,
    organization_id: organizationId || null,
    endpoint: json.endpoint,
    p256dh: json.keys?.p256dh,
    auth: json.keys?.auth,
    user_agent: navigator.userAgent,
  }, { onConflict: 'endpoint' });

  return 'granted';
}
