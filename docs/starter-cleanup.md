# Pembersihan starter

Pembersihan menghapus kode yang tidak terjangkau dari entry point aplikasi, bukan menghapus seluruh file bawaan Next.js. Penelusuran import memakai resolver TypeScript dari seluruh modul `app/`, `proxy.ts`, dan konfigurasi Tailwind. Pencarian referensi juga mencakup pengujian. Setelah pembersihan, tidak ditemukan komponen yang tidak terjangkau.

## File dihapus

| File | Alasan |
| --- | --- |
| `components/auth-button.tsx` | Tombol autentikasi starter tidak digunakan |
| `components/dashboard-navigation.tsx` | Navigasi lama sudah digantikan sidebar |
| `components/deploy-button.tsx` | Promosi deploy template tidak digunakan |
| `components/env-var-warning.tsx` | Peringatan starter tidak digunakan |
| `components/hero.tsx` | Halaman promosi starter tidak digunakan |
| `components/next-logo.tsx` | Hanya dipakai hero starter |
| `components/supabase-logo.tsx` | Hanya dipakai hero starter |
| `components/sign-up-form.tsx` | Form pendaftaran publik tidak digunakan; pengguna dikelola melalui undangan |
| `components/theme-switcher.tsx` | Tidak digunakan dan tidak memiliki provider tema pada layout aplikasi |
| `components/tutorial/code-block.tsx` | Hanya dipakai tutorial starter |
| `components/tutorial/connect-supabase-steps.tsx` | Tutorial konfigurasi starter tidak digunakan |
| `components/tutorial/fetch-data-steps.tsx` | Contoh tabel notes tidak digunakan |
| `components/tutorial/sign-up-user-steps.tsx` | Tutorial pendaftaran publik tidak digunakan |
| `components/tutorial/tutorial-step.tsx` | Hanya dipakai tutorial starter |
| `components/ui/badge.tsx` | Hanya dipakai peringatan starter |
| `components/ui/checkbox.tsx` | Hanya dipakai tutorial starter |
| `components/ui/dropdown-menu.tsx` | Hanya dipakai pengalih tema starter |
| `app/favicon.ico` | Ikon segitiga Vercel bawaan, diperiksa secara visual |
| `app/opengraph-image.png` | Gambar promosi Next.js Starter Kit, diperiksa secara visual |
| `app/twitter-image.png` | Gambar pratinjau starter, diperiksa secara visual |

Tiga aset terakhir sebelumnya dimuat otomatis oleh konvensi metadata Next.js, meskipun tidak memiliki import eksplisit. Penghapusannya disengaja untuk menghilangkan branding starter, bukan karena dianggap tidak memiliki pemakai. Tidak dibuat logo atau gambar pengganti tanpa arahan pemilik proyek.

## File lain yang berubah

- `package.json` dan `package-lock.json`: menghapus lima dependensi langsung yang hanya mendukung komponen tersebut: `@radix-ui/react-checkbox`, `@radix-ui/react-dropdown-menu`, `next-themes`, `lucide-react`, dan `tailwindcss-animate`. npm menghapus 39 paket termasuk dependensi transitif, tanpa menambahkan dependency proyek.
- `tailwind.config.ts`: menghapus plugin animasi yang tidak lagi dipakai dan glob direktori `pages/` serta `src/` yang tidak ada.
- `docs/starter-cleanup.md`: laporan ini.

Daftar di atas adalah cakupan perubahan untuk ditinjau/stage setelah persetujuan. Manifest dan konfigurasi sudah memiliki perubahan dari pekerjaan sebelumnya; tinjau hunks terkait, jangan stage seluruh worktree secara otomatis.

## Tetap dipertahankan

- Klien Supabase SSR/browser/admin, proxy, dan `hasEnvVars`: masih digunakan untuk sesi dan pemeriksaan konfigurasi.
- Komponen Button, Card, Input, Label dan utilitas styling: masih diimpor oleh fitur aktif.
- `/protected`, `/auth/sign-up`, `/auth/sign-up-success`: redirect kompatibilitas yang aman, bukan halaman demo atau pendaftaran publik.
- Konfigurasi Next.js, TypeScript, ESLint, PostCSS dan shadcn: entry point tooling, bukan file yang harus memiliki import aplikasi.
- `components.json` tetap menyebut pilihan library ikon untuk generator shadcn; ini bukan import runtime atau kebutuhan dependency untuk komponen saat ini.
- Skill, dokumentasi kebutuhan, migrasi, tes, kredensial lokal, dan seluruh fitur aktif. Tidak ada perubahan database atau konfigurasi Auth hosted.

## Pemulihan

Sembilan belas file yang dihapus sudah tercatat di Git dan dapat dipulihkan dari revisi sebelum penghapusan. `components/dashboard-navigation.tsx` belum tercatat di Git, sehingga salinan isinya disimpan sebelum dihapus pada:

`C:/Users/alvin/AppData/Local/Temp/alumni-starter-cleanup-fab71c9a654942c88b8478bd09764320/dashboard-navigation.tsx`

Cadangan tersebut bersifat sementara dan dapat terhapus oleh pembersihan folder Temp. Tidak ada commit atau push yang dibuat.

## Verifikasi

- PASS: `npm.cmd run lint`.
- PASS: `npx.cmd tsc --noEmit`.
- PASS: `npm.cmd run build`. Warning lama tentang `cacheComponents` tanpa `partialPrefetching` tetap ada.
- PASS: 61 tes pada `alumni.test.mjs`, `schools.test.mjs`, `placement-status.test.mjs`, `mvp.test.mjs`, dan `users-admin.test.mjs`.
- PASS: 12 kelompok uji browser pada komponen aktual dan CSS build terbaru, menggunakan data fiktif serta mock Auth/action/router. Cakupan mencakup login, logout, pemulihan kata sandi, navigasi role, dialog undangan/pemulihan/edit pengguna, validasi, pending, error/retry, dan ukuran 320/375/768/1280 px. Tidak ditemukan error runtime/console.
- PASS: smoke test server production, delapan URL terproteksi mengarahkan pengguna tanpa sesi ke login; empat halaman autentikasi dapat dimuat; konfirmasi tanpa token ditolak dan URL signup tetap redirect.
- PASS: HTML login mempertahankan judul aplikasi tanpa metadata gambar/favicon starter. Ketiga URL aset yang dihapus mengembalikan 404.
- PASS: penelusuran import setelah penghapusan menghasilkan nol komponen yang tidak terjangkau; tidak ada referensi source aktif ke modul yang dihapus.

Uji browser memakai fixture lokal yang didokumentasikan pada `docs/user-management-verification.md`, bukan akun Supabase live. Tes SQL tidak diulang karena tidak ada perubahan database. Aplikasi sekarang tidak menyediakan favicon atau social-preview image khusus; aset bermerek aplikasi dapat ditambahkan setelah arahan desain tersedia.

## Pemeriksaan Anti-Slop untuk cakupan pembersihan

Tidak ada antarmuka baru yang dirancang. Arah navy/teal dan ENERGY 2 / RHYTHM 2 / MOTION 1 dari DESIGN.md tetap dipertahankan; pemeriksaan berikut menilai perubahan, bukan mengulang klaim untuk seluruh produk.

- R-02 PASS: teks baru laporan ini tidak menggunakan em dash.
- R-03 PASS: fixture browser tidak mengalami overflow halaman/dialog pada empat ukuran layar.
- R-17 PASS: tidak ada statistik aplikasi baru yang ditambahkan.
- R-18 PASS: tidak ada testimonial atau identitas orang yang ditambahkan.
- R-23 PASS: aset starter dihapus tanpa membuat identitas visual pengganti.
- R-24 PASS: navigasi aktif tetap mengarah ke route yang tersedia; redirect lama dipertahankan.
- R-25 PASS: palette aktif tidak berubah; kontras teks fixture terukur minimal 5,82:1.
- R-26 PASS: kontrol aktif diuji kembali; hanya komponen tanpa pemakai yang dihapus.
- R-27 PASS: state pending, error/retry, success dan empty pada fixture tetap berjalan.
- R-28 PASS: tidak ada FAQ ditambahkan.
- R-32 PASS: navigasi keyboard, Escape dan pemulihan fokus diuji dalam fixture.
- R-33 PASS: perubahan source menggunakan apply_patch; npm hanya merapikan dependency dan lockfile.
- R-34 PASS: pengalih tema yang tidak terpasang dihapus, tidak ada mode tema baru.
- R-35 PASS: build, smoke HTTP dan click-through fixture dilakukan setelah pembersihan.
- R-36 PASS: hasil pengujian dibatasi pada cakupan yang benar-benar dijalankan.
- R-37 PASS: DESIGN.md dibaca; tidak ada arah visual baru atau perubahan layout aktif.
- R-38 PASS: tidak ada konten produksi buatan; data pengujian diberi identitas fiktif.
- R-01 PASS: tidak ada gradient/glow baru.
- R-04 PASS: tidak ada ikon dekoratif baru.
- R-06 PASS: font aplikasi tidak diubah.
- R-07 PASS: tidak ada pola latar baru.
- R-08 PASS: tidak ada panah dekoratif baru.
- R-09 PASS: badge starter tanpa pemakai dihapus, tidak diganti badge promosi.
- R-10 PASS: tidak ada glassmorphism baru.
- R-12 PASS: shadow komponen aktif tidak diubah.
- R-13 PASS: tidak ada glow baru.
- R-14 PASS: tidak ada grid kartu baru.
- R-19 PASS: plugin animasi dihapus setelah pencarian memastikan tidak ada class animasi yang dipakai fitur aktif.
- R-22 PASS: tidak ada ilustrasi baru.
- Liveliness PASS: dials, focal point, whitespace, aksen teal dan pola heading aplikasi tetap sama; tidak ada generasi desain baru.
- C-1 PASS: setiap penghapusan memiliki alasan pada tabel inventaris.
- C-2 PASS: fungsi kontrol aktif lulus pengujian ulang.
- C-3 PASS: kode promosi/tutorial yang tidak melayani fitur aplikasi dihapus.
- C-4 PASS: breakpoint, keyboard dan state interaksi diuji dalam fixture.
- C-5 PASS: tidak ada klaim keamanan atau performa baru.
- R-05 PASS: layout data-first tidak berubah.
- R-11 PASS: radius komponen aktif tidak berubah.
- R-15 PASS: label tindakan aplikasi tidak berubah.
- R-16 PASS: tidak ada jargon pemasaran baru.
- R-20 PASS: branding starter dihapus, nama produk tetap ada pada metadata aplikasi.
- R-21 PASS: tema light aplikasi tetap digunakan.
- R-29 PASS: tidak ada warna baru.
- R-30 PASS: tidak ada desain produk lain yang disalin.
- R-31 PASS: alasan perubahan adalah menghapus kode mati dan branding starter, bukan mengubah selera visual.

Usulan commit: `chore: remove unused starter files and dependencies`
