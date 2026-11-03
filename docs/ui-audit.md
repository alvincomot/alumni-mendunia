# Audit UI Alumni Mendunia SMK

Tanggal: 29 Oktober 2026. Acuan: dashboard terbaru, root `DESIGN.md`, dan arahan pengguna. ENERGY 2 / RHYTHM 2 / MOTION 1. Warna biru menandai tindakan utama; tabel dan form menjadi fokus pekerjaan, dengan permukaan putih dan border halus.

## Temuan dan perbaikan

| Temuan | Perbaikan |
| --- | --- |
| Auth memakai teal dan branding kecil yang berbeda dari dashboard | Branding compact dan garis dekoratif dihapus; tombol memakai primary navy `#17324D` yang sama dengan navigasi aktif |
| Input, tombol, card, modal, dan focus ring berbeda antarhalaman | Token bersama, `form-control`, target minimum 44 px, radius kontrol 8 px dan card 12 px; card tanpa shadow |
| Identitas sekolah diduplikasi dengan gaya berbeda | `SchoolIdentity` dipakai pada hasil lookup dan pembuatan kata sandi; nama/NPSN serta fokus heading tetap tersedia |
| Sidebar mobile tersembunyi masih berpotensi menerima Tab | Drawer memakai Dialog Radix yang sudah terpasang: focus trap, Escape, dan pengembalian fokus; desktop memakai aside terpisah |
| Form alumni terlalu sempit pada 1024 px; stepper bertabrakan dengan ringkasan | Layout dua kolom dimulai pada `xl`; ringkasan ditumpuk di bawah form pada tablet; skeleton mengikuti breakpoint tersebut |
| Klik lanjut registrasi menghasilkan submit prematur | React memakai ulang tombol lanjut menjadi tombol submit pada event yang sama. `key` berbeda memisahkan kedua tombol; validasi dan server action tetap sama |
| Panel dashboard memiliki ruang kosong besar untuk sedikit data | Tinggi mengikuti isi; batas maksimum dan scroll dipertahankan pada desktop |
| Warna status persiapan dan aksi penonaktifan tidak konsisten | Persiapan memakai amber seperti badge detail; penonaktifan sekolah memakai destructive, pembatalan dialog tetap outline |
| Filter, tabel, toast, dan halaman error masih memiliki gaya berbeda | Kontrol, border, radius, focus ring, dan container diselaraskan; popup filter dibatasi tinggi viewport |

## Cakupan autentikasi

| State / layar | Bukti pengujian browser |
| --- | --- |
| NPSN awal | Validasi kosong, NPSN tidak ditemukan, string dengan nol di depan, fokus input |
| UNCLAIMED | Nama/NPSN, email aktivasi, validasi email, error layanan, retry, loading dan disabled |
| PENDING_ACTIVATION | Nama/NPSN, instruksi, kirim ulang, cooldown; tidak meminta alamat email tersimpan |
| ACTIVE | Nama/NPSN tetap terlihat saat password, login gagal/berhasil melalui mock, pemulihan sekolah, Ubah NPSN |
| SUSPENDED | Nama/NPSN dan pesan nonaktif; tidak ada tombol login |
| Dinas | Perpindahan mode dengan keyboard, form email/password, validasi dan pemulihan email |
| Buat / ubah kata sandi | Identitas sekolah, visibility toggle dengan keyboard, panjang/konfirmasi, tujuan redirect mock |
| Tautan tidak valid / kedaluwarsa | Halaman error nyata, callback/confirm tanpa token, aktivasi kedaluwarsa melalui fixture, navigasi kembali |

Server actions, callback/confirm routes, seluruh `lib/`, dan seluruh SQL migration identik dengan salinan awal sesi berdasarkan SHA-256. Perbandingan AST juga memastikan definisi state/handler sebelum JSX pada `SchoolLoginForm`, `LoginForm`, dan `UpdatePasswordForm` tidak berubah.

`20261028000200_native_school_self_activation.sql` tetap tidak disentuh dan tidak diterapkan oleh audit ini. Tidak ada perubahan Supabase Auth methods, RLS, account lifecycle, secrets, atau dependency. Diff Git keseluruhan memuat pekerjaan lokal yang sudah ada sebelum audit; daftar di bawah hanya perubahan sesi audit ini.

## Verifikasi

| Pemeriksaan | Hasil |
| --- | --- |
| `npm run lint` | PASS |
| `npx tsc --noEmit` | PASS |
| `npm run build` | PASS; 22 halaman statis diproses |
| `node --test tests/*.test.mjs` | PASS; 131 tes, 0 gagal |
| `node tests/password-recovery-browser.mjs` | PASS; empat state sekolah, recovery, password, error, loading/cooldown pada empat viewport |
| `node tests/ui-audit-browser.mjs` | PASS; delapan halaman aktual dengan data fiktif, empty/loading/error, dialog, navigasi keyboard, dan registrasi pada empat viewport |
| `node tests/school-auth-production-smoke.mjs` | PASS; server Next produksi, route auth nyata, redirect dashboard tanpa sesi, callback/error tanpa token |
| Kontras token | Primary/putih 12,40:1; hover/putih 8,72:1; destructive/putih 6,46:1; disabled 5,67:1; muted/putih 6,25:1 |

Viewport browser: **390, 768, 1024, 1440 px**, tinggi 900 px. Halaman aplikasi yang dijalankan: dashboard, alumni, detail alumni, registrasi dua langkah, sekolah, pengguna, laporan, dan audit log. Enam halaman daftar/dashboard juga diuji dalam state kosong dan loading. Tabel tetap dapat digulir di dalam container tanpa overflow dokumen. Drawer diuji dengan Tab berulang, Escape, dan pengembalian fokus.

Regresi registrasi mereproduksi satu event submit saat klik lanjut sebelum perbaikan. Setelah perbaikan: nol submit pada perpindahan langkah, tidak ada error negara prematur, submit kosong menampilkan error, pemilihan Jepang menghapus error, dan submit valid mencapai redirect melalui action mock.

Catatan pengujian: satu percobaan runner UI terhenti karena build dijalankan bersamaan dan mengganti file font `.next`. Runner dijalankan ulang setelah build selesai. Jalankan build sebelum runner browser, jangan bersamaan.

## Screenshot dan batas verifikasi

Screenshot tersimpan di direktori temporer lokal yang dicetak runner. Artefak auth terakhir:

`C:/Users/alvin/AppData/Local/Temp/alumni-recovery-ui-results-GxEfQV`

Contoh: `school-unclaimed-initial-390.png`, `school-pending_activation-initial-768.png`, `school-active-1440.png`, `school-suspended-initial-1024.png`, `school-password-create-390.png`, `school-activation-loading-390.png`, `school-activation-expired-390.png`.

Artefak smoke produksi: `C:/Users/alvin/AppData/Local/Temp/alumni-production-auth-hGOFS6`. Artefak dashboard/registrasi: `C:/Users/alvin/AppData/Local/Temp/alumni-ui-audit-2JPhMC`, termasuk `dashboard-1440.png`, `registration-1024.png`, dan `registration-placement-390.png`. Artefak temporer tidak dimasukkan ke Git dan dapat dibuat ulang.

Browser menggunakan Chrome headless. State login terautentikasi dan halaman dashboard memakai komponen halaman asli dengan boundary server yang di-mock, data fiktif, dan pemblokiran request eksternal. Verifikasi ini tidak membuktikan pengiriman SMTP, klik tautan email sungguhan, aktivasi hosted, atau mutasi database live. Callback sukses dan otorisasi juga dicakup tes unit dengan mock, bukan uji end-to-end hosted. Tidak ada akun atau data live yang diubah.

Build masih memberikan peringatan konfigurasi Next: `cacheComponents` aktif tanpa opsi `partialPrefetching`. Peringatan tersebut sudah ada dan konfigurasi tidak diubah dalam audit UI.

## File yang diubah dalam sesi ini

Token, primitive, dan dokumentasi:

- `DESIGN.md`
- `app/globals.css`
- `components/ui/button.tsx`
- `components/ui/input.tsx`
- `components/ui/password-input.tsx`
- `components/ui/card.tsx`
- `components/ui/dialog.tsx`
- `components/ui/toast.tsx`
- `components/ui/loading/chart-skeleton.tsx`
- `components/ui/loading/dashboard-skeleton.tsx`
- `components/ui/loading/form-skeleton.tsx`
- `components/ui/loading/page-skeleton.tsx`
- `docs/ui-audit.md` (baru)

Auth:

- `app/auth/login/page.tsx`
- `app/auth/forgot-password/page.tsx`
- `app/auth/update-password/page.tsx`
- `app/auth/access-denied/page.tsx`
- `app/auth/error/page.tsx`
- `components/login-form.tsx`
- `components/school-login-form.tsx`
- `components/update-password-form.tsx`
- `components/auth/school-identity.tsx` (baru)

Dashboard dan form:

- `app/dashboard/layout.tsx`
- `app/dashboard/page.tsx`
- `app/dashboard/error.tsx`
- `app/dashboard/alumni/page.tsx`
- `app/dashboard/alumni/[id]/page.tsx`
- `app/dashboard/schools/page.tsx`
- `app/dashboard/users/page.tsx`
- `app/dashboard/reports/page.tsx`
- `app/dashboard/audit-logs/page.tsx`
- `components/dashboard-sidebar.tsx`
- `components/dashboard-panel.tsx`
- `components/logout-button.tsx`
- `components/data/filters.tsx`
- `components/data/report-table.tsx`
- `components/monitoring/summary.tsx`
- `components/monitoring/distribution.tsx`
- `components/alumni/alumni-registration-form.tsx`
- `components/alumni/country-combobox.tsx`
- `components/alumni/page-frame.tsx`
- `components/alumni/placement-form.tsx`
- `components/alumni/status-action.tsx`
- `components/schools/school-dialog.tsx`
- `components/schools/school-account-dialog.tsx`
- `components/users/user-dialog.tsx`

Tes:

- `tests/password-recovery-browser.mjs`
- `tests/school-auth-production-smoke.mjs`
- `tests/ui-audit-browser.mjs` (baru)

Usulan commit: `style: align application ui with dashboard design`. Tidak ada staging, commit, atau push. Tinjau setiap diff sebelum staging karena beberapa file mengandung perubahan dari sesi sebelumnya.

## Anti-Slop Delivery Gate

Penilaian berikut berlaku pada perubahan dan skenario yang diaudit, dengan batas pengujian hosted di atas.

### Hard gate

- R-02 PASS: pencarian `app/` dan `components/` tidak menemukan em dash dalam copy UI.
- R-03 PASS: empat viewport tanpa overflow dokumen; regression check memastikan stepper berada di dalam form.
- R-17 PASS: kalkulasi statistik tidak berubah; angka fixture berasal dari dua alumni berlabel fiktif.
- R-18 PASS: tidak ada testimonial atau avatar orang yang ditambahkan.
- R-23 PASS: tidak ada aset baru; screenshot diminta pengguna dan memakai data fiktif.
- R-24 PASS: menu mempertahankan href route yang ada; auth navigation diuji pada server Next lokal.
- R-25 PASS: kontras token tombol, disabled, muted, dan footer hero dihitung; semua pasangan teks tersebut di atas 4,5:1.
- R-26 PASS: handler/href kontrol dipertahankan; klik login, recovery, registrasi, drawer, dialog, dan filter dijalankan dalam tes.
- R-27 PASS: runner memeriksa state kosong/loading/error serta auth success, cooldown, disabled, dan expired.
- R-28 PASS: tidak ada FAQ pada perubahan ini.
- R-32 PASS: mode login memakai arrow keys; password toggle, Tab drawer, Escape, dan pemulihan fokus diuji.
- R-33 PASS: perubahan ditulis langsung melalui patch source; tidak ada generator CSS pengganti source.
- R-34 PASS: aplikasi memakai satu tema terang; tidak ada toggle tema baru atau mode yang dihilangkan.
- R-35 PASS: build dan tiga runner browser dijalankan; hasil dan batas mock dicatat di atas.
- R-36 PASS: tidak ada klaim keamanan, sertifikasi, atau performa baru.
- R-37 PASS: arah berasal dari dashboard dan permintaan pengguna; dials dicatat sebelum perubahan.
- R-38 PASS: fixture menggunakan nama fiktif, dashboard fixture diberi penanda; produksi tetap memakai data existing.

### Purpose gate

- R-01 PASS: primary mengikuti dashboard; orb blur login dihapus, tanpa gradient baru.
- R-04 PASS: ikon existing menunjukkan sekolah, alumni, filter, pekerjaan, dan navigasi; tidak ada ikon dekoratif baru.
- R-06 PASS: Plus Jakarta Sans untuk heading dan Inter untuk isi mengikuti DESIGN.md yang sudah ada.
- R-07 PASS: background netral dan hero biru polos; tidak ada grid/dot pattern dekoratif.
- R-08 PASS: tidak menambah panah dekoratif pada tombol.
- R-09 PASS: badge menampilkan status/data; branding kecil di atas heading compact dihapus.
- R-10 PASS: blur topbar dihapus; surface solid.
- R-12 PASS: card/sidebar tanpa shadow; shadow pada overlay membantu membedakan lapisan interaktif.
- R-13 PASS: tidak ada glow setelah orb login dihapus.
- R-14 PASS: kartu statistik tetap mengelompokkan status alumni yang nyata; tidak menambah feature card.
- R-19 PASS: tidak menambah animasi dekoratif; indikator pending existing tetap menyatakan proses aktif dan reduced-motion tetap dipertahankan.
- R-22 PASS: tidak ada ilustrasi generik baru.

### Liveliness

- Dials PASS: ENERGY 2 / RHYTHM 2 / MOTION 1.
- Konsistensi dials PASS: aksen pada tindakan, konten tabel/form dominan, tanpa animasi dekoratif baru.
- Focal point PASS: tombol lanjut/masuk pada auth, form utama pada registrasi, statistik/status pada monitoring.
- Whitespace PASS: panel berukuran menurut isi; ringkasan ditumpuk pada tablet untuk menjaga lebar form.
- Accent PASS: satu keluarga royal-blue untuk tindakan/fokus, warna semantik hanya untuk status dan penolakan.
- Identity PASS: tipografi dan bahasa sekolah/NPSN/alumni mengikuti konteks produk, bukan copy pemasaran.
- Design Read PASS: referensi dashboard dan desain root menjadi sumber keputusan.

### Craftsmanship dan quality locks

- C-1 PASS: alasan warna, ukuran kontrol, radius, dan breakpoint dicatat pada tabel temuan.
- C-2 PASS: kontrol tetap terhubung ke handler/href; tes regresi menjaga aksi auth dan registrasi.
- C-3 PASS: halaman existing dipertahankan; tidak ada section pengisi baru.
- C-4 PASS: state auth, empat viewport, keyboard drawer/dialog, dan nama sekolah panjang diuji.
- C-5 PASS: hasil browser dan mock dipisahkan; tidak mengklaim pengujian email/database live.
- R-05 PASS: layout mengikuti pekerjaan form, daftar, atau monitoring; bukan template landing page baru.
- R-11 PASS: kontrol 8 px, card 12 px, pill hanya pada status/angka yang sesuai.
- R-15 PASS: CTA spesifik: Lanjutkan, Masuk, Kirim tautan aktivasi, Buat Kata Sandi, Simpan Alumni.
- R-16 PASS: tidak ada buzzword pemasaran pada copy baru.
- R-20 PASS: NPSN, sekolah, penempatan, dan status alumni tetap menjadi hierarki utama produk.
- R-21 PASS: tema terang existing dipertahankan sesuai desain dashboard.
- R-29 PASS: neutral/royal-blue ditambah warna status yang bermakna; token terpusat di globals.css.
- R-30 PASS: tidak menyalin tampilan produk lain; referensi milik proyek dipakai.
- R-31 PASS: setiap perubahan utama memiliki alasan pada tabel temuan dan DESIGN.md.

Checklist tambahan antislop-ui: palette PASS (DESIGN.md); accent PASS (CTA/fokus); emoji PASS (tidak ditambah); rhythm PASS (form/daftar/monitoring); bentuk template PASS (tidak ditambah); badge di atas H1 PASS (dihapus pada compact); navigation PASS (route existing); motion PASS (pending fungsional); effects PASS (flat); status dot PASS (dot aktivitas dekoratif dihapus); task layout PASS (struktur existing); angka/feed PASS (data atau fixture berlabel); placeholder PASS (instruksi isian); states PASS (runner); breakpoint/keyboard PASS (empat viewport dan tes fokus).
