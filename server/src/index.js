import express from 'express';
import path from 'path';
import fs from 'fs';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import { fileURLToPath } from 'url';

import { PORT, MAX_UPLOAD_BYTES, ensureBaseDirectories } from './config.js';
import { getDb } from './db.js';
import { authRouter, requireAuth } from './auth.js';
import { filesRouter } from './files.js';
import { uploadRouter } from './upload.js';
import { chunkedRouter } from './chunked.js';
import { searchRouter } from './search.js';
import { starredRouter } from './starred.js';
import { trashRouter } from './trash.js';
import { thumbsRouter } from './thumbs.js';
import { zipRouter } from './zip.js';
import { startMaintenanceSchedule } from './jobs.js';
import { sharesRouter, sharedWithMeRouter, sharedRouter, usersRouter } from './shares.js';
import { publicRouter } from './public.js';
import { adminRouter } from './admin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Pastikan struktur folder dasar dan inisialisasi database
ensureBaseDirectories();
getDb();

export const app = express();

// Trust proxy (dibutuhkan untuk Cloudflare Tunnel, Nginx, Tailscale)
app.set('trust proxy', 1);

// Middleware dasar
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Routing API
app.use('/api/auth', authRouter);
app.use('/api/files', requireAuth, uploadRouter);
app.use('/api/files', requireAuth, searchRouter);
app.use('/api/files', requireAuth, thumbsRouter);
app.use('/api/files', requireAuth, zipRouter);
app.use('/api/files', requireAuth, filesRouter);
app.use('/api/upload', requireAuth, chunkedRouter);
app.use('/api/starred', requireAuth, starredRouter);
app.use('/api/trash', requireAuth, trashRouter);
app.use('/api/shares', requireAuth, sharesRouter);
app.use('/api/shared-with-me', requireAuth, sharedWithMeRouter);
app.use('/api/shared', requireAuth, sharedRouter);
app.use('/api/users', requireAuth, usersRouter);
app.use('/api/admin', requireAuth, adminRouter);

// Halaman link publik: tanpa sesi. GET /s/:token (HTML) jatuh ke catch-all SPA di bawah.
app.use('/s', publicRouter);

// Menyajikan build frontend React jika tersedia
const webDistPath = path.resolve(__dirname, '../../web/dist');
if (fs.existsSync(webDistPath)) {
  app.use(express.static(webDistPath));
  app.get('*', (req, res) => {
    // Jangan redirect request API ke index.html
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'Endpoint tidak ditemukan', code: 'NOT_FOUND' });
    }
    res.sendFile(path.join(webDistPath, 'index.html'));
  });
}

// Global Error Handler (harus terdaftar paling akhir agar menangkap error semua rute)
app.use((err, req, res, next) => {
  // Error dari multer saat upload
  if (err instanceof multer.MulterError) {
    const tooBig = err.code === 'LIMIT_FILE_SIZE';
    return res.status(tooBig ? 413 : 400).json({
      error: tooBig
        ? `Ukuran file melebihi batas ${(MAX_UPLOAD_BYTES / (1024 * 1024 * 1024)).toFixed(1)} GB per file`
        : `Upload tidak valid: ${err.message}`,
      code: tooBig ? 'FILE_TOO_LARGE' : 'UPLOAD_INVALID'
    });
  }

  const status = err.status || 500;
  if (status >= 500) console.error('[Error]', err);
  res.status(status).json({
    error: err.message || 'Terjadi kesalahan pada server',
    code: err.code || 'INTERNAL_SERVER_ERROR'
  });
});

// Jalankan server kecuali saat diimpor oleh tes (tests/setup.js menyetel CHIMERA_TEST=1).
// Tidak memakai cek process.argv agar tetap mendengarkan saat dijalankan PM2 (fork/cluster).
if (!process.env.CHIMERA_TEST) {
  // Tugas pemeliharaan hanya saat berjalan sebagai server (bukan saat diimpor tes)
  startMaintenanceSchedule();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`===============================================`);
    console.log(` Chimera Server aktif di http://0.0.0.0:${PORT}`);
    console.log(`===============================================`);
  });
}
