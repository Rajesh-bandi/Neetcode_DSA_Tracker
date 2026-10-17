import express from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  checkPassword,
  clearedSessionCookie,
  constantTimeEqualHex,
  hashOtp,
  hashPassword,
  newId,
  newOtp,
  parseCookies,
  sessionCookie,
  signToken,
  verifyToken,
  SESSION_COOKIE,
} from './auth.js';
import { summarise, validateProgress } from './progress.js';
import { isIsoDay, isRecentDay, serverDay, streaks } from './streak.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_TTL_MS = 10 * 60_000;
const OTP_RESEND_COOLDOWN_MS = 45_000;
const OTP_MAX_ATTEMPTS = 5;

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

export function createApp({ db, secret, mailer, appOrigin = 'http://localhost:3000', isProduction = false }) {
  const app = express();
  const secureCookies = appOrigin.startsWith('https://');
  const allowedOrigins = new Set(
    String(appOrigin)
      .split(',')
      .map((o) => o.trim().replace(/\/$/, ''))
      .filter(Boolean),
  );

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  const loginLimiter = limiter({ windowMs: 10 * 60_000, max: 12 });
  const otpLimiter = limiter({ windowMs: 10 * 60_000, max: 8 });
  const writeLimiter = limiter({ windowMs: 60_000, max: 90 });

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    next();
  });

  // Cookie auth means mutations need a same-origin check as well as SameSite=Lax.
  app.use('/api', (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') return next();
    const origin = req.get('origin');
    if (!origin) return next(); // curl / tests
    const clean = origin.replace(/\/$/, '');
    let sameHost = false;
    try {
      sameHost = new URL(clean).host === req.get('host');
    } catch {
      sameHost = false;
    }
    if (allowedOrigins.has(clean) || sameHost) return next();
    return res.status(403).json({ error: 'This origin is not allowed to change data.' });
  });

  app.use('/api', express.json({ limit: '512kb' }));

  /* --------------------------------------------------------------- session -- */

  function sessionUser(req) {
    const token = parseCookies(req.get('cookie'))[SESSION_COOKIE];
    const claim = verifyToken(token, secret);
    if (!claim) return null;
    // A token whose session row is gone (signed out) is dead even if the
    // signature still checks out.
    const live = db.prepare('SELECT 1 AS ok FROM sessions WHERE jti = ? AND expires_at > ?').get(claim.jti, Date.now());
    if (!live) return null;
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(claim.userId);
    return row ?? null;
  }

  function requireAuth(req, res, next) {
    const user = sessionUser(req);
    if (!user) return res.status(401).json({ error: 'Sign in to continue.' });
    req.user = user;
    return next();
  }

  function activityFor(userId) {
    const rows = db.prepare('SELECT day, count FROM activity WHERE user_id = ?').all(userId);
    return Object.fromEntries(rows.map((r) => [r.day, r.count]));
  }

  function streakFor(userId, today) {
    const days = db.prepare('SELECT day FROM activity WHERE user_id = ?').all(userId).map((r) => r.day);
    return streaks(days, today);
  }

  function issueSession(res, user) {
    const { token, jti, expiresAt } = signToken(user.id, secret);
    db.prepare('INSERT INTO sessions (jti, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
      jti,
      user.id,
      Date.now(),
      expiresAt,
    );
    // Cheap housekeeping: dropped cookies and expired rows have no value.
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
    res.setHeader('Set-Cookie', sessionCookie(token, { secure: secureCookies }));
  }

  /* ------------------------------------------------------------------ auth -- */

  app.post('/api/auth/register', async (req, res) => {
    const email = normaliseEmail(req.body?.email);
    const name = cleanName(req.body?.name);
    const password = String(req.body?.password ?? '');

    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email address.', field: 'email' });
    if (name.length < 2) return res.status(400).json({ error: 'Tell us what to call you.', field: 'name' });
    if (password.length < 8) {
      return res.status(400).json({ error: 'Use at least 8 characters for your password.', field: 'password' });
    }
    if (password.length > 200) return res.status(400).json({ error: 'That password is too long.', field: 'password' });

    const limited = otpLimiter(`register:${req.ip}:${email}`);
    if (!limited.ok) {
      return res.status(429).json({ error: `Too many attempts. Try again in ${limited.retryAfter}s.`, retryAfter: limited.retryAfter });
    }

    const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (existing?.verified) {
      return res.status(409).json({ error: 'That email already has an account. Sign in instead.', code: 'exists' });
    }

    if (existing) {
      const pending = db.prepare('SELECT sent_at FROM otps WHERE email = ?').get(email);
      if (pending && Date.now() - pending.sent_at < OTP_RESEND_COOLDOWN_MS) {
        const wait = Math.ceil((OTP_RESEND_COOLDOWN_MS - (Date.now() - pending.sent_at)) / 1000);
        return res.status(429).json({ error: `A code was just sent. Wait ${wait}s before asking for another.`, retryAfter: wait });
      }
      db.prepare('UPDATE users SET name = ?, password_hash = ? WHERE id = ?').run(name, hashPassword(password), existing.id);
    } else {
      db.prepare('INSERT INTO users (id, email, name, password_hash, verified, created_at) VALUES (?, ?, ?, ?, 0, ?)').run(
        newId(),
        email,
        name,
        hashPassword(password),
        new Date().toISOString(),
      );
    }

    const code = newOtp();
    db.prepare(
      'INSERT INTO otps (email, code_hash, expires_at, attempts, sent_at) VALUES (?, ?, ?, 0, ?) ' +
        'ON CONFLICT(email) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, sent_at = excluded.sent_at',
    ).run(email, hashOtp(email, code, secret), Date.now() + OTP_TTL_MS, Date.now());

    try {
      await mailer.sendOtp({ email, code, name });
    } catch (error) {
      db.prepare('DELETE FROM otps WHERE email = ?').run(email);
      console.error('otp delivery failed:', error?.message ?? error);
      return res.status(502).json({ error: 'Could not send the code. Check the mail configuration and try again.' });
    }

    return res.status(201).json({
      verificationRequired: true,
      email,
      delivery: mailer.transport,
      // Console transport only exists when SMTP is unconfigured; never in production.
      ...(mailer.transport === 'console' && !isProduction ? { devCode: code } : {}),
    });
  });

  app.post('/api/auth/verify', (req, res) => {
    const email = normaliseEmail(req.body?.email);
    const code = String(req.body?.code ?? '').replace(/\s+/g, '');
    if (!EMAIL_RE.test(email) || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: 'Enter the six-digit code from your email.' });
    }

    const limited = otpLimiter(`verify:${req.ip}:${email}`);
    if (!limited.ok) {
      return res.status(429).json({ error: `Too many attempts. Try again in ${limited.retryAfter}s.`, retryAfter: limited.retryAfter });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) return res.status(400).json({ error: 'That code is not valid any more. Request a new one.' });

    const otp = db.prepare('SELECT * FROM otps WHERE email = ?').get(email);
    if (!otp) return res.status(400).json({ error: 'No code is waiting. Request a new one.', code: 'no-code' });
    if (otp.expires_at < Date.now()) {
      db.prepare('DELETE FROM otps WHERE email = ?').run(email);
      return res.status(400).json({ error: 'That code has expired. Request a new one.', code: 'expired' });
    }
    if (otp.attempts >= OTP_MAX_ATTEMPTS) {
      return res.status(429).json({ error: 'Too many wrong codes. Request a new one.', code: 'locked' });
    }
    if (!constantTimeEqualHex(otp.code_hash, hashOtp(email, code, secret))) {
      db.prepare('UPDATE otps SET attempts = attempts + 1 WHERE email = ?').run(email);
      const left = Math.max(0, OTP_MAX_ATTEMPTS - (otp.attempts + 1));
      return res.status(400).json({ error: `That code is not right. ${left} ${left === 1 ? 'try' : 'tries'} left.` });
    }

    db.prepare('UPDATE users SET verified = 1 WHERE id = ?').run(user.id);
    db.prepare('DELETE FROM otps WHERE email = ?').run(email);
    issueSession(res, user);
    return res.json({ user: publicUser({ ...user, verified: 1 }), streak: streakFor(user.id, serverDay()) });
  });

  app.post('/api/auth/resend', async (req, res) => {
    const email = normaliseEmail(req.body?.email);
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });

    const limited = otpLimiter(`resend:${req.ip}:${email}`);
    if (!limited.ok) {
      return res.status(429).json({ error: `Too many attempts. Try again in ${limited.retryAfter}s.`, retryAfter: limited.retryAfter });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || user.verified) {
      return res.status(400).json({ error: 'There is no pending sign-up for that email.', code: 'no-pending' });
    }

    const pending = db.prepare('SELECT sent_at FROM otps WHERE email = ?').get(email);
    if (pending && Date.now() - pending.sent_at < OTP_RESEND_COOLDOWN_MS) {
      const wait = Math.ceil((OTP_RESEND_COOLDOWN_MS - (Date.now() - pending.sent_at)) / 1000);
      return res.status(429).json({ error: `A code was just sent. Wait ${wait}s.`, retryAfter: wait });
    }

    const code = newOtp();
    db.prepare(
      'INSERT INTO otps (email, code_hash, expires_at, attempts, sent_at) VALUES (?, ?, ?, 0, ?) ' +
        'ON CONFLICT(email) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, sent_at = excluded.sent_at',
    ).run(email, hashOtp(email, code, secret), Date.now() + OTP_TTL_MS, Date.now());

    try {
      await mailer.sendOtp({ email, code, name: user.name });
    } catch (error) {
      console.error('otp delivery failed:', error?.message ?? error);
      return res.status(502).json({ error: 'Could not send the code. Check the mail configuration and try again.' });
    }

    return res.json({
      sent: true,
      delivery: mailer.transport,
      ...(mailer.transport === 'console' && !isProduction ? { devCode: code } : {}),
    });
  });

  app.post('/api/auth/login', (req, res) => {
    const email = normaliseEmail(req.body?.email);
    const password = String(req.body?.password ?? '');
    if (!EMAIL_RE.test(email) || !password) {
      return res.status(400).json({ error: 'Enter your email and password.' });
    }

    const limited = loginLimiter(`login:${req.ip}:${email}`);
    if (!limited.ok) {
      return res.status(429).json({ error: `Too many attempts. Try again in ${limited.retryAfter}s.`, retryAfter: limited.retryAfter });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    // Same work on both branches so a missing account is not measurable.
    const stored = user?.password_hash ?? 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA';
    const valid = checkPassword(password, stored);
    if (!user || !valid) {
      return res.status(401).json({ error: 'Email or password is incorrect.' });
    }
    if (!user.verified) {
      return res.status(403).json({ error: 'Verify your email before signing in.', code: 'unverified', email });
    }

    issueSession(res, user);
    return res.json({ user: publicUser(user), streak: streakFor(user.id, serverDay()) });
  });

  app.post('/api/auth/logout', (req, res) => {
    const claim = verifyToken(parseCookies(req.get('cookie'))[SESSION_COOKIE], secret);
    if (claim) db.prepare('DELETE FROM sessions WHERE jti = ?').run(claim.jti);
    res.setHeader('Set-Cookie', clearedSessionCookie());
    return res.json({ ok: true });
  });

  app.get('/api/auth/me', (req, res) => {
    const user = sessionUser(req);
    if (!user) return res.status(401).json({ error: 'Not signed in.' });
    return res.json({ user: publicUser(user), streak: streakFor(user.id, serverDay()) });
  });

  // Signs out every session for the account, not just this browser.
  app.post('/api/auth/sign-out-everywhere', requireAuth, (req, res) => {
    const removed = db.prepare('DELETE FROM sessions WHERE user_id = ?').run(req.user.id);
    res.setHeader('Set-Cookie', clearedSessionCookie());
    return res.json({ ok: true, signedOut: Number(removed.changes ?? 0) });
  });

  /* -------------------------------------------------------------- progress -- */

  app.get('/api/progress', requireAuth, (req, res) => {
    const row = db.prepare('SELECT * FROM progress WHERE user_id = ?').get(req.user.id);
    const today = serverDay();
    const activity = activityFor(req.user.id);
    if (!row) {
      return res.json({ planStart: null, entries: {}, activity, updatedAt: null, streak: streakFor(req.user.id, today) });
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
      streak: streakFor(req.user.id, today),
    });
  });

  app.put('/api/progress', requireAuth, (req, res) => {
    const limited = writeLimiter(`progress:${req.user.id}`);
    if (!limited.ok) {
      return res.status(429).json({ error: 'Saving too quickly. Give it a second.', retryAfter: limited.retryAfter });
    }

    const { errors, value } = validateProgress(req.body);
    if (errors) return res.status(422).json({ error: errors[0], errors });

    const { solved, mastered } = summarise(value.entries);
    const updatedAt = new Date().toISOString();
    db.prepare(
      'INSERT INTO progress (user_id, plan_start, entries_json, solved, mastered, updated_at) VALUES (?, ?, ?, ?, ?, ?) ' +
        'ON CONFLICT(user_id) DO UPDATE SET plan_start = excluded.plan_start, entries_json = excluded.entries_json, ' +
        'solved = excluded.solved, mastered = excluded.mastered, updated_at = excluded.updated_at',
    ).run(req.user.id, value.planStart, JSON.stringify(value.entries), solved, mastered, updatedAt);

    const upsertDay = db.prepare(
      'INSERT INTO activity (user_id, day, count) VALUES (?, ?, ?) ' +
        'ON CONFLICT(user_id, day) DO UPDATE SET count = MAX(count, excluded.count)',
    );
    for (const [day, count] of Object.entries(value.activity)) {
      if (isIsoDay(day)) upsertDay.run(req.user.id, day, count);
    }

    return res.json({ saved: true, updatedAt, solved, mastered, streak: streakFor(req.user.id, serverDay()) });
  });

  /* ----------------------------------------------------------- leaderboard -- */

  app.get('/api/leaderboard', requireAuth, (req, res) => {
    const today = isIsoDay(req.query.today) && isRecentDay(req.query.today) ? req.query.today : serverDay();

    const users = db
      .prepare(
        'SELECT u.id, u.name, p.solved, p.mastered FROM users u ' +
          'LEFT JOIN progress p ON p.user_id = u.id WHERE u.verified = 1',
      )
      .all();
    const activityRows = db.prepare('SELECT user_id, day FROM activity').all();
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

  app.get('/api/health', (req, res) => res.json({ ok: true, mail: mailer.transport }));

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
