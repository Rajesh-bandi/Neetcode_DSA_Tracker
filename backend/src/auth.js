import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';

/* ---------------------------------------------------------------- tokens -- */

const TOKEN_TTL_DAYS = 30;

function b64url(input) {
  return Buffer.from(input).toString('base64url');
}

/**
 * Compact signed token: `payload.signature`. Not a JWT by spec, but the same
 * shape — an authenticated, expiring user id plus a session id (`jti`) that
 * the server keeps a row for, so signing out can actually revoke the token.
 */
export function signToken(userId, secret, now = Date.now()) {
  const jti = randomUUID();
  const expiresAt = now + TOKEN_TTL_DAYS * 86_400_000;
  const payload = b64url(JSON.stringify({ sub: userId, jti, iat: now, exp: expiresAt }));
  return {
    token: `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`,
    jti,
    expiresAt,
  };
}

export function verifyToken(token, secret, now = Date.now()) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof data?.sub !== 'string' || typeof data?.jti !== 'string') return null;
    if (typeof data?.exp !== 'number' || data.exp < now) return null;
    return { userId: data.sub, jti: data.jti, expiresAt: data.exp };
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------- password -- */

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function checkPassword(password, stored) {
  try {
    const [scheme, N, r, p, salt, hash] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;
    const expected = Buffer.from(hash, 'base64');
    const actual = scryptSync(password, Buffer.from(salt, 'base64'), expected.length, {
      N: Number(N),
      r: Number(r),
      p: Number(p),
    });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/* --------------------------------------------------------------- cookies -- */

export const SESSION_COOKIE = 'nc_session';

export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    out[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return out;
}

/**
 * A frontend on another site (Vercel talking to Render) sends the session
 * cookie cross-site, which browsers only accept as `SameSite=None; Secure`.
 * Same-site deployments keep Lax, which is the stricter default.
 */
function sameSiteFor({ crossSite, secure }) {
  return crossSite && secure ? 'None' : 'Lax';
}

export function sessionCookie(token, { secure = false, crossSite = false, maxAgeDays = TOKEN_TTL_DAYS } = {}) {
  const bits = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    `SameSite=${sameSiteFor({ crossSite, secure })}`,
    `Max-Age=${maxAgeDays * 86_400}`,
  ];
  if (secure) bits.push('Secure');
  return bits.join('; ');
}

export function clearedSessionCookie({ secure = false, crossSite = false } = {}) {
  const bits = [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', `SameSite=${sameSiteFor({ crossSite, secure })}`, 'Max-Age=0'];
  if (secure) bits.push('Secure');
  return bits.join('; ');
}

export function newId() {
  return randomUUID();
}
