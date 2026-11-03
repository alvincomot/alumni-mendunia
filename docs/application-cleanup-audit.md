# Cleanup aplikasi, penyederhanaan UI, dan audit regresi

Tanggal pemeriksaan: 2 November 2026, Asia/Jakarta.

Laporan ini mencatat pelaksanaan **MASTER TASK: COMPLETE APPLICATION CLEANUP,
UI REFINEMENT & FULL REGRESSION AUDIT**. Perubahan dibandingkan dengan snapshot
worktree saat tugas ini dimulai, bukan hanya dengan HEAD Git. Worktree sudah
berisi pengembangan pengguna dan hasil cleanup sebelumnya. Tidak ada reset,
staging, commit, push, ZIP, operasi Auth hosted, atau migrasi hosted.

## A. Cleanup Summary

- Modul yang diaudit: autentikasi Sekolah/Dinas, aktivasi mandiri, pemulihan dan
  callback, dashboard, alumni, penempatan, riwayat status, sekolah, pengguna,
  laporan/CSV, audit log, navigasi, loading/error/empty, dependensi, dokumentasi,
  konfigurasi, dan riwayat migrasi.
- Fokus implementasi: menghapus onboarding sekolah manual, menyediakan detail
  akun yang hanya dibaca, merapikan tindakan tabel, dan memisahkan undangan
  Dinas dari aktivasi mandiri sekolah.
- Tahap ini mengubah **20 file yang sudah ada** dan menambah **5 file**, termasuk
  laporan ini. Tidak ada file/folder tambahan yang dihapus dan tidak ada
  dependency aplikasi yang ditambah, dihapus, atau diubah versinya.
- Cleanup sebelumnya dalam sesi ini sudah menghapus `antislop.md` di root,
  dependency langsung `recharts` beserta 36 dependency transitif yang tidak
  dibutuhkan, beberapa export/tipe mati, dan token grafik tanpa pemakai.
  Hasil tersebut dipertahankan; rincian historis ada di
  [laporan baseline](cleanup-regression-audit.md).
- Penelusuran akhir menemukan **122 modul runtime**, seluruhnya terjangkau dari
  **37 entry point App Router/proxy**, tanpa import lokal yang gagal diresolusikan.
  Tidak ditemukan modul produksi lain yang terbukti aman dihapus.
- Snapshot awal mencatat 187 file yang tersedia. Sembilan migrasi, seluruh
  `app/auth/`, `lib/auth/`, skill, referensi desain, `AGENTS.md`, `DESIGN.md`,
  manifest, dan lockfile tetap sama dengan snapshot tugas ini.

## B. Legacy Features Removed

| Bagian | Perubahan dan alasan |
| --- | --- |
| Provisioning sekolah manual | Menghapus server action `provisionSchoolAccount` dan formulir pembuatan akun. Akun sekolah baru memakai aktivasi mandiri NPSN dan email native Supabase. |
| Penerbitan ulang kata sandi sementara | Menghapus server action `reissueSchoolPassword` dan panel penerbitan ulang. Pemulihan aktif memakai email native Supabase. |
| Penyerahan kredensial | Menghapus password sementara, salin clipboard, state kredensial sekali tampil, dan checkbox pengakuan penyimpanan kredensial. |
| Helper khusus alur pensiun | Menghapus `accountProvisioningMessage`, `generateTemporaryPassword`, `schoolProvisioningMetadata`, `isRecoverableSchoolProvisioning`, konstanta marker terkait, dan deteksi konflik Auth yang hanya dipakai provisioning. Metadata yang sudah tersimpan tidak dihapus. |
| Schema/tipe khusus alur pensiun | Menghapus `schoolAccountProvisionSchema`, `schoolPasswordReissueSchema`, input/result provisioning, result reissue, serta `SchoolTemporaryCredentials`. Schema perubahan status akun tetap ada. |
| Undangan sekolah lewat Manajemen Pengguna | Undangan baru dibatasi ke Admin Dinas dan Viewer Dinas, baik di UI maupun schema server. Request langsung dengan peran Petugas Sekolah ditolak sebelum mengakses API Auth. |
| Kontrol pemulihan ganda | Menghapus checkbox pemulihan dari dialog undangan. Tombol khusus **Pulihkan profil** tetap tersedia. |

Delapan tes yang hanya menjalankan action provisioning/reissue yang sengaja
dipensiunkan diganti cakupannya dengan pemeriksaan bahwa API tersebut sudah
tidak diekspor. Tes digest, password gate, migrasi historis, dan pemulihan tetap
dipertahankan. Ditambahkan 18 kasus detail akun dan satu kasus pemisahan
undangan/pemulihan. Total tes berubah dari 139 menjadi 150, semuanya lulus.

## C. UI Simplification

- Baris sekolah kini memiliki **Edit** dan satu tombol menu berlabel aksesibel.
  Menu berisi **Detail akun**, **Nonaktifkan/Aktifkan sekolah**, dan
  **Tangguhkan/Aktifkan akun** saat relasi petugas tidak ambigu.
- Dialog **Detail Akun Sekolah** hanya menampilkan informasi: identitas sekolah,
  NPSN, status sekolah, status aktivasi, petugas, email terdaftar, verifikasi
  email, status profil, serta kebutuhan penggantian kata sandi akun lama.
- Label lifecycle berasal dari RPC `school_auth_lookup` yang sudah tersedia:
  `UNCLAIMED` → **Belum Aktivasi**, `PENDING_ACTIVATION` → **Menunggu Aktivasi**,
  `ACTIVE` → **Aktif**, `SUSPENDED` → **Ditangguhkan**. Jumlah profil dan flag
  password tidak lagi dipakai untuk menebak lifecycle.
- Kegagalan lookup ditampilkan sebagai **Belum dapat dimuat**, dengan pesan
  muat ulang; dialog memiliki skeleton, error, dan **Coba lagi**. Kondisi akun
  tanpa petugas dijelaskan secara eksplisit.
- Penonaktifan sekolah dan penangguhan profil tetap dua operasi berbeda,
  masing-masing dengan konfirmasi dampak. Mengaktifkan sekolah tidak otomatis
  mengaktifkan profil yang ditangguhkan. Profil tidak dapat diaktifkan dari menu
  selama sekolah nonaktif. Aktivasi/password gate tetap berlaku setelah
  perubahan status profil.
- Viewer Dinas hanya melihat informasi sekolah; tidak ada menu administratif
  atau pembacaan akun menggunakan kredensial layanan.
- Skeleton daftar sekolah disesuaikan menjadi tujuh kolom untuk Admin dan empat
  untuk Viewer. Shell dashboard dan batas loading yang ada dipertahankan.
- Tombol undangan menjadi **Undang pengguna Dinas**, default Viewer Dinas, dengan
  dua pilihan peran Dinas. Toast menyatakan permintaan diterima layanan email,
  tanpa menjanjikan email telah diterima pengguna.

## D. Files Modified and Deleted

Daftar berikut merupakan perubahan **tugas terbaru** dan kandidat file untuk
ditinjau sebelum staging. Sebagian sudah mengandung perubahan pengguna dari
sebelum tugas ini; jangan menambahkan seluruh worktree dengan `git add .`.

| Path | Perubahan |
| --- | --- |
| `app/dashboard/schools/actions.ts` | Hapus dua action legacy; baca lifecycle dan email berdasarkan relasi profil terotorisasi; pertahankan CRUD sekolah/status profil. |
| `app/dashboard/schools/page.tsx` | Lifecycle sebenarnya, kegagalan eksplisit, dua kontrol per baris, batas tabel lebih ringkas. |
| `app/dashboard/schools/loading.tsx` | Cocokkan jumlah kolom/lebar skeleton dengan tabel Admin/Viewer. |
| `components/schools/school-account-dialog.tsx` | Ganti dialog kredensial menjadi detail yang hanya dibaca. |
| `components/schools/school-dialog.tsx` | Izinkan konfirmasi status dibuka dari menu dan kembalikan fokus saat ditutup. |
| `components/schools/school-account-status.tsx` | **Baru:** label dan warna status yang dipakai bersama. |
| `components/schools/school-row-actions.tsx` | **Baru:** menu keyboard dan konfirmasi status akun yang terpisah. |
| `components/users/user-dialog.tsx` | Undangan Dinas saja, hapus pemulihan ganda, perbaiki validasi dan pesan penerimaan email. |
| `lib/schools/accounts.ts` | **Baru:** pembacaan RPC lifecycle dengan validasi respons dan kecocokan NPSN. |
| `lib/users/admin.ts` | Hapus helper yang khusus menerbitkan kredensial manual; pertahankan client admin, directory, digest dan undangan Dinas. |
| `lib/users/schema.ts` | Batasi undangan baru, hapus schema/result legacy, definisikan data detail akun. |
| `tests/school-account-details.test.mjs` | **Baru:** lifecycle, identitas email, pembatasan role, perubahan akses, ID tidak valid dan kegagalan lookup. |
| `tests/school-account-provisioning.test.mjs` | Pensiunkan tes action yang dihapus; pertahankan tes migrasi, status akun, digest dan password gate. |
| `tests/schools.test.mjs` | Perbarui batas mock import; seluruh validasi dan otorisasi sekolah tetap diuji. |
| `tests/mvp.test.mjs` | Undangan Dinas, penolakan undangan sekolah, pemulihan profil sekolah tanpa undangan baru. |
| `tests/users-admin.test.mjs` | Verifikasi helper provisioning sudah tidak diekspor; pertahankan diagnostik dan isolasi client. |
| `tests/form-ux.test.mjs` | Verifikasi detail tidak mengandung kredensial; pertahankan tes form/toast. |
| `tests/ui-audit-browser.mjs` | Menu, lifecycle, detail, konfirmasi terpisah, pembatalan/retry, reaktivasi, Viewer, dan undangan Dinas di empat viewport. |
| `tests/password-recovery-browser.mjs` | Ganti skenario penerbitan kredensial dengan detail tanpa mutasi; semua skenario Auth dipertahankan. |
| `docs/mvp-setup.md` | Perbarui alur administrasi, kompatibilitas, sumber data dan batas email pending. |
| `docs/school-self-activation.md` | Tegaskan aktivasi mandiri sebagai onboarding; jelaskan penghapusan action manual. |
| `docs/password-recovery-email-setup.md` | Hapus instruksi penerbitan ulang manual; pertahankan pemeriksaan password lama. |
| `docs/cleanup-regression-audit.md` | Tandai sebagai laporan baseline historis yang digantikan laporan ini. |
| `README.md` | Tambahkan tautan audit terbaru. |
| `docs/application-cleanup-audit.md` | **Baru:** laporan pelaksanaan dan bukti regresi. |

**Penghapusan file/folder pada tugas terbaru: tidak ada.** Satu deletion tracked
yang masih terlihat pada `git diff` adalah `antislop.md`, hasil cleanup sebelumnya.
Alasannya: salinan instruksi root telah digantikan path skill yang ditetapkan
AGENTS.md. Tidak ada migrasi, callback, aset aktif, atau source pengguna lain
yang dihapus. Folder skill, referensi desain, cache dan artefak tes di luar
repository tidak dihapus.

## E. Retained Features

| Bagian | Alasan dipertahankan |
| --- | --- |
| Sembilan `supabase/migrations/*.sql` | Riwayat deployment, constraint, RLS, audit, lifecycle dan kompatibilitas. Tidak mengedit migrasi yang telah diterapkan. |
| RPC provisioning/reissue di migrasi historis | Sudah menjadi riwayat schema. UI/action aplikasi dihapus; perubahan privilege/database memerlukan migrasi terpisah yang disetujui. Tes SQL pembatasannya tetap dijalankan. |
| `credentialDigest`, `must_change_password`, metadata/row legacy | Akun lama harus tetap mengganti password dan tidak boleh memakai ulang password sementara. Data dan metadata yang tersimpan tidak disentuh. |
| Pemulihan profil Auth tanpa profil aplikasi | Memulihkan kegagalan parsial tanpa membuat akun Auth baru, mengirim undangan baru, atau menimpa profil yang sudah ada. |
| Administrasi profil dan last-admin guard | Perubahan peran/penugasan/status tetap tersedia sesuai kewenangan dan RLS. Guard admin terakhir serta larangan demosi sendiri tetap aktif. |
| `/auth/confirm`, `/auth/callback`, `/auth/update-password` | Verifikasi token/session, recovery PKCE/OTP dan completion aktivasi masih diperlukan. |
| `/protected`, `/auth/sign-up`, `/auth/sign-up-success` | Redirect kompatibilitas yang diuji; tidak membuka signup publik. |
| `lib/users/admin.ts`, klien Supabase, proxy dan guard akses | Dipakai alur aktif. Service key tetap khusus server. |
| Pencarian global dan filter halaman | Lingkup berbeda: pencarian global menuju alumni, filter lokal mempersempit daftar yang sedang dibaca. Tidak redundan. |
| Riwayat penempatan, status dan audit | Diperlukan untuk jejak perubahan serta perhitungan berdasarkan penempatan terkini. |
| Skill, referensi desain, dokumentasi historis, template email | Sumber kerja/desain dan operasional yang masih relevan; laporan historis tidak diperlakukan sebagai spesifikasi onboarding aktif. |

## F. Functional Verification

| Modul | Bukti lokal dan hasil |
| --- | --- |
| Dashboard | Unit test agregasi/filter dan browser halaman nyata dengan data fiktif lulus. Alumni tanpa penempatan tetap dihitung; hanya penempatan terkini memengaruhi status/country. |
| Alumni | Validasi, otorisasi petugas, penetapan sekolah dari sesi, registrasi dan pemulihan kegagalan parsial lulus. Browser menguji form dua langkah dan pemilihan negara tanpa submit dini. |
| Penempatan/status | Unit dan SQL menguji transisi, tanggal, expected status/current placement, penolakan request stale/duplikat, rollback serta riwayat atomik. Tidak ada status bisnis baru. |
| Detail/riwayat | Browser detail dan dialog pembatalan lulus; SQL menjaga sejarah immutable dan penggantian penempatan setelah status terminal. |
| Sekolah | CRUD/validasi NPSN, role gate, status sekolah, lifecycle, detail/email terhubung, suspensi dan reaktivasi lulus. Operasi sekolah dan akun terbukti memiliki payload berbeda. |
| Pengguna | Undangan Dinas, larangan undangan sekolah, pemulihan orphan, role/status/penugasan, admin terakhir dan audit actor lulus. |
| Laporan/CSV | Filter, urutan, format country, izin Dinas, penolakan staff, header private/no-store dan netralisasi formula CSV lulus. |
| Audit log | Otorisasi Admin dan audit actor diuji; Viewer/Petugas tidak mendapat akses administratif. Browser tabel/filter/empty/loading lulus. |
| Navigasi/logout | Shell, drawer mobile, focus trap/return, mode login via keyboard, logout gagal lalu retry, redirect legacy/protected lulus. |
| Loading/error/empty | Enam halaman daftar/monitoring diuji; detail akun memiliki skeleton dan retry tersendiri. Data form dipertahankan saat gagal dan dialog ditutup setelah sukses. |

Tidak ditemukan kontrol lain yang terbukti redundant dan aman dihapus setelah
meninjau alur di atas. Perhitungan monitoring, aturan status alumni, dan export
tidak diubah untuk mengejar penyederhanaan visual.

## G. Authentication and Security

- Aktivasi mandiri sekolah: lookup NPSN dengan leading zero, empat status,
  undangan/resend/cooldown, password creation, pemulihan NPSN dan failure paths
  lulus unit, SQL dan fixture browser yang relevan.
- Dinas: login email, undangan, reset password, callback OTP/PKCE, penolakan
  redirect eksternal dan batas role tetap lulus.
- Detail akun: hanya Admin aktif; ID sekolah divalidasi, relasi petugas dibaca
  dengan SSR terotorisasi, akses Admin dicek lagi sebelum client istimewa dibuat.
  Email diambil melalui `getUserById` untuk ID profil yang ditemukan, dengan
  pemeriksaan ID respons. Tidak memakai email/role/school_id dari client sebagai
  sumber kepercayaan atau mengekspos metadata Auth.
- RLS lokal: cross-school read/write ditolak, Dinas tetap read-only untuk alumni,
  pending activation dan password gate tetap memblokir operasional. Penangguhan
  profil/penonaktifan sekolah tidak memerlukan JWT baru untuk membatasi akses.
- Tidak ada secret yang di-stage. `git ls-files` untuk `.env*` hanya memuat
  `.env.example`; metadata lokal `supabase/.temp` tidak tracked. Client admin
  tetap `server-only`; diagnostik tidak mengembalikan provider error mentah.
- Tidak mengubah schema/RLS, membuat token aktivasi sendiri, mengintegrasikan
  REST Brevo, menambah approval/email-change workflow, atau menghapus akun.

## H. UI/Responsive Tests

| Viewport | Hasil |
| --- | --- |
| 390 px | Lulus: delapan halaman, form/dialog/menu, tabel dalam area geser, nama/email panjang, Auth dan fokus keyboard. |
| 768 px | Lulus: seluruh skenario fixture dan Auth tanpa overflow halaman. |
| 1024 px | Lulus: transisi navigasi desktop, seluruh skenario fixture dan Auth. |
| 1440 px | Lulus: tabel dan layout desktop, seluruh skenario fixture dan Auth. |

Tidak ada browser console error, page error, request gagal, atau respons HTTP
error pada skenario yang dijalankan. Tabel lebar tetap dapat digeser di region
berlabel; tidak memaksa viewport halaman melebar. Tidak ada permintaan browser
fixture ke layanan eksternal.

Menu mendukung ArrowUp/Down, Home/End, Enter dan Escape. Fokus dikembalikan ke
trigger setelah menu/dialog ditutup. Dialog menahan fokus, memiliki judul dan
deskripsi, serta konfirmasi pembatalan/aksi yang jelas. Kontrol menu berukuran
minimal 44 px. Skeleton memiliki status Indonesia, `aria-busy`, placeholder
dekoratif tersembunyi dan aturan reduced motion dari komponen bersama.

Delivery Gate Anti-Slop: mengikuti DESIGN.md, navy/teal, ENERGY 2 / RHYTHM 2 /
MOTION 1, tipografi dan shell yang ada. Tidak menambah ilustrasi, dekorasi,
gradient, copy pemasaran atau statistik buatan. Ikon titik tiga menunjukkan
tindakan tambahan; warna badge membawa arti status, bukan hiasan. Screenshot
menu/detail ponsel dan tabel desktop ditinjau secara visual. Ini merupakan
pemeriksaan skenario lokal, bukan sertifikasi aksesibilitas menyeluruh.

## I. Test Results

| Pemeriksaan | Hasil akhir |
| --- | --- |
| `npm run lint` | **PASS**, tanpa error/warning lint. |
| `npx tsc --noEmit` | **PASS**, tanpa error TypeScript. |
| `node --test tests/*.test.mjs` | **PASS**, 150 tes, 0 gagal/skip. |
| `node tests/database-smoke.mjs` | **PASS**, 16 kelompok SQL/RLS pada PostgreSQL/PGlite terisolasi. |
| `node tests/ui-audit-browser.mjs` | **PASS**, delapan halaman nyata dengan boundary server mock, empat viewport, state dan aksi sekolah/pengguna terbaru. |
| `node tests/password-recovery-browser.mjs` | **PASS**, empat viewport; aktivasi/login/recovery/password/detail akun dan preview email. |
| `node tests/school-auth-production-smoke.mjs` | **PASS**, `next start` lokal dari build aktual, route publik/protected/legacy, validasi dan keyboard pada empat viewport. |
| `npm run build` | **PASS**, build produksi dan generasi 22 halaman selesai. Warning konfigurasi Next yang sudah ada dicatat di J. |
| `git diff --check` | **PASS**. |
| `npm ls --depth=0` | **PASS**, graph dependency konsisten dengan manifest/lockfile. |
| `npm audit --omit=dev --json` | **PASS**, 0 kerentanan dependency produksi. |
| `npm audit --json` | 14 moderate pada dependency pengembangan; sama dengan baseline. Tidak dinyatakan bebas temuan. |
| Import/runtime dan snapshot | 122/122 modul terjangkau, tidak ada import lokal hilang; sembilan migrasi dan file terlindungi sama dengan baseline. |

Perbaikan selama verifikasi: fixture undangan diperbarui untuk assignment sekolah
`null` pada pengguna Dinas; variabel loader tes diganti agar sesuai lint Next;
browser menutup notifikasi sukses sebelum aksi berikutnya agar pointer tidak
tertutup toast. Seluruh pemeriksaan yang terpengaruh kemudian dijalankan ulang.
Tidak ada tes keamanan aktif yang dilonggarkan untuk meluluskan pemeriksaan.

Log dan snapshot lokal tersedia di `node_modules/.cache/application-cleanup/`
(`final-*.log`, hasil npm JSON, `review.json`, `module-review.json`, dan diff
terhadap baseline). File tersebut diabaikan Git. Tiga log browser mencatat
lokasi screenshot masing-masing. Dependency pengujian browser/PGlite memakai
instalasi terisolasi yang sudah tersedia; tidak menambah dependency aplikasi.

## J. Remaining Issues

**Sudah ada sebelum cleanup:**

1. `npm audit` masih melaporkan 14 temuan moderate pada dependency pengembangan
   terkait minimatch/toolchain ESLint. Dependency produksi tidak memiliki temuan.
   Tidak menjalankan pembaruan mayor otomatis yang memperluas cakupan tugas.
2. Next menampilkan warning `cacheComponents` tanpa pilihan eksplisit
   `partialPrefetching`. Build dan start tetap lulus; konfigurasi tidak diubah.
3. SRS, Activity Diagram dan ERD formal belum tersedia. Acuan audit ialah
   AGENTS.md, DESIGN.md, dokumentasi implementasi, source dan migrasi aktual.
4. Rate limiter aplikasi bersifat per-instance. Pembatasan terdistribusi,
   pengujian beban dan concurrency multi-koneksi tetap pekerjaan deployment.
5. Aktivasi membuktikan kepemilikan email, belum membuktikan otoritas institusi.
   Perilaku MVP tersebut dipertahankan; tidak menambah alur approval.

**Batas data detail akun:** RPC lookup yang tersedia tidak mengembalikan email
pending. Jika profil petugas belum terbentuk, email pending tidak ditampilkan
dan alasannya dijelaskan. Email akun yang sudah terhubung ditampilkan dari Auth.
Mendapatkan email pending sebelum profil terbentuk membutuhkan perubahan kontrak
database yang ditinjau terpisah; cleanup ini tidak membuka schema privat atau
menjalankan RPC recovery yang memiliki efek samping hanya untuk membaca email.

**Regresi akibat cleanup:** tidak ada yang masih terdeteksi setelah perbaikan
dan pengulangan seluruh pemeriksaan akhir.

**Hosted Supabase/Brevo belum diverifikasi:** status penerapan migrasi live,
SMTP/pengirim/DNS, allowlist redirect, kesesuaian expiry, pengiriman ke inbox/spam,
konsumsi token sekali pakai/expiry nyata, pencabutan password lama, serta alur
akun nyata dari awal sampai selesai. Auth pada unit/fixture browser dimock dan
SQL memakai database lokal. Smoke produksi lokal tidak mengirim email atau
memutasi akun hosted. Kelulusan lokal tidak membuktikan deliverability maupun
kesiapan produksi.

## K. Final Status

**CLEANUP COMPLETE — EXISTING ISSUES REMAIN**

Perubahan aplikasi selesai dan seluruh pemeriksaan fungsional lokal lulus.
Temuan dependency pengembangan, batas kontrak email pending dan pemeriksaan
hosted di bagian J tetap tercatat untuk tindak lanjut.

## L. Suggested Commit Message

`refactor: clean up legacy features and simplify application UI`

Tinjau 25 path pada bagian D untuk kelompok perubahan ini. Gunakan staging
bertahap pada file yang sudah mengandung pekerjaan sebelumnya. Penghapusan
`antislop.md` dan perubahan dependency dari tugas sebelumnya harus ditinjau
bersama laporan baselinenya bila ingin digabung. Tidak ada file yang di-stage,
tidak ada commit, dan tidak ada push; keduanya memerlukan persetujuan eksplisit.
