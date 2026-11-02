import express from 'express';
import fs from 'fs';
import path from 'path';
import { resolveSafe } from './safe.js';
import { logActivity } from './metadata.js';
import { streamZip, zipNameFor } from './serve.js';

/**
 * GET /api/files/zip?paths=["a","b/c"] — zip streaming untuk pemilik.
 */
export const zipRouter = express.Router();

export function parsePaths(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    // bukan JSON: pisahkan dengan koma
  }
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

zipRouter.get('/zip', async (req, res) => {
  const rels = parsePaths(req.query.paths);
  if (rels.length === 0) {
    return res.status(400).json({ error: 'Daftar item wajib disertakan', code: 'MISSING_PATHS' });
  }

  // Validasi semua path dulu agar error dikirim sebagai JSON sebelum stream dimulai
  const items = [];
  try {
    for (const rel of rels) {
      const resolved = resolveSafe(req.user.username, rel);
      const stat = await fs.promises.stat(resolved.targetPath).catch(() => null);
      if (!stat) return res.status(404).json({ error: `"${rel}" tidak ditemukan`, code: 'NOT_FOUND' });
      items.push({ rel: resolved.cleanRel, abs: resolved.targetPath, isDir: stat.isDirectory(), name: path.basename(resolved.targetPath) });
    }
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message, code: err.code });
  }

  logActivity(req.user.id, 'download_zip', items.length === 1 ? items[0].rel : null, { count: items.length }, req.ip);
  streamZip(req, res, items, zipNameFor(items));
});
