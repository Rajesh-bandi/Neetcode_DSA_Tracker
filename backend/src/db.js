import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createClient } from '@libsql/client';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    username      TEXT UNIQUE,
    name          TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    verified      INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS progress (
    user_id      TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    plan_start   TEXT NOT NULL,
    entries_json TEXT NOT NULL,
    solved       INTEGER NOT NULL DEFAULT 0,
    mastered     INTEGER NOT NULL DEFAULT 0,
    updated_at   TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS activity (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day     TEXT NOT NULL,
    count   INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (user_id, day)
  );

  -- One row per issued session cookie, so signing out revokes the token.
  CREATE TABLE IF NOT EXISTS sessions (
    jti        TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
`;

/**
 * The query interface the app uses: `await db.prepare(sql).get/all/run(args)`,
 * plus `db.batch(statements)` for several writes in one round trip. libSQL is
 * SQLite, so every statement above and in app.js runs unchanged against
 * Turso's hosted database or a file on disk.
 */
function shim(client) {
  return {
    prepare(sql) {
      return {
        get: (...args) => client.execute({ sql, args }).then((result) => result.rows[0]),
        all: (...args) => client.execute({ sql, args }).then((result) => result.rows),
        run: (...args) => client.execute({ sql, args }).then((result) => ({ changes: result.rowsAffected })),
      };
    },
    /** Runs the statements in order inside one transaction; one network hop. */
    batch: (statements) =>
      client
        .batch(statements.map(({ sql, args = [] }) => ({ sql, args })), 'write')
        .then((results) => results.map((result) => ({ changes: result.rowsAffected }))),
    close: () => client.close(),
  };
}

/**
 * With TURSO_DATABASE_URL set (production on Render) the database lives on
 * Turso, so accounts and progress survive the host's ephemeral filesystem.
 * Without it — development and the test suite — the same code opens a local
 * SQLite file and needs no account or network.
 */
export async function openDatabase({ url, authToken, file } = {}) {
  const remoteUrl = url ?? process.env.TURSO_DATABASE_URL?.trim();
  if (remoteUrl) {
    // Turso enforces foreign keys and manages its own journaling.
    const token = authToken ?? (process.env.TURSO_AUTH_TOKEN?.trim() || undefined);
    const client = createClient({ url: remoteUrl, authToken: token });
    await client.executeMultiple(SCHEMA);
    await migrateUsers(client);
    return shim(client);
  }

  const path = file ?? (process.env.DB_PATH ? resolve(process.env.DB_PATH) : defaultDatabasePath());
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const client = createClient({ url: `file:${path}` });
  await client.execute('PRAGMA journal_mode = WAL');
  await client.execute('PRAGMA foreign_keys = ON');
  await client.executeMultiple(SCHEMA);
  await migrateUsers(client);
  return shim(client);
}

async function migrateUsers(client) {
  const columns = await client.execute('PRAGMA table_info(users)');
  if (!columns.rows.some((column) => column.name === 'username')) {
    await client.execute('ALTER TABLE users ADD COLUMN username TEXT');
  }
  await client.execute('CREATE UNIQUE INDEX IF NOT EXISTS users_username ON users(username)');
  await client.execute('DROP TABLE IF EXISTS otps');
}

function defaultDatabasePath() {
  const fromEnv = process.env.DB_PATH;
  if (fromEnv) return resolve(fromEnv);
  return resolve(import.meta.dirname, '../data/tracker.db');
}
