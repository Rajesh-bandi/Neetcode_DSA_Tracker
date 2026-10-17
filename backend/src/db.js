import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * Single connection, WAL, foreign keys on. Node's built-in SQLite keeps the
 * project dependency-free on the native side.
 */
export function openDatabase(file) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      email         TEXT NOT NULL UNIQUE,
      name          TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      verified      INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS otps (
      email      TEXT PRIMARY KEY,
      code_hash  TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      attempts   INTEGER NOT NULL DEFAULT 0,
      sent_at    INTEGER NOT NULL
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
  `);
  return db;
}

export function defaultDatabasePath() {
  const fromEnv = process.env.DB_PATH;
  if (fromEnv) return resolve(fromEnv);
  return resolve(import.meta.dirname, '../data/tracker.db');
}
