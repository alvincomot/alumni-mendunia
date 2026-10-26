# Phase 2: hasil verifikasi

## Cakupan dan hasil

Verifikasi live ditangani pengguna sesuai konfirmasi. Tidak ada login, penulisan data, atau eksekusi migration di database live oleh agent. Semua fixture menggunakan data fiktif.

- `npm run lint`: PASS.
- `npx tsc --noEmit`: PASS.
- `npm run build`: PASS. Peringatan existing `cacheComponents` tanpa `partialPrefetching` tetap ada.
- `node --test tests/placement-status.test.mjs tests/alumni.test.mjs tests/schools.test.mjs`: 32 PASS (12 Phase 2, 20 regresi Phase 1/sekolah).
- HTTP production server lokal: daftar/tambah/detail alumni dan sekolah tanpa sesi menghasilkan 307 ke login; login 200.
- `git diff --check`: PASS untuk tracked files. Migration/RLS tidak berubah.

Pengujian Node menjalankan modul produksi dengan mock Supabase/Next. Cakupan: matriks 16 kombinasi status (hanya 3 diizinkan), profil/sekolah aktif, kepemilikan, penempatan historis, tanggal opsional/urutan/future, panjang catatan, keenam argumen RPC, respons void, status stale sebelum dan saat RPC, pemanggilan ulang/bersamaan, error aman, serta pemisahan riwayat pada detail. Mock tidak membuktikan row lock, trigger, atau RLS database live.

## Pengujian browser yang benar-benar dijalankan

Chrome headless, komponen `StatusAction`/`StatusHistory` asli dan CSS build, tetapi router/server action disimulasikan. Fixture memakai font Arial, bukan pengujian font/layout halaman terautentikasi lengkap. Sembilan kelompok pemeriksaan lulus:

1. Enter membuka dialog; fokus awal pada Kembali; Escape menutup tanpa perubahan.
2. Lebar 320, 375, 768, 1280 px: dialog tidak overflow; Tab tetap di dalam dialog.
3. Kontras teks dialog/riwayat yang diukur minimal 5,82:1.
4. Tanggal berangkat masa depan ditolak; tanggal kosong diterima; catatan terkirim; dua submit selama pending hanya memanggil action sekali; pesan sukses bertahan setelah refresh/tutup.
5. Dialog selesai kontrak dan batal berangkat mengirim target yang benar; status terminal tidak menampilkan aksi.
6. Respons stale menampilkan error, meminta refresh, dan menghilangkan tombol submit ulang.
7. Jika parent mengganti placement ID saat dialog terbuka, submit tetap memakai ID yang semula dikonfirmasi, bukan penempatan pengganti.
8. Riwayat awal dengan `old_status = null`, nama pelaku, WIB, empty state, dan tombol retry bekerja.
9. Tidak ada runtime exception atau `console.error` selama skenario yang lulus.

Fokus awal dan siklus Tab diperbaiki berdasarkan temuan browser, kemudian seluruh skenario dijalankan ulang. Screenshot 320 px juga diperiksa secara visual.

Artefak sesi lokal (sementara, tidak di-stage): `C:/Users/alvin/AppData/Local/Temp/alumni-phase2-6b40f84bc1654a4687722c8b63d495cb/`, berisi fixture, runner, `results.json`, dan `dialog-{320,375,768,1280}.png`. Tidak ada dependency baru di package.json; esbuild hanya dipakai sebagai alat uji sementara.

## Checklist live untuk pengguna

Gunakan akun fiktif Admin Dinas, Viewer Dinas, dan petugas dua sekolah aktif.

1. Verifikasi registrasi alumni dan penempatan awal Phase 1; jika gagal, catat pesan dan langkah reproduksi sebelum melanjutkan transisi.
2. Petugas: konfirmasi berangkat dari daftar, dengan/tanpa tanggal dan catatan. Pastikan status aktif, tanggal benar, dan hanya satu history baru tercatat otomatis.
3. Pada detail, selesaikan kontrak; tolak tanggal sebelum keberangkatan/mulai bekerja dan tanggal masa depan. Status terminal tetap `is_current = true`.
4. Batalkan penempatan persiapan dari detail. Pastikan alumni, placement, dan riwayat tidak dihapus. Tanggal keberangkatan/kontrak tidak dikirim untuk pembatalan.
5. Buka dua tab untuk placement sama; ubah dari tab pertama, lalu konfirmasi dari tab lama. Harus ada pesan konflik/refresh, bukan overwrite.
6. Uji klik ganda dan respons terputus sesudah commit. Periksa status/history sebelum mencoba lagi; tidak boleh ada history duplikat untuk satu transisi.
7. Admin/Viewer hanya membaca; panggilan action/RPC untuk mengubah status harus ditolak. Petugas sekolah B tidak dapat membaca/mengubah milik A.
8. Uji profil atau sekolah dinonaktifkan setelah login. Aksi berikutnya harus gagal aman.
9. Alumni dengan beberapa placement: tiap history tampil di kelompok negara/perusahaan/tanggal pencatatan yang benar. Placement historis tidak mempunyai aksi dan ditolak saat mutasi langsung.
10. Uji error RPC riwayat, retry, keyboard, mobile, dan feedback pada halaman aplikasi lengkap; bukan hanya fixture komponen.

## File Phase 2 untuk review/staging

Baru:
- `app/dashboard/alumni/status-actions.ts`
- `lib/alumni/status.ts`
- `lib/alumni/history.ts`
- `components/alumni/status-action.tsx`
- `components/alumni/status-history.tsx`
- `tests/placement-status.test.mjs`
- `tests/placement-status-verification.md`

Diadaptasi dari Phase 1:
- `app/dashboard/alumni/page.tsx`
- `app/dashboard/alumni/[id]/page.tsx`
- `lib/alumni/schema.ts` (ekspor validator tanggal yang sama untuk digunakan kembali)
- `tests/alumni.test.mjs` (mock import komponen baru)

Worktree juga berisi perubahan fase sebelumnya yang belum di-commit. Jangan melakukan `git add .` atau memasukkan perubahan lain tanpa review. Tidak ada commit/push. Usulan commit setelah persetujuan: `feat: implement placement status updates and history`.

## Gate Anti-Slop

PASS di bawah berlaku untuk source dan fixture komponen yang diuji, bukan sertifikasi integrasi live seluruh aplikasi. Gate integrasi terautentikasi tetap menunggu checklist pengguna. Design Read: administrasi penempatan untuk petugas dan Dinas, navy/teal existing, ENERGY 2 / RHYTHM 2 / MOTION 1. Dialog untuk konfirmasi keputusan; daftar kronologis untuk urutan perubahan; Geist aplikasi dan spacing existing dipertahankan; tidak ada aset/dekorasi baru.

### Hard gate

- R-02 PASS: copy baru tidak memakai em dash.
- R-03 PASS (fixture): empat viewport tanpa overflow dialog; screenshot 320 px diperiksa.
- R-17 PASS: tidak ada statistik baru.
- R-18 PASS: tidak ada testimoni/avatar.
- R-23 PASS: hanya aksi dan riwayat yang diminta; tanpa aset/nav baru.
- R-24 PASS: tidak ada link navigasi baru.
- R-25 PASS (fixture): minimum kontras teks terukur 5,82:1.
- R-26 PASS (fixture): trigger, Kembali/Tutup, submit, dan retry mempunyai perilaku yang diklik dan diuji.
- R-27 PASS: pending submit, loading halaman existing, sukses/error, empty history dan retry tersedia; skenario fixture menguji feedback.
- R-28 PASS: tidak ada FAQ.
- R-32 PASS (fixture): Enter, Tab, Escape, fokus awal dan penutupan diuji; kontrol pending dinonaktifkan.
- R-33 PASS: implementasi diedit melalui patch source; runner tidak mengubah source aplikasi.
- R-34 PASS: tidak menambahkan theme toggle/theme baru.
- R-35 PASS (fixture): build lulus; catatan click-through dan console tersedia di atas. Live tetap belum diuji.
- R-36 PASS: tidak ada klaim keamanan/compliance/performa di UI.
- R-37 PASS: arah/dial mengikuti DESIGN.md, dinyatakan sebelum UI ditulis.
- R-38 PASS: UI memakai data RPC; fixture pengujian diberi label fiktif.

### Purpose gate

- R-01 PASS: tanpa gradient/glow.
- R-04 PASS: tanpa ikon baru.
- R-06 PASS: font aplikasi existing sesuai DESIGN.md; tidak menambah font atau uppercase dekoratif.
- R-07 PASS: tanpa pola latar.
- R-08 PASS: transisi ditulis dengan kata "menjadi", bukan panah dekoratif.
- R-09 PASS: badge existing hanya untuk status nyata.
- R-10 PASS: tanpa glassmorphism.
- R-12 PASS: border memisahkan kelompok riwayat; shadow kontrol existing untuk pemisahan kontrol.
- R-13 PASS: tanpa glow.
- R-14 PASS: tiap kelompok mempunyai konteks placement, bukan feature card.
- R-19 PASS: tidak ada animasi tambahan.
- R-22 PASS: tanpa ilustrasi.

### Liveliness

- Dial PASS: ENERGY 2 / RHYTHM 2 / MOTION 1.
- Konsistensi PASS: navy/teal administratif, jarak antarbagian, tanpa motion baru.
- Fokus PASS: judul dialog menyebut tindakan yang dikonfirmasi.
- Whitespace PASS: pemisah antarplacement dan padding dialog mendukung pembacaan.
- Aksen PASS: fokus/aksi mengikuti teal existing, badge warna semantik.
- Identitas PASS: istilah penempatan/kontrak/sekolah dan bahasa Indonesia mengikuti domain.
- Design Read PASS: arah disampaikan sebelum implementasi.

### Craftsmanship dan quality locks

- C-1 PASS: layout, warna, dan typography mengikuti tujuan konfirmasi/riwayat dan DESIGN.md.
- C-2 PASS (fixture): semua kontrol baru diuji; tidak ada tombol placeholder.
- C-3 PASS: setiap bagian menunjukkan aksi atau riwayat penempatan.
- C-4 PASS (fixture): error/empty/pending/sukses dan empat viewport diuji; integrasi live masih perlu checklist.
- C-5 PASS: tidak ada statistik/testimoni/klaim rekaan.
- R-05 PASS: daftar kronologis mengikuti data, bukan template landing page.
- R-11 PASS: radius kontrol dan panel existing dipertahankan.
- R-15 PASS: CTA Konfirmasi Berangkat, Selesaikan Kontrak, Batalkan Keberangkatan menyebut tugas.
- R-16 PASS: tanpa buzzword pemasaran.
- R-20 PASS: konteks sekolah/placement dan peran menentukan aksi yang tersedia.
- R-21 PASS: tema terang existing tetap digunakan.
- R-29 PASS: warna existing dan status semantik, tanpa palet baru.
- R-30 PASS: tidak meniru produk lain.
- R-31 PASS: alasan utama dicatat pada Design Read: konfirmasi melalui dialog, urutan melalui daftar, identitas visual mengikuti proyek.
