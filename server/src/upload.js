import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { STORAGE_ROOT, MAX_UPLOAD_BYTES } from './config.js';
import { resolveSafe, validateFilename } from './safe.js';
import { getDb } from './db.js';
import { indexSingle } from './indexer.js';

export const uploadRouter = express.Router();

// Folder sementara di filesystem yang sama dengan STORAGE_ROOT
const tmpDir = path.join(STORAGE_ROOT, '.chimera', 'tmp');
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}

// Konfigurasi Multer diskStorage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tmpDir);
  },
  filename: (req, file, cb) => {
    // Generate nama file acak sementara
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `upload-${unique}.tmp`);
  }
});

export const uploadMiddleware = multer({
  storage,
  limits: {
    fileSize: MAX_UPLOAD_BYTES
  }
});

/**
 * Menghitung ukuran total direktori user secara rekursif (digunakan untuk verifikasi kuota).
 */
export function calculateUserUsage(userRoot) {
  let totalBytes = 0;
  if (!fs.existsSync(userRoot)) return 0;

  function walk(currentDir) {
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        // Jangan hitung folder internal sistem
        if (entry.name.startsWith('.chimera')) continue;
        const full = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.isFile()) {
          try {
            const st = fs.statSync(full);
            totalBytes += st.size;
          } catch {
            // Abaikan jika file tidak terbaca
          }
        }
      }
    } catch {
      // Abaikan jika direktori tidak bisa dibaca
    }
  }

  walk(userRoot);
  return totalBytes;
}

/** Hapus file sementara multer yang masih tersisa. */
export function cleanupTmp(files) {
  for (const f of files) {
    try {
      if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
    } catch {
      // Abaikan
    }
  }
}

/**
 * Tentukan tujuan akhir berdasarkan kebijakan konflik nama (Master Prompt §5.4):
 *   'replace'   → timpa file yang ada (folder dengan nama sama tetap ditolak)
 *   'skip'      → lewati jika sudah ada
 *   'keep-both' → simpan keduanya dengan akhiran "(1)" (default)
 * @returns {{targetPath:string, finalName:string, skip:boolean}}
 */
export function resolveConflict(dirPath, filename, policy = 'keep-both') {
  const direct = path.join(dirPath, filename);
  const exists = fs.existsSync(direct);
  if (!exists) return { targetPath: direct, finalName: filename, skip: false };

  if (policy === 'skip') return { targetPath: direct, finalName: filename, skip: true };
  if (policy === 'replace') {
    if (fs.statSync(direct).isDirectory()) {
      const err = new Error(`"${filename}" adalah folder, tidak bisa ditimpa oleh file`);
      err.code = 'IS_DIRECTORY';
      err.status = 409;
      throw err;
    }
    return { targetPath: direct, finalName: filename, skip: false };
  }
  const kept = getNonConflictingPath(dirPath, filename);
  return { ...kept, skip: false };
}

/**
 * Cari nama file yang belum ada jika terjadi bentrok: 'nama (1).ext', 'nama (2).ext', dst.
 */
export function getNonConflictingPath(dirPath, filename) {
  let targetPath = path.join(dirPath, filename);
  if (!fs.existsSync(targetPath)) {
    return { targetPath, finalName: filename };
  }

  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  let counter = 1;

  while (fs.existsSync(targetPath)) {
    const candidateName = `${base} (${counter})${ext}`;
    targetPath = path.join(dirPath, candidateName);
    counter++;
  }

  return { targetPath, finalName: path.basename(targetPath) };
}

/**
 * Pra-cek kuota SEBELUM isi upload diterima (Master Prompt §8.7).
 * Klien mengirim total byte yang akan diunggah di header X-Upload-Total-Size;
 * jika melebihi sisa kuota, tolak sekarang tanpa menunggu seluruh body.
 */
function precheckQuota(req, res, next) {
  const declared = parseInt(req.headers['x-upload-total-size'] || '', 10);
  if (!Number.isFinite(declared) || declared <= 0) return next();

  const userRoot = path.join(STORAGE_ROOT, 'users', req.user.username);
  const remaining = req.user.quotaBytes - calculateUserUsage(userRoot);
  if (declared > remaining) {
    return res.status(413).json({
      error: `Penyimpanan tidak mencukupi. Sisa kuota ${(Math.max(0, remaining) / (1024 * 1024)).toFixed(1)} MB, dibutuhkan ${(declared / (1024 * 1024)).toFixed(1)} MB.`,
      code: 'QUOTA_EXCEEDED'
    });
  }
  next();
}

// POST /api/files/upload?path=
uploadRouter.post('/upload', precheckQuota, uploadMiddleware.array('files', 50), async (req, res) => {
  const targetRelPath = req.query.path || '';
  const uploadedFiles = req.files || [];

  if (uploadedFiles.length === 0) {
    return res.status(400).json({ error: 'Tidak ada file yang diunggah', code: 'NO_FILES_UPLOADED' });
  }

  let resolvedTarget;
  try {
    resolvedTarget = resolveSafe(req.user.username, targetRelPath);
  } catch (err) {
    cleanupTmp(uploadedFiles);
    return res.status(err.status || 400).json({ error: err.message, code: err.code });
  }

  // Pastikan direktori tujuan ada dan benar-benar direktori
  if (!fs.existsSync(resolvedTarget.targetPath)) {
    cleanupTmp(uploadedFiles);
    return res.status(404).json({ error: 'Direktori tujuan tidak ditemukan', code: 'TARGET_NOT_FOUND' });
  }

  const stat = fs.statSync(resolvedTarget.targetPath);
  if (!stat.isDirectory()) {
    cleanupTmp(uploadedFiles);
    return res.status(400).json({ error: 'Tujuan harus berupa folder', code: 'NOT_A_DIRECTORY' });
  }

  // Cek kuota pengguna
  const currentUsage = calculateUserUsage(resolvedTarget.userRoot);
  const totalNewBytes = uploadedFiles.reduce((acc, f) => acc + f.size, 0);

  if (currentUsage + totalNewBytes > req.user.quotaBytes) {
    cleanupTmp(uploadedFiles);
    return res.status(413).json({
      error: `Penyimpanan tidak mencukupi. Kuota: ${(req.user.quotaBytes / (1024 * 1024 * 1024)).toFixed(1)} GB.`,
      code: 'QUOTA_EXCEEDED'
    });
  }

  // Upload folder: klien mengirim field `relativePaths` (JSON array, sejajar dengan urutan file)
  // berisi path relatif tiap file terhadap folder tujuan, mis. "Foto/2024/a.jpg".
  // Setiap segmen folder divalidasi dan diselesaikan lewat resolveSafe agar traversal ditolak.
  let relativePaths = [];
  if (req.body?.relativePaths) {
    try {
      relativePaths = JSON.parse(req.body.relativePaths);
      if (!Array.isArray(relativePaths)) throw new Error();
    } catch {
      cleanupTmp(uploadedFiles);
      return res.status(400).json({ error: 'Format relativePaths tidak valid', code: 'INVALID_RELATIVE_PATHS' });
    }
  }

  const savedFiles = [];
  const skippedFiles = [];
  const policy = ['replace', 'skip', 'keep-both'].includes(req.query.conflict) ? req.query.conflict : 'keep-both';
  const db = getDb();

  for (let i = 0; i < uploadedFiles.length; i++) {
    const f = uploadedFiles[i];
    try {
      // Decode nama file jika multipart encoding bermasalah
      const originalName = Buffer.from(f.originalname, 'latin1').toString('utf8');

      // Tentukan folder tujuan akhir: folder target + sub-folder dari relativePaths (jika ada)
      let destDirResolved = resolvedTarget;
      let fileName = originalName;
      const rel = typeof relativePaths[i] === 'string' ? relativePaths[i].replace(/\\/g, '/') : '';
      if (rel) {
        const segments = rel.split('/').filter(Boolean);
        fileName = segments.pop() || originalName;
        for (const seg of segments) validateFilename(seg); // tolak '..', '.', '.chimera', dsb.
        const subRel = [resolvedTarget.cleanRel, ...segments].filter(Boolean).join('/');
        destDirResolved = resolveSafe(req.user.username, subRel);
        await fs.promises.mkdir(destDirResolved.targetPath, { recursive: true });
        // Indeks tiap tingkat sub-folder yang (mungkin) baru dibuat
        let acc = resolvedTarget.cleanRel;
        for (const seg of segments) {
          acc = acc ? `${acc}/${seg}` : seg;
          indexSingle(req.user, acc);
        }
      }

      const validName = validateFilename(fileName);
      const { targetPath: destPath, finalName, skip } = resolveConflict(destDirResolved.targetPath, validName, policy);
      if (skip) {
        fs.unlinkSync(f.path);
        skippedFiles.push(validName);
        continue;
      }

      // Pindahkan file secara atomik dari folder sementara
      await fs.promises.rename(f.path, destPath);

      const fileRelPath = destDirResolved.cleanRel ? `${destDirResolved.cleanRel}/${finalName}` : finalName;
      indexSingle(req.user, fileRelPath);

      // Catat di tabel aktivitas
      db.prepare(
        `
        INSERT INTO activity (user_id, action, path, meta_json)
        VALUES (?, 'upload', ?, ?)
      `
      ).run(req.user.id, fileRelPath, JSON.stringify({ size: f.size, originalName }));

      savedFiles.push({
        name: finalName,
        path: fileRelPath,
        size: f.size
      });
    } catch (err) {
      // Bersihkan semua file sementara yang belum dipindahkan
      cleanupTmp(uploadedFiles);
      return res.status(err.status || 500).json({
        error: err.status ? err.message : `Gagal menyimpan file ${f.originalname}: ${err.message}`,
        code: err.code || 'UPLOAD_FAILED'
      });
    }
  }

  return res.json({
    success: true,
    message: `${savedFiles.length} file berhasil diunggah`,
    files: savedFiles,
    skipped: skippedFiles
  });
});
