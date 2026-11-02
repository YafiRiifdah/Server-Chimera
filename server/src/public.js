import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { STORAGE_ROOT, SESSION_SECRET } from './config.js';
import { getDb } from './db.js';
import { hashToken, resolveWithinShare } from './shares.js';
import { listDirectory, sendFileStream, sendThumbnail, streamZip, zipNameFor } from './serve.js';
import { logActivity } from './metadata.js';

/**
 * Halaman link publik (Master Prompt §5.6, §6):
 *   GET  /s/:token          → HTML (SPA) — ditangani catch-all di index.js
 *   GET  /s/:token/info     → metadata (+ isi folder dengan ?path=)
 *   GET  /s/:token/raw      → file (?path= untuk folder, ?dl=1 unduh)
 *   GET  /s/:token/thumb
 *   GET  /s/:token/zip      → seluruh folder (atau ?path= sub-folder)
 *   POST /s/:token/unlock   {password}
 * Tanpa sesi. Dibatasi laju per IP (§8.4).
 */
export const publicRouter = express.Router();

// ---------- Pembatas laju sederhana di memori ----------
const WINDOW_MS = 15 * 60 * 1000;
const hits = new Map(); // key → {count, first}
function limiter(key, max) {
  const now = Date.now();
  const rec = hits.get(key);
  if (!rec || now - rec.first > WINDOW_MS) {
    hits.set(key, { count: 1, first: now });
    return true;
  }
  rec.count++;
  return rec.count <= max;
}
export function clearRateLimits() {
  hits.clear();
}
// Bersihkan peta tiap 30 menit agar tidak tumbuh tanpa batas
setInterval(
  () => {
    const now = Date.now();
    for (const [k, v] of hits) if (now - v.first > WINDOW_MS) hits.delete(k);
  },
  30 * 60 * 1000
).unref();

publicRouter.use((req, res, next) => {
  if (!limiter(`pub:${req.ip}`, 1500)) {
    return res.status(429).json({ error: 'Terlalu banyak permintaan, coba lagi nanti', code: 'RATE_LIMIT_EXCEEDED' });
  }
  next();
});

// ---------- Memuat share dari token ----------
function cookieName(share) {
  return `chimera_s_${share.id}`;
}
function accessProof(share) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(`${share.id}:${share.password_hash}`).digest('hex');
}
function isUnlocked(req, share) {
  if (!share.password_hash) return true;
  const proof = req.cookies?.[cookieName(share)];
  if (!proof) return false;
  const expected = accessProof(share);
  return proof.length === expected.length && crypto.timingSafeEqual(Buffer.from(proof), Buffer.from(expected));
}

function loadPublic(req, res, next) {
  const token = String(req.params.token || '');
  if (!/^[A-Za-z0-9_-]{16,}$/.test(token)) return res.status(404).json({ error: 'Link tidak ditemukan', code: 'NOT_FOUND' });
  const row = getDb()
    .prepare(
      "SELECT s.*, o.username AS owner_username FROM shares s JOIN users o ON o.id = s.owner_id WHERE s.type = 'link' AND s.token = ?"
    )
    .get(hashToken(token));
  if (!row) return res.status(404).json({ error: 'Link tidak ditemukan atau sudah dicabut', code: 'NOT_FOUND' });
  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    return res.status(410).json({ error: 'Link sudah kedaluwarsa', code: 'SHARE_EXPIRED' });
  }
  const abs = path.join(STORAGE_ROOT, 'users', row.owner_username, row.path);
  if (!fs.existsSync(abs)) return res.status(404).json({ error: 'Item yang dibagikan sudah tidak ada', code: 'NOT_FOUND' });
  req.share = row;
  req.shareAbs = abs;
  req.unlocked = isUnlocked(req, row);
  next();
}

function requireUnlocked(req, res, next) {
  if (!req.unlocked) return res.status(401).json({ error: 'Link ini dilindungi password', code: 'SHARE_LOCKED' });
  next();
}

function requireDownload(req, res, next) {
  if (req.share.permission !== 'download') {
    return res.status(403).json({ error: 'Pemilik hanya mengizinkan melihat, tidak mengunduh', code: 'DOWNLOAD_FORBIDDEN' });
  }
  next();
}

/** Cek dan tambah hitungan download; 410 jika batas tercapai. */
function countDownload(req, res) {
  const s = req.share;
  if (s.max_downloads && s.download_count >= s.max_downloads) {
    res.status(410).json({ error: 'Batas jumlah download untuk link ini sudah tercapai', code: 'SHARE_LIMIT' });
    return false;
  }
  getDb().prepare('UPDATE shares SET download_count = download_count + 1 WHERE id = ?').run(s.id);
  return true;
}

function resolveSub(req, res) {
  try {
    return resolveWithinShare(req.share, req.share.owner_username, req.query.path);
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message, code: err.code });
    return null;
  }
}

// ---------- Rute ----------

publicRouter.get('/:token/info', loadPublic, async (req, res) => {
  const s = req.share;
  const base = {
    id: s.id,
    name: path.basename(s.path),
    type: fs.statSync(req.shareAbs).isDirectory() ? 'folder' : 'file',
    permission: s.permission,
    requiresPassword: !!s.password_hash,
    unlocked: req.unlocked,
    expiresAt: s.expires_at || null
  };
  if (!req.unlocked) return res.json(base);

  const r = resolveSub(req, res);
  if (!r) return;
  if (!fs.existsSync(r.abs)) return res.status(404).json({ error: 'Tidak ditemukan', code: 'NOT_FOUND' });
  const stat = fs.statSync(r.abs);
  const out = {
    ...base,
    path: r.rel,
    size: stat.isDirectory() ? 0 : stat.size,
    mtime: stat.mtime.toISOString(),
    downloadCount: s.download_count,
    maxDownloads: s.max_downloads,
    limitReached: !!(s.max_downloads && s.download_count >= s.max_downloads)
  };
  if (stat.isDirectory()) {
    out.entries = (await listDirectory(r.abs, r.rel, null)).map((e) => ({ ...e, starred: undefined, shared: undefined, color: undefined }));
  } else {
    out.mime = (await import('mime-types')).default.lookup(r.abs) || 'application/octet-stream';
  }
  res.json(out);
});

publicRouter.post('/:token/unlock', loadPublic, (req, res) => {
  const s = req.share;
  if (!s.password_hash) return res.json({ success: true, unlocked: true });
  if (!limiter(`unlock:${req.ip}:${s.id}`, 10)) {
    return res.status(429).json({ error: 'Terlalu banyak percobaan. Coba lagi dalam 15 menit.', code: 'RATE_LIMIT_EXCEEDED' });
  }
  const { password } = req.body || {};
  if (!password || !bcrypt.compareSync(String(password), s.password_hash)) {
    return res.status(401).json({ error: 'Password salah', code: 'INVALID_PASSWORD' });
  }
  const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.cookie(cookieName(s), accessProof(s), { httpOnly: true, sameSite: 'lax', secure: isSecure, maxAge: 24 * 3600 * 1000, path: `/s/` });
  res.json({ success: true, unlocked: true });
});

publicRouter.get('/:token/raw', loadPublic, requireUnlocked, async (req, res) => {
  const r = resolveSub(req, res);
  if (!r) return;
  if (!fs.existsSync(r.abs)) return res.status(404).json({ error: 'File tidak ditemukan', code: 'NOT_FOUND' });
  const dl = req.query.dl === '1' || req.query.dl === 'true';
  if (dl) {
    if (req.share.permission !== 'download') {
      return res.status(403).json({ error: 'Pemilik hanya mengizinkan melihat, tidak mengunduh', code: 'DOWNLOAD_FORBIDDEN' });
    }
    if (!countDownload(req, res)) return;
    logActivity(req.share.owner_id, 'public_download', r.ownerRel, { shareId: req.share.id }, req.ip);
  }
  try {
    await sendFileStream(req, res, r.abs, { attachment: dl });
  } catch {
    if (!res.headersSent) res.status(500).json({ error: 'Gagal membaca berkas', code: 'STREAM_FAILED' });
  }
});

publicRouter.get('/:token/thumb', loadPublic, requireUnlocked, async (req, res) => {
  const r = resolveSub(req, res);
  if (!r) return;
  await sendThumbnail(req, res, r.abs, `public:${req.share.owner_username}`, req.query.w);
});

publicRouter.get('/:token/zip', loadPublic, requireUnlocked, requireDownload, async (req, res) => {
  const r = resolveSub(req, res);
  if (!r) return;
  const stat = await fs.promises.stat(r.abs).catch(() => null);
  if (!stat) return res.status(404).json({ error: 'Tidak ditemukan', code: 'NOT_FOUND' });
  if (!countDownload(req, res)) return;
  logActivity(req.share.owner_id, 'public_download', r.ownerRel, { shareId: req.share.id, zip: true }, req.ip);
  const items = [{ abs: r.abs, isDir: stat.isDirectory(), name: path.basename(r.abs) }];
  streamZip(req, res, items, zipNameFor(items));
});
