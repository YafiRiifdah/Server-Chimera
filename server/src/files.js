import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import mime from 'mime-types';
import { STORAGE_ROOT } from './config.js';
import { resolveSafe, validateFilename } from './safe.js';
import { getDb } from './db.js';
import { calculateUserUsage, getNonConflictingPath } from './upload.js';
import { FOLDER_COLORS } from './palette.js';
import { indexPath, moveInIndex, removeFromIndex } from './indexer.js';
import { rebaseMetadataPaths, logActivity, loadUserMetadata } from './metadata.js';
import { listDirectory, sendFileStream, parseRange as parseRangeImpl } from './serve.js';

// Warna default (abu-abu) tidak disimpan; disimpan hanya warna non-default.
const DEFAULT_COLOR = FOLDER_COLORS[0].hex;
const ALLOWED_COLORS = new Set(FOLDER_COLORS.map((c) => c.hex));

export const filesRouter = express.Router();

/**
 * GET /api/files?path=
 * Mengambil daftar item (file & folder) di direktori yang diminta.
 */
filesRouter.get('/', async (req, res) => {
  const relPath = req.query.path || '';

  let resolved;
  try {
    resolved = resolveSafe(req.user.username, relPath);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message, code: err.code });
  }

  if (!fs.existsSync(resolved.targetPath)) {
    return res.status(404).json({ error: 'Folder tidak ditemukan', code: 'NOT_FOUND' });
  }

  try {
    const meta = loadUserMetadata(req.user.id);
    const entries = await listDirectory(resolved.targetPath, resolved.cleanRel, meta);
    res.json({ path: resolved.cleanRel, entries });
  } catch (err) {
    res.status(500).json({ error: 'Gagal membaca isi folder', code: 'READ_DIR_FAILED' });
  }
});

/**
 * GET /api/files/stat?path=
 * Mengambil informasi detail sebuah file/folder.
 */
filesRouter.get('/stat', async (req, res) => {
  const relPath = req.query.path;
  if (!relPath) {
    return res.status(400).json({ error: 'Parameter path wajib disertakan', code: 'MISSING_PATH' });
  }

  let resolved;
  try {
    resolved = resolveSafe(req.user.username, relPath);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message, code: err.code });
  }

  if (!fs.existsSync(resolved.targetPath)) {
    return res.status(404).json({ error: 'Item tidak ditemukan', code: 'NOT_FOUND' });
  }

  try {
    const stat = await fs.promises.stat(resolved.targetPath);
    const isDir = stat.isDirectory();
    const detectedMime = isDir ? 'application/vnd.google-apps.folder' : mime.lookup(resolved.targetPath) || 'application/octet-stream';

    const db = getDb();
    const isStarred = !!db.prepare('SELECT 1 FROM starred WHERE user_id = ? AND path = ?').get(req.user.id, resolved.cleanRel);
    const color = isDir
      ? db.prepare('SELECT color FROM folder_colors WHERE user_id = ? AND path = ?').get(req.user.id, resolved.cleanRel)?.color || null
      : undefined;

    // Siapa saja yang punya akses (Master Prompt §5.3 panel Detail)
    const shares = db
      .prepare(
        `SELECT s.id, s.type, s.permission, s.expires_at, u.username AS target_username
                FROM shares s LEFT JOIN users u ON u.id = s.target_user_id
                WHERE s.owner_id = ? AND s.path = ? ORDER BY s.created_at DESC`
      )
      .all(req.user.id, resolved.cleanRel)
      .map((r) => ({
        id: r.id,
        type: r.type,
        permission: r.permission,
        targetUsername: r.target_username || null,
        expiresAt: r.expires_at || null
      }));

    // Aktivitas terakhir untuk path ini (terbaru dulu)
    const activity = db
      .prepare(
        `SELECT a.action, a.created_at, a.meta_json, u.username FROM activity a LEFT JOIN users u ON u.id = a.user_id
                WHERE a.user_id = ? AND a.path = ? ORDER BY a.id DESC LIMIT 10`
      )
      .all(req.user.id, resolved.cleanRel)
      .map((r) => ({ action: r.action, at: r.created_at, username: r.username, meta: r.meta_json ? JSON.parse(r.meta_json) : null }));

    let itemCount;
    let totalSize = isDir ? 0 : stat.size;
    if (isDir) {
      itemCount = 0;
      const walk = (dir) => {
        for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
          if (ent.name.startsWith('.chimera') || ent.name.startsWith('.trash')) continue;
          itemCount++;
          const full = path.join(dir, ent.name);
          if (ent.isDirectory()) walk(full);
          else {
            try {
              totalSize += fs.statSync(full).size;
            } catch {
              // abaikan
            }
          }
        }
      };
      try {
        walk(resolved.targetPath);
      } catch {
        // abaikan
      }
    }

    res.json({
      name: path.basename(resolved.targetPath),
      path: resolved.cleanRel,
      type: isDir ? 'folder' : 'file',
      size: totalSize,
      itemCount,
      mime: detectedMime,
      mtime: stat.mtime.toISOString(),
      ctime: stat.birthtime && stat.birthtime.getTime() > 0 ? stat.birthtime.toISOString() : stat.ctime.toISOString(),
      starred: isStarred,
      color,
      shares,
      activity
    });
  } catch (err) {
    res.status(500).json({ error: 'Gagal membaca metadata item', code: 'STAT_FAILED' });
  }
});

/**
 * POST /api/files/mkdir
 * Membuat folder baru.
 */
filesRouter.post('/mkdir', async (req, res) => {
  const { path: parentRel = '', name } = req.body || {};

  try {
    const validName = validateFilename(name);
    const parentResolved = resolveSafe(req.user.username, parentRel);

    if (!fs.existsSync(parentResolved.targetPath)) {
      return res.status(404).json({ error: 'Folder induk tidak ditemukan', code: 'PARENT_NOT_FOUND' });
    }

    const folderRelPath = parentResolved.cleanRel ? `${parentResolved.cleanRel}/${validName}` : validName;
    const targetResolved = resolveSafe(req.user.username, folderRelPath);

    if (fs.existsSync(targetResolved.targetPath)) {
      return res.status(409).json({ error: 'Folder dengan nama tersebut sudah ada', code: 'ALREADY_EXISTS' });
    }

    await fs.promises.mkdir(targetResolved.targetPath, { recursive: true });
    indexPath(req.user, targetResolved.cleanRel);
    logActivity(req.user.id, 'mkdir', targetResolved.cleanRel, { name: validName }, req.ip);

    res.json({
      success: true,
      folder: {
        name: validName,
        path: targetResolved.cleanRel,
        type: 'folder',
        mtime: new Date().toISOString()
      }
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, code: err.code || 'MKDIR_FAILED' });
  }
});

/**
 * POST /api/files/rename
 * Mengganti nama file atau folder.
 */
filesRouter.post('/rename', async (req, res) => {
  const { path: itemRel, name: newName } = req.body || {};
  if (!itemRel) {
    return res.status(400).json({ error: 'Path item wajib disertakan', code: 'MISSING_PATH' });
  }

  try {
    const validName = validateFilename(newName);
    const srcResolved = resolveSafe(req.user.username, itemRel);

    if (!fs.existsSync(srcResolved.targetPath)) {
      return res.status(404).json({ error: 'Item tidak ditemukan', code: 'NOT_FOUND' });
    }

    const parentDirRel = path.dirname(srcResolved.cleanRel) === '.' ? '' : path.dirname(srcResolved.cleanRel);
    const destRelPath = parentDirRel ? `${parentDirRel}/${validName}` : validName;
    const destResolved = resolveSafe(req.user.username, destRelPath);

    if (fs.existsSync(destResolved.targetPath)) {
      return res.status(409).json({ error: 'Item dengan nama tersebut sudah ada', code: 'ALREADY_EXISTS' });
    }

    await fs.promises.rename(srcResolved.targetPath, destResolved.targetPath);

    const db = getDb();
    db.prepare(
      `
      INSERT INTO activity (user_id, action, path, meta_json)
      VALUES (?, 'rename', ?, ?)
    `
    ).run(req.user.id, destResolved.cleanRel, JSON.stringify({ oldPath: srcResolved.cleanRel, newName: validName }));

    // Perbarui metadata (warna folder, bintang) dan indeks untuk item ini dan turunannya
    rebaseMetadataPaths(req.user.id, srcResolved.cleanRel, destResolved.cleanRel);
    moveInIndex(req.user, srcResolved.cleanRel, destResolved.cleanRel);

    res.json({
      success: true,
      item: {
        name: validName,
        path: destResolved.cleanRel
      }
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, code: err.code || 'RENAME_FAILED' });
  }
});

/**
 * POST /api/files/move
 * Memindahkan satu atau beberapa item ke folder tujuan.
 */
filesRouter.post('/move', async (req, res) => {
  const { paths: itemPaths = [], to: toRel = '' } = req.body || {};
  if (!Array.isArray(itemPaths) || itemPaths.length === 0) {
    return res.status(400).json({ error: 'Daftar item untuk dipindahkan wajib disertakan', code: 'MISSING_PATHS' });
  }

  try {
    const destResolved = resolveSafe(req.user.username, toRel);
    if (!fs.existsSync(destResolved.targetPath)) {
      return res.status(404).json({ error: 'Folder tujuan tidak ditemukan', code: 'DEST_NOT_FOUND' });
    }

    const destStat = await fs.promises.stat(destResolved.targetPath);
    if (!destStat.isDirectory()) {
      return res.status(400).json({ error: 'Tujuan harus berupa folder', code: 'DEST_NOT_DIRECTORY' });
    }

    const db = getDb();
    let movedCount = 0;

    for (const srcRel of itemPaths) {
      const srcResolved = resolveSafe(req.user.username, srcRel);
      if (!fs.existsSync(srcResolved.targetPath)) continue;

      // Cegah memindahkan folder ke dalam dirinya sendiri (atau sub-foldernya).
      // Dibandingkan per segmen path, bukan per string, supaya "foo" -> "foobar" tetap boleh.
      const relToSrc = path.relative(srcResolved.targetPath, destResolved.targetPath);
      const destInsideSrc = relToSrc === '' || (!relToSrc.startsWith('..') && !path.isAbsolute(relToSrc));
      if (destInsideSrc) {
        return res.status(400).json({ error: 'Tidak dapat memindahkan folder ke dalam dirinya sendiri', code: 'INVALID_MOVE' });
      }

      const basename = path.basename(srcResolved.targetPath);
      const targetDestPath = path.join(destResolved.targetPath, basename);

      if (fs.existsSync(targetDestPath)) {
        return res.status(409).json({ error: `Item "${basename}" sudah ada di folder tujuan`, code: 'ALREADY_EXISTS' });
      }

      await fs.promises.rename(srcResolved.targetPath, targetDestPath);
      movedCount++;

      const newRel = destResolved.cleanRel ? `${destResolved.cleanRel}/${basename}` : basename;
      rebaseMetadataPaths(req.user.id, srcResolved.cleanRel, newRel);
      moveInIndex(req.user, srcResolved.cleanRel, newRel);
      db.prepare(
        `
        INSERT INTO activity (user_id, action, path, meta_json)
        VALUES (?, 'move', ?, ?)
      `
      ).run(req.user.id, newRel, JSON.stringify({ from: srcResolved.cleanRel }));
    }

    res.json({ success: true, moved: movedCount });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, code: err.code || 'MOVE_FAILED' });
  }
});

/** Ukuran total sebuah path (file atau folder) untuk cek kuota salin. */
function sizeOfPath(abs) {
  let st;
  try {
    st = fs.statSync(abs);
  } catch {
    return 0;
  }
  if (!st.isDirectory()) return st.size;
  let total = 0;
  for (const ent of fs.readdirSync(abs, { withFileTypes: true })) {
    if (ent.name.startsWith('.chimera') || ent.name.startsWith('.trash')) continue;
    total += sizeOfPath(path.join(abs, ent.name));
  }
  return total;
}

/**
 * POST /api/files/copy {paths:[], to}
 * Menyalin file/folder (rekursif) ke folder tujuan; nama bentrok → "nama (1)".
 * Kuota dicek sebelum menyalin (Master Prompt §8.7). Warna/bintang tidak ikut disalin.
 */
filesRouter.post('/copy', async (req, res) => {
  const { paths: itemPaths = [], to: toRel = '' } = req.body || {};
  if (!Array.isArray(itemPaths) || itemPaths.length === 0) {
    return res.status(400).json({ error: 'Daftar item untuk disalin wajib disertakan', code: 'MISSING_PATHS' });
  }
  try {
    const dest = resolveSafe(req.user.username, toRel);
    if (!fs.existsSync(dest.targetPath) || !fs.statSync(dest.targetPath).isDirectory()) {
      return res.status(404).json({ error: 'Folder tujuan tidak ditemukan', code: 'DEST_NOT_FOUND' });
    }

    const sources = [];
    let needed = 0;
    for (const rel of itemPaths) {
      const src = resolveSafe(req.user.username, rel);
      if (!fs.existsSync(src.targetPath)) continue;
      const relToSrc = path.relative(src.targetPath, dest.targetPath);
      const destInsideSrc = relToSrc === '' || (!relToSrc.startsWith('..') && !path.isAbsolute(relToSrc));
      if (fs.statSync(src.targetPath).isDirectory() && destInsideSrc) {
        return res.status(400).json({ error: 'Tidak dapat menyalin folder ke dalam dirinya sendiri', code: 'INVALID_COPY' });
      }
      sources.push(src);
      needed += sizeOfPath(src.targetPath);
    }

    const remaining = req.user.quotaBytes - calculateUserUsage(dest.userRoot);
    if (needed > remaining) {
      return res.status(413).json({
        error: `Penyimpanan tidak mencukupi untuk menyalin (butuh ${(needed / (1024 * 1024)).toFixed(1)} MB)`,
        code: 'QUOTA_EXCEEDED'
      });
    }

    const copied = [];
    for (const src of sources) {
      const { targetPath, finalName } = getNonConflictingPath(dest.targetPath, path.basename(src.targetPath));
      await fs.promises.cp(src.targetPath, targetPath, {
        recursive: true,
        filter: (p) => {
          const base = path.basename(p);
          return !base.startsWith('.chimera') && !base.startsWith('.trash');
        }
      });
      const newRel = dest.cleanRel ? `${dest.cleanRel}/${finalName}` : finalName;
      indexPath(req.user, newRel);
      logActivity(req.user.id, 'copy', newRel, { from: src.cleanRel }, req.ip);
      copied.push({ name: finalName, path: newRel, from: src.cleanRel });
    }
    res.json({ success: true, copied });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, code: err.code || 'COPY_FAILED' });
  }
});

/**
 * POST /api/files/color  {path, color}
 * Mengatur warna folder (pola Google Drive "Ubah warna"). color null/default = hapus warna.
 */
filesRouter.post('/color', async (req, res) => {
  const { path: itemRel, color } = req.body || {};
  if (!itemRel) {
    return res.status(400).json({ error: 'Path folder wajib disertakan', code: 'MISSING_PATH' });
  }
  const normalized = typeof color === 'string' ? color.trim().toLowerCase() : null;
  if (normalized !== null && !ALLOWED_COLORS.has(normalized)) {
    return res.status(400).json({ error: 'Warna tidak tersedia di palet', code: 'INVALID_COLOR' });
  }

  try {
    const resolved = resolveSafe(req.user.username, itemRel);
    if (!fs.existsSync(resolved.targetPath)) {
      return res.status(404).json({ error: 'Folder tidak ditemukan', code: 'NOT_FOUND' });
    }
    const stat = await fs.promises.stat(resolved.targetPath);
    if (!stat.isDirectory()) {
      return res.status(400).json({ error: 'Warna hanya bisa diatur untuk folder', code: 'NOT_A_FOLDER' });
    }

    const db = getDb();
    if (normalized === null || normalized === DEFAULT_COLOR) {
      db.prepare('DELETE FROM folder_colors WHERE user_id = ? AND path = ?').run(req.user.id, resolved.cleanRel);
    } else {
      db.prepare(
        `
        INSERT INTO folder_colors (user_id, path, color) VALUES (?, ?, ?)
        ON CONFLICT(user_id, path) DO UPDATE SET color = excluded.color
      `
      ).run(req.user.id, resolved.cleanRel, normalized);
    }

    res.json({ success: true, path: resolved.cleanRel, color: normalized === DEFAULT_COLOR ? null : normalized });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, code: err.code || 'COLOR_FAILED' });
  }
});

/**
 * DELETE /api/files
 * Memindahkan file atau folder ke Sampah (.trash).
 */
filesRouter.delete('/', async (req, res) => {
  const { paths: itemPaths = [] } = req.body || {};
  if (!Array.isArray(itemPaths) || itemPaths.length === 0) {
    return res.status(400).json({ error: 'Daftar item untuk dihapus wajib disertakan', code: 'MISSING_PATHS' });
  }

  try {
    const userRoot = path.resolve(STORAGE_ROOT, 'users', req.user.username);
    const trashDir = path.join(userRoot, '.trash');
    if (!fs.existsSync(trashDir)) {
      fs.mkdirSync(trashDir, { recursive: true });
    }

    const db = getDb();
    let deletedCount = 0;

    for (const rel of itemPaths) {
      const resolved = resolveSafe(req.user.username, rel);
      if (!fs.existsSync(resolved.targetPath)) continue;

      const stat = await fs.promises.stat(resolved.targetPath);
      const isDir = stat.isDirectory();
      const trashId = crypto.randomUUID();
      const trashDestPath = path.join(trashDir, trashId);

      // Pindahkan ke folder .trash
      await fs.promises.rename(resolved.targetPath, trashDestPath);

      // Catat di tabel SQLite trash
      db.prepare(
        `
        INSERT INTO trash (id, user_id, original_path, name, type, size)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      ).run(trashId, req.user.id, resolved.cleanRel, path.basename(resolved.targetPath), isDir ? 'folder' : 'file', isDir ? 0 : stat.size);

      removeFromIndex(req.user.id, resolved.cleanRel);
      logActivity(req.user.id, 'trash', resolved.cleanRel, { trashId }, req.ip);

      deletedCount++;
    }

    res.json({ success: true, deleted: deletedCount });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, code: err.code || 'DELETE_FAILED' });
  }
});

export const parseRange = parseRangeImpl;

/**
 * GET /api/files/raw?path=&dl=
 * Stream konten file dengan dukungan HTTP Range dan proteksi keamanan XSS.
 */
filesRouter.get('/raw', async (req, res) => {
  const { path: relPath, dl } = req.query;
  if (!relPath) {
    return res.status(400).json({ error: 'Parameter path wajib disertakan', code: 'MISSING_PATH' });
  }

  let resolved;
  try {
    resolved = resolveSafe(req.user.username, relPath);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message, code: err.code });
  }

  if (!fs.existsSync(resolved.targetPath)) {
    return res.status(404).json({ error: 'File tidak ditemukan', code: 'NOT_FOUND' });
  }

  try {
    if (!req.headers.range) logActivity(req.user.id, 'open', resolved.cleanRel, { dl: !!dl }, req.ip);
    await sendFileStream(req, res, resolved.targetPath, { attachment: dl === '1' || dl === 'true' });
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: 'Gagal membaca berkas', code: 'STREAM_FAILED' });
  }
});

/**
 * GET /api/files/usage
 * Mengembalikan pemakaian kuota user dan kapasitas sisa disk server.
 */
filesRouter.get('/usage', async (req, res) => {
  try {
    const userRoot = path.resolve(STORAGE_ROOT, 'users', req.user.username);
    const usedBytes = calculateUserUsage(userRoot);

    let diskFree = 0;
    try {
      const statfs = await fs.promises.statfs(STORAGE_ROOT);
      diskFree = Number(statfs.bavail) * Number(statfs.bsize);
    } catch {
      diskFree = 100 * 1024 * 1024 * 1024; // Fallback jika OS tidak mendukung statfs
    }

    res.json({
      used: usedBytes,
      quota: req.user.quotaBytes,
      diskFree
    });
  } catch (err) {
    res.status(500).json({ error: 'Gagal mengambil informasi pemakaian', code: 'USAGE_FAILED' });
  }
});
