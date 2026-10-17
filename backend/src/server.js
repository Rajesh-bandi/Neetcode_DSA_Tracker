import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createApp } from './app.js';
import { openDatabase, defaultDatabasePath } from './db.js';
import { createMailer } from './mail.js';

const here = import.meta.dirname;

// Node can read .env itself; no dotenv dependency needed.
const envFile = resolve(here, '../.env');
if (existsSync(envFile)) {
  try {
    process.loadEnvFile(envFile);
  } catch (error) {
    console.warn('could not read backend/.env:', error?.message ?? error);
  }
}

const port = Number(process.env.PORT ?? 8787);
const appOrigin = process.env.APP_ORIGIN ?? 'http://localhost:3000';

/** A stable secret keeps sessions alive across restarts; the file is gitignored. */
function resolveSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const file = resolve(here, '../data/session.secret');
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  const secret = randomBytes(48).toString('base64url');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, secret, { mode: 0o600 });
  console.log('generated backend/data/session.secret (set SESSION_SECRET to override)');
  return secret;
}

const db = openDatabase(defaultDatabasePath());
const app = createApp({
  db,
  secret: resolveSecret(),
  mailer: createMailer(),
  appOrigin,
  isProduction: process.env.NODE_ENV === 'production',
});

const server = app.listen(port, '0.0.0.0', () => {
  const mail = createMailer().transport;
  console.log(`api listening on http://localhost:${port}  (mail: ${mail}, origin: ${appOrigin})`);
  if (mail === 'console') {
    console.log('SMTP is not configured — verification codes print to this console.');
  }
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
