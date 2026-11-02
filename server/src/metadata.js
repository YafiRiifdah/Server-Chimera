import fs from 'fs';
import path from 'path';
import mime from 'mime-types';
import { STORAGE_ROOT } from './config.js';
import { getDb } from './db.js';
import { likeEscape } from './indexer.js';

/**
 * Metadata per path yang hidup di SQLite (warna folder, bintang) harus
 * mengikuti perubahan path di disk. Modul ini dipakai rename, move, dan restore.
 */

/** Perbarui path metadata untuk folder itu sendiri dan semua turunannya. */
export function rebaseMetadataPaths(userId, oldRel, newRel) {
  const db = getDb();
  const like = `${likeEscape(oldRel)}/%`;
  for (const table of ['folder_colors', 'starred', 'shares']) {
    const col = table === 'shares' ? 'owner_id' : 'user_id';
    db.prepare(
      `
      UPDATE ${table}
      SET path = ? || substr(path, ?)
      WHERE ${col} = ? AND (path = ? OR path LIKE ? ESCAPE '\\')
    `
    ).run(newRel, oldRel.length + 1, userId, oldRel, like);
  }
}

/** Hapus metadata path dan turunannya (hapus permanen). */
export function removeMetadataPaths(userId, rel) {
  const db = getDb();
  const like = `${likeEscape(rel)}/%`;
  for (const table of ['folder_colors', 'starred', 'shares']) {
    const col = table === 'shares' ? 'owner_id' : 'user_id';
    db.prepare(`DELETE FROM ${table} WHERE ${col} = ? AND (path = ? OR path LIKE ? ESCAPE '\\')`).run(userId, rel, like);
  }
}

/** Set dan peta metadata user untuk melengkapi entri. */
export function loadUserMetadata(userId) {
  const db = getDb();
  const starredSet = new Set(
    db
      .prepare('SELECT path FROM starred WHERE user_id = ?')
      .all(userId)
      .map((r) => r.path)
  );
  const colorMap = new Map(
    db
      .prepare('SELECT path, color FROM folder_colors WHERE user_id = ?')
      .all(userId)
      .map((r) => [r.path, r.color])
  );
  const sharedSet = new Set(
    db
      .prepare('SELECT path FROM shares WHERE owner_id = ?')
      .all(userId)
      .map((r) => r.path)
  );
  return { starredSet, colorMap, sharedSet };
}

/**
 * Bentuk entri API yang seragam (sama dengan GET /files) dari sebuah path di disk.
 * Mengembalikan null jika path tidak ada lagi (mis. sudah di Sampah).
 */
export function entryFromDisk(user, rel, meta) {
  const root = path.join(STORAGE_ROOT, 'users', user.username);
  let stat;
  try {
    stat = fs.statSync(path.join(root, rel));
  } catch {
    return null;
  }
  const isDir = stat.isDirectory();
  const name = path.basename(rel);
  return {
    name,
    path: rel,
    type: isDir ? 'folder' : 'file',
    size: isDir ? 0 : stat.size,
    mime: isDir ? 'application/vnd.google-apps.folder' : mime.lookup(name) || 'application/octet-stream',
    mtime: stat.mtime.toISOString(),
    starred: meta ? meta.starredSet.has(rel) : false,
    shared: false,
    color: isDir ? meta?.colorMap.get(rel) || null : undefined
  };
}

/** Catat aktivitas pengguna (dipakai Terbaru dan log admin). */
export function logActivity(userId, action, relPath, meta = null, ip = null) {
  getDb()
    .prepare('INSERT INTO activity (user_id, action, path, meta_json, ip) VALUES (?, ?, ?, ?, ?)')
    .run(userId, action, relPath, meta ? JSON.stringify(meta) : null, ip);
}
