# Cleanup dan audit regresi lokal

> Laporan baseline sebelum tugas penyederhanaan UI akun sekolah. Keputusan
> mempertahankan provisioning/reissue di bawah sudah digantikan oleh
> [audit aplikasi terbaru](application-cleanup-audit.md). Hasil historis tetap disimpan.

Tanggal: 2 November 2026, Asia/Jakarta.

**CLEANUP COMPLETE — EXISTING ISSUES REMAIN**

Cleanup selesai dan seluruh pemeriksaan fungsional lokal lulus. Audit npm masih
melaporkan 14 temuan moderate pada dependensi pengembangan yang sudah ada sejak
baseline. Kesiapan hosted Supabase dan pengiriman email Brevo belum diverifikasi.

## A. Ringkasan dan baseline

- File repository dihapus: **1**. Folder repository dihapus: **0**.
- Dependensi langsung dihapus: **Recharts**. npm menghapus **37 paket** termasuk
  Recharts dan 36 paket transitif; tidak menambahkan paket atau mengubah versi
  paket yang dipertahankan. Berkas dalam `node_modules` tidak dihitung sebagai
  penghapusan file/folder source.
- Kode mati dihapus: `CardFooter`, alias `DialogClose`, empat tipe input tanpa
  pemakai, konstanta `loginModes`, serta lima token warna grafik dan pemetaannya.
- Tujuh export yang hanya dipakai di dalam modul dijadikan privat.
- Kondisi awal: 117 file tracked, 79 file untracked; 70 file tracked sudah berubah.
  Semua 196 file awal dicatat hash-nya sebelum cleanup. Perubahan di luar daftar
  cakupan pada bagian D dipertahankan, termasuk sembilan migrasi.
- Baseline lint, TypeScript, 139 tes Node, 16 kelompok SQL/RLS, build, serta tiga
  skrip browser lulus. Warning Next.js dan temuan npm sudah ada sebelum cleanup.
- Inventaris mencakup `app`, `components`, `lib`, `tests`, `docs`, `supabase`,
  referensi desain, skill, konfigurasi, dan metadata tooling. `.next`,
  `node_modules`, `next-env.d.ts`, dan `tsconfig.tsbuildinfo` adalah hasil generasi.
  `.env.local` adalah konfigurasi rahasia lokal dan tidak diubah.
- Tidak tersedia SRS, Activity Diagram, atau ERD formal di repository. Audit
  memakai AGENTS.md, dokumentasi implementasi, source, dan migrasi yang tersedia.

## B. SAFE TO DELETE dan bukti penghapusan

| Item | Bukti dan alasan |
| --- | --- |
| `antislop.md` | Salinan instruksi lama di root. AGENTS.md secara eksplisit memilih `.agents/skills/antislop/SKILL.md` dan `.agents/skills/antislop-ui/SKILL.md`. Tidak digunakan aplikasi, konfigurasi build, tes, atau workflow aktif; skill terpasang dan cadangan tetap tersedia. File lama sudah tracked sehingga dapat dipulihkan melalui Git. |
| `recharts` pada manifest/lockfile | Tidak ada import statis/dinamis, pemanggilan runtime, atau pemakai konfigurasi/tes. Grafik aktif `components/monitoring/country-chart.tsx` menggunakan elemen HTML dan CSS. npm hanya menghapus paket yang menjadi tidak diperlukan. |
| `CardFooter` pada `components/ui/card.tsx` | Resolver referensi TypeScript dan pencarian seluruh repository tidak menemukan pemakai di luar definisi/export. Komponen Card lainnya tetap dipakai. |
| `DialogClose` pada `components/ui/dialog.tsx` | Alias/export tanpa pemakai. Tombol penutup aktif memakai `DialogPrimitive.Close` langsung dan tetap tersedia. |
| `LoginInput`, `PasswordChangeInput`, `SchoolAccountStatusInput`, `SchoolPasswordReissueInput` | Tipe tanpa pemakai di source maupun tes. Schema validasi, hasil action, dan otorisasi tetap dipertahankan. |
| `loginModes` | Nilai runtime hanya dipakai untuk membentuk tipe. `LoginMode` kini diturunkan langsung dari `loginSchema`, dengan union yang sama. |
| `--chart-1` sampai `--chart-5` dan `theme.extend.colors.chart` | Tidak ada class atau lookup runtime yang memakai token tersebut. Grafik aktif memakai palette eksplisit navy/teal dan warna semantik. |

`ButtonProps`, `buttonVariants`, `emailSchema`, `StatusHistoryEntry`,
`SchoolAccountSummary`, `CountryOption`, dan `normalizeCountrySearch` tetap ada
sebagai implementasi internal; hanya export tanpa konsumennya yang dihapus.

Penelusuran setelah cleanup menemukan seluruh **118 modul runtime** terjangkau
dari entry point App Router/proxy. Import CSS root juga ada dan berhasil dibangun.
Tidak ada modul produksi lain yang terbukti aman untuk dihapus.

## C. Item yang dipertahankan

| Klasifikasi | Item | Alasan |
| --- | --- | --- |
| MUST RETAIN | Semua sembilan file `supabase/migrations/*.sql` | Riwayat schema, privilege, trigger, RLS, dan kompatibilitas. Hash seluruh file sama dengan baseline, termasuk migrasi yang belum tracked. |
| MUST RETAIN | Callback/confirm, klien Supabase, proxy, `lib/users/admin.ts`, guard akses, diagnostik Auth | Dipakai sesi, pembatasan akses, administrasi, dan penanganan kegagalan. |
| MUST RETAIN | Provisioning admin, reissue password, `school_claim_v1` reconciliation | Masih menjadi alur pemulihan administratif dan penanganan akun lama; bukan kode aktivasi publik yang mati. |
| MUST RETAIN | `/protected`, `/auth/sign-up`, `/auth/sign-up-success` | Redirect kompatibilitas aktif. Signup publik tidak dibuka oleh route ini. |
| MUST RETAIN | `countryOptions`, `csvCell`, seluruh tes dan skrip smoke | Memiliki pemakai tes langsung, termasuk pemeriksaan dataset negara dan netralisasi formula CSV. |
| MUST RETAIN | Dokumentasi historis, template email, `design-reference/`, `supabase/imports/` | Menjelaskan riwayat, konfigurasi eksternal, dan workflow impor. Tidak diasumsikan mati karena tidak diimpor oleh React. |
| MUST RETAIN | AGENTS.md, DESIGN.md, `.agents/skills/`, `.env.example` | Instruksi aktif dan seluruh variabel contoh masih dipakai. Tidak diubah oleh cleanup. |
| NEEDS REVIEW | `registerInitialPlacement` | Tidak memiliki pemanggil UI saat ini, tetapi masih menjadi Server Action yang diuji secara langsung. Tidak dihapus bersama tes yang melindungi perilakunya. |
| NEEDS REVIEW | `.codex/antislop-backup/`, `.codex/skills/` | Cadangan pengguna dan skill yang terdaftar di lingkungan agent. Tidak dihapus. |
| NEEDS REVIEW | `supabase/.temp/` | Metadata generated yang mungkin diperlukan CLI terhubung. Ditambahkan ke `.gitignore`, bukan dihapus atau diputus koneksinya. |

Tidak ada integrasi Brevo REST aktif di source. Konfigurasi rahasia legacy di
lingkungan lokal tidak disentuh; operator dapat meninjaunya secara terpisah.

## D. Perubahan kode, dokumentasi, dan cakupan staging

Daftar lengkap perubahan tugas ini: **19 file dimodifikasi, 1 dihapus, 1 ditambah**.

| File | Perubahan |
| --- | --- |
| `.gitignore` | Abaikan seluruh `.env*` kecuali `.env.example`, serta metadata CLI Supabase. |
| `README.md` | Sesuaikan status prototipe, prasyarat environment, dan tautan dokumentasi dengan implementasi saat ini. |
| `antislop.md` | Hapus salinan instruksi yang sudah digantikan skill terpasang. |
| `package.json`, `package-lock.json` | Hapus Recharts dan paket transitif tanpa mengubah versi dependensi lain. |
| `app/globals.css`, `tailwind.config.ts` | Hapus token grafik tanpa pemakai. |
| `components/ui/button.tsx` | Jadikan tipe props dan pembentuk variant sebagai detail internal. |
| `components/ui/card.tsx` | Hapus CardFooter yang tidak digunakan. |
| `components/ui/dialog.tsx` | Hapus alias/export DialogClose yang tidak digunakan. |
| `lib/auth/login-schema.ts` | Hapus tipe input mati, batasi export email schema, turunkan LoginMode dari schema. |
| `lib/auth/password-change.ts` | Hapus tipe input mati. |
| `lib/users/schema.ts` | Hapus dua tipe input mati dan batasi export tipe internal. |
| `lib/alumni/status.ts`, `lib/countries.ts` | Batasi export yang hanya digunakan di dalam modul. |
| `docs/mvp-setup.md` | Tambahkan konfigurasi expiry wajib dan perjelas migrasi hardening additive. |
| `docs/password-recovery-verification.md` | Perbaiki tautan ke panduan aktivasi yang tersedia, pertahankan riwayat laporan. |
| `tests/password-recovery-browser.mjs` | Periksa request gagal/HTTP error; periksa error kembali setelah preview email. |
| `tests/ui-audit-browser.mjs` | Periksa console/network, simpan sekolah dan toast, serta logout gagal/retry untuk dashboard dan halaman petugas. |
| `tests/school-auth-production-smoke.mjs` | Batasi request browser ke localhost, periksa console/network sampai akhir, uji 14 URL root/legacy/terproteksi. |
| `docs/cleanup-regression-audit.md` | Laporan ini. |

Daftar ini merupakan cakupan untuk review/staging, bukan izin commit. Sebagian
file sudah memiliki perubahan pengguna sebelum tugas ini; tinjau hunks cleanup
terhadap baseline dan jangan stage seluruh worktree. Tidak ada staging, commit,
push, migrasi hosted, perubahan SMTP, atau penghapusan data/Auth/Storage.

## E. Hasil autentikasi

| Alur | Bukti lokal | Batas verifikasi |
| --- | --- | --- |
| Lookup NPSN | Tes schema/action dan browser: delapan digit, nol depan, sekolah tidak ditemukan, nama/NPSN tetap terlihat. | Lookup hosted tidak dipanggil. |
| UNCLAIMED | Mock action memeriksa recipient, native invite, expiry/configuration, reserve/bind/cancel; PGlite menguji state dan cooldown. | Bukan bukti email diterima di inbox. |
| PENDING_ACTIVATION | Tes resend, deadline, request lama, akun terverifikasi yang belum selesai, rollback kegagalan provider, dan retry partial failure. | Retry mail provider nyata belum dijalankan. |
| Callback dan link | Tes OTP/PKCE dengan mock Auth, pemeriksaan user yang sama, fixed redirect, link salah/expired/reused; browser menguji route aktual tanpa token. | Konsumsi token nyata, refresh/reopen link email nyata, dan lintas browser tetap memerlukan acceptance hosted. |
| Kata sandi awal | Tes minimal delapan karakter, konfirmasi, update Auth sebelum completion; SQL memeriksa perubahan fingerprint password, idempotensi, dan larangan akses dini. | Hash Auth dalam PGlite adalah fixture. |
| ACTIVE | Tes login NPSN/password, binding sekolah/user, salah password, role, profil aktif, redirect dashboard; SQL menguji isolasi sekolah. | Login Auth nyata belum dijalankan. |
| Recovery sekolah/Dinas | Sekolah memakai email terverifikasi dari server; Dinas memakai email. Tes error/rate limit/PKCE, ganti password, dan sign-out. | Password baru berhasil login dan password lama ditolak perlu Auth nyata. |
| SUSPENDED/inactive/password gate | SQL/RLS menolak data operasional dan memeriksa perubahan akses tanpa JWT baru; action menolak sesi yang tidak berwenang. | Session hosted belum diperiksa. |
| Dinas/admin | Mock login kedua role, pembatasan mutasi, undangan, edit profil, orphan recovery, dan proteksi admin terakhir melalui SQL. | Tidak ada akun Dinas nyata digunakan. |
| Logout | Browser fixture menguji gagal lalu retry sukses dari dashboard dan detail petugas; switch-account juga diuji. | Supabase sign-out dimock. |

Integrasi PKCE dalam suite Node memakai implementasi `@supabase/ssr` yang
terpasang dengan endpoint HTTP mock untuk memeriksa cookie verifier. Ini berbeda
dari pengujian layanan Supabase hosted.

## F. Regresi fungsional

| Fitur | Hasil dan cakupan |
| --- | --- |
| Dashboard | Lulus agregasi/current placement, scope sekolah, filter, negara, angkatan, ranking, empty/loading/error; render browser memakai data fiktif. |
| Alumni | Lulus list/detail, validasi, ownership, registrasi/edit, retry partial save, successor placement, tiga transisi status sah, dan riwayat atomik. Browser menjalankan registrasi dua langkah dan pemilihan negara. |
| Sekolah | Lulus validasi NPSN, otorisasi admin, perubahan status, provisioning/reissue; browser membuka dialog, memvalidasi, menyimpan melalui action mock, menutup dialog/toast, dan refresh. |
| Pengguna | Lulus role/profile validation, larangan eskalasi bagi non-admin, proteksi akun sendiri/admin terakhir, undangan dan pemulihan profil. Browser memeriksa dialog dan layout direktori. |
| Laporan | Lulus filter/count, CSV BOM/quoting/formula defense, akses Dinas dan penolakan petugas, no-store; tabel dicek containment-nya. |
| Audit log | Lulus atribusi actor dan pembatasan akses SQL; browser memeriksa data, empty, dan loading. Auth login/logout/email tetap berada pada log Supabase Auth. |
| UI bersama | Lulus delapan halaman fixture pada empat viewport, keyboard menu/focus trap/Escape, dialog, validasi, country combobox, toast, skeleton dan error boundary. Tidak ada overflow halaman atau request/aset gagal pada skenario yang dijalankan. |

UI tidak menyediakan penghapusan alumni/sekolah; perilaku penonaktifan yang ada
dipertahankan. Pengujian ini tidak mencakup klik setiap kombinasi data/role atau
CRUD melalui layanan hosted. Sorting/filter/pagination yang berjalan di server
dinilai melalui source dan tes data/action yang tersedia; tidak diklaim sebagai
end-to-end database browser.

## G. Keamanan

- Pemindaian 36 aset browser hasil build dan source yang dapat dilacak Git tidak
  menemukan nilai secret server yang dikonfigurasi, token `service_role`, atau
  private key. Nilai rahasia tidak dicetak ke laporan atau log.
- Klien admin tetap `server-only`; key server dipasang pada request admin dan
  tidak menjadi input client. Build serta tes client/admin lulus.
- SQL/RLS menguji anon/authenticated tidak bisa mengeksekusi RPC service-only,
  akses lintas sekolah, pending/suspended/inactive, password gate, actor audit,
  serta perubahan status dan riwayat yang atomik.
- Server Action memeriksa role, profil, sekolah dan input secara mandiri.
  Role/school ID client tidak menentukan akses. CSV menetralkan formula.
- Callback memakai tujuan tetap; origin email divalidasi server. Diagnostik
  terstruktur tidak meneruskan pesan provider, email, password, atau URL token.
- Signup UI tetap redirect. Penonaktifan signup di konfigurasi Supabase hosted
  perlu diverifikasi operator; repository tidak dapat membuktikan pengaturan itu.
- Rate limiter lokal dan cooldown database lulus tes. Pembatasan IP bersama
  antar-instance dan kepercayaan terhadap forwarding headers tetap merupakan
  prasyarat deployment yang sudah didokumentasikan.
- Desain self-activation saat ini membuktikan kepemilikan email yang diajukan,
  belum membuktikan kewenangan mewakili sekolah. Ini risiko desain MVP yang
  sudah tercatat, bukan diubah menjadi alur approval dalam cleanup.
- `npm audit` melaporkan 14 moderate dari rantai lint/minimatch, sama seperti
  baseline; `npm audit --omit=dev` melaporkan nol. Advisory maintainer mencatat
  risiko amplifikasi glob pada minimatch 10.2.6 (versi transitif yang terpasang)
  dan perbaikan pada 11.0.1. Lihat
  [advisory minimatch](https://github.com/isaacs/minimatch/security/advisories/GHSA-g3hv-75wg-m249).
  Upgrade lint lintas major/override paksa tidak dilakukan sebagai cleanup
  dependensi mati; perlu perubahan kompatibilitas tersendiri.

## H. Hasil pengujian

| Pemeriksaan | Baseline | Setelah cleanup |
| --- | --- | --- |
| `npm run lint` | Lulus | Lulus |
| `npx tsc --noEmit` | Lulus | Lulus |
| `node --test tests/*.test.mjs` | 139 lulus | 139 lulus, 0 gagal/skip |
| Integrasi SSR/PKCE | Lulus dalam suite Node | Lulus, endpoint Auth mock |
| `node tests/database-smoke.mjs` | 16 kelompok lulus | 16 kelompok lulus |
| `node tests/password-recovery-browser.mjs` | Lulus | Lulus pada 390/768/1024/1440 px |
| `node tests/ui-audit-browser.mjs` | Lulus | Lulus pada 390/768/1024/1440 px, dengan assertion tambahan |
| `node tests/school-auth-production-smoke.mjs` | Lulus | Lulus pada build produksi lokal, termasuk redirect dan console/network |
| `npm run build` | Lulus dengan warning lama | Lulus dengan warning yang sama |
| `git diff --check` | Lulus | Lulus |
| `npm ls --depth=0` | Inventaris diperiksa | Lulus; manifest dan lockfile cocok |
| `npm audit` | 14 moderate | 14 moderate, seluruhnya dev |
| `npm audit --omit=dev` | Tidak dijalankan terpisah | 0 temuan |

SQL menggunakan PostgreSQL melalui PGlite ephemeral, fixture `auth.users`, dan
role tiruan; seluruh migrasi dijalankan secara lokal. Bukan hosted Supabase atau
uji konkurensi banyak koneksi. Browser fixture memakai komponen aktual dengan
action/Auth/router mock. Smoke produksi memakai `next start` lokal tanpa
credential submission atau pengiriman email.

Ketergantungan pengujian PGlite, Playwright, dan esbuild memakai instalasi
terisolasi yang sudah tersedia, melalui `MVP_SQL_TEST_DEPS` dan
`RECOVERY_UI_TEST_DEPS`. Tidak ditambahkan dependency aplikasi.

Log dan snapshot audit berada di `node_modules/.cache/cleanup-audit/` yang
diabaikan Git. Screenshot tersimpan di direktori Temp yang dicetak runner.
Artefak sementara tidak dimasukkan ke commit dan dapat hilang saat cache dibersihkan.

## I. Masalah tersisa

1. **Sudah ada:** 14 temuan moderate toolchain pengembangan dari npm audit.
2. **Sudah ada:** warning Next.js tentang `cacheComponents` tanpa pilihan
   `partialPrefetching` eksplisit. Mengubah strategi prefetch di luar cleanup ini.
3. **Sudah ada:** SRS/diagram formal belum tersedia. Referensi Stitch lama masih
   memuat warna indigo; permintaan sesi dan DESIGN.md menetapkan navy/teal.
   Referensi historis dipertahankan dan warna aktif tidak diganti.
4. **Perlu hosted:** dokumentasi terakhir mencatat hardening
   `20261029000100` sebagai pending. Riwayat hosted tidak diperiksa pada tugas
   ini; operator harus memastikan migrasi sesuai sebelum rilis.
5. **Perlu hosted:** SMTP/sender/allowlist/expiry, inbox delivery, token nyata,
   login/reset/password lama, signup disabled, dan RLS pada deployment nyata.
6. **Batas produksi:** pembatasan IP lintas-instance, pembuktian otoritas sekolah,
   redaksi query token pada access log hosting, serta beban/concurrency nyata.
7. **Masalah baru yang tersisa:** tidak ditemukan pada pemeriksaan yang dijalankan.
   Error lint akibat export cleanup dan locator baru pada test harness sudah
   diperbaiki tanpa menghapus assertion atau mengubah perilaku aplikasi.

## J. Status dan pemeriksaan akhir

**CLEANUP COMPLETE — EXISTING ISSUES REMAIN**

Diff cleanup ditinjau terpisah dari perubahan pengguna. Hanya satu file tracked
dihapus, tidak ada migrasi atau file runtime/keamanan yang dihapus. Semua file
awal di luar cakupan cleanup tetap memiliki hash yang sama. Lockfile sesuai
manifest; tidak ada versi paket tersisa yang berubah. Import, tautan Markdown
relatif, build, dan start produksi lokal diperiksa.

### Delivery Gate Anti-Slop untuk cakupan cleanup

Tidak ada UI baru atau redesign. Arah yang dipertahankan: dashboard administrasi
pendidikan untuk petugas/Dinas, navy/teal, ENERGY 2 / RHYTHM 2 / MOTION 1.
PASS berikut menilai perubahan cleanup dan skenario lokal yang dicatat, bukan
sertifikasi aksesibilitas atau keamanan seluruh deployment.

- R-02 PASS: tidak menambahkan copy UI; label status laporan mengikuti permintaan pengguna.
- R-03 PASS: empat viewport lulus pemeriksaan overflow halaman.
- R-17 PASS: tidak menambahkan statistik; fixture diberi penanda data fiktif.
- R-18 PASS: tidak menambahkan testimonial atau identitas orang produksi.
- R-23 PASS: tidak membuat logo, avatar, atau struktur navigasi baru.
- R-24 PASS: navigasi aktif dipertahankan, route build dan redirect legacy diperiksa.
- R-25 PASS: tidak mengubah warna teks/latar aktif; token dihapus tidak memiliki pemakai.
- R-26 PASS: kontrol aktif dipertahankan; validasi, dialog, combobox, toast dan logout dijalankan.
- R-27 PASS: fixture empty/loading/error pada enam halaman daftar/monitoring tetap lulus.
- R-28 PASS: tidak menambah FAQ.
- R-32 PASS: menu via keyboard, focus trap, fokus kembali, Escape dan tombol password diuji.
- R-33 PASS: source diedit melalui patch; npm hanya mengelola dependensi dan lockfile.
- R-34 PASS: tidak menambah atau mengubah tema.
- R-35 PASS: build/start, click-through fixture, console dan network diperiksa; batas cakupan ada di E/F/H.
- R-36 PASS: hasil lokal dipisahkan dari operasi hosted yang belum dilakukan.
- R-37 PASS: arah DESIGN.md dipertahankan; tidak menghasilkan desain baru.
- R-38 PASS: data fixture fiktif tidak dimasukkan ke data produksi.
- R-01 PASS: tidak menambahkan gradient/glow atau mengganti navy/teal.
- R-04 PASS: tidak menambahkan ikon.
- R-06 PASS: font dan hierarki tipografi aktif tidak diubah.
- R-07 PASS: tidak menambahkan pola latar.
- R-08 PASS: tidak menambahkan panah dekoratif.
- R-09 PASS: tidak menambahkan badge promosi.
- R-10 PASS: tidak menambahkan glassmorphism.
- R-12 PASS: tidak mengubah shadow permukaan aktif.
- R-13 PASS: tidak menambahkan glow.
- R-14 PASS: susunan kartu aktif tidak diubah.
- R-19 PASS: motion aktif tidak diubah; tes skeleton/reduced-motion tetap lulus.
- R-22 PASS: tidak membuat ilustrasi baru.
- Liveliness PASS: dials, fokus halaman, whitespace, aksen dan heading dipertahankan; screenshot dashboard dan form seluler diperiksa.
- C-1 PASS: setiap penghapusan memiliki bukti pada inventaris B.
- C-2 PASS: fungsi kontrol tetap dipertahankan dan skenario regresi lulus.
- C-3 PASS: hanya kode tanpa pemakai yang dihapus, struktur konten aktif tetap sama.
- C-4 PASS: breakpoint, keyboard dan state fixture yang dicatat lulus.
- C-5 PASS: tidak membuat klaim live delivery atau kesiapan produksi tanpa bukti.
- R-05 PASS: layout mengikuti data aplikasi yang sudah ada.
- R-11 PASS: radius komponen aktif tidak diubah.
- R-15 PASS: label tindakan UI tetap sama.
- R-16 PASS: tidak menambah copy pemasaran.
- R-20 PASS: identitas produk tetap sama.
- R-21 PASS: tema terang tetap sama.
- R-29 PASS: hanya menghapus token warna yang tidak digunakan.
- R-30 PASS: tidak menyalin desain produk lain.
- R-31 PASS: alasan perubahan adalah menghapus kode mati dan memperbaiki bukti verifikasi.

## K. Usulan commit

`chore: remove unused code and verify application integrity`

Review/stage hanya file dan hunks pada bagian D setelah meninjau perubahan
pengguna yang sudah ada. Tidak ada commit atau push yang dilakukan.
