# Verifikasi Phase 1 Alumni

## Hasil yang benar-benar dijalankan

- `npm run lint`: lulus.
- `npx tsc --noEmit`: lulus.
- `npm run build`: lulus. Peringatan konfigurasi lama: `cacheComponents` belum disertai `partialPrefetching`.
- `node --test tests/alumni.test.mjs tests/schools.test.mjs`: 20 lulus (13 alumni, 7 regresi sekolah).
- HTTP terhadap production server lokal: daftar alumni, tambah alumni, detail alumni, dashboard, dan sekolah tanpa sesi menghasilkan 307 ke `/auth/login`; login menghasilkan 200.
- `git diff --check`: tidak ada kesalahan whitespace pada tracked files.
- Tidak ada perubahan migration/RLS, dependency tambahan untuk fase ini, commit, atau push.

Pengujian alumni mengeksekusi modul TypeScript asli dengan batas Supabase/Next yang dimock. Cakupan: validasi identitas dan tanggal, empat status awal, profil/sekolah aktif, hak baca Dinas, penolakan aksi langsung, kepemilikan sekolah pada query daftar/detail/edit, parameter RPC, kegagalan sebagian, dan percobaan ulang penempatan tanpa INSERT alumni kedua. Data pengujian fiktif. Ini bukan pengujian database/RLS live atau interaksi browser.

## Verifikasi manual yang masih diperlukan

Gunakan akun uji resmi dengan data fiktif: Admin Dinas, Viewer Dinas, Petugas sekolah A dan B, profil nonaktif, serta petugas sekolah nonaktif. Jangan membagikan kata sandi dalam source code atau laporan.

1. Petugas A: simpan identitas, pastikan trigger mengisi sekolah A, lalu simpan penempatan. Periksa current placement dan initial status history di database.
2. Simulasikan kegagalan RPC setelah alumni tersimpan. Buka kembali detail dan ulangi penempatan. Pastikan hanya satu alumni tercatat. Jika respons hilang setelah commit, muat ulang detail sebelum mencoba kembali.
3. Uji keempat status dengan tanggal valid/tidak valid dan konfirmasi kondisi awal. Tidak ada aksi transisi status pada fase ini.
4. Petugas B tidak dapat membaca atau mengedit alumni A, termasuk melalui URL langsung dan API/RPC. Uji RLS dengan sesi pengguna, bukan service-role.
5. Admin/Viewer dapat membaca kedua sekolah tetapi tidak membuat/mengedit alumni atau penempatan melalui aplikasi. Uji juga izin database secara langsung.
6. Nonaktifkan profil/sekolah uji setelah login; pastikan halaman dan aksi berikutnya ditolak.
7. Uji pencarian, filter tahun, pagination, empty state, error, not-found, loading, serta refresh setelah simpan.
8. Uji semua kontrol dan alur keyboard pada 320, 375, 768, dan 1280 px. Tabel boleh bergulir horizontal di dalam region, bukan seluruh halaman. Periksa focus, pembacaan error, zoom, dan kontras hasil render.

## Batasan

- Pemeriksaan penempatan yang sudah ada dan RPC adalah dua operasi. RPC bawaan dapat mengganti current placement bila dua permintaan bersamaan lolos precheck. Pencegahan atomik/idempotensi memerlukan perubahan RPC yang harus disetujui terlebih dahulu. Tombol pending dan precheck bukan jaminan konkurensi.
- Keberhasilan transaksi dan riwayat otomatis pada database live belum diverifikasi.
- `docs/` dan dokumentasi setup database khusus tidak ditemukan. Implementasi mengacu pada migration yang tersedia dan README.
- Navigasi horizontal existing dipertahankan untuk menjaga cakupan perubahan; sidebar desktop dalam DESIGN.md belum diterapkan.

## Gate Anti-Slop

Gate ini belum lengkap, bukan persetujuan rilis. PASS di bawah terbatas pada bukti yang disebutkan; PENDING memerlukan browser/sesi uji. Arah: sistem administrasi data-first, warna dan Geist existing, ENERGY 2 / RHYTHM 2 / MOTION 1. Border memisahkan identitas dan penempatan; judul navy dan aksi utama menjadi fokus, aksen teal dipakai untuk navigasi/aksi, tanpa dekorasi baru.

### Hard gate

- R-02 PASS: copy alumni tidak memakai em dash.
- R-03 PENDING: tersedia scroll region tabel dan grid responsif; overflow hasil render belum diuji.
- R-17 PASS: jumlah alumni berasal dari Supabase count, tidak ada statistik rekaan.
- R-18 PASS: tidak ada testimoni atau avatar fiktif.
- R-23 PASS: hanya navigasi Data Alumni yang diminta; tidak ada aset visual baru.
- R-24 PASS: tujuan link tersedia pada route build.
- R-25 PENDING: token existing dan status berwarna gelap digunakan; kontras hasil render belum diukur.
- R-26 PASS (source): kontrol terhubung ke href, form GET, server action, refresh, reset, atau native details; klik browser masih pending.
- R-27 PASS (source): loading.tsx, error.tsx, not-found.tsx, empty state, dan feedback form tersedia.
- R-28 PASS: tidak ada FAQ.
- R-32 PENDING: label, aria, native controls, dan focus classes ada; alur keyboard belum diuji.
- R-33 PASS: implementasi ditulis di source melalui patch, bukan injeksi script eksternal.
- R-34 PASS: tidak menambahkan toggle/theme baru.
- R-35 PENDING: build dan HTTP smoke lulus; click-through pengguna terautentikasi belum dijalankan.
- R-36 PASS: tidak ada klaim keamanan/compliance/performa di UI.
- R-37 PASS (source): token dan dial mengacu pada DESIGN.md, bukan arah visual baru.
- R-38 PASS: data UI berasal dari query; data fiktif hanya ada dalam pengujian berlabel.

### Purpose gate

- R-01 PASS: tidak ada gradient/glow baru.
- R-04 PASS: tidak menambahkan ikon dekoratif.
- R-06 PASS: memakai font Geist existing sesuai DESIGN.md; tanpa monospace besar atau label uppercase dekoratif.
- R-07 PASS: tidak ada pola latar dekoratif.
- R-08 PASS: tidak ada panah dekoratif pada tombol.
- R-09 PASS: badge hanya menyatakan status penempatan dengan label teks.
- R-10 PASS: tidak ada glassmorphism.
- R-12 PASS: panel memakai border; shadow input/button berasal dari komponen existing.
- R-13 PASS: tidak ada glow.
- R-14 PASS: struktur mengikuti tabel, identitas, dan penempatan, bukan feature cards.
- R-19 PASS: tidak menambah animasi; MOTION 1.
- R-22 PASS: tidak ada ilustrasi.

### Liveliness

- Dial PASS: ENERGY 2 / RHYTHM 2 / MOTION 1 mengikuti DESIGN.md.
- Konsistensi dial PASS (source): warna administratif, jarak bagian 24 px, tanpa motion baru.
- Fokus PASS (source): H1 tiap halaman, tombol tambah/simpan sesuai tugas.
- Whitespace PASS (source): gap dan border memisahkan filter, tabel, identitas, dan penempatan.
- Aksen PASS (source): teal existing untuk fokus/interaksi; status memakai warna semantik.
- Identitas PASS (source): judul navy, font existing, navigasi dan kontrol konsisten dengan sekolah.
- Design read PASS: arah DESIGN.md dan pola dashboard/sekolah digunakan kembali; tidak ada redesign.

### Craftsmanship dan quality locks

- C-1 PASS (source): keputusan visual merujuk DESIGN.md dan komponen existing.
- C-2 PASS (source): semua kontrol mempunyai implementasi; pembuktian klik masih pending pada R-35.
- C-3 PASS: setiap bagian berhubungan dengan pencarian, identitas, atau penempatan alumni.
- C-4 PENDING: ketahanan browser, breakpoint, dan keyboard perlu pengujian manual di atas.
- C-5 PASS: tidak ada testimoni/statistik/klaim rekaan.
- R-05 PASS: tidak ada hero pemasaran atau template landing page.
- R-11 PASS: radius mengikuti komponen existing; tidak semua elemen berbentuk pill.
- R-15 PASS: CTA menyebut tugas, seperti Tambah alumni dan Simpan penempatan awal.
- R-16 PASS: tidak ada buzzword pemasaran.
- R-20 PASS (source): bahasa/cakupan sekolah, tahun kelulusan, dan penempatan sesuai domain aplikasi.
- R-21 PASS: mempertahankan light theme existing.
- R-29 PASS (source): palet existing ditambah warna semantik status sesuai DESIGN.md.
- R-30 PASS: tidak menyalin tampilan produk lain.
- R-31 PASS (source): tabel untuk perbandingan, dua bagian detail untuk identitas/penempatan, navy/teal dan Geist dari desain proyek.
