import express from 'express';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { getDb } from './db.js';
import { logActivity } from './metadata.js';

export const authRouter = express.Router();

const COOKIE_NAME = 'chimera_session';
const SESSION_TTL_DAYS = 30;

// Rate limiting login di memori: max 10 gagal per 15 menit,
// dihitung terpisah per IP dan per username (Master Prompt §5.1).
const MAX_FAILED = 10;
const WINDOW_MS = 15 * 60 * 1000;
const failedAttempts = new Map();

function rateLimitKeys(ip, username) {
  return [`ip:${ip || 'unknown'}`, `user:${(username || '').toLowerCase()}`];
}

function checkRateLimit(ip, username) {
  const now = Date.now();
  for (const key of rateLimitKeys(ip, username)) {
    const record = failedAttempts.get(key);
    if (!record) continue;

    if (record.lockUntil && record.lockUntil > now) {
      const remainingMin = Math.ceil((record.lockUntil - now) / (60 * 1000));
      const err = new Error(`Terlalu banyak percobaan login gagal. Silakan coba lagi dalam ${remainingMin} menit.`);
      err.code = 'RATE_LIMIT_EXCEEDED';
      err.status = 429;
      throw err;
    }

    // Jendela 15 menit sudah lewat: mulai hitung dari nol
    if (now - record.firstAttempt > WINDOW_MS) {
      failedAttempts.delete(key);
    }
  }
}

function recordFailedAttempt(ip, username) {
  const now = Date.now();
  for (const key of rateLimitKeys(ip, username)) {
    const record = failedAttempts.get(key) || { count: 0, firstAttempt: now };
    record.count += 1;
    if (record.count >= MAX_FAILED) {
      record.lockUntil = now + WINDOW_MS;
    }
    failedAttempts.set(key, record);
  }
}

function clearFailedAttempts(ip, username) {
  // Login sukses hanya membersihkan hitungan username; hitungan IP dibiarkan
  // agar penyerang tidak bisa mereset limit IP dengan akun miliknya sendiri.
  failedAttempts.delete(`user:${(username || '').toLowerCase()}`);
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Middleware untuk memastikan request memiliki sesi autentikasi yang valid.
 */
export function requireAuth(req, res, next) {
  const rawToken = req.cookies?.[COOKIE_NAME];
  if (!rawToken) {
    return res.status(401).json({ error: 'Sesi tidak ditemukan, silakan login', code: 'UNAUTHORIZED' });
  }

  const tokenHash = hashToken(rawToken);
  const db = getDb();

  const session = db
    .prepare(
      `
    SELECT s.id as session_id, s.expires_at, u.id, u.username, u.display_name, u.role, u.quota_bytes, u.disabled
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?
  `
    )
    .get(tokenHash);

  if (!session) {
    res.clearCookie(COOKIE_NAME);
    return res.status(401).json({ error: 'Sesi tidak valid atau telah berakhir', code: 'UNAUTHORIZED' });
  }

  // Cek kedaluwarsa sesi
  if (new Date(session.expires_at) < new Date()) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(session.session_id);
    res.clearCookie(COOKIE_NAME);
    return res.status(401).json({ error: 'Sesi telah kedaluwarsa', code: 'UNAUTHORIZED' });
  }

  // Cek jika akun dinonaktifkan
  if (session.disabled) {
    return res.status(403).json({ error: 'Akun Anda telah dinonaktifkan', code: 'ACCOUNT_DISABLED' });
  }

  // Update last_seen_at sesekali (misal jika sudah lebih dari 1 menit)
  db.prepare(
    `
    UPDATE sessions SET last_seen_at = datetime('now') WHERE id = ?
  `
  ).run(session.session_id);

  req.user = {
    id: session.id,
    username: session.username,
    displayName: session.display_name,
    role: session.role,
    quotaBytes: session.quota_bytes
  };
  req.sessionId = session.session_id;

  next();
}

/**
 * Middleware untuk endpoint khusus admin
 */
export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Akses khusus administrator', code: 'FORBIDDEN' });
  }
  next();
}

// POST /api/auth/login
authRouter.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const ip = req.ip || req.socket?.remoteAddress;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username dan password wajib diisi', code: 'MISSING_CREDENTIALS' });
  }

  try {
    checkRateLimit(ip, username);
  } catch (err) {
    return res.status(err.status || 429).json({ error: err.message, code: err.code });
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    recordFailedAttempt(ip, username);
    return res.status(401).json({ error: 'Username atau password salah', code: 'INVALID_CREDENTIALS' });
  }

  if (user.disabled) {
    return res.status(403).json({ error: 'Akun telah dinonaktifkan oleh administrator', code: 'ACCOUNT_DISABLED' });
  }

  clearFailedAttempts(ip, username);

  // Buat token acak berkekuatan kriptografis
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);

  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const userAgent = req.headers['user-agent'] || 'Unknown';

  db.prepare(
    `
    INSERT INTO sessions (user_id, token_hash, user_agent, ip, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `
  ).run(user.id, tokenHash, userAgent, ip, expiresAt);

  db.prepare(`UPDATE users SET last_login_at = datetime('now') WHERE id = ?`).run(user.id);
  logActivity(user.id, 'login', null, { userAgent: userAgent.slice(0, 200) }, ip);

  // Set cookie aman
  const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.cookie(COOKIE_NAME, rawToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecure,
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
    path: '/'
  });

  return res.json({
    user: {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      role: user.role,
      quotaBytes: user.quota_bytes
    }
  });
});

// POST /api/auth/logout
authRouter.post('/logout', requireAuth, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM sessions WHERE id = ?').run(req.sessionId);
  logActivity(req.user.id, 'logout', null, null, req.ip);
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ success: true, message: 'Berhasil keluar' });
});

// POST /api/auth/logout-all
authRouter.post('/logout-all', requireAuth, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(req.user.id);
  logActivity(req.user.id, 'logout_all', null, null, req.ip);
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ success: true, message: 'Berhasil keluar dari semua perangkat' });
});

// GET /api/auth/sessions — sesi aktif milik user ini (Master Prompt §5.1)
authRouter.get('/sessions', requireAuth, (req, res) => {
  const rows = getDb()
    .prepare(
      "SELECT id, user_agent, ip, created_at, last_seen_at, expires_at FROM sessions WHERE user_id = ? AND expires_at > datetime('now') ORDER BY last_seen_at DESC"
    )
    .all(req.user.id);
  res.json({
    sessions: rows.map((r) => ({
      id: r.id,
      userAgent: r.user_agent,
      ip: r.ip,
      createdAt: r.created_at,
      lastSeenAt: r.last_seen_at,
      expiresAt: r.expires_at,
      current: r.id === req.sessionId
    }))
  });
});

// DELETE /api/auth/sessions/:id — akhiri satu sesi milik sendiri
authRouter.delete('/sessions/:id', requireAuth, (req, res) => {
  const info = getDb().prepare('DELETE FROM sessions WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Sesi tidak ditemukan', code: 'NOT_FOUND' });
  res.json({ success: true });
});

// GET /api/auth/me
authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// POST /api/auth/password
authRouter.post('/password', requireAuth, (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (!oldPassword || !newPassword) {
    return res.status(400).json({ error: 'Password lama dan password baru wajib diisi', code: 'MISSING_FIELDS' });
  }

  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    return res.status(400).json({ error: 'Password baru minimal 8 karakter', code: 'PASSWORD_TOO_SHORT' });
  }

  const db = getDb();
  const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);

  if (!bcrypt.compareSync(oldPassword, user.password_hash)) {
    return res.status(400).json({ error: 'Password lama tidak sesuai', code: 'INVALID_OLD_PASSWORD' });
  }

  const newHash = bcrypt.hashSync(newPassword, 12);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, req.user.id);

  res.json({ success: true, message: 'Password berhasil diperbarui' });
});
