// Two-way sync with the Worker's D1 database. Local data is authoritative until pushed;
// conflicts resolve per record by last-write-wins on updatedAt.
import { applyRemote, dirtyRecords, get, markClean, put } from './store';

export interface SyncState {
  token?: string;
  lastRev: number;
  lastSyncAt?: number;
  lastError?: string;
}

const KEY = 'l:sync';
const CHUNK = 200;

export const getSyncState = (): SyncState => ({ lastRev: 0, ...get<SyncState>(KEY) });
const setSyncState = (s: Partial<SyncState>) => put(KEY, { ...getSyncState(), ...s });

export function setToken(token: string) {
  setSyncState({ token: token.trim() || undefined, lastRev: 0, lastError: undefined });
}

interface SyncResponse {
  rev: number;
  more: boolean;
  changes: { key: string; data: unknown; updatedAt: number }[];
}

async function call<T>(path: string, token: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401) throw new Error('Sync token rejected');
  if (!res.ok) throw new Error(`Server error ${res.status}`);
  return res.json() as Promise<T>;
}

export const testConnection = (token: string) => call<{ ok: boolean; records: number }>('ping', token);

let running: Promise<SyncResult | null> | null = null;

export interface SyncResult {
  pushed: number;
  pulled: number;
}

/** Push local changes and pull remote ones. No-op without a token or while offline. */
export function sync(): Promise<SyncResult | null> {
  return (running ??= doSync().finally(() => (running = null)));
}

async function doSync(): Promise<SyncResult | null> {
  const { token } = getSyncState();
  if (!token || !navigator.onLine) return null;
  try {
    let since = getSyncState().lastRev;
    let pushed = 0;
    let pulled = 0;
    let more = false;
    const dirty = dirtyRecords().map(({ key, data, updatedAt }) => ({ key, data, updatedAt }));
    let i = 0;
    // Push in chunks; keep calling (with nothing to push) until the server says we're caught up.
    do {
      const changes = dirty.slice(i, i + CHUNK);
      i += CHUNK;
      const res = await call<SyncResponse>('sync', token, { since, changes });
      await markClean(changes);
      pushed += changes.length;
      pulled += await applyRemote(res.changes);
      since = res.rev;
      more = res.more;
    } while (i < dirty.length || more);
    setSyncState({ lastRev: since, lastSyncAt: Date.now(), lastError: undefined });
    return { pushed, pulled };
  } catch (e) {
    setSyncState({ lastError: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

/** Delete everything on the server (used by "Reset progress"). */
export async function resetRemote() {
  const { token } = getSyncState();
  if (!token) return;
  await call('reset', token, {});
  setSyncState({ lastRev: 0 });
}
