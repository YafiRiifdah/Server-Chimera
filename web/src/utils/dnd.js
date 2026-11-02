/**
 * Payload drag & drop internal (memindahkan item antar folder).
 * Memakai MIME khusus supaya tidak tertukar dengan drop file dari komputer.
 */
const MIME = 'application/x-chimera-items';

export function setDragItems(e, items) {
  const payload = items.map((i) => ({ path: i.path, name: i.name, type: i.type }));
  e.dataTransfer.setData(MIME, JSON.stringify(payload));
  e.dataTransfer.effectAllowed = 'move';
}

/** Hanya tersedia saat event `drop`; saat `dragover` browser menyembunyikan isinya. */
export function getDragItems(e) {
  try {
    const raw = e.dataTransfer.getData(MIME);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Bisa dipakai saat `dragover` untuk tahu apakah ini drag internal. */
export function hasDragItems(e) {
  return Array.from(e.dataTransfer?.types || []).includes(MIME);
}

/** Apakah drag ini membawa file dari komputer (bukan item internal). */
export function hasOsFiles(e) {
  const types = Array.from(e.dataTransfer?.types || []);
  return types.includes('Files') && !types.includes(MIME);
}

/** Folder tujuan tidak boleh salah satu item yang ditarik atau turunannya. */
export function isValidDropTarget(items, targetPath) {
  if (!items) return false;
  return !items.some((it) => it.path === targetPath || targetPath.startsWith(`${it.path}/`));
}
