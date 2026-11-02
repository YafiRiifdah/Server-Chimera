// Dimuat lewat `node --test --import ./tests/setup.js` SEBELUM modul aplikasi diimpor.
// Setiap berkas tes berjalan di proses sendiri, jadi setiap proses mendapat folder sementara sendiri.
// Tujuannya: tes tidak pernah menyentuh STORAGE_ROOT / DATA_DIR sungguhan.
import fs from 'fs';
import os from 'os';
import path from 'path';

// Bersihkan sisa folder dari proses tes sebelumnya. Di Windows, berkas WAL SQLite
// masih terkunci saat 'exit', sehingga penghapusan di akhir proses bisa gagal;
// folder itu dibersihkan di awal proses berikutnya.
// Hanya folder yang lebih tua dari 1 jam: berkas tes berjalan paralel dalam proses
// terpisah, jadi folder yang baru dibuat proses tetangga tidak boleh ikut dihapus.
for (const name of fs.readdirSync(os.tmpdir())) {
  if (!name.startsWith('chimera-test-')) continue;
  const full = path.join(os.tmpdir(), name);
  try {
    if (Date.now() - fs.statSync(full).mtimeMs < 60 * 60 * 1000) continue;
    fs.rmSync(full, { recursive: true, force: true });
  } catch {
    // Masih dipakai atau sudah hilang; biarkan
  }
}

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'chimera-test-'));

process.env.STORAGE_ROOT = path.join(base, 'storage');
process.env.DATA_DIR = path.join(base, 'data');

// Batas kecil supaya skenario kuota & batas ukuran bisa diuji tanpa file raksasa
process.env.MAX_UPLOAD_BYTES = String(1024 * 1024); // 1 MB
process.env.DEFAULT_QUOTA_BYTES = String(2 * 1024 * 1024); // 2 MB
process.env.UPLOAD_CHUNK_BYTES = String(16 * 1024); // 16 KB (produksi: 8 MB)

process.on('exit', () => {
  try {
    fs.rmSync(base, { recursive: true, force: true });
  } catch {
    // Abaikan jika folder masih terkunci (mis. WAL SQLite di Windows)
  }
});
