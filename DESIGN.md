# DESIGN.md — Alumni Mendunia SMK

## 1. Design Identity

Product: Alumni Mendunia SMK
Type: Education Monitoring Dashboard
Target: Dinas Pendidikan Provinsi DKI Jakarta

Design direction:
Modern, professional, clean, and trustworthy.

Aplikasi harus terasa seperti sistem administrasi pendidikan
yang modern, bukan landing page SaaS atau template AI generik.

## 2. Design Principles

- Clarity over decoration
- Functionality over visual effects
- Consistency across pages
- Accessible for non-technical users
- Data-first interface
- Efficient daily workflows

Prioritaskan kemudahan penggunaan oleh petugas sekolah
dan pengguna Dinas.

## 3. Visual Style

Primary: #17324D
Accent / focus: #087E8B
Background: #F7F9FB
Surface: #FFFFFF
Text Primary: #191C1E

Tombol utama dan navigasi aktif menggunakan token `primary` yang sama.
Gunakan `Button` bersama tanpa override warna lokal. Tombol outline memakai
border halus dan teks gelap; aksi penolakan memakai `destructive` (#BA1A1A).
State disabled memakai permukaan netral dan teks muted yang tetap terbaca.
Input menggunakan `form-control`, tinggi minimum 44px, radius 8px, dan fokus
biru yang terlihat. Card memakai radius 12px, border halus, dan tanpa shadow;
shadow terbatas pada dialog, popover, dan toast yang melayang di atas konten.
Sidebar dan topbar memakai permukaan putih. Navy gelap menjadi identitas utama,
sedangkan teal dipakai secara terbatas untuk accent dan fokus yang terlihat.

Gunakan warna semantik untuk status dan notifikasi.

Hindari penggunaan terlalu banyak warna dalam satu halaman.

Gunakan border halus dan shadow ringan hanya ketika
membantu membedakan hierarki komponen.

## 4. Typography

Gunakan tepat dua keluarga font melalui `next/font/google`:

- Plus Jakarta Sans (`font-heading`) untuk branding, judul halaman,
  judul bagian, judul kartu, dialog, dan heading autentikasi.
- Inter (`font-sans`) untuk navigasi, isi, tabel, form, tombol,
  statistik, bagan, notifikasi, metadata, dan pesan validasi.

Skala standar:

- Branding aplikasi: 16px / 700 / line-height 24px
- Judul halaman (H1): 24px / 700 / line-height 32px
- Judul bagian (H2): 18px / 600 / line-height 28px
- Judul kartu (H3): 16px / 600 / line-height 24px
- Hero autentikasi: 36px, meningkat ke 48px pada layar lebar / 700
- Angka statistik: 28px, meningkat ke 32px pada layar lebar / 700
- Navigasi: 14px / 500–600
- Isi dan tabel: 14px / 400–500 / line-height 24px
- Label form: 13px / 500 / line-height 20px
- Nilai input: 14px / 400; 16px di layar kecil bila diperlukan
  untuk mencegah pembesaran otomatis browser
- Tombol: 14px / 600
- Teks pendukung: 13px / 400 / line-height 20px
- Metadata dan waktu: 12px / 400 / line-height 20px

Gunakan utility bersama `type-brand`, `type-page-title`,
`type-section-title`, `type-card-title`, `type-auth-hero`, `type-body`,
`type-label`, `type-supporting`, `type-meta`, dan `type-stat`. Gunakan
`tracking-tight` hanya pada heading menonjol serta `tabular-nums` untuk
angka statistik dan angka yang perlu sejajar. Semua halaman baru mewarisi
Inter dari root layout; jangan mengimpor font kembali pada level halaman.
Pertahankan line-height yang terbaca, pembungkusan teks panjang, dan ukuran
minimum yang tetap nyaman pada perangkat seluler.

## 5. Layout System

Desktop:

- Sidebar navigation di sebelah kiri
- Header di bagian atas
- Main content area
- Spacing konsisten dengan sistem 4px/8px

Mobile:

- Collapsible sidebar atau mobile navigation
- Layout responsif
- Form dengan satu kolom jika diperlukan
- Tabel panjang dapat menggunakan horizontal scroll
  atau tampilan kartu yang tetap mudah dibaca

Hindari ruang kosong berlebihan.

## 6. Navigation

Admin Dinas:

- Dashboard
- Data Alumni
- Data Sekolah
- Manajemen Pengguna
- Audit Log

Viewer Dinas:

- Dashboard
- Data Alumni
- Laporan

Petugas Sekolah:

- Dashboard
- Data Alumni
- Riwayat Status

Tampilkan menu sesuai role pengguna.

## 7. Dashboard

Gunakan ringkasan statistik yang relevan:

- Total alumni
- Persiapan berangkat
- Aktif bekerja
- Selesai kontrak
- Batal berangkat
- Distribusi negara tujuan

Untuk Dinas, tampilkan statistik lintas sekolah.
Untuk petugas, tampilkan data sekolah sendiri.

Gunakan grafik hanya jika mempermudah interpretasi data.

## 8. Data Tables

Tabel alumni harus mendukung:

- Search
- Filter
- Pagination
- Sorting bila diperlukan
- Status badges
- Row actions

Tombol aksi harus mudah dibedakan.

Jangan menampilkan terlalu banyak tombol dalam satu baris.

Aksi penting harus menggunakan confirmation dialog.

## 9. Forms

Gunakan React Hook Form, Zod, dan shadcn/ui.

Aturan:

- Label harus jelas.
- Field wajib harus ditandai.
- Tampilkan validasi dekat field terkait.
- Gunakan dropdown untuk pilihan status.
- Kelompokkan form menurut jenis informasi.
- Jangan meminta data yang tidak relevan.
- Sediakan tombol Batal dan Simpan.

Gunakan Bahasa Indonesia yang sederhana.

## 10. Status Presentation

Persiapan Berangkat:
Neutral / Amber

Aktif Bekerja:
Green / Success

Selesai Kontrak:
Neutral / Slate

Batal Berangkat:
Red / Danger

Status harus selalu memiliki label teks,
tidak hanya dibedakan menggunakan warna.

## 11. Interaction & Feedback

- Gunakan hover dan focus states yang jelas.
- Tampilkan loading saat proses berlangsung.
- Tampilkan pesan sukses setelah penyimpanan berhasil.
- Tampilkan error yang mudah dipahami.
- Gunakan dialog konfirmasi untuk perubahan penting.
- Pastikan navigasi keyboard dapat digunakan.
- Usahakan kontras teks memenuhi WCAG AA.

Gunakan animasi secara halus dan seperlunya.

### Reusable Form UX

- Dialog untuk penyimpanan rutin harus menutup otomatis setelah server
  mengonfirmasi keberhasilan, mereset state formulir, dan memperbarui data
  tanpa reload penuh browser.
- Jika penyimpanan gagal, pertahankan dialog dan nilai input agar pengguna
  dapat memperbaiki atau mencoba kembali.
- Gunakan toast singkat berbahasa Indonesia untuk keberhasilan rutin. Error
  validasi tetap ditampilkan di dekat field terkait.
- Gunakan validasi aplikasi dengan pesan inline berbahasa Indonesia dan
  `noValidate` ketika constraint browser digantikan oleh Zod atau validasi
  aplikasi.
- Input kata sandi yang diisi pengguna harus menyediakan tombol tampilkan
  atau sembunyikan dengan target sentuh yang nyaman dan label aksesibel.
- Kata sandi pilihan pengguna minimal 8 karakter tanpa kewajiban kombinasi
  huruf besar, huruf kecil, angka, atau simbol. Kata sandi sementara yang
  dibuat sistem tetap harus acak dan kuat.
- Hindari langkah konfirmasi tambahan untuk penyimpanan rutin. Pertahankan
  konfirmasi untuk tindakan yang mengubah akses, status penting, atau data
  sensitif.
- Penyerahan kredensial sekali lihat dan alur keamanan lain tidak boleh
  menutup otomatis sebelum pengguna menyelesaikan tindakan yang diwajibkan.
- Gunakan ukuran kontrol sekurangnya 44px, fokus yang terlihat, label yang
  langsung, serta pesan singkat agar formulir nyaman digunakan oleh pengguna
  lanjut usia dan pengguna dengan pengalaman teknis terbatas.

## 12. Anti-Slop Design Direction

Dial: ENERGY 2 / RHYTHM 2 / MOTION 1

Ikuti skill Anti-Slop yang terpasang.

Hindari:

- Gradient dekoratif berlebihan
- Glassmorphism tanpa kebutuhan
- Animasi yang mengganggu
- Penggunaan card untuk semua elemen
- Tombol dengan aksi palsu
- Icon dekoratif yang tidak diperlukan
- Layout generik tanpa hierarki informasi

Desain tetap perlu memiliki karakter visual,
bukan sekadar minimalis tanpa arah.

## 13. Design Quality Checklist

Sebelum menyelesaikan pekerjaan UI, periksa:

- Apakah layout responsif?
- Apakah navigasi mudah digunakan?
- Apakah semua tombol mempunyai fungsi?
- Apakah status mudah dibedakan?
- Apakah loading, error, dan empty states tersedia?
- Apakah informasi mudah dibaca?
- Apakah visual konsisten dengan DESIGN.md?
- Apakah aturan Anti-Slop yang relevan sudah diterapkan?

Laporkan masalah desain yang belum terselesaikan.
