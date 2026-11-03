# Alumni Mendunia SMK

Sistem informasi berbasis web untuk pendataan dan monitoring alumni Sekolah Menengah Kejuruan (SMK) Provinsi DKI Jakarta yang mendapatkan penempatan kerja di luar negeri.

Proyek ini dikembangkan sebagai prototipe untuk membantu sekolah melakukan pendataan alumni serta mendukung Dinas Pendidikan dalam memantau status penempatan dan pekerjaan alumni.

## Tech Stack

- **Framework:** Next.js (App Router)
- **Language:** TypeScript
- **UI:** Tailwind CSS dan shadcn/ui
- **Database:** Supabase PostgreSQL
- **Authentication:** Supabase Auth
- **Authorization:** PostgreSQL Row Level Security (RLS)
- **Deployment:** Direncanakan menggunakan platform yang sesuai kebutuhan proyek

## User Roles

| Role            | Hak Akses                                                                               |
| --------------- | --------------------------------------------------------------------------------------- |
| Admin Dinas     | Mengelola sekolah dan akun pengguna, memantau seluruh alumni, serta mengakses audit log |
| Viewer Dinas    | Melihat data alumni dan informasi monitoring seluruh sekolah                            |
| Petugas Sekolah | Mengelola alumni serta memperbarui status penempatan pada sekolah masing-masing         |

## Main Features

Fitur yang sudah tersedia dalam implementasi prototipe:

- Autentikasi dan otorisasi berdasarkan role
- Pendataan alumni oleh petugas sekolah
- Pencatatan penempatan kerja di luar negeri
- Pembaruan dan riwayat status penempatan
- Dashboard monitoring untuk sekolah dan Dinas
- Pengelolaan sekolah dan akun pengguna
- Audit log aktivitas administratif

Status penempatan yang digunakan:

- `persiapan_berangkat`
- `aktif_bekerja`
- `selesai_kontrak`
- `batal_berangkat`

## Getting Started

### Prerequisites

Pastikan tersedia:

- Node.js versi yang kompatibel dengan proyek
- npm
- Git
- Supabase project

### Installation

Clone repository:

```bash
git clone https://github.com/alvincomot/alumni-mendunia.git
cd alumni-mendunia
```

Install dependencies:

```bash
npm install
```

Buat file `.env.local` berdasarkan `.env.example`. Isi URL dan publishable key
Supabase, `SUPABASE_SECRET_KEY` khusus server, origin aplikasi `APP_SITE_URL`,
serta `SUPABASE_AUTH_EMAIL_OTP_EXPIRY_SECONDS` yang sama dengan pengaturan Auth.
Lihat [panduan setup](docs/mvp-setup.md) dan
[aktivasi sekolah](docs/school-self-activation.md) untuk prasyarat migrasi,
undangan, dan konfigurasi SMTP.

Jangan memasukkan database password atau secret key ke variabel `NEXT_PUBLIC_*`.

Jalankan development server:

```bash
npm run dev
```

Buka `http://localhost:3000` pada browser.

## Project Documentation

Dokumentasi implementasi dan verifikasi tersedia di `docs/`:

- [Setup aplikasi dan database](docs/mvp-setup.md)
- [Alur aktivasi sekolah dan prosedur rilis](docs/school-self-activation.md)
- [Konfigurasi email pemulihan](docs/password-recovery-email-setup.md)
- [Verifikasi manajemen pengguna](docs/user-management-verification.md)
- [Cleanup aplikasi dan audit regresi terbaru](docs/application-cleanup-audit.md)
- [State formulir dan navigasi setelah simpan](docs/form-state-navigation-audit.md)

SRS, Activity Diagram, dan ERD formal belum tersedia dalam repository.
Laporan verifikasi lama mencatat kondisi saat laporan dibuat; gunakan panduan
aktivasi sekolah untuk alur autentikasi saat ini.

Instruksi pengembangan tersedia dalam `AGENTS.md`, sedangkan pedoman desain antarmuka berada dalam `DESIGN.md`.

## Development Status

**Status: Prototipe fungsional, verifikasi hosted masih diperlukan**

Skema database, RLS, dan fitur bisnis telah diimplementasikan serta memiliki
pengujian lokal. Kelulusan tes lokal tidak membuktikan migrasi sudah diterapkan
di hosted Supabase atau email benar-benar terkirim. Ikuti pemeriksaan rilis
dalam dokumentasi sebelum memakai aplikasi di produksi.

Selama tahap prototipe, sistem hanya menggunakan data fiktif. Penggunaan data pribadi alumni yang sebenarnya memerlukan persetujuan, pengamanan, dan infrastruktur yang sesuai ketentuan instansi.

## Project Notes

Repository ini digunakan untuk mendokumentasikan pengembangan aplikasi secara bertahap dan mempermudah pemeliharaan maupun kelanjutan pengembangan oleh tim teknis yang berwenang.
