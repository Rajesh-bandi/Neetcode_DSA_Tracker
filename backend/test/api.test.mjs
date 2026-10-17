/**
 * End-to-end check of the API: a real Express server, a real SQLite file and
 * real HTTP requests. Run with `npm test` in backend/.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db.js';
import { signToken } from '../src/auth.js';
import { streaks } from '../src/streak.js';

let checks = 0;
let failures = 0;

function check(name, condition, detail = '') {
  checks += 1;
  if (condition) {
    console.log(`  ok    ${name}`);
  } else {
    failures += 1;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const dir = mkdtempSync(join(tmpdir(), 'nc150-api-'));
const db = await openDatabase({ file: join(dir, 'test.db') });
const sent = [];
const mailer = {
  transport: 'console',
  async sendOtp({ email, code }) {
    sent.push({ email, code });
  },
};
const SECRET = 'test-secret-not-for-production';
const app = createApp({ db, secret: SECRET, mailer, appOrigin: 'http://localhost:3000', isProduction: true });
const server = await new Promise((resolve) => {
  const s = app.listen(0, '127.0.0.1', () => resolve(s));
});
const base = `http://127.0.0.1:${server.address().port}`;

/** Minimal cookie jar: the API sets exactly one cookie. */
let cookie = '';

async function call(method, path, body, options = {}) {
  const headers = { ...(options.headers ?? {}) };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (options.cookie ?? cookie) headers.cookie = options.cookie ?? cookie;
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    redirect: 'manual',
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  if (setCookie.length && options.capture !== false) {
    cookie = setCookie.map((c) => c.split(';')[0]).join('; ');
  }
  let data = null;
  const type = res.headers.get('content-type') ?? '';
  if (type.includes('application/json')) data = await res.json();
  else data = await res.text();
  return { status: res.status, data, setCookie, raw: res };
}

const lastCode = () => sent.at(-1)?.code;

try {
  console.log('\nhealth');
  const health = await call('GET', '/api/health');
  check('health answers', health.status === 200 && health.data.ok === true);

  console.log('\nregistration');
  const email = 'ada@example.com';
  const password = 'correct horse battery';
  const register = await call('POST', '/api/auth/register', { email, password, name: 'Ada Lovelace' });
  check('register creates a pending account', register.status === 201, `${register.status}`);
  check('register asks for verification', register.data.verificationRequired === true);
  check('a six-digit code was generated', /^\d{6}$/.test(lastCode() ?? ''), lastCode());
  check('the response never contains the password', !JSON.stringify(register.data).includes(password));
  check('production responses do not leak the code', register.data.devCode === undefined);

  const badEmail = await call('POST', '/api/auth/register', { email: 'not-an-email', password, name: 'X Y' });
  check('invalid email is rejected', badEmail.status === 400 && badEmail.data.field === 'email');

  const shortPassword = await call('POST', '/api/auth/register', { email: 'b@example.com', password: 'short', name: 'B B' });
  check('short password is rejected', shortPassword.status === 400 && shortPassword.data.field === 'password');

  console.log('\nverification');
  const wrong = await call('POST', '/api/auth/verify', { email, code: '000000' });
  check('a wrong code is rejected', wrong.status === 400, `${wrong.status}`);

  const verify = await call('POST', '/api/auth/verify', { email, code: lastCode() });
  check('the emailed code verifies the account', verify.status === 200, `${verify.status}`);
  check('verification issues a session cookie', cookie.includes('nc_session='), cookie);
  check('the cookie is http-only and lax', verify.setCookie[0].includes('HttpOnly') && verify.setCookie[0].includes('SameSite=Lax'));
  check('the user comes back verified', verify.data.user?.verified === true);
  check('the email is normalised to lower case', verify.data.user?.email === email);

  const reuse = await call('POST', '/api/auth/verify', { email, code: lastCode() });
  check('a code cannot be used twice', reuse.status === 400, `${reuse.status}`);

  const duplicate = await call('POST', '/api/auth/register', { email, password, name: 'Ada Again' });
  check('registering a verified email is refused', duplicate.status === 409 && duplicate.data.code === 'exists');

  console.log('\nsession revocation');
  const beforeLogout = cookie;
  await call('POST', '/api/auth/logout', {});
  const reused = await call('GET', '/api/auth/me', undefined, { cookie: beforeLogout });
  check('a signed-out token stops working', reused.status === 401, `${reused.status}`);

  const ghost = signToken('nobody', SECRET).token;
  const ghostCheck = await call('GET', '/api/auth/me', undefined, { cookie: `nc_session=${ghost}` });
  check('a correctly signed token with no session is refused', ghostCheck.status === 401, `${ghostCheck.status}`);

  const first = await call('POST', '/api/auth/login', { email, password });
  const firstCookie = first.setCookie.map((c) => c.split(';')[0]).join('; ');
  const second = await call('POST', '/api/auth/login', { email, password }, { capture: false });
  const secondDevice = second.setCookie.map((c) => c.split(';')[0]).join('; ');
  check('two devices hold separate sessions', firstCookie !== secondDevice && Boolean(secondDevice));

  const everywhere = await call('POST', '/api/auth/sign-out-everywhere', {}, { cookie: firstCookie });
  check('signing out everywhere reports the sessions dropped', everywhere.status === 200 && everywhere.data.signedOut === 2, JSON.stringify(everywhere.data));
  check(
    'the other device is signed out too',
    (await call('GET', '/api/auth/me', undefined, { cookie: secondDevice })).status === 401,
  );
  await call('POST', '/api/auth/login', { email, password });

  console.log('\nsessions');
  const me = await call('GET', '/api/auth/me');
  check('me returns the signed-in user', me.status === 200 && me.data.user.email === email, `${me.status}`);
  check('me includes a streak object', typeof me.data.streak?.current === 'number');
  check('me never returns the password hash', !JSON.stringify(me.data).includes('scrypt$'));

  const anonMe = await call('GET', '/api/auth/me', undefined, { cookie: 'nc_session=' });
  check('me without a cookie is 401', anonMe.status === 401);

  const forged = await call('GET', '/api/auth/me', undefined, { cookie: 'nc_session=abc.def' });
  check('a forged token is rejected', forged.status === 401);

  const wrongPassword = await call('POST', '/api/auth/login', { email, password: 'nope nope nope' });
  check('wrong password is refused', wrongPassword.status === 401);
  check('wrong password does not reveal whether the account exists', wrongPassword.data.error === 'Email or password is incorrect.');

  const login = await call('POST', '/api/auth/login', { email, password });
  check('correct password signs in', login.status === 200 && Boolean(login.data.user));
  check('login returns a fresh cookie', login.setCookie.length > 0);

  console.log('\norigin guard');
  const foreign = await call('POST', '/api/auth/logout', {}, { headers: { origin: 'https://evil.example' } });
  check('a foreign origin cannot mutate', foreign.status === 403, `${foreign.status}`);
  const sameOrigin = await call('POST', '/api/auth/logout', {}, { headers: { origin: 'http://localhost:3000' } });
  check('the configured origin can mutate', sameOrigin.status === 200, `${sameOrigin.status}`);
  await call('POST', '/api/auth/login', { email, password });

  console.log('\nprogress sync');
  const anonProgress = await call('PUT', '/api/progress', { planStart: '2026-01-05', entries: {} }, { cookie: 'nc_session=' });
  check('progress requires a session', anonProgress.status === 401);

  const badPayload = await call('PUT', '/api/progress', {
    planStart: 'not-a-date',
    entries: { 'w1-1': { solvedOn: '2026-01-05', marks: { day99: 'done' } } },
  });
  check('invalid progress is refused', badPayload.status === 422, `${badPayload.status}`);
  check('the validation message names the problem', typeof badPayload.data.error === 'string');

  const today = new Date();
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const day = (offset) => {
    const d = new Date(today);
    d.setDate(d.getDate() + offset);
    return iso(d);
  };

  const payload = {
    planStart: day(-14),
    entries: {
      'w1-1': { solvedOn: day(-2), marks: { day3: 'done' }, notes: { pattern: 'hash map' } },
      'w1-2': { solvedOn: day(-31), marks: { day3: 'done', day7: 'done', day30: 'done' } },
      'w1-3': { solvedOn: day(-1), marks: { day3: 'redo' } },
    },
    activity: { [day(0)]: 2, [day(-1)]: 3, [day(-2)]: 1 },
  };
  const saved = await call('PUT', '/api/progress', payload);
  check('progress saves', saved.status === 200 && saved.data.saved === true, `${saved.status}`);
  check('solved count is derived server-side', saved.data.solved === 3, String(saved.data.solved));
  check('mastered count is derived server-side', saved.data.mastered === 1, String(saved.data.mastered));
  check('a three-day run reads as a streak', saved.data.streak.current === 3, JSON.stringify(saved.data.streak));

  const loaded = await call('GET', '/api/progress');
  check('progress round-trips', loaded.status === 200 && Object.keys(loaded.data.entries).length === 3);
  check('notes round-trip', loaded.data.entries['w1-1'].notes.pattern === 'hash map');
  check('the plan start round-trips', loaded.data.planStart === payload.planStart);

  const lowered = await call('PUT', '/api/progress', { ...payload, activity: { [day(0)]: 1 } });
  check('a lower activity count does not erase the day', lowered.status === 200);
  const afterLower = await call('GET', '/api/progress');
  check('activity keeps the highest count for a day', afterLower.data.activity[day(0)] === 2, JSON.stringify(afterLower.data.activity));

  console.log('\nisolation and leaderboard');
  const otherEmail = 'grace@example.com';
  await call('POST', '/api/auth/register', { email: otherEmail, password: 'hopper 1906 !!', name: 'Grace Hopper' });
  const otherVerify = await call('POST', '/api/auth/verify', { email: otherEmail, code: lastCode() }, { capture: false });
  check('the second account verifies', otherVerify.status === 200);
  const otherCookie = otherVerify.setCookie.map((c) => c.split(';')[0]).join('; ');

  const otherProgress = await call('GET', '/api/progress', undefined, { cookie: otherCookie });
  check('a new account starts empty', Object.keys(otherProgress.data.entries).length === 0);
  check('a new account has no activity', Object.keys(otherProgress.data.activity).length === 0);

  const board = await call('GET', '/api/leaderboard', undefined, { cookie: 'nc_session=' });
  check('the leaderboard requires a session', board.status === 401, `${board.status}`);

  const boardAuthed = await call('GET', '/api/leaderboard');
  check('the leaderboard lists both accounts', boardAuthed.status === 200 && boardAuthed.data.total === 2, String(boardAuthed.data.total));
  check('the streak holder is first', boardAuthed.data.entries[0].name === 'Ada Lovelace');
  check('the leader is ranked one', boardAuthed.data.entries[0].rank === 1);
  check('the leader shows a 3-day streak', boardAuthed.data.entries[0].currentStreak === 3);
  check('the second account sits at zero', boardAuthed.data.entries[1].currentStreak === 0);
  check('the leaderboard marks you', boardAuthed.data.entries.some((e) => e.isYou));
  check('the leaderboard never exposes emails', !JSON.stringify(boardAuthed.data).includes('@example.com'));
  check('initials are derived', boardAuthed.data.entries[0].initials === 'AL');

  // Three consecutive days for Grace so the ordering is not just a tie-break.
  const graceDays = [day(0), day(-1), day(-2), day(-3), day(-4)];
  await call(
    'PUT',
    '/api/progress',
    {
      planStart: day(-7),
      entries: { 'w2-1': { solvedOn: day(0), marks: {} } },
      activity: Object.fromEntries(graceDays.map((d) => [d, 1])),
    },
    { cookie: otherCookie },
  );
  const reordered = await call('GET', '/api/leaderboard');
  check('a five-day streak takes the lead', reordered.data.entries[0].name === 'Grace Hopper', reordered.data.entries[0].name);
  check('longest streak is tracked', reordered.data.entries[0].longestStreak === 5);
  check('today is reported as active', reordered.data.entries[0].activeToday === true);
  check('the viewer is pinned as you', reordered.data.you?.name === 'Ada Lovelace');

  console.log('\notp limits');
  const lockEmail = 'lock@example.com';
  await call('POST', '/api/auth/register', { email: lockEmail, password: 'long enough password', name: 'Lock Test' });
  for (let i = 0; i < 5; i += 1) {
    await call('POST', '/api/auth/verify', { email: lockEmail, code: '111111' });
  }
  const locked = await call('POST', '/api/auth/verify', { email: lockEmail, code: '111111' });
  check('five wrong codes lock the attempt', locked.status === 429, `${locked.status}`);
  const lockedRight = await call('POST', '/api/auth/verify', { email: lockEmail, code: lastCode() });
  check('a locked account needs a new code', lockedRight.status === 429);
  const resend = await call('POST', '/api/auth/resend', { email: lockEmail });
  check('resending is rate limited right after a send', resend.status === 429 && resend.data.retryAfter > 0, `${resend.status}`);

  console.log('\nstreak helper');
  const set = new Set([day(0), day(-1), day(-2), day(-5), day(-6)]);
  const s = streaks(set, day(0));
  check('streak counts back from today', s.current === 3, JSON.stringify(s));
  check('longest streak is the biggest run', s.longest === 3, JSON.stringify(s));
  check('a missed yesterday ends the streak', streaks(new Set([day(-2)]), day(0)).current === 0);
  check('yesterday still counts as alive', streaks(new Set([day(-1), day(-2)]), day(0)).current === 2);
  check('no activity means no streak', streaks(new Set(), day(0)).current === 0);

  console.log('\nmisc');
  const notFound = await call('GET', '/api/nope');
  check('unknown endpoints return JSON 404', notFound.status === 404 && notFound.data.error);
  const huge = await call('PUT', '/api/progress', '{"planStart":"2026-01-05","entries":{},"pad":"' + 'x'.repeat(600_000) + '"}');
  check('oversized bodies are refused', huge.status === 413, `${huge.status}`);
} finally {
  await new Promise((resolve) => server.close(resolve));
  db.close();
  rmSync(dir, { recursive: true, force: true });
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) {
  console.error(`${failures} FAILED`);
  process.exitCode = 1;
}
