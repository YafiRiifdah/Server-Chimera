# DECISIONS — Keputusan Desain Chimera

Dokumen ini mencatat keputusan desain arsitektur, UX, dan teknis yang diambil agar sedekat mungkin dengan pola interaksi Google Drive.

---

### 1. Struktur Modul & Pemisahan Server/Web
- **Arsitektur**: Monorepo dengan folder `server/` (Node.js ESM) dan `web/` (React + Vite).
- **Produksi**: Server Express menyajikan API di `/api/*` dan berkas statis build frontend dari `web/dist` pada port yang sama (default `5100`), sehingga tidak ada kendala CORS di lingkungan produksi PM2.
- **Development**: Vite proxy mengarahkan `/api` ke `http://localhost:5100`.

### 2. Autentikasi & Sesi
- **Sesi Cookie**: Cookie bernama `chimera_session` disimpan dengan flag `httpOnly`, `SameSite=Lax`, dan `Path=/`.
- **Keamanan Token**: Token sesi yang dikirim ke browser adalah string acak 32-byte hex; di tabel SQLite `sessions`, yang disimpan adalah hash SHA-256 token tersebut.
- **Admin Pertama**: Jika tabel `users` kosong saat aplikasi pertama kali dijalankan, sistem otomatis membuat akun admin awal sesuai konfigurasi `INITIAL_ADMIN_*` di `.env` (default `admin` / `adminpassword123`) dengan pesan peringatan di log agar segera diubah.

### 3. Keamanan Path (`resolveSafe`)
- **Struktur Folder Pengguna**: `STORAGE_ROOT/users/<username>/`.
- **Aturan**:
  - Semua relPath dinormalisasi (slash `/`).
  - Tolak karakter kendali (control chars), null byte `\0`.
  - Tolak traversal `..`, path berawalan slash absolut luar root, drive Windows `C:`, dsb.
  - Tolak akses langsung ke folder sistem internal: `.chimera` dan `.trash`.
  - Resolusi path fisik menggunakan `path.resolve` dan verifikasi bahwa path dimulai dari root folder user (`userRoot`).
  - Untuk file yang sudah ada, `fs.realpathSync` dipastikan tetap berada di bawah `userRoot` (mencegah eksploitasi symlink keluar root).

### 4. Perilaku File & Folder (Mirip Google Drive)
- **Klik 1x vs Klik 2x**:
  - Klik 1x: Memilih (select) item dan memunculkan toolbar aksi di atas.
  - Klik 2x: Masuk ke folder jika folder; membuka lightbox pratinjau jika file.
- **Tampilan Kotak & Tampilan Daftar**:
  - Disimpan di `localStorage` per peramban (`chimera_view_mode`: `'grid' | 'list'`).
  - Folder selalu diurutkan paling atas mendahului file.
- **Hapus File**:
  - Menghapus memindahkan file/folder ke `STORAGE_ROOT/users/<username>/.trash/<trashId>`.
  - Metadata nama asli, path asal, dan tanggal hapus dicatat di tabel SQLite `trash`.
- **Upload File**:
  - Multer menulis ke `STORAGE_ROOT/.chimera/tmp/` (filesystem yang sama) lalu melakukan `fs.rename` (atomik) ke folder target user.
  - Konflik nama file: jika nama file sudah ada di folder tujuan, tambahkan penomoran `nama (1).ext`, `nama (2).ext` sebagaimana perilaku default Google Drive saat upload manual di Tahap 1.

### 5. Format Respons Kesalahan API
- Sesuai spesifikasi prompt: `{ "error": "<pesan manusia>", "code": "<SNAKE_CASE>" }` dengan status HTTP semantik (400, 401, 403, 404, 409, 413, 429, 500).
- Error multer dipetakan di error handler global: `LIMIT_FILE_SIZE` → 413 `FILE_TOO_LARGE`, error multer lain → 400 `UPLOAD_INVALID`.

### 6. Tes Terisolasi (keputusan keamanan)
- `npm test` menjalankan `node --test --import ./tests/setup.js`. Berkas setup itu membuat folder sementara di `os.tmpdir()` dan mengarahkan `STORAGE_ROOT` serta `DATA_DIR` ke sana **sebelum** modul aplikasi dimuat, lalu menghapusnya saat proses selesai. Setiap berkas tes berjalan di proses sendiri sehingga datanya terpisah.
- Tes integrasi menolak berjalan (assert di `before`) jika `STORAGE_ROOT`/`DATA_DIR` bukan di folder sementara. Alasan: tes menghapus folder admin; tanpa penjaga ini, `npm test` di server produksi bisa menghapus Drive admin sungguhan.
- Setup tes juga menetapkan `MAX_UPLOAD_BYTES=1 MB` dan `DEFAULT_QUOTA_BYTES=2 MB` agar skenario batas ukuran dan kuota dapat diuji tanpa file raksasa.
- `server/src/config.js` menyelesaikan `.env` dan path relatif dari **root proyek** (dua tingkat di atas `server/src`), bukan dari `process.cwd()`, supaya hasilnya sama dari mana pun aplikasi dijalankan.

### 7. Upload
- **Upload folder** mempertahankan struktur: klien mengirim field multipart `relativePaths` (JSON array sejajar dengan urutan file) berisi path relatif tiap file, mis. `Foto/2024/a.jpg`. Server memvalidasi tiap segmen dengan `validateFilename`, menyelesaikan folder tujuan lewat `resolveSafe` (traversal ditolak), lalu `mkdir -p`. Nama folder teratas dari pilihan pengguna ikut dibuat, seperti Google Drive.
- **Drop folder dari komputer** dibaca rekursif dengan `DataTransferItem.webkitGetAsEntry()`; jika browser tidak mendukung, jatuh ke `dataTransfer.files`.
- **Satu request per file**, maksimal **3 upload bersamaan** (antrean di klien). Dengan begitu progres dan tombol batal berlaku per file. Pemuatan ulang daftar digabung (debounce 400 ms) agar banyak file kecil tidak memicu reload bertubi-tubi.
- **Pra-cek kuota dua lapis**: klien membandingkan total byte dengan sisa kuota dari `/files/usage` sebelum mengirim; server membaca header `X-Upload-Total-Size` dan menolak 413 `QUOTA_EXCEEDED` sebelum body diterima. Pengecekan akhir setelah file diterima tetap ada sebagai pengaman.
- Konflik nama tetap otomatis `nama (1).ext` di Tahap 1; dialog "Ganti / Simpan keduanya / Lewati" di Tahap 2.

### 8. Navigasi & Seleksi
- **URL mencerminkan lokasi**: `/drive/<path>` (tiap segmen di-encode). Navigasi memakai `history.pushState`, `popstate` menangani tombol back/forward, dan refresh membuka folder yang sama. Folder yang tidak ada → kembali ke root dengan notifikasi. Tanpa pustaka router agar dependensi minimal.
- **Shift+klik** memilih rentang berdasarkan urutan tampil (folder dulu, lalu file), dengan jangkar = item terakhir yang diklik tanpa Shift. Ctrl+Shift+klik menambah rentang ke pilihan yang ada.
- **Tata letak header (pola Google Drive)**: baris 1 = judul folder besar (breadcrumb) di kiri, toggle daftar/petak dan tombol Detail di kanan; baris 2 = toolbar aksi berbentuk pil yang **selalu ada dengan tinggi tetap** (kosong saat tidak ada pilihan; chip filter menyusul di Tahap 2). Alasan teknis tinggi tetap: jika toolbar disisipkan hanya saat ada pilihan, daftar bergeser di antara dua klik sehingga klik ganda pada item yang belum dipilih gagal (bug ini sempat muncul dua kali).
- Toggle tampilan hanya ada di area konten, tidak di Topbar, seperti Google Drive.
- Klik pada judul folder aktif (dengan panah ▾) membuka menu "Folder baru / Upload file / Upload folder", sama dengan menu klik kanan area kosong.
- Tiap item punya tombol ⋮ yang membuka menu klik kanan yang sama, untuk pengguna tanpa klik kanan (sentuh/trackpad).
- **Salin link**: folder → `/drive/<path>`; file → folder induk + `?file=<nama>`, dan saat dibuka pratinjau file langsung tampil. Penyalinan lewat `navigator.clipboard` dengan fallback `execCommand('copy')` karena di HTTP (Tailscale) clipboard API tidak tersedia. Link hanya berlaku untuk pemilik yang sudah login; tombol "Bagikan" disembunyikan sampai Tahap 3.
- **Drag internal** membawa semua item terpilih jika item yang ditarik termasuk pilihan; jika tidak, item itu dipilih dulu lalu ditarik sendirian. Payload memakai MIME khusus `application/x-chimera-items`, sehingga drop internal tidak tertukar dengan drop file dari komputer. Target drop: folder di daftar, breadcrumb, dan "Drive Saya" di sidebar.
- Hapus awalnya tanpa dialog, langsung ke Sampah dengan toast; sejak §32 memakai **dialog konfirmasi biru** "Pindahkan ke Sampah?" (permintaan pemilik, agar tidak terhapus karena salah tekan Delete).
- Panel **Detail** memakai modal `DetailModal`; semua `alert()`/`confirm()` diganti toast.
- Dialog **Pindahkan** adalah pemilih folder yang bisa dijelajahi naik/turun lewat `GET /files`; folder yang sedang dipindahkan beserta turunannya tidak bisa dipilih, dan tombol nonaktif jika tujuan sama dengan lokasi sekarang.
- Menu sidebar yang belum tersedia (Dibagikan kepada saya, Terbaru, Berbintang, Sampah) dinonaktifkan dengan badge tahap, bukan tombol yang tampak berfungsi.
- Kotak pencarian Tahap 1 hanya menyaring nama di folder aktif; placeholder berbunyi "Cari di folder ini" agar tidak menyesatkan sampai pencarian global hadir di Tahap 2.

### 9. Pembatas Laju Login
- Dihitung **terpisah per IP dan per username** (10 gagal → kunci 15 menit). Login sukses hanya mereset hitungan username, bukan IP, supaya penyerang tidak bisa mereset limit IP dengan akun miliknya sendiri. Penyimpanan di memori; cukup untuk satu proses PM2.

### 10. HTTP Range
- Mendukung `bytes=a-b`, `bytes=a-`, dan suffix `bytes=-n`. Akhir rentang yang melebihi ukuran file dipotong ke byte terakhir (bukan 416), sesuai RFC 7233; 416 hanya jika awal rentang ≥ ukuran file atau format tidak valid.


### 11. Warna Folder (pola Google Drive "Ubah warna")
- **Ikon folder** adalah SVG datar sendiri (`web/src/components/FolderIcon.jsx`): tab kiri atas, badan, dan bayangan tipis di bawah tab, meniru bentuk ikon folder Google Drive tanpa memakai aset/merek Google. Warna isi mengikuti warna folder; default abu-abu `#8f8f8f` seperti Drive.
- **Palet 25 warna** (default + 24 warna klasik Drive dengan nama Indonesia) disimpan di satu sumber `shared/folder-colors.json`, dibaca server lewat `server/src/palette.js` (`readFileSync`, bukan import JSON eksperimental) dan frontend lewat `web/src/utils/folderColors.js`. Server menolak warna di luar palet (400 `INVALID_COLOR`).
- **Penyimpanan**: folder di disk tidak bisa menyimpan warna, jadi metadata ada di tabel SQLite `folder_colors(user_id, path, color)`. Warna default tidak disimpan (baris dihapus). `GET /files` menyertakan `color` pada entri folder; `POST /files/color {path, color|null}` mengatur/menghapus.
- **Rename/move** memperbarui path di `folder_colors` dan `starred` untuk folder itu **dan semua turunannya** (`rebaseMetadataPaths`), dengan `LIKE ... ESCAPE` agar nama berisi `%`/`_` aman.
- **UI**: entri "Ubah warna" di menu klik kanan folder (palet terbuka di dalam menu, ramah sentuh) dan tombol "Ubah warna" di toolbar saat satu folder dipilih. Perubahan diterapkan optimistis di tampilan, dibatalkan dengan toast jika server menolak.
- Warna folder di Sampah dibiarkan di tabel agar ikut kembali saat "Pulihkan" di Tahap 2.

---

## Tahap 2

### 12. Indeks Pencarian (`files_index`)
- Sumber kebenaran tetap disk. Indeks diperbarui pada setiap operasi (upload, mkdir, rename, move, hapus ke Sampah, pulihkan) lewat `server/src/indexer.js`; rename/move folder = buang subtree lama lalu indeks ulang subtree baru dari disk (sederhana dan selalu benar, biaya O(isi folder)).
- Bangun ulang penuh: `npm run reindex` (semua user) atau `POST /api/files/reindex` (user sendiri). Hasil pencarian selalu diverifikasi ke disk sebelum dikirim agar entri basi tidak tampil.
- `GET /files/search?q=&type=&modified=`: `q` = LIKE pada nama (escape `%`/`_`); `type` folder/image/video/audio/document berdasar MIME; `modified` today/7d/30d. Maksimal 200 hasil.

### 13. Terbaru
- Diambil dari log `activity` (aksi upload, rename, move, restore, open), dikelompokkan per path, terbaru dulu, maksimal 100, hanya file yang masih ada. "open" dicatat di `GET /files/raw` hanya saat permintaan tanpa header Range, supaya streaming video (banyak permintaan Range) tidak membanjiri log.

### 14. Berbintang
- Tabel `starred(user_id, path)`. Daftar Berbintang difilter ke item yang masih ada di disk; item di Sampah tidak tampil tetapi barisnya tidak dihapus agar kembali saat dipulihkan. Path mengikuti rename/move (bersama warna folder) lewat `metadata.js`.

### 15. Sampah
- `GET /trash` membaca tabel `trash` dan memverifikasi folder `.trash/<id>` ada. **Pulihkan** memakai `resolveSafe` pada lokasi asal, membuat ulang folder induk yang hilang, dan jika nama sudah dipakai menyimpan keduanya dengan akhiran "(1)". Kuota dicek sebelum memulihkan (§8.7).
- **Hapus permanen** dan **Kosongkan Sampah** membutuhkan dialog konfirmasi (tidak bisa dibatalkan), berbeda dengan Hapus biasa yang langsung ke Sampah.
- Auto-bersih 30 hari dijalankan `jobs.js` saat server start dan tiap 6 jam, bersama pembersihan sesi upload chunked > 24 jam dan pemangkasan aktivitas > 90 hari. Tidak dijalankan saat modul diimpor tes.

### 16. Upload Chunked / Resumable
- Batas: file > 50 MB memakai chunked; ukuran chunk dari `UPLOAD_CHUNK_BYTES` (default 8 MB, tes 16 KB). Sesi di tabel `uploads`; potongan di `STORAGE_ROOT/.chimera/tmp/<id>/<n>` (filesystem sama dengan tujuan), disusun streaming ke `<id>.assembled` lalu `rename`.
- Klien menyimpan `uploadId` di `localStorage` dengan kunci `folder|path-relatif|ukuran|lastModified`, sehingga memilih file yang sama setelah koneksi putus atau reload melanjutkan dari potongan yang sudah diterima (`GET /upload/:id`). Tombol **Coba lagi** di panel upload memakai jalur yang sama; tombol **Batal** menghapus sesi di server.
- Kuota dicek saat `init` (ukuran dideklarasikan) dan sekali lagi saat `complete`. Chunk yang melebihi `chunkSize` ditolak 413 dan tidak disimpan.
- **Konflik nama** (kedua jalur upload): `replace` / `keep-both` (default) / `skip`. Dialog di klien muncul hanya untuk file di tingkat atas folder tujuan yang namanya sudah ada; "Terapkan ke semua" menetapkan kebijakan untuk sisa konflik. File di dalam sub-folder upload folder selalu `keep-both` (menanyakan tiap file di folder besar tidak praktis).

### 17. Thumbnail
- `GET /files/thumb?path=&w=` (w 32..1024). Gambar lewat `sharp` (hormati EXIF orientation, JPEG q80); video lewat `ffmpeg` jika ada di PATH (frame detik ke-1), jika tidak → 404 dan klien memakai ikon. SVG sengaja tidak di-thumbnail (berisi skrip). HEIC bergantung dukungan libheif di build sharp; jika gagal → 404.
- Cache `STORAGE_ROOT/.chimera/thumbs/<sha1(user|path|mtime|size|w)>.jpg`; permintaan bersamaan untuk kunci yang sama dibuat sekali. Klien menambahkan `v=<mtime>` agar cache browser ikut kedaluwarsa saat file berubah.

### 18. Download Zip
- `GET /files/zip?paths=[...]` mengalirkan zip dengan `archiver` (deflate level 1 untuk kecepatan) tanpa file sementara; satu folder → `<nama>.zip`, lainnya → `Chimera-<tanggal>.zip`. Semua path divalidasi sebelum header dikirim agar error tetap JSON. Di UI: Download pada folder atau pilihan ganda memakai zip; satu file tetap unduhan langsung.

### 19. Navigasi Bagian
- URL: `/recent`, `/starred`, `/trash`, `/search?q=&type=&modified=`. Satu komponen `DrivePage` melayani semua bagian dengan `mode` ('drive' | 'list' | 'trash') yang mengatur aksi, kolom, dan drag & drop. Kunci seleksi = path, atau id Sampah untuk item Sampah.
- Di luar Drive Saya, "+ Baru" dan drop file mengunggah ke root Drive Saya (seperti Google Drive). Pencarian lokal di folder dihapus karena pencarian global sudah ada; kotak pencarian Topbar membuka `/search`.

---

## Tahap 3

### 20. Berbagi: model data dan token
- Satu tabel `shares` untuk dua jenis: `type='link'` (publik) dan `type='user'` (ke pengguna lain, `target_user_id`). Item tetap di tempat asal pemilik; path di `shares` ikut rename/move dan dihapus saat hapus permanen (lewat `metadata.js`).
- **Token link** 24 byte acak (base64url). Yang disimpan untuk pencarian adalah **hash SHA-256** (§8.2). Agar pemilik tetap bisa "Salin link" dari dialog Bagikan dan halaman Link saya, token juga disimpan **terenkripsi AES-256-GCM** (`token_enc`) dengan kunci turunan `SESSION_SECRET`; tanpa secret server, bocornya DB tidak membuka link. Kolom ditambahkan lewat migrasi ringan `PRAGMA table_info`.
- Izin link: `view` (pratinjau saja; `raw?dl=1` dan zip ditolak 403) atau `download`. Opsi: kedaluwarsa 1/7/30 hari/tanpa, password (bcrypt cost 10), batas jumlah download (dihitung pada `raw?dl=1` dan zip; setelah tercapai → 410 `SHARE_LIMIT`). Kedaluwarsa → 410 `SHARE_EXPIRED`; dicabut/tidak ada → 404.
- **Password link**: `POST /s/:token/unlock` memasang cookie `chimera_s_<id>` berisi HMAC(`SESSION_SECRET`, `id:password_hash`) selama 24 jam, tanpa state di server. Mengganti/menghapus password otomatis membatalkan cookie lama. Sebelum unlock, `info` hanya mengirim nama dan jenis (tanpa ukuran/isi).
- **Pembatas laju** publik (§8.4) di memori: 10 percobaan unlock / 15 menit per IP+link; 1500 permintaan / 15 menit per IP untuk semua endpoint `/s/*`.

### 21. Berbagi ke pengguna (Dibagikan kepada saya)
- Penerima mengakses lewat `/api/shared/:id/*` dengan path **relatif terhadap akar berbagi**; `resolveWithinShare` menjalankan `resolveSafe` pada akun pemilik lalu memastikan hasilnya berada di dalam akar berbagi, jadi `..` dan path absolut tidak bisa keluar dari folder yang dibagikan. `shareId` milik orang lain → 404 (bukan 403) agar tidak membocorkan keberadaan berbagi.
- Izin `view`: daftar, raw, thumb, zip. Izin `edit`: tambah upload multipart (bukan chunked), mkdir, rename, hapus (masuk **Sampah pemilik**, kuota pemilik yang dipakai). Akar berbagi sendiri tidak bisa diganti nama/dihapus oleh penerima; pindah, bintang, warna, dan berbagi ulang tidak tersedia untuk penerima.
- Aktivitas dicatat atas nama **pelaku** (penerima) dengan `meta.onBehalfOf` = pemilik, supaya log admin jujur tentang siapa yang bertindak.
- Daftar "Dibagikan kepada saya" dan halaman publik memverifikasi item masih ada di disk; item yang sudah di Sampah pemilik tidak tampil, dan kembali tampil setelah dipulihkan (baris `shares` tidak dihapus saat ke Sampah).

### 22. Admin
- Semua rute `/api/admin/*` di balik `requireAdmin`. Daftar user memuat pemakaian (dihitung dari disk), kuota, status, terakhir login, jumlah sesi aktif. Validasi username `^[a-zA-Z0-9_\-.]{3,32}$`, password ≥ 8. Folder user dibuat saat akun dibuat.
- Menonaktifkan user juga **menghapus semua sesinya** (sesi lama langsung 401), begitu pula reset password. Admin tidak bisa menonaktifkan atau mencabut peran admin dirinya sendiri (mencegah terkunci).
- Statistik memakai `fs.statfs` pada `STORAGE_ROOT` (disk tersisa/kapasitas) dan menjumlahkan pemakaian semua user. Log aktivitas dibaca dengan paginasi dan filter username; `login`, `logout`, `logout_all` ikut dicatat.
- Admin **tidak** menjelajah Drive user lain dari UI (spesifikasi API §6 tidak mencantumkannya); admin melihat pemakaian dan semua link, dan tetap punya akses SSH ke disk.

### 23. Sesi aktif
- `GET /auth/sessions` menandai sesi saat ini (`current`); `DELETE /auth/sessions/:id` hanya untuk sesi milik sendiri. UI menampilkan browser/OS dari user agent, IP, dan terakhir aktif, plus "Keluar dari semua perangkat".

### 24. Refactor penyajian
- Streaming file (Range, nosniff, HTML/SVG sebagai attachment), thumbnail, zip, dan pembacaan folder dipindah ke `server/src/serve.js` agar dipakai tiga konteks (pemilik, penerima berbagi, publik) tanpa duplikasi. Di web, `utils/urls.js` memilih prefix URL (`/api/files`, `/api/shared/:id`, `/s/:token`) berdasarkan item.

---

## Tahap 4

### 25. Tema terang/gelap mengikuti sistem
- Palet netral Tailwind (`white`, `slate`, `sky`) dan empat warna permukaan ala Google Drive (`surface`, `surface-hover`, `selected`, `toolbar`) dipetakan ke **variabel CSS** di `tailwind.config.js`; nilai terang/gelap ada di `web/src/styles/index.css` di bawah `prefers-color-scheme`. Dengan begitu seluruh UI berganti tema tanpa menulis varian `dark:` di tiap kelas. Skala slate dibalik (50↔900), sky dibalik untuk warna latar dan dipertahankan untuk aksen.
- Dua warna sengaja **tidak** ikut tema: `ink` (selalu gelap: toast, header panel upload, tombol gelap) dan `on-accent` (selalu putih: teks di atas tombol berwarna). Lightbox pratinjau selalu gelap sehingga teks abunya memakai nilai tetap.
- Belum ada sakelar tema manual; mengikuti pengaturan sistem (sesuai §9).

### 26. Mobile dan PWA
- Sidebar menjadi **drawer** di bawah 768 px (tombol menu di Topbar, latar gelap untuk menutup); padding konten mengecil; toolbar aksi bisa digulir horizontal; logo teks disembunyikan di layar sempit.
- Layar sentuh (`pointer: coarse`): **ketuk = buka**, **tekan lama (450 ms) = pilih**; setelah ada pilihan, ketuk menambah/mengurangi pilihan. Event `contextmenu` dari tekan lama dicegah agar tidak membuka menu; menu lewat tombol ⋮. Drag & drop internal dimatikan di layar sentuh.
- "+ Baru" di layar kecil menambah **Ambil foto / video** (input `capture="environment"`); Upload folder disembunyikan karena browser HP tidak mendukungnya.
- Pratinjau: geser kiri/kanan berpindah file, cubit untuk zoom, satu jari menggeser gambar yang diperbesar; di desktop scroll/klik dua kali/tombol ± untuk zoom (1×–6×).
- **PWA**: `manifest.json` (ikon 192/512 + maskable dibuat dari SVG dengan sharp), `sw.js` minimal: navigasi network-first dengan fallback `index.html`, aset ber-hash cache-first, `/api` dan `/s` tidak pernah di-cache. Service worker hanya didaftarkan di build produksi.

### 27. Pintasan keyboard lengkap dan drag-select
- `Ctrl+C` / `Ctrl+X` menaruh item ke **papan klip internal** (bukan clipboard OS); `Ctrl+V` di folder lain menyalin lewat `POST /files/copy` atau memindahkan. Keterangan "N item di papan klip" tampil di baris toolbar; menu area kosong mendapat **Tempel**, menu item mendapat **Buat salinan** (salinan `nama (1)` di folder yang sama).
- Panah ←→↑↓ memindahkan pilihan (petak memakai jumlah kolom sesuai breakpoint; daftar satu kolom); Shift+panah memperluas pilihan. Delete, F2, Enter, Esc, Ctrl+A sudah ada sejak Tahap 1.
- **Drag-select kotak** di area kosong (mouse saja): memilih item yang berpotongan dengan kotak (`data-item-key` pada tiap item); Ctrl menambah ke pilihan yang ada; klik biasa di area kosong membatalkan pilihan.

### 28. Salin di server
- `POST /files/copy {paths, to}` memakai `fs.cp` rekursif, nama bentrok → "(1)", kuota dicek dari ukuran total sumber sebelum menyalin (§8.7), folder tidak bisa disalin ke dalam dirinya sendiri. Warna folder dan bintang tidak ikut disalin; indeks pencarian diperbarui.

### 29. Urutkan, virtualisasi, panel Detail
- Urutkan nama/diubah/ukuran (naik/turun) lewat judul kolom di daftar atau menu "Urutkan" di header; folder selalu di atas; disimpan di `localStorage`. Terbaru mempertahankan urutan waktu dari server saat urutan default.
- Daftar/petak memakai **virtualisasi baris** sederhana (`useVirtualRows`) saat item > 120–150: hanya baris yang terlihat dirender, dengan padding pengganti, sehingga folder berisi 10.000 file tetap responsif (§9). Di server, `readdir` + `stat` berjalan paralel terbatas (32).
- `GET /files/stat` diperluas: jumlah isi dan ukuran total folder, waktu dibuat (`birthtime`), **siapa yang punya akses** (dari `shares`), dan **aktivitas terakhir** path itu. Panel Detail (`DetailPanel.jsx`) menampilkannya untuk item milik sendiri.
- HEIC/HEIF: browser tidak bisa merender, jadi pratinjau meminta thumbnail JPEG 2048 px dari server (bergantung dukungan libheif pada build sharp; jika gagal tampil ikon).

### 30. Aksesibilitas dan kualitas kode
- `:focus-visible` memakai cincin biru global; tombol ikon mendapat `aria-label` (dari `title`); menu memakai `role="menu"`; bar penyimpanan `role="progressbar"`; `color-scheme: light dark` agar kontrol bawaan ikut tema.
- ESLint (flat config, `@eslint/js` + `react` + `react-hooks`) dan Prettier (printWidth 140, single quote) di root: `npm run lint`, `npm run format`. Regex karakter kendali di `safe.js` memang disengaja dan dikecualikan dari `no-control-regex`.

### 31. Panel upload "1/N + sisa waktu", menu Urutkan kustom, animasi
- Header panel upload menampilkan **nomor item yang sedang diproses dari total** ("Mengupload 245/1.000 item") plus persen byte dan **estimasi sisa waktu** ala Google Drive ("kurang dari 1 menit", "sekitar 3 menit", "sekitar 1 jam 5 menit"). Estimasi = minimum dari laju byte dan laju item sejak batch dimulai (file kecil dibatasi biaya per permintaan, file besar oleh bandwidth), dihaluskan dengan EMA dan diperbarui tiap detik; satu detik pertama menampilkan "Menghitung sisa waktu…". Daftar file dibatasi (yang berjalan + gagal + 10 antrean + 40 selesai) agar 1.000+ item tidak membebani DOM, dan muat-ulang daftar diredam maksimal tiap 2 detik.
- `<select>` bawaan untuk Urutkan diganti `SortMenu.jsx` (tombol pil + popover dengan centang, "Balik urutan", tutup dengan klik luar/Esc) agar tampilannya konsisten antar browser dan tema gelap.
- Animasi: plugin `tailwindcss-animate` diaktifkan (kelas `animate-in` sebelumnya tidak berefek karena plugin belum terpasang). Transisi global untuk `button`/`a` (warna, transform, bayangan 150 ms) dengan efek tekan `scale(0.97)`; latar modal memudar masuk; perpindahan bagian/folder/pencarian memakai `.chimera-page-enter` (fade + geser 6 px, 220 ms) lewat `key` pada pembungkus konten. `prefers-reduced-motion: reduce` mematikan semua animasi/transisi.

### 32. Konfirmasi hapus dan hover sidebar
- Hapus biasa (toolbar, menu klik kanan, tombol Delete) kini menampilkan `ConfirmModal` nada `primary` (biru, ikon peringatan biru): "Pindahkan ke Sampah?" dengan nama file (1 item) atau jumlah item, dan catatan bisa dipulihkan dalam 30 hari. Hapus permanen/kosongkan Sampah tetap nada `danger` (merah).
- Item menu sidebar memakai `hover:bg-surface-hover` (bukan `hover:bg-slate-100`): di tema gelap `slate-100` dipetakan ke warna yang sama dengan latar sidebar sehingga hover tidak terlihat.

### 33. Ikon Material dan menu ⋮ ala Google Drive
- Semua ikon kini dari **Material Icons (Google, Apache-2.0)** lewat paket `react-icons/md`, dibundel lokal tanpa CDN; `lucide-react` dilepas. Satu modul `web/src/icons.jsx` memetakan nama semantik → ikon Material, jadi mengganti set ikon cukup di satu berkas. Material punya margin internal 2 px, sehingga ukuran kelas ikon dinaikkan satu tingkat (w-4 → w-5, w-3.5 → w-4) agar bobot visual sama. Indikator memuat memakai cincin CSS (`Loader2`) karena Material tidak punya ikon spinner.
- Menu klik kanan / tombol ⋮ disusun persis Google Drive: **Buka · Download · Ganti nama · Buat salinan** │ **Bagikan ▸** (Bagikan, Salin link) · **Atur ▸** (Pindahkan, Berbintang, Ubah warna untuk folder) · **Informasi file/folder ▸** (Detail) │ **Pindahkan ke sampah**, dengan petunjuk pintasan (Enter, F2, Delete, Ctrl+V). Folder tidak punya "Buka" (klik dua kali) dan "Buat salinan" (seperti GDrive). Submenu melayang ke kanan, atau ke kiri jika mepet tepi layar; di layar sentuh dibuka dengan ketukan.
- Semua `<select>` bawaan diganti komponen `Select.jsx` (tombol + daftar pilihan dengan centang, dirender `position: fixed` agar tidak terpotong modal yang digulir; varian `field`/`chip`/`pill`; panah atas/bawah mengganti nilai tanpa membuka). Dipakai di dialog Bagikan, filter pencarian, dan Admin. Header dialog mengikuti Google Drive: judul saja tanpa kotak ikon berwarna, dan semua dialog menutup dengan Esc (`useEscapeKey`).

### 34. Hapus pengguna
- `DELETE /admin/users/:id` menghapus baris pengguna; sesi, indeks, bintang, sampah, share (sebagai pemilik maupun penerima), warna folder, dan sesi upload ikut terhapus lewat `ON DELETE CASCADE`, sedangkan log aktivitas dipertahankan dengan `user_id NULL`. Menolak menghapus diri sendiri (`SELF_DELETE`).
- File di disk **tidak dihapus**: folder `users/<username>` dipindahkan (rename, tanpa salin) ke `STORAGE_ROOT/.chimera/deleted-users/<username>-<waktu>` agar admin masih bisa memulihkannya lewat SSH; pemakaian disk tidak berkurang sampai arsip dibersihkan manual. Di Admin ada tombol tempat sampah per baris dengan dialog konfirmasi merah.
- Dropdown di halaman Admin tadinya "tidak beraksi" karena daftar pilihannya (`position: fixed`) berada di dalam pembungkus halaman yang masih membawa `transform` dari animasi transisi (`animation-fill-mode: both`) sehingga posisinya meleset keluar layar. Diperbaiki dengan `backwards`: setelah animasi selesai tidak ada transform tersisa. Pembuatan akun admin lewat form sudah berfungsi sejak awal (peran `admin` dikirim ke server).
- Baris akun admin yang sedang login tidak menampilkan tombol Nonaktifkan/Hapus (server sudah menolak, tapi tombolnya menyesatkan). Atur kuota dan Reset password kini memakai dialog `InputModal` (pengganti `window.prompt`), dengan validasi di tempat; kolom password di form tambah pengguna dan dialog reset memakai `PasswordInput` (tombol mata lihat/sembunyikan).
- **Password pengguna tidak bisa dilihat admin**: yang disimpan hanya hash bcrypt satu arah (§3), jadi teks aslinya memang tidak ada di server. Menyimpan teks asli agar bisa ditampilkan sengaja tidak dilakukan: satu kebocoran basis data akan membocorkan semua sandi, termasuk yang pengguna pakai ulang di layanan lain. Admin mengatur sandi lewat Reset password dan bisa melihat sandi baru yang ia ketik sebelum disimpan.

### 35. Tema terang bawaan
- Tema tidak lagi mengikuti `prefers-color-scheme` sistem (§9 lama): bawaannya **terang** seperti Google Drive, karena di Windows mode gelap tampilan jadi gelap tanpa diminta. Tema gelap tetap ada sebagai pilihan di menu profil ("Tema gelap"/"Tema terang"), disimpan di `localStorage` (`chimera_theme`) dan diterapkan sebagai `data-theme="dark"` di `<html>`; skrip kecil di `index.html` menerapkannya sebelum render agar tidak berkedip. Logo merek kini `Logo` (awan + panah unggah) tanpa kotak latar, dipakai juga untuk favicon dan ikon PWA.
- Bilah judul jendela PWA (mode `standalone`) digambar sistem operasi, jadi overlay dialog tidak bisa menutupinya. Solusi: selama ada dialog terbuka, `meta theme-color` diubah ke warna overlay yang sama (terang `#999999`, gelap `#090e19`) lewat penghitung di `useEscapeKey`, lalu dikembalikan saat dialog tertutup, sehingga bilah judul ikut meredup. `theme_color` manifest diselaraskan ke putih.
