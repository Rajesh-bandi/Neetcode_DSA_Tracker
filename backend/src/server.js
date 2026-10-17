import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createApp } from './app.js';
import { openDatabase } from './db.js';

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

// PORT=0 means "any free port" to Node, which breaks the frontend proxy that
// expects 8787; treat a non-positive or unparsable value as unset.
const configuredPort = Number(process.env.PORT);
const port = Number.isInteger(configuredPort) && configuredPort > 0 ? configuredPort : 8787;
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

// Turso when TURSO_DATABASE_URL is set (production), a local file otherwise.
const db = await openDatabase();
const app = createApp({
  db,
  secret: resolveSecret(),
  appOrigin,
});

const server = app.listen(port, '0.0.0.0', () => console.log(`api listening on http://localhost:${port}  (origin: ${appOrigin})`));

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
