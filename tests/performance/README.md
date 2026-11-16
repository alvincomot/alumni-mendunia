# Pengujian k6 Seluruh Halaman

Suite ini menemukan route langsung dari folder `app/`, membangun manifest, lalu
menguji halaman publik dan matriks otorisasi `petugas_sekolah`, `admin_dinas`,
serta `viewer_dinas`. Redirect ke login tidak pernah dianggap sukses untuk
halaman privat.

## Model hasil

- `PASS`: route `ALLOWED` memuat shell dashboard terautentikasi dan responsnya
  sesuai kebijakan.
- `FAIL`: status, redirect, konten, atau isolasi akses tidak sesuai.
- `EXPECTED DENIAL`: route `DENIED_EXPECTED` benar-benar ditolak sesuai
  implementasi aplikasi.
- `NOT APPLICABLE`: route bukan bagian dari sesi role biasa, misalnya halaman
  yang memerlukan sesi recovery tervalidasi.
- `NOT TESTED`: sesi atau fixture aman belum tersedia, atau route tidak mendapat
  iterasi pada profil beban.

Handler mutasi, telemetry, callback token, recovery, aktivasi, email, dan export
tidak dijalankan oleh suite halaman read-only ini.

## Batas keamanan

- Target default aplikasi adalah `http://127.0.0.1:3000`.
- Pembuatan sesi memerlukan konfirmasi bahwa target terisolasi dan seluruh
  fixture bersifat fiktif.
- Target non-local hanya diterima bila bernama `isolated-staging` dan
  `K6_ALLOW_REMOTE_TARGET=true` diberikan secara eksplisit.
- Pembuatan sesi pada hostname `vercel.app` diblokir.
- SPIKE hanya dapat dijalankan pada localhost terisolasi.
- Password tidak ditulis ke file sesi. Cookie SSR disimpan sementara di
  `.sessions.local.json`, tidak dicetak, dan diabaikan Git.
- File sesi kedaluwarsa setelah 45 menit secara default.
- RLS tetap aktif. Fixture dibuktikan dapat dibaca oleh role yang sesuai, dan
  fixture alumni lintas sekolah dibuktikan tidak terlihat oleh petugas.

## Persiapan akun dan fixture

Sediakan tiga akun fiktif yang sudah ada pada Supabase lokal atau staging
terisolasi. Setiap akun harus memiliki profil aktif dan role yang tepat. Pembuat
sesi mencari sendiri alumni dan murid pertama yang dapat dibaca setiap role
melalui RLS. Untuk petugas, kedua fixture wajib berasal dari sekolah akun.

Pembuat sesi juga mencari alumni dari sekolah lain melalui `admin_dinas`, lalu
memastikan RLS menyembunyikannya dari `petugas_sekolah`. UUID dapat dioverride
melalui environment jika diperlukan, tetapi tidak wajib diisi. Halaman detail
murid menggunakan route dinamis `/dashboard/murid-aktif/[id]`. UUID murid
ditemukan otomatis melalui sesi dan RLS untuk menguji halaman tersebut.

Salin konfigurasi contoh ke file lokal yang diabaikan Git:

```bash
cp tests/performance/config.example.env tests/performance/config.local.env
```

Isi seluruh nilai `replace-with-*`, akun fiktif, dan NPSN pada
`config.local.env`. UUID fixture tidak perlu dicari manual. Untuk spike, ubah
`K6_SESSION_COUNT=5`; smoke dan report cukup menggunakan satu sesi per role.
`K6_REPORT_ITERATIONS` menentukan jumlah sampel terukur per kombinasi halaman
dan role (2 sampai 20, default 5). Mode report menjalankan satu putaran warm-up
terpisah sebelum sampel tersebut agar kompilasi awal tidak mencemari p95.

## Menjalankan dari Git Bash Windows

Pastikan aplikasi Next.js dan Supabase uji sudah aktif. Muat environment tanpa
mencetak isinya, lalu buat cookie SSR melalui login password Supabase yang nyata:

```bash
set -a
source tests/performance/config.local.env
set +a
npm run perf:sessions
npm run perf:smoke
npm run perf:report
```

Pembuat sesi menjalankan `signInWithPassword`, `getUser`, pemeriksaan profil dan
fixture melalui RLS, lalu meminta `/dashboard` dengan cookie tersebut. Proses
gagal bila dashboard mengarah ke login atau tidak memuat shell terautentikasi.

SPIKE hanya setelah target dipastikan benar-benar lokal dan terisolasi:

```bash
sed -i 's/^K6_SESSION_COUNT=.*/K6_SESSION_COUNT=5/' tests/performance/config.local.env
set -a
source tests/performance/config.local.env
set +a
npm run perf:sessions
npm run perf:spike
```

Setiap perintah pengujian memperbarui `route-manifest.json`. Laporan JSON dan
HTML tersimpan di `tests/performance/results/`, dengan status HTTP, jumlah
request, error rate, rata-rata, p95, maksimum, klasifikasi kebijakan, dan hasil
per role/halaman. Redirect dan 404 yang dikirim Next.js melalui stream React
tetap diverifikasi dari marker framework, bukan salah dilaporkan sebagai HTTP
200 yang berhasil.

Jangan gunakan akun produksi, password produksi, data pribadi asli, database
produksi, Vercel Hobby, atau cookie browser produksi.
