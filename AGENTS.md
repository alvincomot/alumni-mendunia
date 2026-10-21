<!-- antislop:start -->
## antislop
For UI, copy, people, mobile layout, or code comments work, read these installed skill files directly (use these paths even if a same-named global skill exists):
- Core filter, always on: `antislop`: `.codex/skills/antislop/SKILL.md`
Before starting, follow the core's "Two Usage Modes" section in strict order: explicit session instruction first, then global preference, then ask. A session instruction always wins. For a resolved mode, say `antislop active: <mode> (session override).` or `antislop active: <mode> (global preference).` once before presenting findings or making edits, using the actual mode and source. Acknowledging the user's request without naming the source does not replace this notice.
Only an explicit choice of antislop during or after selects a session mode. A request to review, audit, or avoid file edits does not select a mode; read the global preference in that case. Another skill's mode does not select antislop's mode.
If the mode is unresolved, ask during/after and end the response; wait for the answer before any UI review, planning, or concept. For read-only tasks, put the active-mode notice only at the start of the final answer, never in progress messages. For editing tasks, announce before the first edit and omit it from the final answer.
To update antislop later: `npx antislop-ai --update`, or run `npx antislop-ai` and pick Overwrite them.
<!-- antislop:end -->

# Alumni Mendunia SMK — Project Instructions

## Project Overview

Alumni Mendunia SMK adalah sistem informasi berbasis web
untuk pendataan dan monitoring alumni SMK Provinsi DKI Jakarta
yang bekerja di luar negeri.

Proyek ini merupakan prototipe fungsional yang dikembangkan
oleh satu fullstack developer dan berpotensi dilanjutkan
oleh tim Pusdatin.

Seluruh data selama tahap prototipe harus fiktif.

## Tech Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui
- Supabase PostgreSQL
- Supabase Authentication
- Supabase Row Level Security (RLS)
- React Hook Form + Zod
- TanStack Table
- Recharts
- Vercel (deployment)

Jangan menambahkan framework atau dependency baru tanpa
alasan teknis yang jelas.

## Source of Truth

Dokumentasi pada folder `docs/` menjadi acuan kebutuhan:

- SRS: fitur, pengguna, dan aturan bisnis
- Activity Diagram: alur proses sistem
- ERD: struktur dan hubungan database

Periksa dokumentasi sebelum mengimplementasikan fitur terkait.

Jangan mengasumsikan database, API, atau tabel sudah tersedia.
Periksa implementasi yang benar-benar ada dalam repository.

Jika dokumentasi bertentangan dengan implementasi,
laporkan perbedaannya sebelum membuat perubahan besar.

## User Roles

1. admin_dinas
   - Mengelola sekolah dan akun pengguna
   - Melihat data seluruh sekolah
   - Mengakses audit log administratif

2. viewer_dinas
   - Melihat dashboard dan data seluruh sekolah
   - Melihat riwayat status
   - Tidak dapat mengubah data alumni

3. petugas_sekolah
   - Mengelola alumni sekolah sendiri
   - Memperbarui status alumni
   - Melihat riwayat status alumni sekolah sendiri

## Alumni Status

Status utama:
- persiapan_berangkat
- aktif_bekerja
- selesai_kontrak

Status pengecualian:
- batal_berangkat

Aturan:
- Tombol "Konfirmasi Berangkat" hanya tersedia ketika
  status alumni masih persiapan_berangkat.
- Konfirmasi keberangkatan mengubah status menjadi aktif_bekerja.
- Selesai kontrak dilakukan melalui halaman detail alumni.
- Semua perubahan status harus tercatat dalam status_histories.
- Data sekolah langsung terlihat di dashboard Dinas
  tanpa proses approval.

Jangan menambahkan status baru tanpa persetujuan.

## Database & Security

Database utama menggunakan Supabase PostgreSQL.

Tabel:
- schools
- profiles
- alumni
- placements
- status_histories
- audit_logs

Aturan keamanan:
- Terapkan otorisasi pada server dan database melalui RLS.
- Jangan mempercayai role atau school_id dari input client.
- Jangan mengekspos service_role key ke browser.
- Jangan menyimpan kredensial di source code.
- Jangan menggunakan data pribadi alumni asli pada prototipe.
- Perubahan status dan pencatatan riwayat harus atomik.
- Perubahan skema database dan RLS harus mendapat persetujuan.

## UI & Design

Untuk pekerjaan antarmuka:
1. Baca DESIGN.md sebelum mulai membuat UI.
2. Ikuti instruksi skill Anti-Slop yang terpasang di proyek.
3. Gunakan komponen shadcn/ui bila sesuai.
4. Pastikan desain responsif dan aksesibel.
5. Gunakan Bahasa Indonesia pada antarmuka.
6. Sediakan loading, error, dan empty states.

Jangan mengabaikan mode dan aturan penggunaan
yang ditetapkan oleh skill Anti-Slop.

## Coding Standards

- Gunakan TypeScript dengan tipe yang jelas.
- Hindari penggunaan any tanpa alasan.
- Gunakan penamaan variabel dan fungsi berbahasa Inggris.
- Gunakan struktur modular berbasis fitur.
- Pisahkan logika bisnis dari komponen presentasi.
- Hindari duplikasi kode.
- Jangan melakukan refactor besar tanpa diminta.
- Gunakan komentar hanya ketika menambah kejelasan.

## Development Workflow

- Kerjakan satu fitur dalam satu tahap.
- Periksa struktur proyek sebelum membuat file baru.
- Jelaskan rencana sebelum perubahan yang kompleks.
- Jangan mengubah file di luar cakupan tugas.
- Gunakan mock data yang diberi penanda jelas jika
  database belum terintegrasi.
- Jalankan lint, typecheck, dan pengujian yang relevan.
- Setelah implementasi, jelaskan file yang berubah,
  hasil pengujian, dan masalah yang masih tersisa.
- Pastikan proyek mudah dipahami developer berikutnya.


## Git & Commit Message Guidelines

Use Conventional Commits without scopes.

### Commit Format

type: short description

### Allowed Types

- feat: New features
- fix: Bug fixes
- refactor: Code restructuring without behavior changes
- style: Code formatting or visual styling changes
- docs: Documentation changes
- test: Adding or updating tests
- chore: Maintenance and configuration changes
- perf: Performance improvements
- build: Build system or dependency changes
- ci: CI/CD configuration changes

### Commit Message Rules

1. Always write commit messages in English.
2. Use the format: type: short description.
3. Never include scopes, such as feat(auth): or fix(ui):.
4. Use lowercase for the type and description.
5. Use the imperative mood (add, implement, fix, remove).
6. Keep the subject concise, preferably under 72 characters.
7. Do not end the subject with a period.
8. Describe the actual change clearly.
9. Avoid vague messages such as "update files" or "fix bugs".
10. Use a commit body when additional explanation is necessary.

### Git Workflow

After completing a meaningful development task:

1. Run git status and inspect the changes.
2. Review relevant diffs before suggesting a commit.
3. Group related changes into one logical commit.
4. Suggest one professional commit message in English.
5. Use the format without scopes.
6. Show which files should be staged.
7. Wait for explicit user approval before committing.
8. Never push to GitHub without explicit user approval.
9. Never commit secrets, credentials, or sensitive data.
10. Do not stage unrelated changes.

### Examples

feat: implement alumni registration form
feat: add departure confirmation workflow
feat: display alumni status statistics
fix: prevent unauthorized school data access
fix: correct status transition validation
refactor: extract reusable form components
style: improve responsive dashboard layout
docs: update entity relationship diagram
test: add role-based access control tests
chore: configure codex and anti-slop

### Task Completion Report

After completing a task, provide:

- Summary of changes
- Modified files
- Test results
- Suggested commit message
- Remaining issues, if any

Do not automatically commit or push changes.


## Definition of Done

A development task is considered complete only when:

1. The implementation meets the requested requirements.
2. The code follows the existing project architecture.
3. TypeScript has no new type errors.
4. ESLint checks pass.
5. Relevant functionality has been tested.
6. UI changes follow DESIGN.md and Anti-Slop rules.
7. Loading, error, and empty states are handled where needed.
8. No secrets or sensitive data are exposed.
9. Existing functionality is not unintentionally broken.
10. The changes are ready for review.

### Quality Checks

After implementing a feature, run the relevant checks:

- npm run lint
- npx tsc --noEmit
- npm run build

Only run commands supported by the project.

If a check fails:
- Explain the error.
- Fix issues caused by the current changes.
- Report unresolved issues clearly.

Never claim that tests passed without running them.

### Database Changes

When modifying the database:

- Use versioned SQL migrations.
- Do not modify existing migrations that have been applied.
- Review changes to RLS policies.
- Preserve existing data unless explicitly instructed.
- Update database documentation when the schema changes.
- Never execute destructive SQL without user approval.

### Final Review

Before suggesting a Git commit:

1. Verify the completed requirements.
2. Summarize all modified files.
3. Report test results.
4. Identify remaining issues.
5. Suggest a Conventional Commit message in English.
6. Use the format: type: short description.
7. Do not commit or push without user approval.
