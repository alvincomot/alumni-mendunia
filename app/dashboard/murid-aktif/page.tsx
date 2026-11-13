import { requireAccess } from "@/lib/auth/access";
import { loadActiveStudents } from "@/lib/active-students/data";
import {
  activeStudentSummary,
  filterActiveStudents,
  parseActiveStudentFilters,
  type ActiveStudentSearchParams,
} from "@/lib/active-students/model";
import {
  placementStatusLabels,
  trainingStatusLabels,
} from "@/lib/active-students/schema";
import { ActiveStudentFilterForm } from "@/components/active-students/filters";
import {
  ActiveStudentDistributions,
  ActiveStudentSummary,
} from "@/components/active-students/summary";
import { StudentRowActions } from "@/components/active-students/student-actions";
import { Pagination } from "@/components/data/pagination";
import { Button } from "@/components/ui/button";
import Link from "next/link";

const pageSize = 20;

export default async function ActiveStudentsPage({
  searchParams,
}: {
  searchParams: Promise<ActiveStudentSearchParams>;
}) {
  const access = await requireAccess();
  const params = await searchParams;
  const filters = parseActiveStudentFilters(params);
  if (access.canWrite) filters.school = "";
  const allRows = await loadActiveStudents(access);
  const rows = filterActiveStudents(allRows, filters);
  const requested =
    typeof params.page === "string" && /^\d{1,6}$/u.test(params.page)
      ? Number(params.page)
      : 1;
  const page = Math.min(
    Math.max(requested, 1),
    Math.max(1, Math.ceil(rows.length / pageSize)),
  );
  const visibleRows = rows.slice((page - 1) * pageSize, page * pageSize);
  const crossSchool = !access.canWrite;

  let school = { name: access.schoolName ?? "Sekolah", npsn: "-" };
  if (access.canWrite && access.schoolId) {
    const result = await access.supabase
      .from("schools")
      .select("name, npsn")
      .eq("id", access.schoolId)
      .maybeSingle();
    if (result.error || !result.data)
      throw new Error("Identitas sekolah tidak tersedia");
    school = result.data;
  }

  const summary = activeStudentSummary(rows);
  const schoolMonitoring = [...summary.bySchool.values()].sort(
    (left, right) =>
      right.total - left.total || left.name.localeCompare(right.name, "id-ID"),
  );

  return (
    <div className="mx-auto w-full max-w-[96rem]">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="type-page-title text-primary">
            {crossSchool ? "Monitoring Murid Aktif" : "Data Murid Aktif"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {crossSchool
              ? "Pantau perkembangan murid yang berminat bekerja ke luar negeri di seluruh sekolah."
              : "Pendataan murid yang berminat bekerja ke luar negeri."}
          </p>
        </div>
        {!crossSchool && (
          <Button asChild>
            <Link href="/dashboard/murid-aktif/new">Tambah Murid</Link>
          </Button>
        )}
      </header>

      <div className="mt-6">
        <ActiveStudentSummary rows={rows} crossSchool={crossSchool} />
      </div>

      <ActiveStudentFilterForm
        rows={allRows}
        values={filters}
        showSchools={crossSchool}
      />

      {crossSchool && (
        <div className="mb-6">
          <ActiveStudentDistributions rows={rows} />
        </div>
      )}

      {rows.length === 0 ? (
        <section className="rounded-xl border bg-card p-6">
          <h2 className="type-section-title text-primary">
            Belum ada murid sesuai filter
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {crossSchool
              ? "Ubah filter untuk melihat data sekolah atau tahun lainnya."
              : "Ubah filter atau tambahkan murid pertama untuk sekolah Anda."}
          </p>
        </section>
      ) : (
        <div
          role="region"
          aria-label="Daftar murid aktif, geser untuk melihat seluruh kolom"
          tabIndex={0}
          className="min-w-0 overflow-x-auto rounded-xl border bg-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
        >
          <table className="w-full min-w-[1180px] text-left text-sm">
            <caption className="sr-only">
              Murid aktif, kesiapan pelatihan, dan penempatan
            </caption>
            <thead className="border-b bg-secondary text-primary">
              <tr>
                {[
                  "Nama Murid",
                  "Konsentrasi Keahlian",
                  "Kelas",
                  "Status KJP",
                  "Status Pelatihan",
                  "LKP/SO/P3MI",
                  "Status Penempatan",
                  "Tahun Pendataan",
                  "Aksi",
                ].map((label) => (
                  <th key={label} scope="col" className="px-4 py-3">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((student) => (
                <tr key={student.id} className="border-b align-top last:border-0">
                  <th scope="row" className="max-w-52 break-words px-4 py-4 font-semibold">
                    {student.full_name}
                    {crossSchool && (
                      <span className="mt-1 block type-meta font-normal text-muted-foreground">
                        {student.schools?.name ?? "Sekolah tidak tersedia"}
                      </span>
                    )}
                  </th>
                  <td className="max-w-52 break-words px-4 py-4">{student.skill_concentration}</td>
                  <td className="px-4 py-4 tabular-nums">{student.grade}</td>
                  <td className="px-4 py-4">
                    {student.kjp_status == null ? "Belum dicatat" : student.kjp_status ? "Ya" : "Tidak"}
                  </td>
                  <td className="px-4 py-4">
                    <span className="inline-flex rounded-full bg-[#E6F6F7] px-2.5 py-1 text-xs font-semibold text-[#075E66]">
                      {trainingStatusLabels[student.training_status]}
                    </span>
                  </td>
                  <td className="max-w-48 break-words px-4 py-4">{student.provider_name ?? "Belum dicatat"}</td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${student.placement_status === "sudah" ? "bg-[#E1F4EB] text-[#006B49]" : "bg-secondary text-muted-foreground"}`}>
                      {placementStatusLabels[student.placement_status]}
                    </span>
                  </td>
                  <td className="px-4 py-4 tabular-nums">{student.data_year}</td>
                  <td className="px-4 py-4">
                    <StudentRowActions
                      student={student}
                      school={{
                        name: student.schools?.name ?? school.name,
                        npsn: student.schools?.npsn ?? school.npsn,
                      }}
                      canWrite={access.canWrite}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        path="/dashboard/murid-aktif"
        params={filters}
        page={page}
        total={rows.length}
        size={pageSize}
      />

      {crossSchool && (
        <section className="mt-6 rounded-xl border bg-card p-5 sm:p-6" aria-labelledby="school-monitoring-title">
          <h2 id="school-monitoring-title" className="type-section-title text-primary">Monitoring Sekolah</h2>
          <p className="mt-1 text-sm text-muted-foreground">Sekolah diurutkan berdasarkan jumlah murid berminat terbanyak.</p>
          {schoolMonitoring.length === 0 ? (
            <p className="mt-5 text-sm text-muted-foreground">Belum ada sekolah sesuai filter.</p>
          ) : (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b text-primary">
                  <tr>
                    {["Nama Sekolah", "NPSN", "Total Murid", "Aktif Pelatihan", "Selesai Pelatihan", "Sudah Penempatan"].map((label) => <th key={label} scope="col" className="px-3 py-3">{label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {schoolMonitoring.map((item) => (
                    <tr key={item.id} className="border-b last:border-0">
                      <th scope="row" className="px-3 py-3 font-medium">{item.name}</th>
                      <td className="px-3 py-3 tabular-nums">{item.npsn}</td>
                      <td className="px-3 py-3 tabular-nums">{item.total}</td>
                      <td className="px-3 py-3 tabular-nums">{item.activeTraining}</td>
                      <td className="px-3 py-3 tabular-nums">{item.completedTraining}</td>
                      <td className="px-3 py-3 tabular-nums">{item.placed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

