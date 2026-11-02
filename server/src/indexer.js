import fs from 'fs';
import path from 'path';
import mime from 'mime-types';
import { STORAGE_ROOT } from './config.js';
import { getDb } from './db.js';

/**
 * Indeks nama file di SQLite (`files_index`) untuk pencarian global.
 * Sumber kebenaran tetap disk; indeks diperbarui setiap ada perubahan
 * dan bisa dibangun ulang penuh lewat `npm run reindex` atau POST /files/reindex.
 */

const HIDDEN_PREFIXES = ['.chimera', '.trash'];

function userRootOf(username) {
  return path.join(STORAGE_ROOT, 'users', username);
}

function rowFor(userId, rel, stat) {
  const name = path.basename(rel);
  const isDir = stat.isDirectory();
  const parent = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
  return {
    user_id: userId,
    path: rel,
    name,
    type: isDir ? 'folder' : 'file',
    size: isDir ? 0 : stat.size,
    mime: isDir ? 'application/vnd.google-apps.folder' : mime.lookup(name) || 'application/octet-stream',
    mtime: stat.mtime.toISOString(),
    parent_path: parent
  };
}

function upsertStmt(db) {
  return db.prepare(`
    INSERT INTO files_index (user_id, path, name, type, size, mime, mtime, parent_path)
    VALUES (@user_id, @path, @name, @type, @size, @mime, @mtime, @parent_path)
    ON CONFLICT(user_id, path) DO UPDATE SET
      name = excluded.name, type = excluded.type, size = excluded.size,
      mime = excluded.mime, mtime = excluded.mtime, parent_path = excluded.parent_path
  `);
}

/** Escape untuk LIKE agar '%' dan '_' pada nama diperlakukan literal. */
export function likeEscape(s) {
  return s.replace(/[\\%_]/g, '\\$&');
}

/**
 * Indeks satu path (file atau folder beserta seluruh isinya).
 * Dipanggil setelah upload, mkdir, rename/move (path baru), dan restore.
 */
export function indexPath(user, rel) {
  const db = getDb();
  const root = userRootOf(user.username);
  const upsert = upsertStmt(db);

  const walk = (relPath) => {
    const abs = path.join(root, relPath);
    let stat;
    try {
      stat = fs.statSync(abs);
    } catch {
      return;
    }
    upsert.run(rowFor(user.id, relPath, stat));
    if (!stat.isDirectory()) return;
    let entries = [];
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (HIDDEN_PREFIXES.some((p) => ent.name.startsWith(p))) continue;
      walk(relPath ? `${relPath}/${ent.name}` : ent.name);
    }
  };

  db.transaction(() => walk(rel))();
}

/** Indeks satu path saja tanpa menelusuri isinya (dipakai saat upload membuat sub-folder). */
export function indexSingle(user, rel) {
  const abs = path.join(userRootOf(user.username), rel);
  let stat;
  try {
    stat = fs.statSync(abs);
  } catch {
    return;
  }
  upsertStmt(getDb()).run(rowFor(user.id, rel, stat));
}

/** Hapus path dan seluruh turunannya dari indeks (trash, hapus permanen). */
export function removeFromIndex(userId, rel) {
  const db = getDb();
  db.prepare("DELETE FROM files_index WHERE user_id = ? AND (path = ? OR path LIKE ? ESCAPE '\\')").run(
    userId,
    rel,
    `${likeEscape(rel)}/%`
  );
}

/** Rename/move: buang subtree lama lalu indeks ulang subtree baru dari disk. */
export function moveInIndex(user, oldRel, newRel) {
  removeFromIndex(user.id, oldRel);
  indexPath(user, newRel);
}

/** Bangun ulang indeks satu user dari nol. */
export function reindexUser(user) {
  const db = getDb();
  db.transaction(() => {
    db.prepare('DELETE FROM files_index WHERE user_id = ?').run(user.id);
    const root = userRootOf(user.username);
    if (!fs.existsSync(root)) return;
    const upsert = upsertStmt(db);
    const walk = (relPath) => {
      const abs = path.join(root, relPath);
      let entries = [];
      try {
        entries = fs.readdirSync(abs, { withFileTypes: true });
      } catch {
        return;
      }
      for (const ent of entries) {
        if (HIDDEN_PREFIXES.some((p) => ent.name.startsWith(p))) continue;
        const childRel = relPath ? `${relPath}/${ent.name}` : ent.name;
        let stat;
        try {
          stat = fs.statSync(path.join(root, childRel));
        } catch {
          continue;
        }
        upsert.run(rowFor(user.id, childRel, stat));
        if (stat.isDirectory()) walk(childRel);
      }
    };
    walk('');
  })();
  return db.prepare('SELECT COUNT(*) c FROM files_index WHERE user_id = ?').get(user.id).c;
}

/** Bangun ulang indeks semua user (dipakai `npm run reindex` dan admin). */
export function reindexAll() {
  const db = getDb();
  const users = db.prepare('SELECT id, username FROM users').all();
  const result = {};
  for (const u of users) result[u.username] = reindexUser(u);
  return result;
}
