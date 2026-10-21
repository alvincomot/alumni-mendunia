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

Fitur yang direncanakan meliputi:

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

Buat file `.env.local` berdasarkan `.env.example`, kemudian isi konfigurasi Supabase:

```env
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

Jangan memasukkan database password atau secret key ke variabel `NEXT_PUBLIC_*`.

Jalankan development server:

```bash
npm run dev
```

Buka `http://localhost:3000` pada browser.

## Project Documentation

Dokumentasi pengembangan akan disimpan dalam folder `docs/`, termasuk:

- Software Requirements Specification (SRS)
- Use Case dan Activity Diagram
- Entity Relationship Diagram (ERD)
- Dokumentasi database dan migration

Instruksi pengembangan tersedia dalam `AGENTS.md`, sedangkan pedoman desain antarmuka berada dalam `DESIGN.md`.

## Development Status

**Status: Early Development / Prototype**

Proyek masih dalam tahap pengembangan awal. Skema database, keamanan RLS, dan fitur bisnis Alumni Mendunia masih dalam proses implementasi.

Selama tahap prototipe, sistem hanya menggunakan data fiktif. Penggunaan data pribadi alumni yang sebenarnya memerlukan persetujuan, pengamanan, dan infrastruktur yang sesuai ketentuan instansi.

## Project Notes

Repository ini digunakan untuk mendokumentasikan pengembangan aplikasi secara bertahap dan mempermudah pemeliharaan maupun kelanjutan pengembangan oleh tim teknis yang berwenang.
