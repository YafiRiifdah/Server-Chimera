import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawn, spawnSync } from 'child_process';
import sharp from 'sharp';
import mime from 'mime-types';
import archiver from 'archiver';
import { STORAGE_ROOT } from './config.js';

/**
 * Helper penyajian file yang dipakai tiga konteks: pemilik (/api/files),
 * penerima berbagi (/api/shared/:id), dan halaman publik (/s/:token).
 * Semua menerima path ABSOLUT yang sudah divalidasi pemanggil lewat resolveSafe.
 */

const HIDDEN_PREFIXES = ['.chimera', '.trash'];
const thumbsDir = path.join(STORAGE_ROOT, '.chimera', 'thumbs');

// ---------- Daftar isi folder ----------

/**
 * Baca isi folder menjadi entri API. `relBase` = path relatif folder (untuk menyusun path entri).
 * `meta` opsional {starredSet, colorMap}. Folder selalu di atas, lalu abjad.
 */
const STAT_CONCURRENCY = 32;

/** Jalankan fn untuk tiap item dengan paralelisme terbatas, mempertahankan urutan hasil. */
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function listDirectory(absDir, relBase, meta = null) {
  const dirEntries = (await fs.promises.readdir(absDir, { withFileTypes: true })).filter(
    (item) => !HIDDEN_PREFIXES.some((p) => item.name.startsWith(p))
  );
  // readdir + stat paralel terbatas agar folder berisi ribuan file tetap responsif (§9)
  const stats = await mapLimit(dirEntries, STAT_CONCURRENCY, (item) => fs.promises.stat(path.join(absDir, item.name)).catch(() => null));
  const entries = [];
  for (let i = 0; i < dirEntries.length; i++) {
    const item = dirEntries[i];
    const stat = stats[i];
    if (!stat) continue;
    const rel = relBase ? `${relBase}/${item.name}` : item.name;
    const isDirectory = stat.isDirectory();
    entries.push({
      name: item.name,
      path: rel,
      type: isDirectory ? 'folder' : 'file',
      size: isDirectory ? 0 : stat.size,
      mime: isDirectory ? 'application/vnd.google-apps.folder' : mime.lookup(item.name) || 'application/octet-stream',
      mtime: stat.mtime.toISOString(),
      starred: meta ? meta.starredSet.has(rel) : false,
      shared: meta?.sharedSet ? meta.sharedSet.has(rel) : false,
      color: isDirectory ? meta?.colorMap?.get(rel) || null : undefined
    });
  }
  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
  });
  return entries;
}

// ---------- Streaming file dengan Range ----------

/**
 * Mengurai header Range (RFC 7233) untuk satu rentang byte.
 * @returns {null | 'invalid' | {start:number,end:number}}
 */
export function parseRange(header, size) {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return 'invalid';
  const [, a, b] = m;
  if (a === '' && b === '') return 'invalid';
  let start, end;
  if (a === '') {
    const n = parseInt(b, 10);
    if (n === 0) return 'invalid';
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = parseInt(a, 10);
    end = b === '' ? size - 1 : Math.min(parseInt(b, 10), size - 1);
  }
  if (start >= size || start > end) return 'invalid';
  return { start, end };
}

export function contentDisposition(type, filename) {
  const encoded = encodeURIComponent(filename).replace(/['()]/g, escape).replace(/\*/g, '%2A');
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '');
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/**
 * Kirim file dengan dukungan Range, nosniff, dan proteksi XSS untuk HTML/SVG (Master Prompt §8.5).
 * @param {object} opts {attachment:boolean}
 */
export async function sendFileStream(req, res, absPath, opts = {}) {
  const stat = await fs.promises.stat(absPath);
  if (stat.isDirectory()) {
    res.status(400).json({ error: 'Tidak dapat mengunduh folder langsung sebagai raw file', code: 'IS_DIRECTORY' });
    return false;
  }
  const filename = path.basename(absPath);
  const ext = path.extname(filename).toLowerCase();
  const contentType = mime.lookup(filename) || 'application/octet-stream';
  const isDangerousWebFile = ['.html', '.htm', '.svg', '.xhtml'].includes(ext);
  const dispositionType = opts.attachment || isDangerousWebFile ? 'attachment' : 'inline';

  res.setHeader('Content-Disposition', contentDisposition(dispositionType, filename));
  res.setHeader('Content-Type', contentType);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Accept-Ranges', 'bytes');

  const range = parseRange(req.headers.range, stat.size);
  if (range === 'invalid') {
    res.setHeader('Content-Range', `bytes */${stat.size}`);
    res.status(416).end();
    return false;
  }
  if (range) {
    const { start, end } = range;
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
    res.setHeader('Content-Length', end - start + 1);
    fs.createReadStream(absPath, { start, end }).pipe(res);
  } else {
    res.setHeader('Content-Length', stat.size);
    fs.createReadStream(absPath).pipe(res);
  }
  return true;
}

// ---------- Thumbnail ----------

let ffmpegAvailable = null;
export function hasFfmpeg() {
  if (ffmpegAvailable === null) {
    try {
      ffmpegAvailable = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
    } catch {
      ffmpegAvailable = false;
    }
  }
  return ffmpegAvailable;
}

const inFlight = new Map();

function imageThumb(src, dest, w) {
  return sharp(src, { failOn: 'none' })
    .rotate()
    .resize({ width: w, height: w, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80, mozjpeg: true })
    .toFile(dest);
}

function videoThumb(src, dest, w) {
  return new Promise((resolve, reject) => {
    const args = [
      '-hide_banner',
      '-loglevel',
      'error',
      '-ss',
      '1',
      '-i',
      src,
      '-frames:v',
      '1',
      '-vf',
      `scale=${w}:-2`,
      '-q:v',
      '4',
      '-y',
      dest
    ];
    const proc = spawn('ffmpeg', args, { stdio: 'ignore' });
    proc.on('error', reject);
    proc.on('exit', (code) => (code === 0 && fs.existsSync(dest) ? resolve() : reject(new Error(`ffmpeg keluar dengan kode ${code}`))));
  });
}

/**
 * Kirim thumbnail JPEG untuk file di absPath. `cacheScope` membedakan cache antar user.
 * Mengirim 404 JSON jika tipe tidak didukung atau gagal dibuat.
 */
export async function sendThumbnail(req, res, absPath, cacheScope, wRaw) {
  let w = parseInt(wRaw || '256', 10);
  if (!Number.isFinite(w)) w = 256;
  w = Math.min(2048, Math.max(32, w)); // 2048 dipakai pratinjau HEIC (konversi ke JPEG)

  let stat;
  try {
    stat = await fs.promises.stat(absPath);
  } catch {
    return res.status(404).json({ error: 'File tidak ditemukan', code: 'NOT_FOUND' });
  }
  if (stat.isDirectory()) return res.status(404).json({ error: 'Folder tidak punya thumbnail', code: 'THUMB_UNSUPPORTED' });

  const type = mime.lookup(absPath) || '';
  const isImage = type.startsWith('image/') && type !== 'image/svg+xml';
  const isVideo = type.startsWith('video/');
  if (!isImage && !(isVideo && hasFfmpeg())) {
    return res.status(404).json({ error: 'Tipe file ini tidak punya pratinjau kecil', code: 'THUMB_UNSUPPORTED' });
  }

  const key = crypto.createHash('sha1').update(`${cacheScope}|${absPath}|${stat.mtimeMs}|${stat.size}|${w}`).digest('hex');
  const cachePath = path.join(thumbsDir, `${key}.jpg`);
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (!fs.existsSync(cachePath)) {
    try {
      if (!inFlight.has(key)) {
        fs.mkdirSync(thumbsDir, { recursive: true });
        const tmp = path.join(thumbsDir, `${key}.${process.pid}.tmp.jpg`);
        const job = (isImage ? imageThumb(absPath, tmp, w) : videoThumb(absPath, tmp, w))
          .then(() => fs.promises.rename(tmp, cachePath))
          .finally(() => {
            inFlight.delete(key);
            fs.rm(tmp, { force: true }, () => {});
          });
        inFlight.set(key, job);
      }
      await inFlight.get(key);
    } catch {
      return res.status(404).json({ error: 'Gagal membuat pratinjau kecil', code: 'THUMB_FAILED' });
    }
  }
  res.type('image/jpeg');
  res.sendFile(cachePath);
}

// ---------- Zip streaming ----------

/**
 * Alirkan zip dari daftar {abs, name, isDir}. Header dikirim di sini; validasi path dilakukan pemanggil.
 */
export function streamZip(req, res, items, zipName) {
  res.status(200);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', contentDisposition('attachment', zipName));
  res.setHeader('X-Content-Type-Options', 'nosniff');

  const archive = archiver('zip', { zlib: { level: 1 } });
  archive.on('warning', () => {});
  archive.on('error', () => {
    if (!res.headersSent) res.status(500).end();
    else res.destroy();
  });
  req.on('close', () => archive.abort());
  archive.pipe(res);
  for (const it of items) {
    if (it.isDir) archive.directory(it.abs, it.name);
    else archive.file(it.abs, { name: it.name });
  }
  archive.finalize();
}

export function zipNameFor(items) {
  if (items.length === 1) return `${items[0].isDir ? items[0].name : items[0].name.replace(/\.[^.]+$/, '')}.zip`;
  return `Chimera-${new Date().toISOString().slice(0, 10)}.zip`;
}
