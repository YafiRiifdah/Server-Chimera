import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { STORAGE_ROOT, PUBLIC_URL, SESSION_SECRET } from './config.js';
import { resolveSafe, validateFilename } from './safe.js';
import { getDb } from './db.js';
import { calculateUserUsage, resolveConflict, uploadMiddleware, cleanupTmp } from './upload.js';
import { indexPath, indexSingle, moveInIndex, removeFromIndex } from './indexer.js';
import { rebaseMetadataPaths, logActivity, entryFromDisk } from './metadata.js';
import { listDirectory, sendFileStream, sendThumbnail, streamZip, zipNameFor } from './serve.js';
import { parsePaths } from './zip.js';

/**
 * Berbagi (Master Prompt §5.6):
 *  - link publik  : shares.type='link', token acak disimpan sebagai hash SHA-256
 *  - ke pengguna  : shares.type='user', target_user_id, permission 'view' | 'edit'
 * Item tetap di tempat asal pemilik; penerima mengakses lewat /api/shared/:id/* dengan
 * path relatif terhadap akar berbagi dan tidak bisa keluar darinya.
 */

export const sharesRouter = express.Router(); // /api/shares
export const sharedWithMeRouter = express.Router(); // /api/shared-with-me
export const sharedRouter = express.Router(); // /api/shared/:id
export const usersRouter = express.Router(); // /api/users

const EXPIRES = { '1d': 1, '7d': 7, '30d': 30 };

export function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export function shareUrl(rawToken) {
  return `${PUBLIC_URL.replace(/\/$/, '')}/s/${rawToken}`;
}

// Token mentah disimpan terenkripsi (AES-256-GCM, kunci dari SESSION_SECRET) hanya agar
// pemilik bisa menyalin link lagi; pencarian link tetap memakai hash SHA-256.
const ENC_KEY = crypto.createHash('sha256').update(SESSION_SECRET).digest();
export function encryptToken(raw) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv);
  const ct = Buffer.concat([cipher.update(raw, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64');
}
export function decryptToken(enc) {
  try {
    const buf = Buffer.from(enc, 'base64');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ct = buf.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/** Bentuk JSON share untuk pemilik/admin (tanpa token mentah). */
export function shareToJson(row, extra = {}) {
  return {
    id: row.id,
    path: row.path,
    name: path.basename(row.path) || 'Drive Saya',
    type: row.type,
    permission: row.permission,
    targetUsername: row.target_username || null,
    ownerUsername: row.owner_username || undefined,
    expiresAt: row.expires_at || null,
    maxDownloads: row.max_downloads || null,
    downloadCount: row.download_count || 0,
    hasPassword: !!row.password_hash,
    createdAt: row.created_at,
    expired: !!(row.expires_at && new Date(row.expires_at) < new Date()),
    url: row.type === 'link' && row.token_enc ? shareUrl(decryptToken(row.token_enc)) : undefined,
    ...extra
  };
}

function expiresAtFrom(expiresIn) {
  if (!expiresIn || expiresIn === 'never') return null;
  const days = EXPIRES[expiresIn];
  if (!days) {
    const err = new Error('Masa berlaku harus 1d, 7d, 30d, atau never');
    err.code = 'INVALID_EXPIRY';
    err.status = 400;
    throw err;
  }
  return new Date(Date.now() + days * 24 * 3600 * 1000).toISOString();
}

const SELECT_SHARE = `
  SELECT s.*, u.username AS target_username, o.username AS owner_username
  FROM shares s
  LEFT JOIN users u ON u.id = s.target_user_id
  JOIN users o ON o.id = s.owner_id
`;

// ---------------- /api/users/list ----------------
usersRouter.get('/list', (req, res) => {
  const users = getDb()
    .prepare('SELECT id, username, display_name FROM users WHERE disabled = 0 AND id != ? ORDER BY username')
    .all(req.user.id)
    .map((u) => ({ id: u.id, username: u.username, displayName: u.display_name }));
  res.json({ users });
});

// ---------------- /api/shares (pemilik) ----------------

sharesRouter.get('/', (req, res) => {
  const rows = getDb().prepare(`${SELECT_SHARE} WHERE s.owner_id = ? ORDER BY s.created_at DESC`).all(req.user.id);
  res.json({
    shares: rows.map((r) => shareToJson(r, { exists: fs.existsSync(path.join(STORAGE_ROOT, 'users', req.user.username, r.path)) }))
  });
});

sharesRouter.post('/', async (req, res) => {
  const { path: rel, type = 'link', permission, targetUsername, expiresIn, password, maxDownloads } = req.body || {};
  if (!rel && rel !== '') return res.status(400).json({ error: 'Path wajib disertakan', code: 'MISSING_PATH' });
  if (!['link', 'user'].includes(type)) return res.status(400).json({ error: 'Jenis berbagi tidak valid', code: 'INVALID_TYPE' });

  try {
    const resolved = resolveSafe(req.user.username, rel);
    if (!resolved.cleanRel)
      return res.status(400).json({ error: 'Seluruh Drive tidak bisa dibagikan, pilih file atau folder', code: 'INVALID_PATH' });
    if (!fs.existsSync(resolved.targetPath)) return res.status(404).json({ error: 'Item tidak ditemukan', code: 'NOT_FOUND' });

    const db = getDb();
    const expiresAt = expiresAtFrom(expiresIn);
    let row;

    if (type === 'link') {
      const perm = permission === 'view' ? 'view' : 'download';
      const rawToken = crypto.randomBytes(24).toString('base64url');
      const passwordHash = password ? bcrypt.hashSync(String(password), 10) : null;
      const max = Number.isInteger(Number(maxDownloads)) && Number(maxDownloads) > 0 ? Number(maxDownloads) : null;
      const info = db
        .prepare(
          'INSERT INTO shares (owner_id, path, type, token, token_enc, permission, password_hash, expires_at, max_downloads) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )
        .run(req.user.id, resolved.cleanRel, 'link', hashToken(rawToken), encryptToken(rawToken), perm, passwordHash, expiresAt, max);
      row = db.prepare(`${SELECT_SHARE} WHERE s.id = ?`).get(info.lastInsertRowid);
      logActivity(req.user.id, 'share_link', resolved.cleanRel, { shareId: row.id, permission: perm }, req.ip);
      return res.json({ share: shareToJson(row, { token: rawToken, url: shareUrl(rawToken) }) });
    }

    // type === 'user'
    if (!targetUsername) return res.status(400).json({ error: 'Pilih pengguna tujuan', code: 'MISSING_TARGET' });
    const target = db
      .prepare('SELECT id, username FROM users WHERE username = ? COLLATE NOCASE AND disabled = 0')
      .get(String(targetUsername));
    if (!target) return res.status(404).json({ error: 'Pengguna tidak ditemukan', code: 'USER_NOT_FOUND' });
    if (target.id === req.user.id) return res.status(400).json({ error: 'Tidak bisa berbagi ke diri sendiri', code: 'SELF_SHARE' });
    const perm = permission === 'edit' ? 'edit' : 'view';

    const existing = db
      .prepare("SELECT id FROM shares WHERE owner_id = ? AND path = ? AND type = 'user' AND target_user_id = ?")
      .get(req.user.id, resolved.cleanRel, target.id);
    if (existing) {
      db.prepare('UPDATE shares SET permission = ?, expires_at = ? WHERE id = ?').run(perm, expiresAt, existing.id);
      row = db.prepare(`${SELECT_SHARE} WHERE s.id = ?`).get(existing.id);
    } else {
      const info = db
        .prepare('INSERT INTO shares (owner_id, path, type, target_user_id, permission, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(req.user.id, resolved.cleanRel, 'user', target.id, perm, expiresAt);
      row = db.prepare(`${SELECT_SHARE} WHERE s.id = ?`).get(info.lastInsertRowid);
    }
    logActivity(req.user.id, 'share_user', resolved.cleanRel, { shareId: row.id, target: target.username, permission: perm }, req.ip);
    res.json({ share: shareToJson(row) });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, code: err.code || 'SHARE_FAILED' });
  }
});

sharesRouter.patch('/:id', (req, res) => {
  const db = getDb();
  const row = db.prepare(`${SELECT_SHARE} WHERE s.id = ? AND s.owner_id = ?`).get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Berbagi tidak ditemukan', code: 'NOT_FOUND' });
  const { permission, expiresIn, password, maxDownloads } = req.body || {};
  try {
    const updates = [];
    const params = [];
    if (permission !== undefined) {
      const allowed = row.type === 'link' ? ['view', 'download'] : ['view', 'edit'];
      if (!allowed.includes(permission)) return res.status(400).json({ error: 'Izin tidak valid', code: 'INVALID_PERMISSION' });
      updates.push('permission = ?');
      params.push(permission);
    }
    if (expiresIn !== undefined) {
      updates.push('expires_at = ?');
      params.push(expiresAtFrom(expiresIn));
    }
    if (password !== undefined && row.type === 'link') {
      updates.push('password_hash = ?');
      params.push(password ? bcrypt.hashSync(String(password), 10) : null);
    }
    if (maxDownloads !== undefined && row.type === 'link') {
      const max = Number.isInteger(Number(maxDownloads)) && Number(maxDownloads) > 0 ? Number(maxDownloads) : null;
      updates.push('max_downloads = ?');
      params.push(max);
    }
    if (updates.length) {
      params.push(row.id);
      db.prepare(`UPDATE shares SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }
    const updated = db.prepare(`${SELECT_SHARE} WHERE s.id = ?`).get(row.id);
    res.json({ share: shareToJson(updated) });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, code: err.code || 'SHARE_UPDATE_FAILED' });
  }
});

sharesRouter.delete('/:id', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM shares WHERE id = ? AND owner_id = ?').get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Berbagi tidak ditemukan', code: 'NOT_FOUND' });
  db.prepare('DELETE FROM shares WHERE id = ?').run(row.id);
  logActivity(req.user.id, 'unshare', row.path, { shareId: row.id, type: row.type }, req.ip);
  res.json({ success: true });
});

// ---------------- /api/shared-with-me ----------------

sharedWithMeRouter.get('/', (req, res) => {
  const rows = getDb()
    .prepare(
      `${SELECT_SHARE} WHERE s.type = 'user' AND s.target_user_id = ? AND (s.expires_at IS NULL OR s.expires_at > datetime('now')) ORDER BY s.created_at DESC`
    )
    .all(req.user.id);
  const entries = [];
  for (const r of rows) {
    const e = entryFromDisk({ username: r.owner_username }, r.path, null);
    if (!e) continue; // sudah di Sampah / dihapus pemilik
    entries.push({
      ...e,
      path: '',
      ownerPath: r.path,
      shareId: r.id,
      ownerUsername: r.owner_username,
      permission: r.permission,
      sharedAt: r.created_at
    });
  }
  res.json({ entries });
});

// ---------------- /api/shared/:id/* (penerima) ----------------

/** Muat share milik penerima; 404 jika tidak ada/kedaluwarsa/item hilang. */
function loadShared(req, res, next) {
  const row = getDb()
    .prepare(`${SELECT_SHARE} WHERE s.id = ? AND s.type = 'user' AND s.target_user_id = ?`)
    .get(req.params.id, req.user.id);
  if (!row || (row.expires_at && new Date(row.expires_at) < new Date())) {
    return res.status(404).json({ error: 'Item yang dibagikan tidak ditemukan', code: 'NOT_FOUND' });
  }
  const rootAbs = path.join(STORAGE_ROOT, 'users', row.owner_username, row.path);
  if (!fs.existsSync(rootAbs)) {
    return res.status(404).json({ error: 'Item yang dibagikan sudah tidak ada', code: 'NOT_FOUND' });
  }
  req.share = row;
  req.owner = { id: row.owner_id, username: row.owner_username };
  next();
}

function requireEdit(req, res, next) {
  if (req.share.permission !== 'edit') {
    return res.status(403).json({ error: 'Anda hanya punya izin lihat untuk item ini', code: 'FORBIDDEN' });
  }
  next();
}

/**
 * Selesaikan sub-path di dalam share: dikunci agar tidak keluar dari akar share.
 * @returns {{abs:string, rel:string(sub), ownerRel:string}}
 */
export function resolveWithinShare(share, ownerUsername, subPath = '') {
  const sub = String(subPath || '');
  const resolved = resolveSafe(ownerUsername, sub ? `${share.path}/${sub}` : share.path);
  const root = share.path;
  if (!(resolved.cleanRel === root || resolved.cleanRel.startsWith(`${root}/`))) {
    const err = new Error('Akses di luar folder yang dibagikan ditolak');
    err.code = 'FORBIDDEN_PATH';
    err.status = 403;
    throw err;
  }
  const rel = resolved.cleanRel === root ? '' : resolved.cleanRel.slice(root.length + 1);
  return { abs: resolved.targetPath, rel, ownerRel: resolved.cleanRel };
}

function withinOr(res, fn) {
  try {
    return fn();
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message, code: err.code || 'INVALID_PATH' });
    return null;
  }
}

sharedRouter.get('/:id/files', loadShared, async (req, res) => {
  const r = withinOr(res, () => resolveWithinShare(req.share, req.owner.username, req.query.path));
  if (!r) return;
  if (!fs.existsSync(r.abs)) return res.status(404).json({ error: 'Folder tidak ditemukan', code: 'NOT_FOUND' });
  const stat = fs.statSync(r.abs);
  if (!stat.isDirectory()) {
    // Share satu file: daftar berisi file itu sendiri
    const e = entryFromDisk(req.owner, r.ownerRel, null);
    return res.json({ path: '', entries: e ? [{ ...e, path: '' }] : [], share: shareToJson(req.share) });
  }
  const entries = await listDirectory(r.abs, r.rel, null);
  res.json({ path: r.rel, entries, share: shareToJson(req.share) });
});

sharedRouter.get('/:id/raw', loadShared, async (req, res) => {
  const r = withinOr(res, () => resolveWithinShare(req.share, req.owner.username, req.query.path));
  if (!r) return;
  if (!fs.existsSync(r.abs)) return res.status(404).json({ error: 'File tidak ditemukan', code: 'NOT_FOUND' });
  try {
    await sendFileStream(req, res, r.abs, { attachment: req.query.dl === '1' });
  } catch {
    if (!res.headersSent) res.status(500).json({ error: 'Gagal membaca berkas', code: 'STREAM_FAILED' });
  }
});

sharedRouter.get('/:id/thumb', loadShared, async (req, res) => {
  const r = withinOr(res, () => resolveWithinShare(req.share, req.owner.username, req.query.path));
  if (!r) return;
  await sendThumbnail(req, res, r.abs, req.owner.username, req.query.w);
});

sharedRouter.get('/:id/zip', loadShared, async (req, res) => {
  const rels = parsePaths(req.query.paths);
  const list = rels.length ? rels : [''];
  const items = [];
  for (const sub of list) {
    const r = withinOr(res, () => resolveWithinShare(req.share, req.owner.username, sub));
    if (!r) return;
    const stat = await fs.promises.stat(r.abs).catch(() => null);
    if (!stat) return res.status(404).json({ error: `"${sub}" tidak ditemukan`, code: 'NOT_FOUND' });
    items.push({ abs: r.abs, isDir: stat.isDirectory(), name: path.basename(r.abs) });
  }
  streamZip(req, res, items, zipNameFor(items));
});

sharedRouter.post('/:id/mkdir', loadShared, requireEdit, async (req, res) => {
  const { path: sub = '', name } = req.body || {};
  try {
    const validName = validateFilename(name);
    const parent = resolveWithinShare(req.share, req.owner.username, sub);
    if (!fs.existsSync(parent.abs)) return res.status(404).json({ error: 'Folder induk tidak ditemukan', code: 'PARENT_NOT_FOUND' });
    const target = resolveWithinShare(req.share, req.owner.username, parent.rel ? `${parent.rel}/${validName}` : validName);
    if (fs.existsSync(target.abs)) return res.status(409).json({ error: 'Folder dengan nama tersebut sudah ada', code: 'ALREADY_EXISTS' });
    await fs.promises.mkdir(target.abs, { recursive: true });
    indexPath(req.owner, target.ownerRel);
    logActivity(req.user.id, 'mkdir', target.ownerRel, { onBehalfOf: req.owner.username, shareId: req.share.id }, req.ip);
    res.json({ success: true, folder: { name: validName, path: target.rel, type: 'folder' } });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, code: err.code || 'MKDIR_FAILED' });
  }
});

sharedRouter.post('/:id/rename', loadShared, requireEdit, async (req, res) => {
  const { path: sub, name } = req.body || {};
  try {
    if (!sub) return res.status(403).json({ error: 'Folder yang dibagikan tidak bisa diganti namanya dari sini', code: 'FORBIDDEN' });
    const validName = validateFilename(name);
    const src = resolveWithinShare(req.share, req.owner.username, sub);
    if (!fs.existsSync(src.abs)) return res.status(404).json({ error: 'Item tidak ditemukan', code: 'NOT_FOUND' });
    const parentRel = src.rel.includes('/') ? src.rel.slice(0, src.rel.lastIndexOf('/')) : '';
    const dest = resolveWithinShare(req.share, req.owner.username, parentRel ? `${parentRel}/${validName}` : validName);
    if (fs.existsSync(dest.abs)) return res.status(409).json({ error: 'Item dengan nama tersebut sudah ada', code: 'ALREADY_EXISTS' });
    await fs.promises.rename(src.abs, dest.abs);
    rebaseMetadataPaths(req.owner.id, src.ownerRel, dest.ownerRel);
    moveInIndex(req.owner, src.ownerRel, dest.ownerRel);
    logActivity(req.user.id, 'rename', dest.ownerRel, { onBehalfOf: req.owner.username, oldPath: src.ownerRel }, req.ip);
    res.json({ success: true, item: { name: validName, path: dest.rel } });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, code: err.code || 'RENAME_FAILED' });
  }
});

sharedRouter.delete('/:id/files', loadShared, requireEdit, async (req, res) => {
  const { paths: subs = [] } = req.body || {};
  if (!Array.isArray(subs) || subs.length === 0)
    return res.status(400).json({ error: 'Daftar item wajib disertakan', code: 'MISSING_PATHS' });
  const db = getDb();
  const trashDir = path.join(STORAGE_ROOT, 'users', req.owner.username, '.trash');
  fs.mkdirSync(trashDir, { recursive: true });
  let deleted = 0;
  try {
    for (const sub of subs) {
      if (!sub) return res.status(403).json({ error: 'Folder yang dibagikan tidak bisa dihapus dari sini', code: 'FORBIDDEN' });
      const r = resolveWithinShare(req.share, req.owner.username, sub);
      if (!fs.existsSync(r.abs)) continue;
      const stat = await fs.promises.stat(r.abs);
      const trashId = crypto.randomUUID();
      await fs.promises.rename(r.abs, path.join(trashDir, trashId));
      db.prepare('INSERT INTO trash (id, user_id, original_path, name, type, size) VALUES (?, ?, ?, ?, ?, ?)').run(
        trashId,
        req.owner.id,
        r.ownerRel,
        path.basename(r.abs),
        stat.isDirectory() ? 'folder' : 'file',
        stat.isDirectory() ? 0 : stat.size
      );
      removeFromIndex(req.owner.id, r.ownerRel);
      logActivity(req.user.id, 'trash', r.ownerRel, { onBehalfOf: req.owner.username, trashId }, req.ip);
      deleted++;
    }
    res.json({ success: true, deleted });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, code: err.code || 'DELETE_FAILED' });
  }
});

sharedRouter.post('/:id/upload', loadShared, requireEdit, uploadMiddleware.array('files', 50), async (req, res) => {
  const files = req.files || [];
  if (files.length === 0) return res.status(400).json({ error: 'Tidak ada file yang diunggah', code: 'NO_FILES_UPLOADED' });
  try {
    const dir = resolveWithinShare(req.share, req.owner.username, req.query.path);
    if (!fs.existsSync(dir.abs) || !fs.statSync(dir.abs).isDirectory()) {
      cleanupTmp(files);
      return res.status(404).json({ error: 'Folder tujuan tidak ditemukan', code: 'TARGET_NOT_FOUND' });
    }
    // Kuota milik PEMILIK yang dipakai
    const ownerRoot = path.join(STORAGE_ROOT, 'users', req.owner.username);
    const ownerQuota = getDb().prepare('SELECT quota_bytes FROM users WHERE id = ?').get(req.owner.id).quota_bytes;
    const total = files.reduce((a, f) => a + f.size, 0);
    if (calculateUserUsage(ownerRoot) + total > ownerQuota) {
      cleanupTmp(files);
      return res.status(413).json({ error: 'Penyimpanan pemilik folder tidak mencukupi', code: 'QUOTA_EXCEEDED' });
    }
    const policy = ['replace', 'skip', 'keep-both'].includes(req.query.conflict) ? req.query.conflict : 'keep-both';
    const saved = [];
    for (const f of files) {
      const validName = validateFilename(Buffer.from(f.originalname, 'latin1').toString('utf8'));
      const { targetPath, finalName, skip } = resolveConflict(dir.abs, validName, policy);
      if (skip) {
        fs.unlinkSync(f.path);
        continue;
      }
      await fs.promises.rename(f.path, targetPath);
      const ownerRel = dir.ownerRel ? `${dir.ownerRel}/${finalName}` : finalName;
      indexSingle(req.owner, ownerRel);
      logActivity(req.user.id, 'upload', ownerRel, { onBehalfOf: req.owner.username, size: f.size }, req.ip);
      saved.push({ name: finalName, path: dir.rel ? `${dir.rel}/${finalName}` : finalName, size: f.size });
    }
    res.json({ success: true, files: saved });
  } catch (err) {
    cleanupTmp(files);
    res.status(err.status || 500).json({ error: err.message, code: err.code || 'UPLOAD_FAILED' });
  }
});
