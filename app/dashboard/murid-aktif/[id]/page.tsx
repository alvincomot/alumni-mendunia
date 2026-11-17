import Link from "next/link";
import { notFound } from "next/navigation";
import { getActiveStudentHistory } from "@/app/dashboard/murid-aktif/actions";
import { DeleteStudentDialog } from "@/components/active-students/student-actions";
import {
  StudentIdentityEditor,
  StudentProgramEditor,
} from "@/components/active-students/student-editor";
import { ActiveStudentHistoryList } from "@/components/active-students/student-history";
import { DashboardIcon, type DashboardIconName } from "@/components/dashboard-icon";
import { Button } from "@/components/ui/button";
import { loadActiveStudentDetail } from "@/lib/active-students/data";
import { activeStudentReturnPath } from "@/lib/active-students/navigation";
import {
  activeStudentIdSchema,
  placementStatusLabels,
  trainingStatusLabels,
  type TrainingStatus,
} from "@/lib/active-students/schema";
import { requireAccess } from "@/lib/auth/access";
import { formatCountryName } from "@/lib/countries";

const trainingStatusStyles: Record<TrainingStatus, string> = {
  belum_pelatihan: "bg-slate-100 text-slate-700",
  aktif_pelatihan: "bg-[#E6F6F7] text-[#075E66]",
  selesai_pelatihan: "bg-green-50 text-green-800",
};

function formatDate(value: string | null) {
  if (!value) return "Belum dicatat";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "long",
    timeZone: "Asia/Jakarta",
  }).format(new Date(`${value.slice(0, 10)}T00:00:00+07:00`));
}

function DetailItem({
  icon,
  label,
  children,
  empty = false,
}: {
  icon: DashboardIconName;
  label: string;
  children: React.ReactNode;
  empty?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary/70">
        <DashboardIcon name={icon} className="size-[22px]" />
      </span>
      <div className="min-w-0">
        <dt className="type-meta text-muted-foreground">{label}</dt>
        <dd
          className={`mt-0.5 break-words text-sm font-medium leading-5 ${
            empty ? "italic text-muted-foreground" : "text-foreground"
          }`}
        >
          {children}
        </dd>
      </div>
    </div>
  );
}

function SectionHeading({
  id,
  icon,
  children,
}: {
  id: string;
  icon: DashboardIconName;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
        <DashboardIcon name={icon} className="size-[22px]" />
      </span>
      <h2 id={id} className="type-card-title break-words text-primary">
        {children}
      </h2>
    </div>
  );
}

export default async function ActiveStudentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const access = await requireAccess();
  const { id } = await params;
  if (!activeStudentIdSchema.safeParse(id).success) notFound();
  const returnTo = activeStudentReturnPath((await searchParams).returnTo);
  const [student, historyResult] = await Promise.all([
    loadActiveStudentDetail(access, id),
    getActiveStudentHistory(id),
  ]);
  if (!student) notFound();

  const school = {
    name: student.schools?.name ?? access.schoolName ?? "Sekolah tidak tersedia",
    npsn: student.schools?.npsn ?? "-",
  };
  const history = historyResult.success ? historyResult.history : [];
  const historyError = historyResult.success ? undefined : historyResult.message;

  return (
    <div className="mx-auto w-full max-w-[96rem]">
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" className="-ml-3 min-h-11">
          <Link href={returnTo}>
            <DashboardIcon name="arrowLeft" />
            Kembali ke daftar
          </Link>
        </Button>
        {access.canWrite && (
          <Button asChild className="ml-auto min-h-11">
            <Link href="/dashboard/murid-aktif/new">
              <DashboardIcon name="plus" />
              Tambah murid lain
            </Link>
          </Button>
        )}
      </div>

      <h1 className="mt-4 type-page-title break-words text-primary">
        {student.full_name}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Detail murid aktif{!access.canWrite && " · Akses hanya baca"}
      </p>

      <section
        aria-labelledby="student-identity-heading"
        className="mt-6 rounded-xl border bg-card p-5 sm:p-6"
      >
        <SectionHeading id="student-identity-heading" icon="user">
          Identitas murid
        </SectionHeading>
        <dl className="mt-5 grid gap-x-6 gap-y-5 md:grid-cols-2 xl:grid-cols-3">
          <DetailItem icon="schoolBuilding" label="Sekolah">
            {school.name}
          </DetailItem>
          <DetailItem icon="building" label="NPSN">
            <span className="tabular-nums">{school.npsn}</span>
          </DetailItem>
          <DetailItem icon="book" label="Konsentrasi keahlian">
            {student.skill_concentration}
          </DetailItem>
          <DetailItem icon="clipboard" label="Kelas">
            Kelas {student.grade}
          </DetailItem>
          <DetailItem icon="clipboard" label="Status KJP">
            {student.kjp_status == null
              ? "Belum dicatat"
              : student.kjp_status
                ? "Ya"
                : "Tidak"}
          </DetailItem>
          <DetailItem icon="calendar" label="Tahun Pendataan">
            <span className="tabular-nums">{student.data_year}</span>
          </DetailItem>
          <DetailItem icon="clipboard" label="Persetujuan wali">
            Dikonfirmasi {formatDate(student.parent_consent_at)}
          </DetailItem>
        </dl>
        {access.canWrite && <StudentIdentityEditor student={student} />}
      </section>

      <section
        aria-labelledby="student-training-heading"
        className="mt-6 rounded-xl border bg-card p-5 sm:p-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHeading id="student-training-heading" icon="briefcase">
            Pelatihan dan penempatan
          </SectionHeading>
          <span
            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${trainingStatusStyles[student.training_status]}`}
          >
            {trainingStatusLabels[student.training_status]}
          </span>
        </div>
        <dl className="mt-6 grid gap-x-6 gap-y-5 md:grid-cols-2 xl:grid-cols-3">
          <DetailItem icon="book" label="Status pelatihan">
            {trainingStatusLabels[student.training_status]}
          </DetailItem>
          <DetailItem
            icon="building"
            label="LKP / Sending Organization / P3MI"
            empty={!student.provider_name}
          >
            {student.provider_name ?? "Belum dicatat"}
          </DetailItem>
          <DetailItem icon="flag" label="Status penempatan">
            {placementStatusLabels[student.placement_status]}
          </DetailItem>
          <DetailItem
            icon="flag"
            label="Negara penempatan"
            empty={!student.placement_country}
          >
            {student.placement_country
              ? formatCountryName(student.placement_country)
              : "Belum dicatat"}
          </DetailItem>
          <DetailItem
            icon="calendar"
            label="Tanggal penempatan"
            empty={!student.placement_date}
          >
            {formatDate(student.placement_date)}
          </DetailItem>
        </dl>
        {access.canWrite && <StudentProgramEditor student={student} />}
      </section>

      <section
        aria-labelledby="student-history-heading"
        className="mt-6 rounded-xl border bg-card p-5 sm:p-6"
      >
        <SectionHeading id="student-history-heading" icon="history">
          Riwayat perubahan
        </SectionHeading>
        <p className="mt-2 text-sm text-muted-foreground">
          Nilai sebelum dan sesudah ditampilkan berurutan. Waktu menggunakan WIB.
        </p>
        <ActiveStudentHistoryList history={history} error={historyError} />
      </section>

      {access.canWrite && (
        <div className="mt-6 flex justify-end border-t pt-6">
          <DeleteStudentDialog
            student={student}
            successPath={returnTo}
            triggerLabel="Hapus data murid"
          />
        </div>
      )}
    </div>
  );
}
