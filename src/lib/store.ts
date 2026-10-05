// Local-first record store: everything lives in memory and is persisted to IndexedDB.
// Records whose key does not start with "l:" are synced to D1.
import { openDB, type IDBPDatabase } from 'idb';

export interface Rec<T = unknown> {
  key: string;
  data: T;
  updatedAt: number;
  /** 1 = changed locally since the last successful sync. */
  dirty: 0 | 1;
}

const mem = new Map<string, Rec>();
const listeners = new Set<() => void>();
let dbPromise: Promise<IDBPDatabase> | null = null;
let notifyQueued = false;

const db = () =>
  (dbPromise ??= openDB('learn-croatian', 1, {
    upgrade(d) {
      d.createObjectStore('records', { keyPath: 'key' });
    },
  }));

export const isLocalOnly = (key: string) => key.startsWith('l:');

export async function loadAll() {
  const recs = (await (await db()).getAll('records')) as Rec[];
  for (const r of recs) mem.set(r.key, r);
  notify();
  // Ask the browser not to evict our data (best effort; iOS may ignore).
  navigator.storage?.persist?.().catch(() => {});
}

function notify() {
  if (notifyQueued) return;
  notifyQueued = true;
  queueMicrotask(() => {
    notifyQueued = false;
    listeners.forEach((l) => l());
  });
}

export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function get<T>(key: string): T | undefined {
  return mem.get(key)?.data as T | undefined;
}

export function getRec(key: string) {
  return mem.get(key);
}

export function put<T>(key: string, data: T, updatedAt = Date.now()) {
  // Keep timestamps strictly increasing per key so last-write-wins is deterministic.
  const prev = mem.get(key);
  if (prev && updatedAt <= prev.updatedAt) updatedAt = prev.updatedAt + 1;
  const rec: Rec<T> = { key, data, updatedAt, dirty: isLocalOnly(key) ? 0 : 1 };
  mem.set(key, rec);
  db().then((d) => d.put('records', rec));
  notify();
}

export function byPrefix<T>(prefix: string): Rec<T>[] {
  const out: Rec<T>[] = [];
  for (const r of mem.values()) if (r.key.startsWith(prefix)) out.push(r as Rec<T>);
  return out;
}

export function dirtyRecords(): Rec[] {
  return [...mem.values()].filter((r) => r.dirty);
}

/** Apply records from the server; the newest updatedAt wins. Returns how many changed. */
export async function applyRemote(recs: { key: string; data: unknown; updatedAt: number }[]) {
  const d = await db();
  const tx = d.transaction('records', 'readwrite');
  let changed = 0;
  for (const r of recs) {
    if (isLocalOnly(r.key)) continue;
    const cur = mem.get(r.key);
    if (cur && cur.updatedAt >= r.updatedAt) continue;
    const rec: Rec = { key: r.key, data: r.data, updatedAt: r.updatedAt, dirty: 0 };
    mem.set(r.key, rec);
    tx.store.put(rec);
    changed++;
  }
  await tx.done;
  if (changed) notify();
  return changed;
}

/** Clear the dirty flag on records that haven't changed since they were pushed. */
export async function markClean(pushed: { key: string; updatedAt: number }[]) {
  const d = await db();
  const tx = d.transaction('records', 'readwrite');
  for (const p of pushed) {
    const cur = mem.get(p.key);
    if (cur && cur.dirty && cur.updatedAt === p.updatedAt) {
      cur.dirty = 0;
      tx.store.put(cur);
    }
  }
  await tx.done;
}

/** Wipe synced data (keeps local-only settings such as the sync token). */
export async function clearProgress() {
  const d = await db();
  const tx = d.transaction('records', 'readwrite');
  for (const key of [...mem.keys()]) {
    if (isLocalOnly(key)) continue;
    mem.delete(key);
    tx.store.delete(key);
  }
  await tx.done;
  notify();
}

/** Replace all synced data, e.g. from a backup file. */
export async function importRecords(recs: { key: string; data: unknown; updatedAt: number }[]) {
  await clearProgress();
  const now = Date.now();
  for (const r of recs) if (!isLocalOnly(r.key)) put(r.key, r.data, Math.max(r.updatedAt, now));
}

export function exportRecords() {
  return [...mem.values()].filter((r) => !isLocalOnly(r.key)).map(({ key, data, updatedAt }) => ({ key, data, updatedAt }));
}
