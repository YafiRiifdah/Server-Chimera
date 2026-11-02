/**
 * Mengubah input file / drop dari komputer menjadi daftar
 * { file, relativePath } sehingga struktur folder bisa dipertahankan (Master Prompt §5.4).
 */

/** Dari <input type="file"> biasa atau dengan webkitdirectory. */
export function entriesFromFileList(fileList) {
  return Array.from(fileList || []).map((file) => ({
    file,
    relativePath: file.webkitRelativePath || file.name
  }));
}

function readAllEntries(dirReader) {
  // readEntries hanya mengembalikan sebagian (maks ~100) per panggilan; ulangi sampai kosong.
  return new Promise((resolve, reject) => {
    const all = [];
    const readBatch = () => {
      dirReader.readEntries((batch) => {
        if (batch.length === 0) return resolve(all);
        all.push(...batch);
        readBatch();
      }, reject);
    };
    readBatch();
  });
}

function fileFromEntry(entry) {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

async function walkEntry(entry, prefix, out) {
  if (entry.isFile) {
    const file = await fileFromEntry(entry);
    out.push({ file, relativePath: prefix ? `${prefix}/${entry.name}` : entry.name });
  } else if (entry.isDirectory) {
    const children = await readAllEntries(entry.createReader());
    const childPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;
    for (const child of children) {
      await walkEntry(child, childPrefix, out);
    }
  }
}

/**
 * Dari event drop. Memakai webkitGetAsEntry agar folder yang di-drop dibaca rekursif.
 * Jika browser tidak mendukung, jatuh ke dataTransfer.files (file saja).
 */
export async function entriesFromDataTransfer(dataTransfer) {
  const items = Array.from(dataTransfer.items || []);
  const supportsEntries = items.length > 0 && typeof items[0].webkitGetAsEntry === 'function';

  if (!supportsEntries) {
    return entriesFromFileList(dataTransfer.files);
  }

  // Ambil semua entry dulu: setelah await pertama, dataTransfer.items menjadi kosong di beberapa browser
  const entries = items.map((it) => it.webkitGetAsEntry()).filter(Boolean);
  const out = [];
  for (const entry of entries) {
    await walkEntry(entry, '', out);
  }
  return out;
}
