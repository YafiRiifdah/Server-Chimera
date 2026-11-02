# Chimera — Personal Self-Hosted Cloud Storage

Chimera adalah aplikasi penyimpanan file pribadi (seperti Google Drive / Nextcloud) berbasis web yang dirancang untuk dijalankan di server Linux pribadi. File pengguna disimpan langsung dalam struktur direktori fisik asli di server (`STORAGE_ROOT/users/<username>/`) tanpa blob atau hashing tersembunyi, sehingga mudah diakses via SSH dan dicadangkan dengan `rsync`.

---

## 🚀 Fitur Tahap 1 (Selesai)

1. **Autentikasi & Akun**:
   - Login dengan username dan password (`bcrypt` cost 12).
   - Token sesi kriptografis dalam cookie `httpOnly`, `SameSite=Lax`.
   - Inisialisasi otomatis akun Admin default (`admin` / `adminpassword123`).
   - Fitur ganti password dan pembatas percobaan login (10 gagal → kunci 15 menit, per IP dan per username).

2. **Sistem File & Keamanan (Non-Negotiable)**:
   - Validasi ketat `resolveSafe()` anti-path-traversal (menolak `../`, `..\\`, `%2e%2e`, path absolut, dan symlink keluar root).
   - Validasi nama berkas (menolak pemisah direktori, null byte, panjang > 255 byte).
   - File HTML & SVG disajikan aman untuk mencegah Stored XSS.
   - Pengecekan kuota sebelum menerima berkas (di klien, lalu di server lewat header `X-Upload-Total-Size`), dan batas ukuran per file (413 `FILE_TOO_LARGE`).

3. **Operasi Berkas (Persis Pola Google Drive)**:
   - Navigasi folder dengan URL `/drive/<path>`: refresh membuka folder yang sama, tombol back/forward browser bekerja.
   - Breadcrumb interaktif (bisa diklik dan menerima drop berkas); toolbar aksi menggantikan breadcrumb saat ada item terpilih.
   - Tampilan ganda: **Tampilan Kotak (Grid)** dan **Tampilan Daftar (List)**, disimpan di `localStorage`.
   - Klik 1x = pilih item; Ctrl+klik tambah/kurangi, Shift+klik rentang, Ctrl+A semua.
   - Klik 2x = buka (masuk ke dalam folder atau buka pratinjau berkas).
   - Buat folder baru, ganti nama, dan pindahkan lewat dialog pemilih folder yang bisa dijelajahi, atau tarik ke folder / breadcrumb / "Drive Saya".
   - Hapus langsung memindahkan ke Sampah (`.trash`) dengan notifikasi, tanpa dialog konfirmasi (pola Google Drive).
   - Panel Detail (nama, tipe, ukuran, lokasi, diubah).
   - Ikon folder datar ala Google Drive dan **Ubah warna** folder (palet 25 warna) lewat klik kanan atau toolbar; warna tersimpan per pengguna di SQLite dan ikut saat folder diganti nama/dipindahkan.
   - Unduh langsung dengan dukungan HTTP Range (seekable audio/video streaming).

4. **Upload & Pratinjau**:
   - Unggah berkas atau **folder** (struktur sub-folder dipertahankan) via tombol **+ Baru** atau **Drag & Drop** dari komputer, termasuk drop folder.
   - Antrean upload maksimal 3 berkas bersamaan; panel progres di pojok kanan bawah dengan persen per berkas dan tombol batal per berkas.
   - Lightbox pratinjau (gambar, video, audio, PDF, teks/kode/markdown).
   - Pintasan keyboard: `Delete` (hapus), `F2` (ganti nama), `Enter` (buka), `Esc` (batal pilih), `Ctrl+A` (pilih semua).

## ✨ Fitur Tahap 2 (Selesai)

1. **Sampah penuh**: halaman Sampah dengan lokasi asal dan tanggal hapus, **Pulihkan** (folder induk dibuat ulang, nama bentrok → "(1)"), **Hapus permanen**, **Kosongkan sampah** (dengan konfirmasi), dan pembersihan otomatis setelah 30 hari.
2. **Terbaru**: 100 file terakhir yang diunggah/diubah/dibuka.
3. **Berbintang**: tandai file/folder dari menu klik kanan atau toolbar; tanda ikut saat rename/move.
4. **Pencarian global**: kotak pencarian di atas mencari nama di seluruh Drive dengan filter **Jenis** dan **Diubah**; indeks SQLite diperbarui otomatis dan bisa dibangun ulang dengan `npm run reindex`.
5. **Thumbnail** gambar (dan video jika `ffmpeg` terpasang di server) pada tampilan petak dan daftar, dengan cache di `STORAGE_ROOT/.chimera/thumbs`.
6. **Download zip** streaming untuk folder atau banyak item sekaligus.
7. **Upload chunked / resumable** untuk file > 50 MB (potongan 8 MB): bisa dilanjutkan setelah koneksi putus atau reload dengan memilih file yang sama; panel upload menampilkan kecepatan dan tombol Coba lagi.
8. **Dialog konflik nama** saat upload: Ganti / Simpan keduanya / Lewati, dengan "terapkan ke semua".

## 🤝 Fitur Tahap 3 (Selesai)

1. **Berbagi lewat link publik** `https://<domain>/s/<token>`: kedaluwarsa (1/7/30 hari/tanpa), password, izin "hanya lihat" atau "lihat & download", batas jumlah download. Halaman publik rapi: nama, ukuran, pratinjau, Download; folder bisa dijelajah dan "Download semua (zip)".
2. **Berbagi ke pengguna lain** dengan izin Lihat atau Edit; muncul di **Dibagikan kepada saya** milik penerima, bisa dijelajah, dipratinjau, diunduh, dan (jika Edit) diunggah/dibuat folder/diganti nama/dihapus ke Sampah pemilik.
3. **Dialog Bagikan** satu tempat (klik kanan → Bagikan, atau tombol di toolbar) untuk pengguna dan link, dengan "Salin link". Halaman **Link saya** menampilkan semua berbagi yang Anda kelola untuk disalin, diubah, atau dicabut.
4. **Halaman Admin**: daftar pengguna (pemakaian, kuota, status, terakhir login, sesi aktif), tambah/nonaktifkan, reset password, atur kuota, semua link aktif, statistik disk, log aktivitas (dipangkas 90 hari), pindai ulang indeks.
5. **Sesi aktif** di menu profil: lihat perangkat yang login, akhiri sesi tertentu, atau keluar dari semua perangkat.
6. Pembatas laju untuk unlock password link dan endpoint publik.

## 📱 Fitur Tahap 4 (Selesai)

1. **Mobile**: sidebar jadi drawer, ketuk = buka dan tekan lama = pilih, upload dari galeri atau **kamera**, pratinjau geser kiri/kanan dan cubit untuk zoom. **PWA**: "Tambahkan ke layar utama" lewat manifest + service worker minimal (data tidak pernah di-cache).
2. **Tema terang/gelap** mengikuti sistem.
3. **Pintasan keyboard lengkap**: Ctrl+C / Ctrl+X / Ctrl+V (salin/pindah antar folder), panah untuk berpindah pilihan, Shift+panah memperluas, plus Delete, F2, Enter, Esc, Ctrl+A. Menu klik kanan mendapat **Buat salinan** dan **Tempel**.
4. **Drag-select kotak** di area kosong, **urutkan** nama/diubah/ukuran, **virtualisasi** daftar untuk folder berisi ribuan file.
5. **Panel Detail** lengkap: ukuran dan jumlah isi folder, dibuat/diubah, siapa yang punya akses, aktivitas terakhir.
6. Aksesibilitas dasar (fokus keyboard terlihat, label ikon, kontras) dan `npm run lint` / `npm run format` (ESLint + Prettier).

Keempat tahap master prompt selesai. Keputusan desain lengkap ada di `DECISIONS.md`.

---

## 🛠️ Persyaratan Sistem

- **Node.js**: v22 (minimal v20)
- **NPM**: v10+
- **Sistem Operasi**: Linux (Ubuntu 24.04 disarankan) atau Windows/macOS untuk development.
- **Opsional**: `ffmpeg` di PATH server untuk thumbnail video (`sudo apt install ffmpeg`). Tanpa ffmpeg, video tampil dengan ikon.

---

## 💻 Cara Menjalankan di Laptop (Development)

1. **Clone dan instal dependensi**:
   ```bash
   git clone <repo-url> chimera
   cd chimera
   npm install --prefix server
   npm install --prefix web
   ```

2. **Siapkan konfigurasi `.env`**:
   ```bash
   cp .env.example .env
   ```
   *(Secara default, pengembangan lokal menggunakan folder `./storage` dan `./data`)*

3. **Lint dan format** (opsional, sebelum commit):
   ```bash
   npm run lint
   ```
   ```bash
   npm run format
   ```

4. **Jalankan tes otomatis (Unit & Integration)**:
   ```bash
   npm test
   ```
   Tes berjalan di folder sementara milik sistem (`STORAGE_ROOT` dan `DATA_DIR` diarahkan ke sana oleh `server/tests/setup.js`), sehingga aman dijalankan di mana pun, termasuk di server produksi. Tes akan menolak berjalan jika pengaturan itu tidak terpenuhi.

5. **Jalankan development server**:
   - Backend API:
     ```bash
     npm run dev:server
     ```
   - Frontend Vite:
     ```bash
     npm run dev:web
     ```
   Buka peramban di `http://localhost:5173`. Masuk dengan:
   - **Username**: `admin`
   - **Password**: `adminpassword123`

---

## 🖥️ Cara Pasang di Server Produksi (Ubuntu 24.04 + PM2)

1. **Build frontend React**:
   ```bash
   npm run build:web
   ```

2. **Atur variabel lingkungan produksi di `.env`**:
   ```env
   PORT=5100
   STORAGE_ROOT=/mnt/data/Chimera
   DATA_DIR=/opt/BantengJson/chimera/data
   SESSION_SECRET=kunci_rahasia_acak_minimal_32_karakter_disini
   MAX_UPLOAD_BYTES=21474836480
   UPLOAD_CHUNK_BYTES=8388608
   DEFAULT_QUOTA_BYTES=107374182400
   PUBLIC_URL=http://100.89.220.43:5100
   ```
   `PUBLIC_URL` dipakai untuk menyusun link berbagi publik; setelah Cloudflare Tunnel aktif, ganti ke domain HTTPS Anda (mis. `https://drive.contoh.id`).

3. **Bangun indeks pencarian** (sekali, atau setelah menyalin file lewat SSH/rsync):
   ```bash
   npm run reindex
   ```
   Daftar folder selalu dibaca langsung dari disk, jadi file yang ditaruh lewat SSH langsung tampil saat dijelajahi. Yang perlu disinkronkan hanya **indeks pencarian** (kotak "Telusuri di Drive"). Perintah di atas setara dengan tombol **Pindai ulang indeks** di halaman Admin.

   **Saran**: jika Anda sering menaruh atau mengubah file lewat SSH/rsync, jadwalkan pindai ulang otomatis dengan cron di server, misalnya tiap pukul 03.00:
   ```bash
   crontab -e
   ```
   lalu tambahkan baris:
   ```
   0 3 * * * cd /opt/BantengJson/chimera && npm run reindex >> /opt/BantengJson/chimera/data/reindex.log 2>&1
   ```
   Pindai ulang aman dijalankan saat server aktif (SQLite dalam mode WAL) dan hanya membaca disk, tidak mengubah file.

4. **Jalankan dengan PM2**:
   ```bash
   pm2 start ecosystem.config.cjs
   pm2 save
   pm2 startup
   ```
   Server tunggal Node.js akan langsung menyajikan API `/api/*` sekaligus berkas frontend dari port `5100`.

---

## 💾 Strategi Backup

Penyimpanan Chimera mempertahankan struktur folder asli pengguna di disk dan memisahkan database metadata:

1. **Backup file pengguna**:
   ```bash
   rsync -avz --delete /mnt/data/Chimera/ /tujuan/backup/Chimera/
   ```

2. **Backup database SQLite & metadata**:
   ```bash
   # Salin file chimera.db (aman saat WAL mode aktif)
   sqlite3 /opt/BantengJson/chimera/data/chimera.db ".backup '/tujuan/backup/chimera-$(date +%F).db'"
   ```

