# Audit state formulir dan navigasi setelah simpan

Tanggal: 3 November 2026, Asia/Jakarta.

Perbandingan menggunakan snapshot worktree sebelum tugas ini, bukan hanya HEAD
Git. Pekerjaan sebelumnya dipertahankan. Seluruh data pengujian fiktif dan lokal;
tidak ada perubahan data Supabase hosted, migrasi hosted, staging, commit, push,
atau ZIP. Pedoman desain dan mode Anti-Slop **during** tetap digunakan.

## 1. Akar masalah yang dibuktikan

Pada implementasi lama, `AlumniRegistrationForm` menyimpan respons sukses ke
`result`, mereset nilai React Hook Form dan ID alumni, tetapi tidak mereset `step`
dan `result`. Setelah pindah ke detail dan membuka formulir baru melalui Link,
state komponen yang dipertahankan oleh navigasi aplikasi kembali digunakan.
Akibatnya, nilai kosong dan ringkasan “Belum disimpan” tampil bersama langkah 2
dan banner sukses sebelumnya.

Ini direproduksi dengan snapshot kode lama dalam **build Next.js**, menggunakan
konfigurasi `cacheComponents: true` yang sama dan navigasi client. Log reproduksi:
`REPRODUCED baseline: client revisit retains step 2 and success banner with reset fields`.
Jadi, masalahnya adalah lifecycle state formulir yang tidak lengkap, bukan data
database lama. Activity dapat mempertahankan state ketika tampilan disembunyikan
serta membersihkan efeknya; perubahan key membuat subtree formulir baru.
Lihat dokumentasi [Activity](https://react.dev/reference/react/Activity) dan
[reset state React](https://react.dev/learn/preserving-and-resetting-state).

`FormSession` sekarang mengganti key isi formulir ketika sesi tampilan ditinggalkan.
Pergantian langkah di dalam formulir tidak mengakhiri sesi. Reset eksplisit setelah
sukses tetap dilakukan. Identitas sekolah berasal dari props hasil otorisasi server
dan tetap tersedia pada sesi baru. Shell dashboard tidak ikut di-remount.

## 2. File dan komponen yang berubah

Semua path pada tabel berikut relatif terhadap root repository. Ini juga daftar
file kandidat staging untuk tugas ini; file yang sudah memiliki perubahan sebelum
tugas perlu dipilih per hunk agar pekerjaan lain tidak ikut ter-stage.
Total perubahan tugas: **27 file diperbarui, 5 file baru, tidak ada file dihapus**.

| File | Perubahan |
| --- | --- |
| `components/ui/form-session.tsx` (baru) | Batas sesi formulir dan penanda aktivitas untuk mencegah respons lama mengubah navigasi/notifikasi sesi baru. |
| `components/ui/toast.tsx` | Toast tujuan halaman, aksi Link opsional, konsumsi notifikasi saat meninggalkan halaman; pembacaan rute dibatasi Suspense khusus notifikasi. |
| `lib/alumni/navigation.ts` (baru) | Membawa filter daftar melalui `returnTo` internal yang divalidasi dan dibatasi ke parameter daftar. |
| `components/alumni/alumni-registration-form.tsx` | Reset seluruh sesi, kembali ke daftar, satu toast dan “Tambah Alumni Lagi”, pending mengikuti request sebenarnya. |
| `components/alumni/alumni-form.tsx` | Editor menutup setelah sukses, reset sesuai record, kegagalan mempertahankan nilai. |
| `components/alumni/placement-form.tsx` | Penempatan sukses kembali ke daftar, reset, toast, dan guard pending/sudah selesai. |
| `components/alumni/status-action.tsx` | Dialog status menutup dan mereset catatan/tanggal setelah sukses, satu toast. |
| `app/dashboard/alumni/page.tsx` | Link tambah/detail membawa filter daftar. |
| `app/dashboard/alumni/new/page.tsx` | Meneruskan tujuan kembali yang sudah divalidasi. |
| `app/dashboard/alumni/[id]/page.tsx` | Editor terkontrol, tujuan kembali pada link dan formulir penempatan. |
| `components/schools/school-dialog.tsx` | Lifecycle dialog dan respons async mengikuti sesi yang aktif. |
| `components/schools/school-row-actions.tsx` | State tindakan sementara dibatasi per sesi/sekolah. |
| `components/schools/school-account-dialog.tsx` | Detail akun diberi key identitas sekolah. |
| `app/dashboard/schools/actions.ts` | Revalidasi sekolah juga menjangkau dashboard, pengguna, alumni/detail dan laporan yang memakai data sekolah. |
| `components/users/user-dialog.tsx` | Reset email, konfirmasi, hasil, dan formulir setelah sukses; sesi terpisah per pengguna. |
| `components/login-form.tsx` | Sesi baru membersihkan pilihan/hasil/input lama dan mengabaikan navigasi dari respons sesi yang sudah ditinggalkan. |
| `components/school-login-form.tsx` | Guard respons lookup, aktivasi, dan login ketika sesi tidak lagi aktif. |
| `components/forgot-password-form.tsx` | Reset hasil pemulihan dan input saat kunjungan baru. |
| `components/update-password-form.tsx` | Sesi sesuai konteks aktivasi, guard klik berulang, hapus password setelah sukses, toast pada tujuan server. |
| `components/logout-button.tsx` | Guard request sinkron dan penanganan kegagalan inisialisasi client dalam blok try. |
| `components/data/filters.tsx` | Nilai input/combobox mengikuti URL; Reset dan akhir sesi membersihkan draft filter yang belum diterapkan. |
| `tests/alumni-navigation.test.mjs` (baru) | Sebelas tes tujuan kembali dan penolakan URL/parameter yang tidak diizinkan. |
| `tests/form-navigation-browser.mjs` (baru) | Reproduksi baseline dan regresi navigasi Next client dengan aksi/database fiktif. |
| `tests/alumni.test.mjs` | Kontrak halaman dan mock editor/navigation diperbarui; tes otorisasi tetap ada. |
| `tests/placement-status.test.mjs` | Menyesuaikan props halaman dan mock editor untuk tes detail/status. |
| `tests/schools.test.mjs` | Memeriksa seluruh tujuan revalidasi sekolah. |
| `tests/form-ux.test.mjs` | Memeriksa toast alumni dengan opsi tujuan. |
| `tests/password-recovery-browser.mjs` | Mock pathname untuk provider toast. |
| `tests/ui-audit-browser.mjs` | Ekspektasi tujuan sukses alumni menjadi daftar; menunggu pengembalian fokus setelah animasi menu sebelum memeriksa fokus. |
| `README.md` | Tautan laporan ini. |
| `docs/mvp-setup.md` | Konvensi lifecycle formulir dan navigasi setelah simpan. |
| `docs/form-state-navigation-audit.md` (baru) | Laporan menyeluruh tugas ini. |

## 3. Perilaku setelah simpan

- Alumni + penempatan awal terkonfirmasi sukses: `replace` ke daftar alumni dengan
  filter sebelumnya, revalidasi server dan refresh client, toast **“Alumni berhasil
  ditambahkan.”**, aksi **“Tambah Alumni Lagi”** menuju sesi baru pada langkah 1.
- Penempatan awal/berikutnya: kembali ke daftar alumni dengan toast sesuai operasi.
- Edit identitas: editor menutup, detail diperbarui, satu toast. Membuka kembali
  atau memilih alumni lain mengambil data record tersebut.
- Sekolah/pengguna/status alumni: dialog menutup setelah sukses, data daftar/detail
  diperbarui, satu toast, lalu pembukaan berikutnya menggunakan state awal.
- Kegagalan validasi/server mempertahankan input dan menampilkan error; tidak ada
  toast sukses. Kegagalan jaringan tetap meminta pengguna memeriksa data sebelum retry.

## 4. Modul lain yang diaudit

| Modul | Hasil |
| --- | --- |
| Sekolah | Tambah/edit, detail akun, status sekolah dan status akun ditelusuri. Reset dialog dan isolasi antar-record diperbaiki; alur aktivasi mandiri tetap. |
| Pengguna | Undangan Dinas, edit nama/peran/penugasan/status dan pemulihan profil memakai dialog yang sama. Reset email/konfirmasi dilengkapi. Tidak ada pembuatan akun sekolah manual baru. |
| Auth | Lookup NPSN, UNCLAIMED/PENDING/EXPIRED/ACTIVE, aktivasi/resend, pemulihan sekolah/Dinas, pembuatan/reset password, login/logout diperiksa. State kunjungan baru dipisahkan; rate limit, cooldown server, callback, session dan aturan password tidak diubah. |
| Dashboard/laporan | Filter bersama diperbaiki. Filter yang diterapkan tetap di URL, termasuk Back/Forward; pagination dan unduh CSV tetap mengikuti parameter. Pencarian header adalah form GET yang tidak menyimpan hasil mutasi. Tidak ada redirect tambahan pada filter/pagination. |
| Penempatan/status | Tetap menggunakan status yang ada dan aturan transisi server. Tidak menambahkan editor riwayat atau status baru. |

## 5. Notifikasi dan reset

Toast disimpan hanya di memori provider, ditampilkan pada pathname tujuan, kemudian
dibuang saat meninggalkan halaman. Back/Forward tidak menghidupkan notifikasi lama.
Aksi tambah lagi memakai Next Link. URL hanya membawa filter daftar yang diizinkan,
bukan password, payload formulir, respons server, atau penanda sukses persisten.

Sesi baru mereset langkah, nilai alumni/penempatan, tanggal, dropdown, error, hasil,
ID retry, ringkasan dan pending. Nilai sesi yang belum selesai tetap ada ketika
berpindah langkah. Menutup editor/dialog membatalkan draft lokal; produk ini tidak
memiliki penyimpanan draft lintas kunjungan. Tidak ada `window.location.reload()`,
timeout produksi untuk reset, dependency baru, atau penonaktifan caching global.

## 6. Pencegahan duplikasi

Guard `useRef` menolak submit kedua sebelum render berikutnya. Tombol/fieldset
dinonaktifkan selama request; registrasi/penempatan juga terkunci setelah sukses
sampai navigasi selesai. Pengujian menahan respons server dan mengirim klik serta
submit berulang untuk memeriksa jumlah request.

Pengujian menemukan bahwa `isSubmitting` React Hook Form dapat turun ketika submit
kedua ditolak guard sementara request pertama masih berjalan. Form alumni dan
penempatan sekarang memakai state pending yang mengikuti request yang benar-benar
dikirim. Password dan logout juga memiliki guard sinkron.

Jika identitas alumni tersimpan tetapi penempatan gagal, ID dari respons tetap
dipakai pada retry. Tes membuktikan jumlah identitas tidak bertambah dua kali.
Respons sukses tanpa ID registrasi tidak dianggap penyimpanan lengkap.

## 7. Integritas data dan otorisasi

Validasi Zod server, scope sekolah dari sesi, RLS, role Dinas, audit log, atomic
status history dan RPC penempatan dengan expected current ID dipertahankan.
Tidak ada perubahan pada sembilan migrasi, server action alumni/status, server
action Auth, pustaka otorisasi, manifest atau lockfile dibanding snapshot tugas.
Perubahan server action sekolah hanya memperluas revalidasi setelah sukses.
Pemeriksaan SHA-256 terhadap snapshot memastikan **53 file yang dilindungi tetap
identik**, termasuk sembilan migrasi dan shell dashboard.

Tes unit mencakup penolakan akses langsung, spoofing role/sekolah, konflik status,
penempatan dan penugasan. Enam belas kelompok PostgreSQL/RLS lokal mencakup isolasi
antar-sekolah, Dinas read-only untuk alumni, histori atomik/immutable, rollback,
expected-ID retry, audit administrator, admin terakhir, serta lifecycle aktivasi.

## 8. Hasil navigasi browser

`tests/form-navigation-browser.mjs` membangun aplikasi Next terisolasi menggunakan
komponen dan halaman produksi. Link, router, Server Action transport, revalidasi,
Activity dan Back/Forward benar-benar dijalankan oleh Next. Penanda pada dokumen
tetap sama sepanjang perpindahan, sehingga skenario ini tidak memakai reload.
Hanya akses, data, dan aksi backend diganti fixture fiktif; request eksternal diblokir.

- **390, 768, 1024, 1440 px: lulus** untuk langkah awal, maju/mundur, nilai draft,
  error validasi/server, pending/klik berulang, daftar terbaru, satu toast, tambah
  lagi, nilai/tanggal/negara/status bersih dan Back/Forward tanpa overflow halaman.
- Skenario lanjutan lulus: filter search/tahun/negara dan Reset, retry parsial,
  edit alumni A/B, penempatan, konfirmasi status, dialog sekolah/pengguna,
  lookup/aktivasi/pemulihan Dinas, serta password gagal/retry/sukses/kunjungan baru.
- Draft filter yang ditinggalkan juga diuji melalui Link ke formulir dan Back;
  hasilnya kembali ke nilai URL, tanpa menghidupkan draft yang belum diterapkan.
- Regresi UI yang sudah ada lulus untuk delapan halaman, loading/error/empty,
  keyboard/fokus/dialog, dan empat viewport. Assertion pengembalian fokus menu
  sempat berjalan sebelum animasi selesai; diperbaiki dengan menunggu kondisi fokus,
  tanpa menghapus assertion atau menambah timeout produksi.
- Build fixture terpisah mengabaikan tipe mock yang sengaja tidak lengkap.
  Typecheck produksi tetap dijalankan tanpa pengabaian error.

## 9. Pemeriksaan lengkap

| Pemeriksaan | Hasil |
| --- | --- |
| `npm run lint` | Lulus, tanpa peringatan lint. |
| `npx tsc --noEmit` | Lulus. |
| `node --test tests/*.test.mjs` | 161 lulus, 0 gagal/skip. |
| `node tests/database-smoke.mjs` | 16 kelompok SQL/RLS lulus pada PostgreSQL terisolasi/PGlite. |
| `node tests/form-navigation-browser.mjs` | Lulus; build Next, empat viewport dan seluruh skenario lanjutan. |
| `npm run build` | Lulus, 22 halaman diprerender; peringatan konfigurasi Next yang sudah ada dicatat di bawah. |
| `node tests/password-recovery-browser.mjs` | Lulus empat viewport, empat status sekolah, pemulihan/aktivasi/password; tanpa error console atau request gagal. |
| `node tests/ui-audit-browser.mjs` | Lulus delapan halaman pada empat viewport beserta dialog, role, keyboard/fokus, toast, loading/error/empty dan logout retry. |
| `node tests/school-auth-production-smoke.mjs` | Lulus route Next produksi lokal, empat viewport, redirect protected/legacy serta callback/error; tanpa error console/request. |
| `git diff --check` | Lulus; Git hanya memberi pemberitahuan konversi LF/CRLF pada worktree Windows. |

Log sesi ini disimpan lokal di `node_modules/.cache/form-state/`, termasuk
`baseline-navigation.log`, `final-navigation.log`, `final-unit.log`, `final-sql.log`,
`final-lint.log`, `final-tsc.log`, dan `navigation-artifacts/baseline-stale-form.png`.
Log build dan browser: `final-build.log`, `final-auth-browser.log`,
`final-ui-browser.log`, `final-production-browser.log`. Screenshot UI akhir berada
di direktori lokal `%TEMP%/alumni-ui-audit-hmyTSh`, screenshot Auth fixture di
`%TEMP%/alumni-recovery-ui-results-aOm0D1`, dan Auth produksi di
`%TEMP%/alumni-production-auth-cieKF1`.
Artefak cache tidak perlu di-stage. Script browser memakai Playwright/esbuild yang
sudah tersedia melalui `RECOVERY_UI_TEST_DEPS`; tes SQL memakai `MVP_SQL_TEST_DEPS`.
Tidak ada dependency baru pada aplikasi.

## 10. Batas verifikasi dan tindak lanjut

- Tidak ada pengujian mutasi hosted, pengiriman email nyata, konsumsi token nyata,
  atau pemeriksaan konfigurasi SMTP/Supabase hosted. Browser fixture tidak membuktikan
  otorisasi backend; pembuktiannya berasal dari tes server dan SQL yang terpisah.
- Tes SQL lokal bukan uji konkurensi banyak koneksi atau konfirmasi bahwa migrasi
  sudah diterapkan di Supabase hosted. Deklarasi extension pgcrypto dilewati oleh
  harness lokal sebagaimana sebelumnya; fungsi/trigger/RLS tetap diuji.
- Klik berulang dan retry dengan ID yang diketahui terlindungi. Jika koneksi hilang
  setelah INSERT identitas commit tetapi sebelum ID diterima, operasi gabungan lama
  belum memiliki idempotency key lintas request/transaksi. Pengguna tetap diarahkan
  memeriksa daftar/detail sebelum retry. Jaminan exactly-once untuk kondisi tersebut
  memerlukan desain transaksi/idempotency database terpisah; tidak dibuat migrasi
  yang tidak diperlukan untuk perbaikan lifecycle UI ini.
- Respons dari sesi yang sudah ditinggalkan diabaikan untuk efek UI; ini tidak
  membatalkan transaksi server yang mungkin sudah berjalan.
- SRS, Activity Diagram, dan ERD formal belum tersedia di `docs/`. Aturan yang
  digunakan adalah instruksi proyek, dokumentasi operasional dan implementasi yang ada.
- Next masih memberi peringatan `cacheComponents` tanpa pilihan eksplisit
  `partialPrefetching`. Build berhasil; konfigurasi caching tidak diubah untuk
  menyelesaikan bug formulir.

Usulan commit, setelah review dan persetujuan:

```text
fix: reset form state and standardize post-save navigation
```

Jangan men-stage seluruh worktree secara otomatis: beberapa file kandidat di atas
juga memuat pekerjaan sebelum tugas ini. Tidak ada commit atau push yang dilakukan.
