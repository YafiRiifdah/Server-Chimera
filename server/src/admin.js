import express from 'express';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcrypt';
import { STORAGE_ROOT, DEFAULT_QUOTA_BYTES } from './config.js';
import { getDb } from './db.js';
import { requireAdmin } from './auth.js';
import { calculateUserUsage } from './upload.js';
import { reindexAll } from './indexer.js';
import { shareToJson } from './shares.js';
import { logActivity } from './metadata.js';

/**
 * Halaman Admin (Master Prompt §5.8, §6): kelola user, kuota, reset password,
 * semua link publik, statistik disk, log aktivitas, pindai ulang indeks.
 */
export const adminRouter = express.Router();
adminRouter.use(requireAdmin);

const USERNAME_RE = /^[a-zA-Z0-9_\-.]{3,32}$/;

function userToJson(u) {
  const root = path.join(STORAGE_ROOT, 'users', u.username);
  return {
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    role: u.role,
    quotaBytes: u.quota_bytes,
    usedBytes: calculateUserUsage(root),
    disabled: !!u.disabled,
    createdAt: u.created_at,
    lastLoginAt: u.last_login_at,
    activeSessions: getDb().prepare("SELECT COUNT(*) c FROM sessions WHERE user_id = ? AND expires_at > datetime('now')").get(u.id).c
  };
}

adminRouter.get('/users', (req, res) => {
  const users = getDb().prepare('SELECT * FROM users ORDER BY username').all().map(userToJson);
  res.json({ users });
});

adminRouter.post('/users', (req, res) => {
  const { username, password, displayName, role, quotaBytes } = req.body || {};
  if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
    return res
      .status(400)
      .json({ error: 'Username 3–32 karakter: huruf, angka, titik, garis bawah, atau strip', code: 'INVALID_USERNAME' });
  }
  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'Password minimal 8 karakter', code: 'PASSWORD_TOO_SHORT' });
  }
  const db = getDb();
  if (db.prepare('SELECT 1 FROM users WHERE username = ? COLLATE NOCASE').get(username)) {
    return res.status(409).json({ error: 'Username sudah dipakai', code: 'USERNAME_TAKEN' });
  }
  const quota = Number.isFinite(Number(quotaBytes)) && Number(quotaBytes) > 0 ? Number(quotaBytes) : DEFAULT_QUOTA_BYTES;
  const info = db
    .prepare('INSERT INTO users (username, password_hash, display_name, role, quota_bytes) VALUES (?, ?, ?, ?, ?)')
    .run(
      username,
      bcrypt.hashSync(password, 12),
      (displayName || username).toString().slice(0, 100),
      role === 'admin' ? 'admin' : 'user',
      quota
    );
  fs.mkdirSync(path.join(STORAGE_ROOT, 'users', username), { recursive: true });
  logActivity(req.user.id, 'admin_create_user', null, { username }, req.ip);
  res.json({ user: userToJson(db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid)) });
});

adminRouter.patch('/users/:id', (req, res) => {
  const db = getDb();
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'Pengguna tidak ditemukan', code: 'NOT_FOUND' });
  const { disabled, quotaBytes, displayName, role } = req.body || {};

  if (disabled !== undefined) {
    if (u.id === req.user.id && disabled)
      return res.status(400).json({ error: 'Tidak bisa menonaktifkan akun sendiri', code: 'SELF_DISABLE' });
    db.prepare('UPDATE users SET disabled = ? WHERE id = ?').run(disabled ? 1 : 0, u.id);
    if (disabled) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
  }
  if (quotaBytes !== undefined) {
    const q = Number(quotaBytes);
    if (!Number.isFinite(q) || q <= 0) return res.status(400).json({ error: 'Kuota tidak valid', code: 'INVALID_QUOTA' });
    db.prepare('UPDATE users SET quota_bytes = ? WHERE id = ?').run(Math.floor(q), u.id);
  }
  if (displayName !== undefined) {
    db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(String(displayName).slice(0, 100) || u.username, u.id);
  }
  if (role !== undefined) {
    if (!['admin', 'user'].includes(role)) return res.status(400).json({ error: 'Peran tidak valid', code: 'INVALID_ROLE' });
    if (u.id === req.user.id && role !== 'admin')
      return res.status(400).json({ error: 'Tidak bisa mencabut peran admin sendiri', code: 'SELF_DEMOTE' });
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, u.id);
  }
  logActivity(req.user.id, 'admin_update_user', null, { username: u.username, disabled, quotaBytes, role }, req.ip);
  res.json({ user: userToJson(db.prepare('SELECT * FROM users WHERE id = ?').get(u.id)) });
});

adminRouter.post('/users/:id/reset-password', (req, res) => {
  const db = getDb();
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'Pengguna tidak ditemukan', code: 'NOT_FOUND' });
  const { password } = req.body || {};
  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'Password minimal 8 karakter', code: 'PASSWORD_TOO_SHORT' });
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(password, 12), u.id);
  // Semua sesi user itu diakhiri agar perangkat lama harus login ulang
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
  logActivity(req.user.id, 'admin_reset_password', null, { username: u.username }, req.ip);
  res.json({ success: true });
});

adminRouter.get('/shares', (req, res) => {
  const rows = getDb()
    .prepare(
      `
      SELECT s.*, u.username AS target_username, o.username AS owner_username
      FROM shares s LEFT JOIN users u ON u.id = s.target_user_id JOIN users o ON o.id = s.owner_id
      ORDER BY s.created_at DESC
    `
    )
    .all();
  res.json({
    shares: rows.map((r) => shareToJson(r, { exists: fs.existsSync(path.join(STORAGE_ROOT, 'users', r.owner_username, r.path)) }))
  });
});

adminRouter.delete('/shares/:id', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM shares WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Berbagi tidak ditemukan', code: 'NOT_FOUND' });
  db.prepare('DELETE FROM shares WHERE id = ?').run(row.id);
  logActivity(req.user.id, 'admin_unshare', row.path, { shareId: row.id, ownerId: row.owner_id }, req.ip);
  res.json({ success: true });
});

adminRouter.get('/activity', (req, res) => {
  const limit = Math.min(500, Math.max(1, parseInt(req.query.limit || '200', 10) || 200));
  const offset = Math.max(0, parseInt(req.query.offset || '0', 10) || 0);
  const username = req.query.username ? String(req.query.username) : null;
  const where = username ? 'WHERE u.username = ?' : '';
  const params = username ? [username, limit, offset] : [limit, offset];
  const rows = getDb()
    .prepare(
      `
      SELECT a.id, a.action, a.path, a.meta_json, a.ip, a.created_at, u.username
      FROM activity a LEFT JOIN users u ON u.id = a.user_id
      ${where} ORDER BY a.id DESC LIMIT ? OFFSET ?
    `
    )
    .all(...params);
  res.json({
    entries: rows.map((r) => ({
      id: r.id,
      username: r.username,
      action: r.action,
      path: r.path,
      meta: r.meta_json ? JSON.parse(r.meta_json) : null,
      ip: r.ip,
      createdAt: r.created_at
    }))
  });
});

adminRouter.get('/stats', async (req, res) => {
  const db = getDb();
  let diskFree = 0;
  let diskTotal = 0;
  try {
    const st = await fs.promises.statfs(STORAGE_ROOT);
    diskFree = Number(st.bavail) * Number(st.bsize);
    diskTotal = Number(st.blocks) * Number(st.bsize);
  } catch {
    // statfs tidak tersedia
  }
  const users = db.prepare('SELECT username FROM users').all();
  let usedBytes = 0;
  for (const u of users) usedBytes += calculateUserUsage(path.join(STORAGE_ROOT, 'users', u.username));
  res.json({
    diskFree,
    diskTotal,
    usedBytes,
    usersCount: users.length,
    activeUsers: db.prepare('SELECT COUNT(*) c FROM users WHERE disabled = 0').get().c,
    sharesCount: db.prepare("SELECT COUNT(*) c FROM shares WHERE type = 'link'").get().c,
    trashCount: db.prepare('SELECT COUNT(*) c FROM trash').get().c,
    indexCount: db.prepare('SELECT COUNT(*) c FROM files_index').get().c,
    storageRoot: STORAGE_ROOT
  });
});

adminRouter.post('/reindex', (req, res) => {
  const indexed = reindexAll();
  logActivity(req.user.id, 'admin_reindex', null, indexed, req.ip);
  res.json({ success: true, indexed });
});
