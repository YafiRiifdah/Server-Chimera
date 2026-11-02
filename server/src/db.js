import Database from 'better-sqlite3';
import path from 'path';
import bcrypt from 'bcrypt';
import { DATA_DIR, ensureBaseDirectories, INITIAL_ADMIN, DEFAULT_QUOTA_BYTES } from './config.js';

let dbInstance = null;

export function getDb() {
  if (dbInstance) return dbInstance;

  ensureBaseDirectories();
  const dbPath = path.join(DATA_DIR, 'chimera.db');
  dbInstance = new Database(dbPath);

  // Optimasi SQLite: WAL mode & Foreign Keys
  dbInstance.pragma('journal_mode = WAL');
  dbInstance.pragma('foreign_keys = ON');

  initSchema(dbInstance);
  migrate(dbInstance);
  seedInitialAdmin(dbInstance);

  return dbInstance;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'user')),
      quota_bytes INTEGER NOT NULL DEFAULT ${DEFAULT_QUOTA_BYTES},
      disabled INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_login_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT UNIQUE NOT NULL,
      user_agent TEXT,
      ip TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS files_index (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      path TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      size INTEGER NOT NULL DEFAULT 0,
      mime TEXT,
      mtime TEXT,
      parent_path TEXT,
      UNIQUE(user_id, path)
    );

    CREATE TABLE IF NOT EXISTS starred (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      path TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY(user_id, path)
    );

    CREATE TABLE IF NOT EXISTS trash (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      original_path TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      size INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS shares (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      path TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('link', 'user')),
      token TEXT UNIQUE,
      target_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      permission TEXT NOT NULL CHECK(permission IN ('view', 'download', 'edit')),
      password_hash TEXT,
      expires_at TEXT,
      max_downloads INTEGER,
      download_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Warna folder per pengguna (pola Google Drive "Ubah warna").
    -- Folder di disk tidak bisa menyimpan warna, jadi metadata ini hidup di SQLite.
    CREATE TABLE IF NOT EXISTS folder_colors (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      path TEXT NOT NULL,
      color TEXT NOT NULL,
      PRIMARY KEY(user_id, path)
    );

    -- Sesi upload chunked/resumable (Master Prompt §5.4)
    CREATE TABLE IF NOT EXISTS uploads (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      path TEXT NOT NULL,
      name TEXT NOT NULL,
      size INTEGER NOT NULL,
      mtime TEXT,
      chunk_size INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      path TEXT,
      meta_json TEXT,
      ip TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
    CREATE INDEX IF NOT EXISTS idx_files_user_parent ON files_index(user_id, parent_path);
    CREATE INDEX IF NOT EXISTS idx_trash_user ON trash(user_id);
    CREATE INDEX IF NOT EXISTS idx_shares_token ON shares(token);
    CREATE INDEX IF NOT EXISTS idx_activity_user ON activity(user_id);
  `);
}

/** Migrasi kolom tambahan untuk DB yang dibuat versi sebelumnya. */
function migrate(db) {
  const cols = db
    .prepare('PRAGMA table_info(shares)')
    .all()
    .map((c) => c.name);
  if (!cols.includes('token_enc')) {
    // Salinan token terenkripsi agar pemilik bisa menyalin link lagi (hash tetap untuk pencarian)
    db.exec('ALTER TABLE shares ADD COLUMN token_enc TEXT');
  }
}

function seedInitialAdmin(db) {
  const count = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  if (count === 0) {
    const hash = bcrypt.hashSync(INITIAL_ADMIN.password, 12);
    db.prepare(
      `
      INSERT INTO users (username, password_hash, display_name, role, quota_bytes)
      VALUES (?, ?, ?, 'admin', ?)
    `
    ).run(INITIAL_ADMIN.username, hash, INITIAL_ADMIN.displayName, DEFAULT_QUOTA_BYTES);
    console.log(`[DB] Akun Admin awal dibuat: username="${INITIAL_ADMIN.username}". Harap segera ganti password di produksi.`);
  }
}
