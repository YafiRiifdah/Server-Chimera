import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { STORAGE_ROOT, MAX_UPLOAD_BYTES, UPLOAD_CHUNK_BYTES } from './config.js';
import { resolveSafe, validateFilename } from './safe.js';
import { getDb } from './db.js';
import { calculateUserUsage, resolveConflict } from './upload.js';
import { indexSingle } from './indexer.js';
import { logActivity } from './metadata.js';

/**
 * Upload chunked / resumable (Master Prompt §5.4, §6):
 *   POST /api/upload/init            → {uploadId, chunkSize, received: []}
 *   PUT  /api/upload/:id/chunk/:n    (body biner)
 *   GET  /api/upload/:id             → {received: [...]}
 *   POST /api/upload/:id/complete    {conflict}
 *   DELETE /api/upload/:id
 * Potongan disimpan di STORAGE_ROOT/.chimera/tmp/<id>/<n> (filesystem yang sama
 * dengan tujuan), disusun ke satu file lalu di-rename ke tujuan.
 */
export const chunkedRouter = express.Router();

const tmpRoot = path.join(STORAGE_ROOT, '.chimera', 'tmp');

function sessionDir(id) {
  return path.join(tmpRoot, id);
}

function totalChunksOf(size, chunkSize) {
  return Math.max(1, Math.ceil(size / chunkSize));
}

/** Daftar nomor chunk yang sudah lengkap di disk. */
function receivedChunks(id) {
  const dir = sessionDir(id);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((n) => /^\d+$/.test(n))
    .map(Number)
    .sort((a, b) => a - b);
}

function cleanupSession(id) {
  try {
    fs.rmSync(sessionDir(id), { recursive: true, force: true });
  } catch {
    // Abaikan
  }
  try {
    fs.rmSync(path.join(tmpRoot, `${id}.assembled`), { force: true });
  } catch {
    // Abaikan
  }
  getDb().prepare('DELETE FROM uploads WHERE id = ?').run(id);
}

/** Bersihkan sesi upload yang ditinggalkan lebih dari `hours` jam (tugas terjadwal). */
export function purgeStaleUploads(hours = 24) {
  const db = getDb();
  const rows = db.prepare("SELECT id FROM uploads WHERE created_at < datetime('now', ?)").all(`-${hours} hours`);
  for (const r of rows) cleanupSession(r.id);
  // Folder yatim di tmp tanpa baris (mis. setelah crash) ikut dibersihkan jika sudah tua
  if (fs.existsSync(tmpRoot)) {
    const known = new Set(
      db
        .prepare('SELECT id FROM uploads')
        .all()
        .map((r) => r.id)
    );
    for (const name of fs.readdirSync(tmpRoot)) {
      const full = path.join(tmpRoot, name);
      try {
        const st = fs.statSync(full);
        const ageMs = Date.now() - st.mtimeMs;
        const id = name.replace(/\.assembled$/, '');
        if (!known.has(id) && ageMs > hours * 3600 * 1000) {
          fs.rmSync(full, { recursive: true, force: true });
        }
      } catch {
        // Abaikan
      }
    }
  }
  return rows.length;
}

/** Ambil sesi milik user; 404 jika tidak ada. */
function loadSession(req, res) {
  const row = getDb().prepare('SELECT * FROM uploads WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!row) {
    res.status(404).json({ error: 'Sesi upload tidak ditemukan atau sudah selesai', code: 'UPLOAD_NOT_FOUND' });
    return null;
  }
  return row;
}

// POST /api/upload/init
chunkedRouter.post('/init', (req, res) => {
  const { path: targetRel = '', name, size, mtime } = req.body || {};
  const sizeNum = Number(size);
  if (!Number.isInteger(sizeNum) || sizeNum <= 0) {
    return res.status(400).json({ error: 'Ukuran file tidak valid', code: 'INVALID_SIZE' });
  }
  if (sizeNum > MAX_UPLOAD_BYTES) {
    return res.status(413).json({
      error: `Ukuran file melebihi batas ${(MAX_UPLOAD_BYTES / (1024 * 1024 * 1024)).toFixed(1)} GB per file`,
      code: 'FILE_TOO_LARGE'
    });
  }

  try {
    const validName = validateFilename(name);
    const target = resolveSafe(req.user.username, targetRel);
    if (!fs.existsSync(target.targetPath) || !fs.statSync(target.targetPath).isDirectory()) {
      return res.status(404).json({ error: 'Folder tujuan tidak ditemukan', code: 'TARGET_NOT_FOUND' });
    }

    const remaining = req.user.quotaBytes - calculateUserUsage(target.userRoot);
    if (sizeNum > remaining) {
      return res.status(413).json({
        error: `Penyimpanan tidak mencukupi. Sisa kuota ${(Math.max(0, remaining) / (1024 * 1024)).toFixed(1)} MB.`,
        code: 'QUOTA_EXCEEDED'
      });
    }

    const id = crypto.randomUUID();
    fs.mkdirSync(sessionDir(id), { recursive: true });
    getDb()
      .prepare('INSERT INTO uploads (id, user_id, path, name, size, mtime, chunk_size) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, req.user.id, target.cleanRel, validName, sizeNum, mtime || null, UPLOAD_CHUNK_BYTES);

    res.json({ uploadId: id, chunkSize: UPLOAD_CHUNK_BYTES, totalChunks: totalChunksOf(sizeNum, UPLOAD_CHUNK_BYTES), received: [] });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, code: err.code || 'UPLOAD_INIT_FAILED' });
  }
});

// GET /api/upload/:id
chunkedRouter.get('/:id', (req, res) => {
  const row = loadSession(req, res);
  if (!row) return;
  res.json({
    uploadId: row.id,
    chunkSize: row.chunk_size,
    size: row.size,
    totalChunks: totalChunksOf(row.size, row.chunk_size),
    received: receivedChunks(row.id)
  });
});

// PUT /api/upload/:id/chunk/:n  (body biner)
chunkedRouter.put('/:id/chunk/:n', (req, res) => {
  const row = loadSession(req, res);
  if (!row) {
    req.resume();
    return;
  }
  const n = Number(req.params.n);
  const total = totalChunksOf(row.size, row.chunk_size);
  if (!Number.isInteger(n) || n < 0 || n >= total) {
    req.resume();
    return res.status(400).json({ error: `Nomor chunk harus 0..${total - 1}`, code: 'INVALID_CHUNK_INDEX' });
  }
  const expected = n < total - 1 ? row.chunk_size : row.size - n * row.chunk_size;

  const dir = sessionDir(row.id);
  fs.mkdirSync(dir, { recursive: true });
  const partPath = path.join(dir, `${n}.part`);
  const finalPath = path.join(dir, String(n));
  const out = fs.createWriteStream(partPath);
  let bytes = 0;
  let failed = false;

  const fail = (status, error, code) => {
    if (failed) return;
    failed = true;
    req.unpipe(out);
    out.destroy();
    fs.rm(partPath, { force: true }, () => {});
    req.resume();
    res.status(status).json({ error, code });
  };

  req.on('data', (buf) => {
    bytes += buf.length;
    if (bytes > row.chunk_size) fail(413, 'Potongan melebihi ukuran chunk', 'CHUNK_TOO_LARGE');
  });
  req.on('error', () => fail(400, 'Koneksi terputus saat mengirim potongan', 'CHUNK_ABORTED'));
  out.on('error', () => fail(500, 'Gagal menulis potongan ke disk', 'CHUNK_WRITE_FAILED'));
  out.on('finish', () => {
    if (failed) return;
    if (bytes !== expected) {
      return fail(400, `Ukuran potongan ${bytes} byte, seharusnya ${expected}`, 'CHUNK_SIZE_MISMATCH');
    }
    fs.rename(partPath, finalPath, (err) => {
      if (err) return fail(500, 'Gagal menyimpan potongan', 'CHUNK_WRITE_FAILED');
      res.json({ received: receivedChunks(row.id) });
    });
  });

  req.pipe(out);
});

// POST /api/upload/:id/complete {conflict}
chunkedRouter.post('/:id/complete', async (req, res) => {
  const row = loadSession(req, res);
  if (!row) return;
  const total = totalChunksOf(row.size, row.chunk_size);
  const received = receivedChunks(row.id);
  if (received.length !== total) {
    const missing = [];
    for (let i = 0; i < total; i++) if (!received.includes(i)) missing.push(i);
    return res.status(409).json({ error: 'Masih ada potongan yang belum diterima', code: 'UPLOAD_INCOMPLETE', missing });
  }

  const assembled = path.join(tmpRoot, `${row.id}.assembled`);
  try {
    // Susun potongan berurutan ke satu file (streaming, tanpa memuat ke memori)
    const out = fs.createWriteStream(assembled);
    for (let i = 0; i < total; i++) {
      await new Promise((resolve, reject) => {
        const inp = fs.createReadStream(path.join(sessionDir(row.id), String(i)));
        inp.on('error', reject);
        inp.on('end', resolve);
        inp.pipe(out, { end: false });
      });
    }
    await new Promise((resolve, reject) => {
      out.on('error', reject);
      out.end(resolve);
    });

    const assembledSize = fs.statSync(assembled).size;
    if (assembledSize !== row.size) {
      cleanupSession(row.id);
      return res.status(400).json({ error: 'Ukuran file hasil susunan tidak sesuai', code: 'SIZE_MISMATCH' });
    }

    const target = resolveSafe(req.user.username, row.path);
    if (!fs.existsSync(target.targetPath)) {
      cleanupSession(row.id);
      return res.status(404).json({ error: 'Folder tujuan sudah tidak ada', code: 'TARGET_NOT_FOUND' });
    }

    // Kuota dicek ulang saat selesai (pemakaian bisa berubah selama upload berjalan)
    const remaining = req.user.quotaBytes - calculateUserUsage(target.userRoot);
    const policy = (req.body && req.body.conflict) || 'keep-both';
    const existing = path.join(target.targetPath, row.name);
    const replacingSize =
      policy === 'replace' && fs.existsSync(existing) && fs.statSync(existing).isFile() ? fs.statSync(existing).size : 0;
    if (row.size - replacingSize > remaining) {
      cleanupSession(row.id);
      return res.status(413).json({ error: 'Penyimpanan tidak mencukupi', code: 'QUOTA_EXCEEDED' });
    }

    const { targetPath, finalName, skip } = resolveConflict(target.targetPath, row.name, policy);
    if (skip) {
      cleanupSession(row.id);
      return res.json({ success: true, skipped: true, name: row.name });
    }

    await fs.promises.rename(assembled, targetPath);
    if (row.mtime) {
      const m = new Date(row.mtime);
      if (!Number.isNaN(m.getTime())) {
        try {
          await fs.promises.utimes(targetPath, new Date(), m);
        } catch {
          // mtime hanya pelengkap
        }
      }
    }

    const fileRel = target.cleanRel ? `${target.cleanRel}/${finalName}` : finalName;
    indexSingle(req.user, fileRel);
    logActivity(req.user.id, 'upload', fileRel, { size: row.size, chunked: true }, req.ip);
    cleanupSession(row.id);
    res.json({ success: true, file: { name: finalName, path: fileRel, size: row.size } });
  } catch (err) {
    try {
      fs.rmSync(assembled, { force: true });
    } catch {
      // Abaikan
    }
    res.status(err.status || 500).json({ error: err.message, code: err.code || 'UPLOAD_COMPLETE_FAILED' });
  }
});

// DELETE /api/upload/:id
chunkedRouter.delete('/:id', (req, res) => {
  const row = loadSession(req, res);
  if (!row) return;
  cleanupSession(row.id);
  res.json({ success: true });
});
