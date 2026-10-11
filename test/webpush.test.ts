import { describe, expect, it } from 'vitest';
import { b64uDecode, b64uEncode, encryptPayload, generateVapidKeys, vapidAuthorization } from '../worker/webpush';

describe('web push', () => {
  it('matches the RFC 8291 example encryption', async () => {
    const asPublic = b64uDecode('BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8');
    const jwk = { kty: 'EC', crv: 'P-256', x: b64uEncode(asPublic.slice(1, 33)), y: b64uEncode(asPublic.slice(33)) };
    const local = {
      publicKey: await crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, []),
      privateKey: await crypto.subtle.importKey('jwk', { ...jwk, d: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw' }, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']),
    };
    const body = await encryptPayload(
      new TextEncoder().encode('When I grow up, I want to be a watermelon'),
      { p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', auth: 'BTBZMqHH6r4Tts7J_aSIgg' },
      { salt: b64uDecode('DGv6ra1nlYgDCS1FRnbzlw'), local },
    );
    // Header and ciphertext exactly as given in RFC 8291 Appendix A.
    const header = b64uDecode('DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8');
    const ciphertext = b64uDecode('8pfeW0KbunFT06SuDKoJH9Ql87S1QUrdirN6GcG7sFz1y1sqLgVi1VhjVkHsUoEsbI_0LpXMuGvnzQ');
    expect(header).toHaveLength(86);
    expect([...body]).toEqual([...header, ...ciphertext]);
  });

  it('signs a VAPID token the public key verifies', async () => {
    const keys = await generateVapidKeys();
    const header = await vapidAuthorization('https://web.push.apple.com/abc', { ...keys, subject: 'https://example.com' });
    const [, token, k] = header.match(/^vapid t=(\S+), k=(\S+)$/)!;
    expect(k).toBe(keys.publicKey);
    const [h, p, sig] = token.split('.');
    const claims = JSON.parse(new TextDecoder().decode(b64uDecode(p)));
    expect(claims.aud).toBe('https://web.push.apple.com');
    expect(claims.sub).toBe('https://example.com');
    const pub = await crypto.subtle.importKey('raw', b64uDecode(keys.publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, b64uDecode(sig), new TextEncoder().encode(`${h}.${p}`));
    expect(ok).toBe(true);
  });
});
