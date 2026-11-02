import express from 'express';
import fs from 'fs';
import path from 'path';
import { STORAGE_ROOT } from './config.js';
import { resolveSafe } from './safe.js';
import { getDb } from './db.js';
import { calculateUserUsage, getNonConflictingPath } from './upload.js';
import { indexPath } from './indexer.js';
import { rebaseMetadataPaths, removeMetadataPaths, logActivity } from './metadata.js';

export const trashRouter = express.Router();

function trashDirOf(username) {
  return path.join(STORAGE_ROOT, 'users', username, '.trash');
}

function rowToEntry(row, username) {
  return {
    id: row.id,
    name: row.name,
    originalPath: row.original_path,
    type: row.type,
    size: row.size,
    deletedAt: row.deleted_at,
    mime: row.type === 'folder' ? 'application/vnd.google-apps.folder' : undefined,
    exists: fs.existsSync(path.join(trashDirOf(username), row.id))
  };
}

/** Hitung ukuran total sebuah path di disk (file atau folder). */
function sizeOf(abs) {
  let st;
  try {
    st = fs.statSync(abs);
  } catch {
    return 0;
  }
  if (!st.isDirectory()) return st.size;
  let total = 0;
  for (const ent of fs.readdirSync(abs, { withFileTypes: true })) {
    total += sizeOf(path.join(abs, ent.name));
  }
  return total;
}

/** Hapus permanen satu baris trash: dari disk dan tabel. Mengembalikan true jika baris ada. */
function purgeRow(row, username) {
  const abs = path.join(trashDirOf(username), row.id);
  try {
    fs.rmSync(abs, { recursive: true, force: true });
  } catch {
    // Abaikan; baris tetap dihapus agar tidak menggantung
  }
  const db = getDb();
  db.prepare('DELETE FROM trash WHERE id = ?').run(row.id);
  removeMetadataPaths(row.user_id, row.original_path);
  return true;
}

/**
 * Bersihkan item Sampah yang lebih tua dari `days` hari untuk semua user.
 * Dipanggil tugas terjadwal. Mengembalikan jumlah item yang dihapus.
 */
export function purgeExpiredTrash(days = 30) {
  const db = getDb();
  const rows = db
    .prepare(
      `
    SELECT t.*, u.username FROM trash t JOIN users u ON u.id = t.user_id
    WHERE t.deleted_at < datetime('now', ?)
  `
    )
    .all(`-${days} days`);
  for (const row of rows) purgeRow(row, row.username);
  return rows.length;
}

/** GET /api/trash */
trashRouter.get('/', (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM trash WHERE user_id = ? ORDER BY deleted_at DESC').all(req.user.id);
  const entries = rows.map((r) => rowToEntry(r, req.user.username)).filter((e) => e.exists);
  res.json({ entries, retentionDays: 30 });
});

/**
 * POST /api/trash/restore {ids}
 * Pulihkan ke lokasi asal; folder induk yang hilang dibuat ulang; nama bentrok → "nama (1)".
 */
trashRouter.post('/restore', async (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Daftar id wajib disertakan', code: 'MISSING_IDS' });
  }
  const db = getDb();
  const userRoot = path.join(STORAGE_ROOT, 'users', req.user.username);
  const trashDir = trashDirOf(req.user.username);

  const rows = ids.map((id) => db.prepare('SELECT * FROM trash WHERE id = ? AND user_id = ?').get(id, req.user.id)).filter(Boolean);
  if (rows.length === 0) {
    return res.status(404).json({ error: 'Item Sampah tidak ditemukan', code: 'NOT_FOUND' });
  }

  // Kuota dicek sebelum memulihkan (Master Prompt §8.7)
  const needed = rows.reduce((acc, r) => acc + sizeOf(path.join(trashDir, r.id)), 0);
  const remaining = req.user.quotaBytes - calculateUserUsage(userRoot);
  if (needed > remaining) {
    return res.status(413).json({
      error: `Penyimpanan tidak mencukupi untuk memulihkan (butuh ${(needed / (1024 * 1024)).toFixed(1)} MB)`,
      code: 'QUOTA_EXCEEDED'
    });
  }

  const restored = [];
  try {
    for (const row of rows) {
      const src = path.join(trashDir, row.id);
      if (!fs.existsSync(src)) {
        db.prepare('DELETE FROM trash WHERE id = ?').run(row.id);
        continue;
      }
      // Validasi lokasi asal lewat resolveSafe (menolak traversal dari data lama yang rusak)
      const original = resolveSafe(req.user.username, row.original_path);
      const parentAbs = path.dirname(original.targetPath);
      await fs.promises.mkdir(parentAbs, { recursive: true });

      const { targetPath, finalName } = getNonConflictingPath(parentAbs, row.name);
      await fs.promises.rename(src, targetPath);

      const parentRel = original.cleanRel.includes('/') ? original.cleanRel.slice(0, original.cleanRel.lastIndexOf('/')) : '';
      const newRel = parentRel ? `${parentRel}/${finalName}` : finalName;
      if (newRel !== row.original_path) rebaseMetadataPaths(req.user.id, row.original_path, newRel);

      db.prepare('DELETE FROM trash WHERE id = ?').run(row.id);
      indexPath(req.user, newRel);
      // Folder induk yang dibuat ulang ikut diindeks
      if (parentRel) indexPath(req.user, parentRel.split('/')[0]);
      logActivity(req.user.id, 'restore', newRel, { trashId: row.id }, req.ip);
      restored.push({ id: row.id, path: newRel, name: finalName, type: row.type });
    }
    res.json({ success: true, restored });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, code: err.code || 'RESTORE_FAILED', restored });
  }
});

/** DELETE /api/trash/all — kosongkan Sampah */
trashRouter.delete('/all', (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM trash WHERE user_id = ?').all(req.user.id);
  for (const row of rows) purgeRow(row, req.user.username);
  // Sisa folder yatim di .trash (tanpa baris) ikut dibersihkan
  const dir = trashDirOf(req.user.username);
  if (fs.existsSync(dir)) {
    for (const name of fs.readdirSync(dir)) {
      fs.rmSync(path.join(dir, name), { recursive: true, force: true });
    }
  }
  logActivity(req.user.id, 'trash_empty', null, { count: rows.length }, req.ip);
  res.json({ success: true, deleted: rows.length });
});

/** DELETE /api/trash {ids} — hapus permanen */
trashRouter.delete('/', (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Daftar id wajib disertakan', code: 'MISSING_IDS' });
  }
  const db = getDb();
  let deleted = 0;
  for (const id of ids) {
    const row = db.prepare('SELECT * FROM trash WHERE id = ? AND user_id = ?').get(id, req.user.id);
    if (!row) continue;
    purgeRow(row, req.user.username);
    logActivity(req.user.id, 'delete_permanent', row.original_path, { trashId: id }, req.ip);
    deleted++;
  }
  res.json({ success: true, deleted });
});
