import express from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  checkPassword,
  clearedSessionCookie,
  hashPassword,
  newId,
  parseCookies,
  sessionCookie,
  signToken,
  verifyToken,
  SESSION_COOKIE,
} from './auth.js';
import { summarise, validateProgress } from './progress.js';
import { isIsoDay, isRecentDay, serverDay, streaks } from './streak.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ------------------------------------------------------------------ utils -- */

function normaliseEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}

function cleanName(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 60);
}

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username ?? row.name,
    name: row.name,
    email: row.email,
    createdAt: row.created_at,
    verified: Boolean(row.verified),
  };
}

function initials(name) {
  const parts = String(name).trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

/** Small fixed-window limiter. Resets on restart, which is fine for one instance. */
function limiter({ windowMs, max }) {
  const hits = new Map();
  return (key) => {
    const now = Date.now();
    const bucket = hits.get(key);
    if (!bucket || bucket.reset <= now) {
      hits.set(key, { count: 1, reset: now + windowMs });
      return { ok: true, retryAfter: 0 };
    }
    bucket.count += 1;
    if (bucket.count > max) {
      return { ok: false, retryAfter: Math.ceil((bucket.reset - now) / 1000) };
    }
    return { ok: true, retryAfter: 0 };
  };
}

/* -------------------------------------------------------------------- app -- */

export function createApp({ db, secret, appOrigin = 'http://localhost:3000' }) {
  const app = express();
  // Any https origin in the list means this deployment is served over https,
  // which is what allows a cross-site (SameSite=None) session cookie.
  const secureCookies = String(appOrigin)
    .split(',')
    .some((o) => o.trim().startsWith('https://'));
  const allowedOrigins = new Set(
    String(appOrigin)
      .split(',')
      .map((o) => o.trim().replace(/\/$/, ''))
      .filter(Boolean),
  );

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  const loginLimiter = limiter({ windowMs: 10 * 60_000, max: 12 });
  const registerLimiter = limiter({ windowMs: 10 * 60_000, max: 8 });
  const writeLimiter = limiter({ windowMs: 60_000, max: 90 });

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    next();
  });

  /** The caller's origin when it is one we serve: an allowed app origin, or ourselves. */
  function callerOrigin(req) {
    const raw = req.get('origin');
    if (!raw) return null;
    const clean = raw.replace(/\/$/, '');
    try {
      if (allowedOrigins.has(clean) || new URL(clean).host === req.get('host')) return clean;
    } catch {
      return null;
    }
    return null;
  }

  /**
   * The frontend may live on another site (Vercel) than the API (Render), so
   * answer CORS for the allowed origins and let the preflight through before
   * the mutation check runs.
   */
  app.use('/api', (req, res, next) => {
    const origin = callerOrigin(req);
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
      res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    return next();
  });

  // Cookie auth means mutations need an origin check as well as SameSite=*.
  app.use('/api', (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') return next();
    if (!req.get('origin')) return next(); // curl / tests
    if (callerOrigin(req)) return next();
    return res.status(403).json({ error: 'This origin is not allowed to change data.' });
  });

  /**
   * A cookie is only sent cross-site as SameSite=None, and browsers only accept
   * that over https. Same-origin deployments keep the stricter Lax.
   */
  function cookieShape(req) {
    const origin = req.get('origin');
    let crossSite = false;
    try {
      crossSite = Boolean(origin) && new URL(origin.replace(/\/$/, '')).host !== req.get('host');
    } catch {
      crossSite = false;
    }
    // Behind a TLS-terminating proxy the scheme is in the forwarded header.
    const secure = secureCookies || req.secure || req.get('x-forwarded-proto') === 'https';
    return { secure, crossSite };
  }

  app.use('/api', express.json({ limit: '512kb' }));

  /* --------------------------------------------------------------- session -- */

  async function sessionUser(req) {
    const token = parseCookies(req.get('cookie'))[SESSION_COOKIE];
    const claim = verifyToken(token, secret);
    if (!claim) return null;
    // A token whose session row is gone (signed out) is dead even if the
    // signature still checks out.
    const live = await db.prepare('SELECT 1 AS ok FROM sessions WHERE jti = ? AND expires_at > ?').get(claim.jti, Date.now());
    if (!live) return null;
    const row = await db.prepare('SELECT * FROM users WHERE id = ?').get(claim.userId);
    return row ?? null;
  }

  async function requireAuth(req, res, next) {
    const user = await sessionUser(req);
    if (!user) return res.status(401).json({ error: 'Sign in to continue.' });
    req.user = user;
    return next();
  }

  async function activityFor(userId) {
    const rows = await db.prepare('SELECT day, count FROM activity WHERE user_id = ?').all(userId);
    return Object.fromEntries(rows.map((r) => [r.day, r.count]));
  }

  async function streakFor(userId, today) {
    const days = (await db.prepare('SELECT day FROM activity WHERE user_id = ?').all(userId)).map((r) => r.day);
    return streaks(days, today);
  }

  async function issueSession(req, res, user) {
    const { token, jti, expiresAt } = signToken(user.id, secret);
    await db.prepare('INSERT INTO sessions (jti, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
      jti,
      user.id,
      Date.now(),
      expiresAt,
    );
    // Cheap housekeeping: dropped cookies and expired rows have no value.
    await db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
    res.setHeader('Set-Cookie', sessionCookie(token, cookieShape(req)));
  }

  /* ------------------------------------------------------------------ auth -- */

  app.post('/api/auth/register', async (req, res) => {
    const email = normaliseEmail(req.body?.email);
    const username = String(req.body?.username ?? '').trim().toLowerCase();
    const name = cleanName(req.body?.name || username);
    const password = String(req.body?.password ?? '');
    if (!EMAIL_RE.test(email) || !email.endsWith('@gmail.com')) return res.status(400).json({ error: 'Enter a valid Gmail address.', field: 'email' });
    if (!/^[a-z0-9_]{3,24}$/.test(username)) return res.status(400).json({ error: 'Username must be 3–24 letters, numbers, or underscores.', field: 'username' });
    if (password.length < 8) return res.status(400).json({ error: 'Use at least 8 characters for your password.', field: 'password' });
    if (password.length > 200) return res.status(400).json({ error: 'That password is too long.', field: 'password' });
    const limited = registerLimiter(`register:${req.ip}:${email}`);
    if (!limited.ok) return res.status(429).json({ error: `Too many attempts. Try again in ${limited.retryAfter}s.`, retryAfter: limited.retryAfter });
    const existing = await db.prepare('SELECT id FROM users WHERE email = ? OR username = ?').get(email, username);
    if (existing) return res.status(409).json({ error: 'That Gmail or username is already registered.', code: 'exists' });
    const id = newId();
    await db.prepare('INSERT INTO users (id, email, username, name, password_hash, verified, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)').run(
      id, email, username, name, hashPassword(password), new Date().toISOString(),
    );
    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    await issueSession(req, res, user);
    return res.status(201).json({ user: publicUser(user), streak: await streakFor(user.id, serverDay()) });
  });

  app.post('/api/auth/login', async (req, res) => {
    const identifier = String(req.body?.identifier ?? req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    if (!identifier || !password) {
      return res.status(400).json({ error: 'Enter your username or Gmail and password.' });
    }

    const limited = loginLimiter(`login:${req.ip}:${identifier}`);
    if (!limited.ok) {
      return res.status(429).json({ error: `Too many attempts. Try again in ${limited.retryAfter}s.`, retryAfter: limited.retryAfter });
    }

    const user = await db.prepare('SELECT * FROM users WHERE email = ? OR username = ?').get(identifier, identifier);
    // Same work on both branches so a missing account is not measurable.
    const stored = user?.password_hash ?? 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA';
    const valid = checkPassword(password, stored);
    if (!user || !valid) {
      return res.status(401).json({ error: 'Email or password is incorrect.' });
    }
    await issueSession(req, res, user);
    return res.json({ user: publicUser(user), streak: await streakFor(user.id, serverDay()) });
  });

  app.post('/api/auth/logout', async (req, res) => {
    const claim = verifyToken(parseCookies(req.get('cookie'))[SESSION_COOKIE], secret);
    if (claim) await db.prepare('DELETE FROM sessions WHERE jti = ?').run(claim.jti);
    res.setHeader('Set-Cookie', clearedSessionCookie(cookieShape(req)));
    return res.json({ ok: true });
  });

  app.get('/api/auth/me', async (req, res) => {
    const user = await sessionUser(req);
    if (!user) return res.status(401).json({ error: 'Not signed in.' });
    return res.json({ user: publicUser(user), streak: await streakFor(user.id, serverDay()) });
  });

  // Signs out every session for the account, not just this browser.
  app.post('/api/auth/sign-out-everywhere', requireAuth, async (req, res) => {
    const removed = await db.prepare('DELETE FROM sessions WHERE user_id = ?').run(req.user.id);
    res.setHeader('Set-Cookie', clearedSessionCookie(cookieShape(req)));
    return res.json({ ok: true, signedOut: Number(removed.changes ?? 0) });
  });

  /* -------------------------------------------------------------- progress -- */

  app.get('/api/progress', requireAuth, async (req, res) => {
    const row = await db.prepare('SELECT * FROM progress WHERE user_id = ?').get(req.user.id);
    const today = serverDay();
    const activity = await activityFor(req.user.id);
    if (!row) {
      return res.json({ planStart: null, entries: {}, activity, updatedAt: null, streak: await streakFor(req.user.id, today) });
    }
    let entries = {};
    try {
      entries = JSON.parse(row.entries_json);
    } catch {
      entries = {};
    }
    return res.json({
      planStart: row.plan_start,
      entries,
      activity,
      updatedAt: row.updated_at,
      streak: await streakFor(req.user.id, today),
    });
  });

  app.put('/api/progress', requireAuth, async (req, res) => {
    const limited = writeLimiter(`progress:${req.user.id}`);
    if (!limited.ok) {
      return res.status(429).json({ error: 'Saving too quickly. Give it a second.', retryAfter: limited.retryAfter });
    }

    const { errors, value } = validateProgress(req.body);
    if (errors) return res.status(422).json({ error: errors[0], errors });

    const { solved, mastered } = summarise(value.entries);
    const updatedAt = new Date().toISOString();
    // One batch: a single round trip to the database, all or nothing.
    const writes = [
      {
        sql:
          'INSERT INTO progress (user_id, plan_start, entries_json, solved, mastered, updated_at) VALUES (?, ?, ?, ?, ?, ?) ' +
          'ON CONFLICT(user_id) DO UPDATE SET plan_start = excluded.plan_start, entries_json = excluded.entries_json, ' +
          'solved = excluded.solved, mastered = excluded.mastered, updated_at = excluded.updated_at',
        args: [req.user.id, value.planStart, JSON.stringify(value.entries), solved, mastered, updatedAt],
      },
    ];
    const upsertDaySql =
      'INSERT INTO activity (user_id, day, count) VALUES (?, ?, ?) ' +
      'ON CONFLICT(user_id, day) DO UPDATE SET count = MAX(count, excluded.count)';
    for (const [day, count] of Object.entries(value.activity)) {
      if (isIsoDay(day)) writes.push({ sql: upsertDaySql, args: [req.user.id, day, count] });
    }
    await db.batch(writes);

    return res.json({ saved: true, updatedAt, solved, mastered, streak: await streakFor(req.user.id, serverDay()) });
  });

  /* ----------------------------------------------------------- leaderboard -- */

  app.get('/api/leaderboard', requireAuth, async (req, res) => {
    const today = isIsoDay(req.query.today) && isRecentDay(req.query.today) ? req.query.today : serverDay();

    const users = await db
      .prepare(
        'SELECT u.id, u.name, p.solved, p.mastered FROM users u ' +
          'LEFT JOIN progress p ON p.user_id = u.id',
      )
      .all();
    const activityRows = await db.prepare('SELECT user_id, day FROM activity').all();
    const byUser = new Map();
    for (const row of activityRows) {
      if (!byUser.has(row.user_id)) byUser.set(row.user_id, []);
      byUser.get(row.user_id).push(row.day);
    }

    const entries = users.map((u) => {
      const s = streaks(byUser.get(u.id) ?? [], today);
      return {
        id: u.id,
        name: u.name,
        initials: initials(u.name),
        solved: u.solved ?? 0,
        mastered: u.mastered ?? 0,
        currentStreak: s.current,
        longestStreak: s.longest,
        activeDays: s.totalDays,
        activeToday: s.activeToday,
        isYou: u.id === req.user.id,
      };
    });

    entries.sort(
      (a, b) =>
        b.currentStreak - a.currentStreak ||
        b.longestStreak - a.longestStreak ||
        b.solved - a.solved ||
        b.mastered - a.mastered ||
        a.name.localeCompare(b.name),
    );

    let rank = 0;
    let previous = null;
    entries.forEach((entry, index) => {
      const tied =
        previous &&
        previous.currentStreak === entry.currentStreak &&
        previous.longestStreak === entry.longestStreak &&
        previous.solved === entry.solved &&
        previous.mastered === entry.mastered;
      if (!tied) rank = index + 1;
      entry.rank = rank;
      previous = entry;
    });

    const you = entries.find((e) => e.isYou) ?? null;
    return res.json({ today, total: entries.length, entries: entries.slice(0, 50), you });
  });

  /* ----------------------------------------------------------------- misc -- */

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  app.use('/api', (req, res) => res.status(404).json({ error: 'No such endpoint.' }));

  // Built frontend, when present: assets first, then the SPA shell.
  const dist = join(import.meta.dirname, '../../frontend/dist');
  if (existsSync(dist)) {
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
      return res.sendFile(join(dist, 'index.html'));
    });
  }

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON body.' });
    if (error?.type === 'entity.too.large') return res.status(413).json({ error: 'That payload is too large.' });
    console.error('unhandled error:', error?.message ?? error);
    return res.status(500).json({ error: 'Something went wrong on the server.' });
  });

  return app;
}
