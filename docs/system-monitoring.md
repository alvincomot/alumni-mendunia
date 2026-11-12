# Monitoring Sistem

Dokumen ini menjelaskan implementasi Monitoring Sistem. Migration
`20261109000100_system_monitoring.sql` diterapkan ke project Supabase production
yang tertaut pada 9 November 2026. Tabel agregat tersedia dan mulai terisi
setelah frontend yang memuat pencatat pageview digunakan.

## Akses dan route

- Halaman utama: `/dashboard/monitoring`.
- Tab: Ringkasan Penggunaan, Audit Log, dan Kesehatan Sistem.
- `/dashboard/audit-logs` tetap tersedia sebagai redirect ke
  `/dashboard/monitoring?tab=audit` dan mempertahankan parameter filter.
- Seluruh halaman dan RPC ringkasan dibatasi untuk `admin_dinas`.
- `viewer_dinas` tidak mendapat akses baru karena kebijakan Audit Log existing
  bersifat admin-only.
- `petugas_sekolah` tidak dapat membaca agregat atau ringkasan lintas sekolah.

## Sumber metrik

| Metrik | Sumber | Definisi |
| --- | --- | --- |
| Pageview | `app_pageviews_daily` | Pembukaan route dashboard terautentikasi yang didukung |
| Tren dan halaman teratas | Agregat harian yang sama | Total per tanggal WIB dan normalized path |
| Lifecycle akun Sekolah | `schools` dan `app_private.school_auth_accounts` | Status `ACTIVE`, `UNCLAIMED`, `PENDING_ACTIVATION`, atau `SUSPENDED` |
| Sekolah mengubah data | `audit_logs` dan `profiles.school_id` | Sekolah dengan perubahan data, bukan login atau pageview |
| Penggunaan fitur | `audit_logs` dan `status_histories` | Mutasi tersimpan dan transisi keberangkatan yang benar-benar tercatat |
| Koneksi database | Query ringan saat tab dibuka | Hasil satu pemeriksaan, bukan uptime atau performa historis |

Sessions dan unique visitors tidak ditampilkan karena aplikasi tidak menyimpan
identifier analytics yang dapat menghitungnya secara akurat. Error aplikasi,
uptime, slow query, resource Vercel/Supabase, dan kuota Brevo juga tidak
ditampilkan sebagai angka karena belum ada integrasi resmi untuk sumber-sumber
tersebut.

## Privasi dan efisiensi

Telemetry pageview menyimpan hanya:

- tanggal WIB;
- normalized path dari allowlist;
- jumlah pageview;
- waktu pembaruan agregat.

ID alumni pada route detail dinormalisasi menjadi `/dashboard/alumni/[id]`.
Query string dan fragment ditolak. Tabel tidak mempunyai kolom user, IP, email,
NPSN, token, atau payload alumni. Penulisan memakai atomic upsert pada primary
key `(day, path)`, sehingga tidak membuat event mentah per kunjungan dan aman
untuk request bersamaan pada serverless.

Retensi adalah 400 hari. Baris lama dibersihkan ketika admin membuka Ringkasan
Penggunaan sehingga pageview biasa tidak memicu cleanup atau query analytics
berat. Ringkasan hanya dimuat ketika tab Ringkasan dibuka; query Audit Log dan
pemeriksaan kesehatan hanya dijalankan pada tab masing-masing.

## Langkah deployment aman

1. Migration, kebijakan RLS, fungsi `SECURITY DEFINER`, allowlist path, index,
   dan hasil tes PGlite telah ditinjau sebelum migration diterapkan.
2. Jangan mengedit atau menerapkan ulang migration yang sudah tercatat di hosted.
3. Verifikasi sebagai tiga role bahwa pageview dapat dicatat hanya untuk profil
   aktif, agregat hanya dapat dibaca admin, dan route lama tetap mengarah ke tab
   Audit Log.
4. Deploy aplikasi Next.js setelah migration tersedia. Jika aplikasi lebih dulu
   terdeploy, endpoint telemetry gagal secara nonfatal dan Ringkasan menampilkan
   bahwa migration belum tersedia.
5. Uji pageview dan ringkasan dengan data fiktif, lalu pantau beban database.
   Verifikasi live belum dianggap selesai sampai langkah ini dilakukan pada
   environment yang disetujui.

Migration monitoring telah diterapkan ke hosted. Tidak ada perubahan SMTP,
commit, atau push yang dilakukan.
