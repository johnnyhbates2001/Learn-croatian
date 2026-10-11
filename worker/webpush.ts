// Web Push (RFC 8030) using only WebCrypto: VAPID authentication (RFC 8292)
// and aes128gcm payload encryption (RFC 8291).

const enc = new TextEncoder();

type Bytes = Uint8Array<ArrayBuffer>;

export function b64uEncode(bytes: Uint8Array) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64uDecode(s: string): Bytes {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function concat(...parts: Uint8Array[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) {
    out.set(p, i);
    i += p.length;
  }
  return out;
}

async function hmac(key: Bytes, data: Bytes) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

export interface PushSubscriptionKeys {
  endpoint: string;
  /** The browser's P-256 public key (base64url, uncompressed point). */
  p256dh: string;
  /** The browser's 16-byte auth secret (base64url). */
  auth: string;
}

/** Encrypt a payload for one subscription. `salt` and `local` are only passed by tests. */
export async function encryptPayload(
  payload: Bytes,
  sub: Pick<PushSubscriptionKeys, 'p256dh' | 'auth'>,
  opts: { salt?: Bytes; local?: CryptoKeyPair } = {},
) {
  const uaPublic = b64uDecode(sub.p256dh);
  const auth = b64uDecode(sub.auth);
  const local = opts.local ?? ((await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair);
  const asPublic = new Uint8Array((await crypto.subtle.exportKey('raw', local.publicKey)) as ArrayBuffer);
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  // Not an inline literal: Workers' types spell the `public` member differently from the DOM's.
  const ecdhParams = { name: 'ECDH', public: uaKey };
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits(ecdhParams, local.privateKey, 256));

  // RFC 8291 §3.4: combine the ECDH secret with the auth secret, then derive key and nonce (HKDF-SHA256).
  const prkKey = await hmac(auth, ecdh);
  const ikm = await hmac(prkKey, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic, new Uint8Array([1])));
  const salt = opts.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(enc.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(enc.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);

  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  // A single record: the payload followed by the 0x02 "last record" delimiter.
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(payload, new Uint8Array([2]))));

  // Header (RFC 8188): salt, record size, key id length, key id (our public key).
  const header = new Uint8Array(21);
  header.set(salt);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  return concat(header, asPublic, ciphertext);
}

export interface Vapid {
  /** Uncompressed P-256 public key, base64url — what the browser gets as applicationServerKey. */
  publicKey: string;
  privateJwk: JsonWebKey;
  /** Contact for the push service: a mailto: or https: URL. */
  subject: string;
}

export async function generateVapidKeys(): Promise<Omit<Vapid, 'subject'>> {
  const kp = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const raw = new Uint8Array((await crypto.subtle.exportKey('raw', kp.publicKey)) as ArrayBuffer);
  return { publicKey: b64uEncode(raw), privateJwk: (await crypto.subtle.exportKey('jwk', kp.privateKey)) as JsonWebKey };
}

/** The `Authorization` header value for a push to `endpoint` (RFC 8292). */
export async function vapidAuthorization(endpoint: string, vapid: Vapid, now = Date.now()) {
  const json = (o: unknown) => b64uEncode(enc.encode(JSON.stringify(o)));
  const unsigned = `${json({ typ: 'JWT', alg: 'ES256' })}.${json({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: vapid.subject })}`;
  const key = await crypto.subtle.importKey('jwk', vapid.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(unsigned)));
  return `vapid t=${unsigned}.${b64uEncode(sig)}, k=${vapid.publicKey}`;
}

export async function sendPush(sub: PushSubscriptionKeys, message: unknown, vapid: Vapid, ttlSeconds = 12 * 3600) {
  const body = await encryptPayload(new Uint8Array(enc.encode(JSON.stringify(message))), sub);
  return fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      authorization: await vapidAuthorization(sub.endpoint, vapid),
      'content-encoding': 'aes128gcm',
      'content-type': 'application/octet-stream',
      ttl: String(ttlSeconds),
      urgency: 'normal',
    },
    body,
  });
}
