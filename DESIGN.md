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
Accent: #087E8B
Background: #F7F9FC
Surface: #FFFFFF
Text Primary: #172B3A

Gunakan warna semantik untuk status dan notifikasi.

Hindari penggunaan terlalu banyak warna dalam satu halaman.

Gunakan border halus dan shadow ringan hanya ketika
membantu membedakan hierarki komponen.

## 4. Typography

Font utama: Geist atau Inter.

Gunakan hierarki tipografi yang konsisten:

- Page heading: 24–28px
- Section heading: 18–20px
- Body text: 14–16px
- Supporting text: 12–14px

Prioritaskan keterbacaan tabel, form, dan informasi dashboard.

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
