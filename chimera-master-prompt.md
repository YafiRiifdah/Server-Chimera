# MASTER PROMPT — Chimera (Drive pribadi di server sendiri)

> Cara pakai: tempel seluruh isi file ini sebagai prompt pertama ke AI coding (Claude Code, Cursor, dsb.) di folder proyek kosong, atau simpan sebagai `CLAUDE.md` / `SPEC.md` di root repo supaya selalu jadi acuan. Bagian yang diberi tanda `[UBAH]` sesuaikan dulu.

---

## 1. Peran dan tujuan

Kamu adalah senior full-stack engineer. Bangun **Chimera**, aplikasi penyimpanan file self-hosted (seperti Google Drive / Nextcloud) yang berjalan di server Linux milik saya. Prioritas utama: **pengguna awam yang terbiasa Google Drive harus bisa langsung memakainya tanpa belajar**. Tiru pola interaksi Google Drive sedekat mungkin (istilah, letak tombol, perilaku klik, menu klik kanan, drag & drop), bukan meniru visual/merek Google.

Bukan tujuan: sinkronisasi desktop, kolaborasi dokumen (edit Office online), chat, kalender.

## 2. Konteks lingkungan (fakta, jangan diasumsikan lain)

- Server: Ubuntu Server 24.04, Node.js 22, PM2 sudah terpasang, Ryzen 9 / 64 GB RAM.
- Kode diletakkan di `/opt/BantengJson/chimera`.
- File pengguna disimpan di HDD: `STORAGE_ROOT=/mnt/data/Chimera` (ext4, 4 TB). Folder ini **harus** tetap berisi file biasa dalam struktur folder yang sama dengan yang tampil di web (folder di disk = folder di web), supaya bisa dibaca lewat SSH dan di-backup dengan rsync. Jangan menyimpan file sebagai blob/hash.
- Diakses lewat Tailscale (`http://100.89.220.43:5100`) dan nanti lewat Cloudflare Tunnel dengan domain publik (HTTPS, di belakang reverse proxy; perhatikan `trust proxy` dan cookie `secure`).
- Pengguna: saya (admin) + beberapa anggota tim media (user biasa, tidak punya akses SSH). Jumlah user < 50.
- Tidak boleh bergantung pada layanan pihak ketiga (tanpa S3, tanpa Firebase, tanpa OAuth eksternal). Semua berjalan lokal.

## 3. Stack (wajib)

- **Backend**: Node.js 22, Express, JavaScript ESM (atau TypeScript jika konsisten di seluruh proyek). `[UBAH jika ingin TS]`
- **Database metadata**: SQLite lewat `better-sqlite3` (users, sesi, share link, sampah, favorit, aktivitas). File DB di `DATA_DIR`, bukan di STORAGE_ROOT.
- **Frontend**: React 18 + Vite, tanpa framework UI berat; CSS sendiri atau Tailwind. `[UBAH]`
- **Upload**: `multer` disk storage ke folder sementara **di filesystem yang sama** dengan STORAGE_ROOT (`STORAGE_ROOT/.chimera/tmp`), lalu `rename` ke tujuan. Upload besar memakai **chunked/resumable** (lihat §6).
- **Thumbnail**: `sharp` untuk gambar, `ffmpeg` (jika ada di sistem) untuk frame video; cache di `STORAGE_ROOT/.chimera/thumbs`.
- **Auth**: username + password (bcrypt), sesi di cookie httpOnly `SameSite=Lax`, tabel sesi di SQLite (bisa logout dari semua perangkat).
- Proses: satu proses Node yang menyajikan API dan hasil build frontend; dijalankan PM2 (`ecosystem.config.cjs`).

## 4. Konsep produk (bahasa Indonesia di UI)

Istilah UI mengikuti Google Drive versi Indonesia: **Drive Saya**, **Dibagikan kepada saya**, **Terbaru**, **Berbintang**, **Sampah**, **Baru**, **Upload file**, **Upload folder**, **Folder baru**, **Ganti nama**, **Pindahkan**, **Salin link**, **Bagikan**, **Download**, **Hapus**, **Pulihkan**, **Hapus permanen**, **Penyimpanan**.

Setiap user punya ruang sendiri: `STORAGE_ROOT/users/<username>/` adalah "Drive Saya"-nya. Admin bisa melihat semua. Kuota per user bisa diatur admin (default 100 GB) `[UBAH]`.

## 5. Fitur dan perilaku (urut prioritas)

### 5.1 Autentikasi dan user
- Halaman login sederhana. Tanpa pendaftaran mandiri; admin membuat user di halaman Admin.
- Admin: buat/nonaktifkan user, reset password, atur kuota, lihat pemakaian.
- User bisa ganti password sendiri dan melihat sesi aktif + "keluar dari semua perangkat".
- Pembatas percobaan login (misal 10 gagal → tunggu 15 menit per IP + per user).

### 5.2 Navigasi (persis pola Google Drive)
- **Sidebar kiri**: tombol besar "+ Baru" (dropdown: Folder baru, Upload file, Upload folder), lalu menu Drive Saya, Dibagikan kepada saya, Terbaru, Berbintang, Sampah, dan indikator Penyimpanan (bar + "X GB dari Y GB").
- **Bar atas**: kotak pencarian global (nama file, di seluruh Drive user), toggle tampilan kotak/daftar, menu profil (nama, ganti password, admin jika admin, keluar).
- **Breadcrumb** di atas daftar file, bisa diklik; juga bisa di-drop file ke breadcrumb untuk memindahkan.
- URL mencerminkan lokasi (`/drive/<path>`, `/shared`, `/recent`, `/starred`, `/trash`), tombol back browser bekerja.

### 5.3 Daftar file
- Dua tampilan: **kotak** (thumbnail besar, nama) dan **daftar** (kolom: Nama, Pemilik, Diubah, Ukuran). Tampilan terakhir diingat.
- Urutkan: nama, diubah, ukuran; folder selalu di atas.
- **Klik satu kali = pilih**, **klik dua kali = buka** (folder masuk, file pratinjau), persis Google Drive. Di layar sentuh: ketuk = buka, tekan lama = pilih.
- Multi-pilih: Ctrl/Cmd+klik, Shift+klik rentang, drag-select kotak di area kosong, Ctrl+A.
- **Klik kanan** di item → menu konteks: Buka, Download, Bagikan, Salin link, Ganti nama, Pindahkan ke, Buat salinan, Tambahkan ke Berbintang, Detail, Hapus. Klik kanan di area kosong → Folder baru, Upload file, Upload folder, Tempel (jika ada yang disalin/dipotong).
- Toolbar aksi muncul saat ada yang dipilih (jumlah terpilih + tombol Bagikan, Download, Pindahkan, Hapus, Berbintang).
- Pintasan keyboard: Delete (hapus), F2 (ganti nama), Ctrl+C / Ctrl+X / Ctrl+V (salin/pindah), Enter (buka), Esc (batal pilih), panah untuk navigasi.
- **Drag & drop internal**: tarik item ke folder lain di daftar, ke breadcrumb, atau ke sidebar "Drive Saya" untuk memindahkan.
- Panel **Detail** (ikon i / menu Detail): pratinjau kecil, tipe, ukuran, lokasi, dibuat, diubah, siapa saja yang punya akses, aktivitas terakhir.

### 5.4 Upload
- Tombol Upload file / Upload folder (folder memakai `webkitdirectory`, struktur folder dipertahankan).
- **Drag & drop dari komputer** ke area daftar (overlay "Lepaskan untuk mengupload ke <folder>"), termasuk drop folder (gunakan `DataTransferItem.webkitGetAsEntry` untuk rekursif).
- **Panel progres upload** di pojok kanan bawah seperti Google Drive: daftar file, persen, kecepatan, bisa batal per file, minimize, "N upload selesai".
- Upload besar (> 50 MB) memakai **chunked resumable**: klien memotong 8 MB, `POST /api/upload/init` → `uploadId`, `PUT /api/upload/:id/chunk/:n`, `POST /api/upload/:id/complete`; server menyusun ke file sementara dan `rename` ke tujuan. Kalau koneksi putus, klien bisa lanjut dari chunk terakhir (`GET /api/upload/:id` mengembalikan chunk yang sudah ada). Upload bersamaan dibatasi 3 file.
- Nama bentrok: tanya "Ganti file yang ada / Simpan keduanya (nama (1)) / Lewati", bisa "terapkan ke semua".
- Batas ukuran per file dari `.env` (default 20 GB), sisa kuota dicek sebelum upload.

### 5.5 Pratinjau (lightbox seperti Google Drive)
- Gambar (jpg/png/gif/webp/heic → konversi server-side ke jpeg untuk pratinjau), video (HTML5 dengan **Range request** agar bisa seek), audio, PDF (iframe/pdf.js), teks/kode/markdown (dengan syntax highlight ringan), dan info "tidak ada pratinjau, download" untuk lainnya.
- Navigasi ← → antar file di folder yang sama, tombol Download, Bagikan, Buka di tab baru, Tutup (Esc), zoom gambar dengan scroll/pinch.

### 5.6 Berbagi
- **Link publik** per file atau folder: `https://<domain>/s/<token>`; opsi: kedaluwarsa (1 hari/7 hari/30 hari/tanpa), password, izin "lihat" atau "lihat & download", batas jumlah download (opsional). Halaman publik tampil rapi: nama, ukuran, pratinjau, tombol Download; folder publik tampil sebagai daftar yang bisa dijelajah dan "Download semua (zip)" dibuat secara streaming.
- **Bagikan ke user lain** di Chimera: pilih user, izin "Lihat" atau "Edit"; muncul di "Dibagikan kepada saya" milik penerima. Item yang dibagikan tetap ada di tempat asal (tanpa menyalin), diakses lewat tabel `shares_internal`.
- Dialog "Bagikan" satu tempat untuk keduanya, dengan tombol "Salin link".
- Pemilik bisa mencabut akses/link kapan saja; halaman "Dikelola: link saya" untuk melihat semua link aktif.

### 5.7 Sampah, Terbaru, Berbintang, Pencarian
- Hapus = pindah ke `STORAGE_ROOT/users/<u>/.trash/<id>/` dengan metadata lokasi asal di SQLite; **Pulihkan** mengembalikan ke lokasi asal (buat ulang folder jika sudah tidak ada); **Hapus permanen**; otomatis dibersihkan setelah 30 hari (job terjadwal).
- Terbaru: 100 file terakhir yang dibuka/diubah user.
- Berbintang: tabel favorit per user.
- Pencarian: nama file di seluruh Drive user (indeks sederhana di SQLite yang diperbarui saat ada perubahan + pemindaian ulang berkala/manual `occ`-style: `npm run reindex`). Filter: tipe (gambar/video/dokumen/folder), diubah (hari ini/7 hari/30 hari).

### 5.8 Admin
- Halaman Admin: daftar user (pemakaian, kuota, status, terakhir login), tambah/nonaktifkan, reset password, atur kuota, lihat semua link publik aktif, statistik disk server (`statfs`), tombol "Pindai ulang indeks".
- Log aktivitas (upload/hapus/share/login) di SQLite, bisa dilihat admin, otomatis dipangkas 90 hari.

### 5.9 Mobile
- Semua fitur di atas harus bisa dipakai di HP (responsif): sidebar jadi drawer, aksi lewat menu titik tiga dan tekan lama, upload dari galeri/kamera, pratinjau geser kiri/kanan. PWA (manifest + service worker minimal) agar bisa "Tambahkan ke layar utama".

## 6. Spesifikasi API (JSON, prefix `/api`, semua butuh sesi kecuali login dan `/s/*`)

Jalankan semua operasi path melalui satu fungsi `resolveSafe(user, relPath)` yang menolak `..`, path absolut, karakter kontrol, dan akses ke `.chimera`/`.trash`.

```
POST   /auth/login            {username,password}
POST   /auth/logout
POST   /auth/logout-all
GET    /auth/me
POST   /auth/password         {old,new}

GET    /files?path=           → {path, entries:[{id,name,type,size,mime,mtime,starred,shared}]}
GET    /files/stat?path=
POST   /files/mkdir           {path,name}
POST   /files/rename          {path,name}
POST   /files/move            {paths:[],to}
POST   /files/copy            {paths:[],to}
DELETE /files                 {paths:[]}          → ke Sampah
GET    /files/raw?path=&dl=   (Range support; Content-Disposition inline/attachment; filename* UTF-8)
GET    /files/thumb?path=&w=  (cache; 404 jika tipe tak didukung)
GET    /files/zip?paths=      (stream zip untuk banyak item/folder)
GET    /files/search?q=&type=&modified=
GET    /files/recent
GET    /files/usage           → {used,quota,diskFree}

POST   /upload/init           {path,name,size,mtime} → {uploadId,chunkSize,received:[]}
PUT    /upload/:id/chunk/:n   (body biner)
GET    /upload/:id            → {received:[]}
POST   /upload/:id/complete   {conflict:"replace"|"keep-both"|"skip"}
DELETE /upload/:id
POST   /files/upload?path=    (multipart biasa untuk file kecil)

GET    /trash                 ; POST /trash/restore {ids}; DELETE /trash {ids}; DELETE /trash/all
GET    /starred               ; POST /starred {path}; DELETE /starred {path}

GET    /shares                ; POST /shares {path,type:"link"|"user",...}; PATCH /shares/:id; DELETE /shares/:id
GET    /shared-with-me

GET    /s/:token              (publik; HTML halaman share) ; GET /s/:token/raw?dl=1 ; GET /s/:token/zip ; POST /s/:token/unlock {password}

GET    /admin/users ; POST /admin/users ; PATCH /admin/users/:id ; POST /admin/users/:id/reset-password
GET    /admin/shares ; GET /admin/activity ; POST /admin/reindex ; GET /admin/stats
```

Kesalahan selalu `{error: "pesan untuk manusia", code: "SNAKE_CASE"}` dengan status HTTP yang benar (400/401/403/404/409/413/429/500).

## 7. Skema SQLite (minimal)

```
users(id, username UNIQUE, password_hash, display_name, role 'admin'|'user', quota_bytes, disabled, created_at, last_login_at)
sessions(id, user_id, token_hash, user_agent, ip, created_at, last_seen_at, expires_at)
files_index(id, user_id, path, name, type, size, mime, mtime, parent_path)   -- untuk pencarian/Terbaru; sumber kebenaran tetap disk
starred(user_id, path, created_at)
trash(id, user_id, original_path, name, type, size, deleted_at)
shares(id, owner_id, path, type 'link'|'user', token, target_user_id, permission 'view'|'download'|'edit', password_hash, expires_at, max_downloads, download_count, created_at)
activity(id, user_id, action, path, meta_json, ip, created_at)
```

## 8. Keamanan (wajib, tidak bisa ditawar)

1. Semua path lewat `resolveSafe`; tulis unit test yang membuktikan `../`, `..\\`, `%2e%2e`, path absolut, dan symlink keluar root ditolak (`fs.realpath` setelah resolve).
2. Password bcrypt cost 12; token sesi dan token share dari `crypto.randomBytes`, disimpan sebagai hash.
3. Cookie: `httpOnly`, `SameSite=Lax`, `Secure` otomatis saat di belakang HTTPS (`app.set('trust proxy', 1)`).
4. Pembatas laju untuk login, unlock password share, dan endpoint publik.
5. Header: `Content-Disposition` dengan `filename*`, `X-Content-Type-Options: nosniff`; file HTML/SVG yang diupload disajikan sebagai `attachment` (atau `Content-Security-Policy: sandbox`) agar tidak jadi XSS.
6. Validasi nama file: tolak `/`, `\`, NUL, nama `.`/`..`, dan awalan `.chimera`; batasi panjang 255 byte.
7. Kuota dicek sebelum menerima upload dan sebelum copy/restore.
8. Tidak ada secret di kode; semua dari `.env` (`PORT, STORAGE_ROOT, DATA_DIR, SESSION_SECRET, MAX_UPLOAD_BYTES, DEFAULT_QUOTA_BYTES, PUBLIC_URL`). Sediakan `.env.example` dan `.gitignore`.
9. Log server tidak boleh mencetak password/token.

## 9. Kualitas dan non-fungsional

- Folder berisi 10.000 file harus tetap responsif (virtualisasi daftar di frontend; `readdir` + `stat` paralel terbatas di backend; thumbnail lazy).
- Streaming untuk download, zip, dan upload (tidak pernah memuat seluruh file ke memori).
- Operasi pindah/ganti nama memakai `rename` (atomik, instan di filesystem yang sama).
- Semua teks UI bahasa Indonesia, ringkas, tanpa jargon; pesan kesalahan menjelaskan apa yang harus dilakukan.
- Aksesibilitas dasar: fokus keyboard terlihat, label pada ikon, kontras cukup, tema terang dan gelap mengikuti sistem.
- Tes: unit untuk `resolveSafe`, kuota, dan logika sampah; tes integrasi API dengan supertest untuk alur login → mkdir → upload → share → trash → restore.
- Lint + format (eslint, prettier). README berisi cara pasang di server, cara dev di laptop, cara backup (`rsync` STORAGE_ROOT + salin DB SQLite).

## 10. Struktur repo yang diharapkan

```
chimera/
  server/   src/{index,config,db,auth,files,upload,shares,trash,search,admin,thumbs,safe}.js, migrations/, tests/
  web/      src/{app,pages,components,hooks,api,styles}, public/manifest.json
  ecosystem.config.cjs, README.md, .env.example, .gitignore
```

## 11. Cara kerja yang saya inginkan dari kamu

1. Mulai dengan menuliskan rencana singkat dan daftar file yang akan dibuat; lalu kerjakan per tahap:
   - **Tahap 1**: auth + user tunggal admin + jelajah/upload/download/mkdir/rename/move/delete ke Sampah + pratinjau + tampilan kotak/daftar + drag & drop upload. Harus sudah bisa dipakai sehari-hari.
   - **Tahap 2**: chunked upload resumable, thumbnail, zip, pencarian, Terbaru, Berbintang, Sampah penuh (pulihkan/hapus permanen/auto-bersih).
   - **Tahap 3**: multi-user, berbagi link (password/kedaluwarsa) dan berbagi ke user, Dibagikan kepada saya, halaman Admin, aktivitas.
   - **Tahap 4**: mobile/PWA, pintasan keyboard lengkap, drag-select, tema, pemolesan.
2. Setiap tahap harus bisa dijalankan dan diuji (`npm run dev` backend + frontend, `npm test`). Jangan lanjut ke tahap berikut sebelum tahap sebelumnya lolos tes.
3. Kalau ada keputusan desain yang belum saya tentukan, pilih yang paling mirip Google Drive dan catat di `DECISIONS.md`; jangan bertanya untuk hal kecil.
4. Kode harus bisa dipahami: komentar singkat dalam bahasa Indonesia di bagian yang tidak jelas; tanpa dependensi yang tidak perlu.
5. Di akhir tiap tahap, berikan ringkasan: apa yang selesai, cara mencoba, dan apa yang belum.
