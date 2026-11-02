import { api } from '../api/client.js';

/**
 * Mengunggah satu entry {file, relativePath}:
 *  - file ≤ 50 MB → multipart biasa
 *  - file > 50 MB → chunked resumable (Master Prompt §5.4). Sesi disimpan di localStorage
 *    sehingga jika koneksi putus atau halaman ditutup, memilih file yang sama melanjutkan
 *    dari potongan terakhir yang sudah diterima server.
 * Mengembalikan {promise, abort}. abort() menghentikan tanpa menghapus sesi (bisa dilanjutkan).
 */
export const CHUNKED_THRESHOLD = 50 * 1024 * 1024;
const SESSION_PREFIX = 'chimera_upload:';

function sessionKey(targetPath, entry) {
  const f = entry.file;
  return `${SESSION_PREFIX}${targetPath}|${entry.relativePath || f.name}|${f.size}|${f.lastModified}`;
}

function readSession(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeSession(key, id) {
  try {
    if (id) localStorage.setItem(key, id);
    else localStorage.removeItem(key);
  } catch {
    // localStorage bisa tidak tersedia; resume lintas reload tidak kritis
  }
}

/** Pastikan sub-folder dari relativePath ada (untuk file besar di dalam upload folder). */
async function ensureFolder(targetPath, segments) {
  let acc = targetPath;
  for (const seg of segments) {
    try {
      await api.createFolder(acc, seg);
    } catch (err) {
      if (err.code !== 'ALREADY_EXISTS') throw err;
    }
    acc = acc ? `${acc}/${seg}` : seg;
  }
  return acc;
}

export function uploadEntry({ targetPath, entry, conflict = 'keep-both', onProgress }) {
  const file = entry.file;
  if (file.size <= CHUNKED_THRESHOLD) {
    return api.uploadFile(targetPath, entry, onProgress, conflict);
  }

  let current = null; // {abort} dari XHR chunk yang sedang berjalan
  let aborted = false;

  const promise = (async () => {
    const rel = (entry.relativePath || file.name).replace(/\\/g, '/');
    const segments = rel.split('/').filter(Boolean);
    const name = segments.pop() || file.name;
    const dirPath = segments.length ? await ensureFolder(targetPath, segments) : targetPath;

    // Lanjutkan sesi lama jika ada
    const key = sessionKey(targetPath, entry);
    let session = null;
    const savedId = readSession(key);
    if (savedId) {
      try {
        session = await api.getUpload(savedId);
      } catch {
        writeSession(key, null);
      }
    }
    if (!session) {
      const init = await api.initUpload(dirPath, name, file.size, new Date(file.lastModified).toISOString());
      session = { uploadId: init.uploadId, chunkSize: init.chunkSize, received: init.received || [] };
      writeSession(key, session.uploadId);
    }

    const { uploadId, chunkSize } = session;
    const total = Math.max(1, Math.ceil(file.size / chunkSize));
    const received = new Set(session.received || []);
    let doneBytes = 0;
    for (const n of received) doneBytes += n < total - 1 ? chunkSize : file.size - n * chunkSize;
    onProgress?.(doneBytes, file.size);

    for (let n = 0; n < total; n++) {
      if (received.has(n)) continue;
      if (aborted) {
        const err = new Error('Upload dibatalkan');
        err.name = 'AbortError';
        throw err;
      }
      const start = n * chunkSize;
      const blob = file.slice(start, Math.min(start + chunkSize, file.size));
      const req = api.putChunk(uploadId, n, blob, (loaded) => onProgress?.(doneBytes + loaded, file.size));
      current = req;
      try {
        await req.promise;
      } catch (err) {
        if (err.status === 404) writeSession(key, null); // sesi hilang di server: mulai ulang lain kali
        throw err;
      } finally {
        current = null;
      }
      received.add(n);
      doneBytes += blob.size;
      onProgress?.(doneBytes, file.size);
    }

    const result = await api.completeUpload(uploadId, conflict);
    writeSession(key, null);
    return result;
  })();

  return {
    promise,
    abort: () => {
      aborted = true;
      current?.abort();
    }
  };
}

/**
 * Upload ke dalam folder yang DIBAGIKAN ke saya (izin edit): multipart biasa,
 * sub-folder dari relativePath dibuat dulu lewat /shared/:id/mkdir.
 */
export function uploadSharedEntry({ shareId, targetPath, entry, conflict = 'keep-both', onProgress }) {
  let current = null;
  let aborted = false;
  const promise = (async () => {
    const rel = (entry.relativePath || entry.file.name).replace(/\\/g, '/');
    const segments = rel.split('/').filter(Boolean);
    segments.pop();
    let dir = targetPath;
    for (const seg of segments) {
      try {
        await api.sharedMkdir(shareId, dir, seg);
      } catch (err) {
        if (err.code !== 'ALREADY_EXISTS') throw err;
      }
      dir = dir ? `${dir}/${seg}` : seg;
    }
    if (aborted) {
      const err = new Error('Upload dibatalkan');
      err.name = 'AbortError';
      throw err;
    }
    current = api.sharedUpload(shareId, dir, entry, onProgress, conflict);
    return current.promise;
  })();
  return {
    promise,
    abort: () => {
      aborted = true;
      current?.abort();
    }
  };
}

/** Batalkan dan buang sesi chunked yang tersimpan untuk entry ini (tombol Batal). */
export async function discardSession(targetPath, entry) {
  const key = sessionKey(targetPath, entry);
  const id = readSession(key);
  writeSession(key, null);
  if (id) {
    try {
      await api.cancelUpload(id);
    } catch {
      // sudah tidak ada
    }
  }
}
