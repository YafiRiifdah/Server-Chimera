import express from 'express';
import fs from 'fs';
import { resolveSafe } from './safe.js';
import { getDb } from './db.js';
import { loadUserMetadata, entryFromDisk } from './metadata.js';

export const starredRouter = express.Router();

/**
 * GET /api/starred
 * Daftar item berbintang yang masih ada di disk (item di Sampah tidak ditampilkan).
 */
starredRouter.get('/', (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT path FROM starred WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
  const meta = loadUserMetadata(req.user.id);
  const entries = rows.map((r) => entryFromDisk(req.user, r.path, meta)).filter(Boolean);
  entries.sort((a, b) =>
    a.type !== b.type ? (a.type === 'folder' ? -1 : 1) : a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true })
  );
  res.json({ entries });
});

/** POST /api/starred {path} */
starredRouter.post('/', (req, res) => {
  const { path: rel } = req.body || {};
  if (!rel) return res.status(400).json({ error: 'Path wajib disertakan', code: 'MISSING_PATH' });
  try {
    const resolved = resolveSafe(req.user.username, rel);
    if (!fs.existsSync(resolved.targetPath)) {
      return res.status(404).json({ error: 'Item tidak ditemukan', code: 'NOT_FOUND' });
    }
    getDb().prepare('INSERT OR IGNORE INTO starred (user_id, path) VALUES (?, ?)').run(req.user.id, resolved.cleanRel);
    res.json({ success: true, path: resolved.cleanRel, starred: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, code: err.code || 'STAR_FAILED' });
  }
});

/** DELETE /api/starred {path} */
starredRouter.delete('/', (req, res) => {
  const { path: rel } = req.body || {};
  if (!rel) return res.status(400).json({ error: 'Path wajib disertakan', code: 'MISSING_PATH' });
  try {
    const resolved = resolveSafe(req.user.username, rel);
    getDb().prepare('DELETE FROM starred WHERE user_id = ? AND path = ?').run(req.user.id, resolved.cleanRel);
    res.json({ success: true, path: resolved.cleanRel, starred: false });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, code: err.code || 'UNSTAR_FAILED' });
  }
});
