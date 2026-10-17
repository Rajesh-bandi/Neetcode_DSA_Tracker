/**
 * Full-stack check: starts the real backend on its own database, points the
 * browser's fetch at it with a cookie jar, and drives sign-up, the emailed
 * account, progress sync, the leaderboard and sign-out through the actual UI.
 * Run with scripts/verify.sh.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { createElement } from 'react';

let checks = 0;
let failures = 0;
function check(name: string, condition: boolean, detail = '') {
  checks += 1;
  if (condition) {
    console.log(`  ok    ${name}`);
  } else {
    failures += 1;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const cwd = process.cwd();
const serverEntry = resolve(cwd, '../backend/src/server.js');
if (!existsSync(serverEntry)) throw new Error(`backend not found at ${serverEntry}`);

const PORT = 8788;
const dir = mkdtempSync(join(tmpdir(), 'nc150-e2e-'));
const ORIGIN = 'http://localhost:3000';

const server = spawn(process.execPath, [serverEntry], {
  cwd: resolve(cwd, '../backend'),
  env: {
    ...process.env,
    PORT: String(PORT),
    DB_PATH: join(dir, 'e2e.db'),
    APP_ORIGIN: ORIGIN,
    SESSION_SECRET: 'e2e-secret-not-for-production',
    NODE_ENV: 'test',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let serverLog = '';
server.stdout.on('data', (chunk) => {
  serverLog += chunk;
});
server.stderr.on('data', (chunk) => {
  serverLog += chunk;
});

const nodeFetch = globalThis.fetch;
const base = `http://127.0.0.1:${PORT}`;

/** Waits for the API to answer before the UI starts talking to it. */
async function waitForServer(deadlineMs = 15_000) {
  const started = Date.now();
  while (Date.now() - started < deadlineMs) {
    try {
      const res = await nodeFetch(`${base}/api/health`);
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

/* ------------------------------------------------------------ jsdom setup -- */

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: `${ORIGIN}/`,
  pretendToBeVisual: true,
});
const { window } = dom;

function setGlobal(name: string, value: unknown) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

/** Stands in for the browser: same-origin cookies, real HTTP to the API. */
const jar = new Map();
async function browserFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const absolute = /^https?:/.test(raw) ? raw : `${base}${raw}`;
  const headers = new Headers(init.headers ?? {});
  if (jar.size) headers.set('cookie', [...jar].map(([k, v]) => `${k}=${v}`).join('; '));
  const method = (init.method ?? 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') headers.set('origin', ORIGIN);

  const response = await nodeFetch(absolute, { ...init, headers, redirect: 'manual' });
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(';')[0];
    const index = pair.indexOf('=');
    const key = pair.slice(0, index);
    const value = pair.slice(index + 1);
    if (value) jar.set(key, value);
    else jar.delete(key);
  }
  return response;
}

setGlobal('window', window);
setGlobal('document', window.document);
setGlobal('navigator', window.navigator);
setGlobal('localStorage', window.localStorage);
setGlobal('HTMLElement', window.HTMLElement);
setGlobal('Event', window.Event);
setGlobal('MouseEvent', window.MouseEvent);
setGlobal('getComputedStyle', window.getComputedStyle.bind(window));
setGlobal('IS_REACT_ACT_ENVIRONMENT', true);
setGlobal('fetch', browserFetch);

(window as unknown as { matchMedia: unknown }).matchMedia = () => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {},
});

const text = (selector: string) => document.querySelector(selector)?.textContent ?? '';
const bodyText = () => document.body.textContent ?? '';
const boardDebug = () => `${document.querySelectorAll('.lb__row').length} rows`;
function click(selectorOrEl: string | Element | null | undefined) {
  const el = typeof selectorOrEl === 'string' ? document.querySelector(selectorOrEl) : selectorOrEl;
  if (!el) throw new Error(`missing element ${String(selectorOrEl)}`);
  (el as HTMLElement).click();
}
function navTo(label: string) {
  const target = [...document.querySelectorAll('.navitem')].find((b) => b.textContent?.includes(label));
  if (!target) throw new Error(`no nav item ${label}`);
  (target as HTMLElement).click();
}
/**
 * React tracks input values on the element, so a plain `.value = x` is ignored
 * as "unchanged". Set through the native setter, then fire the same event a
 * user would.
 */
function fill(selector: string, value: string) {
  const input = document.querySelector<HTMLInputElement>(selector);
  if (!input) throw new Error(`missing input ${selector}`);
  const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
  input.dispatchEvent(new window.Event('change', { bubbles: true }));
}

async function waitFor(predicate: () => boolean, timeoutMs = 6000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return true;
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });
  }
  return predicate();
}

/** Same idea, for a predicate that has to ask the API. */
async function waitUntil(predicate: () => Promise<boolean>, timeoutMs = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await predicate()) return true;
    await act(async () => {
      await new Promise((r) => setTimeout(r, 80));
    });
  }
  return await predicate();
}

/* ------------------------------------------------------------------ run -- */

const { createRoot } = await import('react-dom/client');
const { act } = await import('react');
const { default: App } = await import('../src/App');
const { PROBLEMS } = await import('../src/data/problems');
const { STORE_KEY, todayISO } = await import('../src/lib/state');
const { shiftDay } = await import('../src/lib/streak');

try {
  const up = await waitForServer();
  if (!up) throw new Error(`api did not start:\n${serverLog}`);
  console.log(`\napi ready on ${base}`);

  // A browser with two days of local work already done.
  const today = todayISO();
  const yesterday = shiftDay(today, -1);
  localStorage.setItem(
    STORE_KEY,
    JSON.stringify({
      version: 2,
      planStart: shiftDay(today, -7),
      entries: {
        [PROBLEMS[0].id]: { solvedOn: yesterday, marks: { day3: 'done' } },
        [PROBLEMS[1].id]: { solvedOn: today, marks: {} },
      },
      activity: { [yesterday]: 2, [today]: 1 },
    }),
  );

  const container = document.createElement('div');
  document.getElementById('root')!.appendChild(container);
  const root = createRoot(container);
  window.location.hash = '#/home';
  await act(async () => {
    root.render(createElement(App));
  });

  console.log('\nbefore signing in');
  check('a guest is offered an account', bodyText().includes('Sign in to sync'));
  check('local work is visible without the API', text('.ledger__v').trim() === '2', text('.ledger__v'));
  check('no session token is kept in localStorage', !Object.keys(localStorage).some((k) => /token|session/i.test(k)));

  console.log('\nregistering');
  await act(async () => {
    navTo('Today');
    click(document.querySelector('.rail__signin'));
  });
  check('the sign-up form opens', bodyText().includes('Keep the streak in one place'));

  const email = 'e2e@gmail.com';
  await act(async () => {
    fill('input[type="text"]', 'TestRunner');
    fill('input[type="email"]', email);
    fill('input[type="password"]', 'e2e password 123');
  });
  await act(async () => {
    click('button[type="submit"]');
  });
  const signedIn = await waitFor(() => bodyText().includes('TestRunner'));
  check('the account opens the app signed in', signedIn);

  const sessionCookie = jar.get('nc_session');
  check('the server issued a session cookie', Boolean(sessionCookie), String(sessionCookie));

  console.log('\nprogress reaches the server');

  async function serverProgress() {
    const res = await nodeFetch(`${base}/api/progress`, {
      headers: { cookie: `nc_session=${jar.get('nc_session')}` },
    });
    if (!res.ok) return null;
    return res.json();
  }

  const stored = await waitUntil(async () => {
    const current = await serverProgress();
    return current !== null && Object.keys(current.entries ?? {}).length === 2;
  })
    ? await serverProgress()
    : null;
  check('the account holds the local progress', stored !== null);
  check('both local problems were uploaded', Object.keys(stored?.entries ?? {}).length === 2, JSON.stringify(Object.keys(stored?.entries ?? {})));
  check('the local plan start was uploaded', stored?.planStart === shiftDay(today, -7), String(stored?.planStart));
  check('the remote activity keeps both days', Object.keys(stored?.activity ?? {}).length === 2, JSON.stringify(stored?.activity));
  check('the day three mark survived the trip', stored?.entries[PROBLEMS[0].id]?.marks?.day3 === 'done');

  const accountBoard = await (
    await nodeFetch(`${base}/api/leaderboard?today=${today}`, { headers: { cookie: `nc_session=${jar.get('nc_session')}` } })
  ).json();
  check('the server derives the solved count', accountBoard.you?.solved === 2, JSON.stringify(accountBoard.you));
  check('the server derives the streak', accountBoard.you?.currentStreak === 2, JSON.stringify(accountBoard.you));

  const me = await (await nodeFetch(`${base}/api/auth/me`, { headers: { cookie: `nc_session=${jar.get('nc_session')}` } })).json();
  check('the account is verified', me.user?.verified === true);
  check('the server sees a two-day streak', me.streak?.current === 2, JSON.stringify(me.streak));
  check('the account never returns a password hash', !JSON.stringify(me).includes('scrypt$'));

  console.log('\nthe board reads the real database');
  await act(async () => {
    navTo('Streak board');
  });
  const boardLoaded = await waitFor(() => bodyText().includes('Ranked by') && Boolean(document.querySelector('.lb__row')));
  check('the board loads for a signed-in account', boardLoaded, boardDebug());
  check('the board shows the account', text('.lb__name').includes('TestRunner'), text('.lb__name'));
  check('the board marks your own row', bodyText().includes('you'));
  check('the board shows the streak length', text('.lb__streak').trim().startsWith('2'), text('.lb__streak'));
  check('the board never shows an email', !bodyText().includes('@gmail.com'));

  console.log('\nthe pet follows the synced streak');
  await act(async () => {
    navTo('Today');
  });
  check(
    'the pet is content on a two-day run logged today',
    Boolean(document.querySelector('.pet--content')),
    document.querySelector('.pet')?.getAttribute('class') ?? 'no pet',
  );
  check('the ledger agrees with the server', text('.ledger__v').trim() === '2', text('.ledger__v'));
  check('the rail reports a saved state', text('.rail__whoMeta').includes('synced'), text('.rail__whoMeta'));

  console.log('\naccount settings');
  await act(async () => {
    navTo('Settings');
  });
  check('settings shows the signed-in account', text('.settings__identity').includes(email));
  check('settings offers password change and clear progress', Boolean(document.querySelector('.settings__form')) && Boolean(document.querySelector('.settings__clear')));
  const changedPassword = 'a fresh e2e password 456';
  await act(async () => {
    fill('#settings-current-password', 'e2e password 123');
    fill('#settings-new-password', changedPassword);
    fill('#settings-confirm-password', changedPassword);
  });
  await act(async () => {
    click([...document.querySelectorAll('.settings__form button')].find((b) => b.textContent?.includes('Save new password')));
  });
  check('settings can change the password and keep the session', await waitFor(() => bodyText().includes('Password changed.')));

  console.log('\nwriting while signed in');
  await act(async () => {
    navTo('Tracker');
  });
  await act(async () => {
    click(document.querySelector('button[role="checkbox"]:not([aria-checked="true"])'));
  });
  const thirdOnServer = await waitUntil(async () => {
    const now = await serverProgress();
    return Object.keys(now?.entries ?? {}).length === 3;
  });
  check('a new solve syncs to the account', thirdOnServer === true);

  console.log('\nsigning out');
  const signOutButton = [...document.querySelectorAll('.rail__reset')].find((b) => b.textContent?.includes('Sign out'));
  await act(async () => {
    click(signOutButton);
  });
  await waitFor(() => bodyText().includes('Sign in to sync'));
  check('signing out returns the guest state', bodyText().includes('Sign in to sync'));
  check('the session cookie was cleared', !jar.get('nc_session'), String(jar.get('nc_session')));
  check(
    'local progress survives signing out',
    Object.keys((JSON.parse(localStorage.getItem(STORE_KEY) as string) as { entries: Record<string, unknown> }).entries).length === 3,
  );

  const anonMe = await nodeFetch(`${base}/api/auth/me`, { headers: { cookie: `nc_session=${sessionCookie}` } });
  check('the old session is rejected after signing out', anonMe.status === 401, String(anonMe.status));

  console.log('\nsigning back in');
  await act(async () => {
    click(document.querySelector('.rail__signin'));
  });
  await act(async () => {
    click([...document.querySelectorAll('.panel__link')].find((b) => b.textContent?.includes('I have one')));
  });
  await act(async () => {
    fill('input[autocomplete="username"]', email);
    fill('input[type="password"]', changedPassword);
  });
  await act(async () => {
    click('button[type="submit"]');
  });
  const backIn = await waitFor(() => bodyText().includes('TestRunner'));
  check('a password sign-in works', backIn);

  const wrong = await nodeFetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN },
    body: JSON.stringify({ email, password: 'wrong password here' }),
  });
  check('the API refuses a wrong password', wrong.status === 401, String(wrong.status));
} catch (error) {
  failures += 1;
  checks += 1;
  console.error(`\n  FAIL  the run threw: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  server.kill('SIGTERM');
  rmSync(dir, { recursive: true, force: true });
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) {
  console.error(`${failures} FAILED`);
  process.exitCode = 1;
}
process.exit(failures > 0 ? 1 : 0);
