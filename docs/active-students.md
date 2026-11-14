# Data Murid Aktif

Modul Data Murid Aktif mendata murid kelas 10–13 yang berminat mengikuti
persiapan kerja ke luar negeri. Modul ini terpisah dari Data Alumni dan tidak
melakukan konversi otomatis ketika murid lulus.

## Akses

- `petugas_sekolah`: membaca, menambah, mengubah, melihat riwayat, dan
  menghapus permanen data pada sekolahnya sendiri.
- `admin_dinas`: membaca data dan statistik lintas sekolah tanpa hak ubah atau
  hapus.
- `viewer_dinas`: membaca data dan statistik lintas sekolah sesuai kebijakan
  read-only existing.

`school_id`, identitas petugas, dan waktu persetujuan wali ditetapkan di
database dari sesi terautentikasi. Nilai sekolah dari browser tidak digunakan
sebagai dasar otorisasi.

## Antarmuka

- `/dashboard/murid-aktif`: daftar, statistik, filter, detail, edit, dan hapus
  sesuai kewenangan role.
- `/dashboard/murid-aktif/new`: form tambah dua langkah untuk Petugas Sekolah,
  dengan ringkasan input dan identitas sekolah yang diperoleh dari sesi.

## Tabel

### `public.active_students`

Menyimpan identitas minimum murid, kelas, status KJP, bukti konfirmasi
persetujuan wali, status pelatihan, lembaga wajib, status penempatan, negara/tanggal
penempatan kondisional, serta `data_year` sebagai Tahun Pendataan pertama.

`data_year`, sekolah, bukti persetujuan, dan metadata pembuatan tidak dapat
diubah setelah insert. Status penempatan `belum` selalu membersihkan negara dan
tanggal; status `sudah` mewajibkan keduanya.

### `public.active_student_histories`

Mencatat nilai sebelum/sesudah untuk status pelatihan, lembaga, status
penempatan, negara, dan tanggal penempatan. Status awal dicatat pada transaksi
insert. Histori menggunakan `ON DELETE CASCADE` karena kebijakan modul adalah
hard delete tanpa restore.

### `public.audit_logs`

Migration menambahkan `school_id` opsional dan tipe entitas
`active_students`. Audit hanya menyimpan actor, aksi, tipe entitas, UUID record,
sekolah, dan waktu. Nama murid maupun snapshot data tidak disimpan. Dengan
demikian catatan penghapusan tetap akuntabel tanpa mempertahankan PII setelah
hard delete.

## Migration dan deployment

Migration forward-only:

`supabase/migrations/20261112000100_active_students.sql`

Migration telah diterapkan ke hosted Supabase proyek `alumni-mendunia` dan
riwayat lokal/remote diverifikasi sinkron pada 12 November 2026. Deployment
source aplikasi tetap dilakukan terpisah setelah regression test dan review
perubahan kode selesai.

Migration lanjutan berikut diterapkan ke hosted Supabase pada 14 November 2026:

`supabase/migrations/20261113000100_require_active_student_fields_and_fix_history.sql`

Migration tersebut mewajibkan status KJP dan nama lembaga untuk penulisan baru,
serta memperbaiki referensi kolom ambigu pada RPC riwayat. Validasi server dan
fallback pembacaan riwayat tetap dipertahankan sebagai perlindungan saat terjadi
kegagalan infrastruktur.

