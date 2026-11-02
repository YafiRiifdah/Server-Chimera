/* eslint-disable no-control-regex -- regex di berkas ini memang sengaja menolak karakter kendali */
import path from 'path';
import fs from 'fs';
import { STORAGE_ROOT } from './config.js';

/**
 * Validasi nama file tunggal (bukan path).
 * Menolak /, \, NUL, nama '.' / '..', awalan '.chimera'/'.trash', serta panjang > 255 byte.
 */
export function validateFilename(name) {
  if (typeof name !== 'string' || name.trim() === '') {
    const err = new Error('Nama file tidak boleh kosong');
    err.code = 'INVALID_FILENAME';
    err.status = 400;
    throw err;
  }

  // Cek batas panjang byte (maksimal 255 byte di ext4/NTFS)
  if (Buffer.byteLength(name, 'utf8') > 255) {
    const err = new Error('Nama file melebihi batas 255 byte');
    err.code = 'FILENAME_TOO_LONG';
    err.status = 400;
    throw err;
  }

  // Tolak karakter kendali dan null byte
  if (/[\x00-\x1f\x7f]/.test(name)) {
    const err = new Error('Nama file mengandung karakter kendali tidak valid');
    err.code = 'INVALID_FILENAME';
    err.status = 400;
    throw err;
  }

  // Tolak pemisah direktori
  if (name.includes('/') || name.includes('\\')) {
    const err = new Error('Nama file tidak boleh mengandung karakter pemisah direktori (/ atau \\)');
    err.code = 'INVALID_FILENAME';
    err.status = 400;
    throw err;
  }

  // Tolak nama . atau ..
  if (name === '.' || name === '..') {
    const err = new Error('Nama file tidak boleh berupa . atau ..');
    err.code = 'INVALID_FILENAME';
    err.status = 400;
    throw err;
  }

  // Tolak direktori sistem tersembunyi
  if (name.startsWith('.chimera') || name.startsWith('.trash')) {
    const err = new Error('Nama file tidak boleh diawali dengan .chimera atau .trash');
    err.code = 'RESERVED_FILENAME';
    err.status = 400;
    throw err;
  }

  return name.trim();
}

/**
 * Menyelesaikan dan memvalidasi path relatif terhadap direktori root user.
 * Menolak .., %2e%2e, path absolut, symlink melarikan diri, serta folder internal.
 *
 * @param {string} username
 * @param {string} relPath
 * @returns {{ targetPath: string, userRoot: string, cleanRel: string }}
 */
export function resolveSafe(username, relPath = '') {
  if (!username || typeof username !== 'string' || !/^[a-zA-Z0-9_\-.]+$/.test(username)) {
    const err = new Error('Username tidak valid');
    err.code = 'INVALID_USER';
    err.status = 400;
    throw err;
  }

  const userRoot = path.resolve(STORAGE_ROOT, 'users', username);
  if (!fs.existsSync(userRoot)) {
    fs.mkdirSync(userRoot, { recursive: true });
  }

  // Pastikan relPath berupa string
  let inputPath = String(relPath || '');

  // Decode URI encoding berulang (misal %2e%2e atau %252e) untuk mencegah bypass
  let decoded = inputPath;
  let prevDecoded = '';
  let decodeCount = 0;
  while (decoded !== prevDecoded && decodeCount < 5) {
    prevDecoded = decoded;
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      const err = new Error('Format encoding path tidak valid');
      err.code = 'INVALID_PATH';
      err.status = 400;
      throw err;
    }
    decodeCount++;
  }

  // Tolak null byte & control characters
  if (/[\x00-\x1f\x7f]/.test(decoded)) {
    const err = new Error('Path mengandung karakter tidak valid');
    err.code = 'INVALID_PATH';
    err.status = 400;
    throw err;
  }

  // Tolak path absolut Windows (e.g. C: atau D:)
  if (/^[a-zA-Z]:/.test(decoded)) {
    const err = new Error('Path absolut tidak diizinkan');
    err.code = 'FORBIDDEN_PATH';
    err.status = 403;
    throw err;
  }

  // Standardisasi pemisah direktori menjadi /
  const normalizedSlashes = decoded.replace(/\\/g, '/');

  // Pecah per segmen dan evaluasi setiap komponen
  const rawSegments = normalizedSlashes.split('/').filter(Boolean);

  for (const seg of rawSegments) {
    if (seg === '..' || seg === '.') {
      const err = new Error('Path traversal tidak diizinkan');
      err.code = 'FORBIDDEN_TRAVERSAL';
      err.status = 403;
      throw err;
    }
    // Tolak akses langsung ke folder sistem di dalam root user
    if (seg.startsWith('.chimera') || seg.startsWith('.trash')) {
      const err = new Error('Akses ke folder sistem ditolak');
      err.code = 'FORBIDDEN_SYSTEM_PATH';
      err.status = 403;
      throw err;
    }
  }

  const cleanRel = rawSegments.join('/');
  const targetPath = path.resolve(userRoot, cleanRel);

  // Pastikan targetPath berada di dalam userRoot
  const relativeFromRoot = path.relative(userRoot, targetPath);
  if (relativeFromRoot.startsWith('..') || path.isAbsolute(relativeFromRoot)) {
    const err = new Error('Akses di luar direktori pengguna ditolak');
    err.code = 'FORBIDDEN_PATH';
    err.status = 403;
    throw err;
  }

  // Jika targetPath sudah ada secara fisik di disk, verifikasi fs.realpathSync tidak lolos lewat symlink
  if (fs.existsSync(targetPath)) {
    const realTarget = fs.realpathSync(targetPath);
    const realUserRoot = fs.realpathSync(userRoot);
    const relReal = path.relative(realUserRoot, realTarget);
    if (relReal.startsWith('..') || path.isAbsolute(relReal)) {
      const err = new Error('Symlink di luar direktori pengguna ditolak');
      err.code = 'FORBIDDEN_SYMLINK';
      err.status = 403;
      throw err;
    }
  }

  return { targetPath, userRoot, cleanRel };
}
