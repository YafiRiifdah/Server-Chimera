import express from 'express';
import { getDb } from './db.js';
import { likeEscape, reindexUser } from './indexer.js';
import { loadUserMetadata, entryFromDisk } from './metadata.js';

export const searchRouter = express.Router();

// Filter tipe ala Google Drive: gambar / video / audio / dokumen / folder
const TYPE_FILTERS = {
  folder: "type = 'folder'",
  image: "mime LIKE 'image/%'",
  video: "mime LIKE 'video/%'",
  audio: "mime LIKE 'audio/%'",
  document:
    "(mime = 'application/pdf' OR mime LIKE 'text/%' OR mime LIKE 'application/msword%' OR mime LIKE 'application/vnd.ms-%' OR mime LIKE 'application/vnd.openxmlformats%' OR mime LIKE 'application/vnd.oasis%' OR mime = 'application/rtf' OR mime = 'application/json')"
};

const MODIFIED_FILTERS = {
  today: '-1 days',
  '7d': '-7 days',
  '30d': '-30 days'
};

/**
 * GET /api/files/search?q=&type=&modified=
 * Pencarian nama di seluruh Drive user lewat indeks SQLite.
 */
searchRouter.get('/search', (req, res) => {
  const q = String(req.query.q || '').trim();
  const type = String(req.query.type || '');
  const modified = String(req.query.modified || '');

  if (!q && !type && !modified) return res.json({ entries: [] });

  const where = ['user_id = ?'];
  const params = [req.user.id];
  if (q) {
    where.push("name LIKE ? ESCAPE '\\'");
    params.push(`%${likeEscape(q)}%`);
  }
  if (type && TYPE_FILTERS[type]) where.push(TYPE_FILTERS[type]);
  if (modified && MODIFIED_FILTERS[modified]) {
    where.push("mtime >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)");
    params.push(MODIFIED_FILTERS[modified]);
  }

  const rows = getDb()
    .prepare(`SELECT path FROM files_index WHERE ${where.join(' AND ')} ORDER BY type = 'folder' DESC, name COLLATE NOCASE LIMIT 200`)
    .all(...params);

  // Verifikasi ke disk agar entri basi (mis. baru dihapus) tidak tampil
  const meta = loadUserMetadata(req.user.id);
  const entries = rows.map((r) => entryFromDisk(req.user, r.path, meta)).filter(Boolean);
  res.json({ entries, query: q });
});

/**
 * GET /api/files/recent
 * 100 file terakhir yang diunggah/diubah/dibuka user (dari log aktivitas).
 */
searchRouter.get('/recent', (req, res) => {
  const rows = getDb()
    .prepare(
      `
      SELECT path, MAX(created_at) AS last_at, MAX(id) AS last_id FROM activity
      WHERE user_id = ? AND path IS NOT NULL
        AND action IN ('upload', 'rename', 'move', 'restore', 'open')
      GROUP BY path ORDER BY last_at DESC, last_id DESC LIMIT 300
    `
    )
    .all(req.user.id);
  const meta = loadUserMetadata(req.user.id);
  const entries = [];
  for (const r of rows) {
    const e = entryFromDisk(req.user, r.path, meta);
    if (e && e.type === 'file') {
      e.lastActivityAt = r.last_at;
      entries.push(e);
    }
    if (entries.length >= 100) break;
  }
  res.json({ entries });
});

/** POST /api/files/reindex — bangun ulang indeks user ini dari disk */
searchRouter.post('/reindex', (req, res) => {
  const count = reindexUser(req.user);
  res.json({ success: true, indexed: count });
});
