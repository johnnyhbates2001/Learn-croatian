// Daily reminders via Web Push. The Worker stores this device's subscription and
// a cron trigger sends the reminder (see worker/reminders.ts).
import { get, put } from './store';
import { call, getSyncState } from './sync';

export interface ReminderState {
  enabled: boolean;
  /** Local time, HH:MM. */
  time: string;
}

// Local-only ("l:"): each device has its own subscription.
const KEY = 'l:reminder';

export const getReminder = (): ReminderState => ({ enabled: false, time: '19:00', ...get<ReminderState>(KEY) });
const saveReminder = (s: Partial<ReminderState>) => put(KEY, { ...getReminder(), ...s });

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

function b64uDecode(s: string) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function token() {
  const t = getSyncState().token;
  if (!t) throw new Error('Connect sync first: reminders are sent by your sync server.');
  return t;
}

async function subscription(create: boolean) {
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if (existing || !create) return existing;
  const { publicKey } = await call<{ publicKey: string }>('push/key', token());
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uDecode(publicKey) });
}

async function register(sub: PushSubscription, time: string) {
  await call('push/subscribe', token(), { subscription: sub.toJSON(), remindAt: time, tz: timeZone() });
}

/** Must be called from a tap: iOS only shows the permission prompt in response to one. */
export async function enableReminders(time = getReminder().time) {
  token();
  const permission = await Notification.requestPermission();
  if (permission !== 'granted')
    throw new Error(permission === 'denied' ? 'Notifications are blocked. Allow them for Riječi in your phone’s Settings → Notifications.' : 'Notifications weren’t allowed.');
  const sub = await subscription(true);
  if (!sub) throw new Error('Could not subscribe to notifications.');
  await register(sub, time);
  saveReminder({ enabled: true, time });
}

export async function disableReminders() {
  saveReminder({ enabled: false });
  const sub = await subscription(false).catch(() => null);
  if (!sub) return;
  const t = getSyncState().token;
  if (t) await call('push/unsubscribe', t, { endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}

export async function setReminderTime(time: string) {
  saveReminder({ time });
  if (!getReminder().enabled) return;
  const sub = await subscription(true);
  if (sub) await register(sub, time);
}

export async function sendTestReminder() {
  const sub = await subscription(false);
  if (!sub) throw new Error('This device isn’t subscribed. Turn reminders off and on again.');
  await call('push/test', token(), { endpoint: sub.endpoint });
}

/**
 * On launch: re-send this device's subscription (browsers can rotate it) and time zone (you may
 * have travelled), so the server always has the current ones. Silent on failure.
 */
export async function refreshReminders() {
  const { enabled, time } = getReminder();
  if (!enabled || !getSyncState().token || !pushSupported() || Notification.permission !== 'granted') return;
  try {
    const sub = await subscription(true);
    if (sub) await register(sub, time);
  } catch {
    // Offline or server unavailable: try again next launch.
  }
}
