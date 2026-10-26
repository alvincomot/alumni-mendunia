import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAlumniAccess } from "@/lib/alumni/access";
import {
  idSchema,
  type AlumniRecord,
  type PlacementRecord,
} from "@/lib/alumni/schema";
import {
  AlumniPageFrame,
  AlumniAccessDenied,
  PlacementBadge,
} from "@/components/alumni/page-frame";
import { AlumniForm } from "@/components/alumni/alumni-form";
import { PlacementForm } from "@/components/alumni/placement-form";
import { Button } from "@/components/ui/button";
import { StatusAction } from "@/components/alumni/status-action";
import { StatusHistory } from "@/components/alumni/status-history";
import { getPlacementHistory } from "@/lib/alumni/history";
import { formatCountryName } from "@/lib/countries";

function DetailItem({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium">{children}</dd>
    </div>
  );
}

function formatDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("id-ID", {
        dateStyle: "long",
        timeZone: "UTC",
      }).format(new Date(value))
    : "Belum dicatat";
}

export default async function AlumniDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const access = await getAlumniAccess();
  if (!access.allowed) {
    if (access.reason === "session") redirect("/auth/login");
    return <AlumniAccessDenied />;
  }
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  let query = access.supabase
    .from("alumni")
    .select("id, school_id, full_name, graduation_year, major")
    .eq("id", id);
  if (access.canWrite) query = query.eq("school_id", access.schoolId!);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error("Alumni detail unavailable");
  if (!data) notFound();
  const alumni = data as AlumniRecord;
  const [school, placementRows] = await Promise.all([
    access.supabase
      .from("schools")
      .select("name")
      .eq("id", alumni.school_id)
      .maybeSingle(),
    access.supabase
      .from("placements")
      .select(
        "id, alumni_id, destination_country, work_sector, company_name, status, planned_departure, actual_departure, employment_start, contract_end_date, is_current, created_at",
      )
      .eq("alumni_id", id)
      .order("is_current", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id"),
  ]);
  if (school.error || placementRows.error)
    throw new Error("Alumni related data unavailable");
  const placements = (placementRows.data ?? []) as (PlacementRecord & {
    created_at: string;
  })[];
  const placement = placements.find((item) => item.is_current) ?? null;
  const hasPlacement = placements.length > 0;
  const histories = await Promise.all(
    placements.map(async (item) => ({
      placement: item,
      current: item.id === placement?.id,
      history: await getPlacementHistory(access.supabase, item.id),
    })),
  );
  return (
    <AlumniPageFrame canWrite={access.canWrite}>
      <Button asChild variant="outline" className="mb-5 min-h-11">
        <Link href="/dashboard/alumni">Kembali ke daftar</Link>
      </Button>
      <h1 className="break-words text-2xl font-semibold text-primary">
        {alumni.full_name}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Detail alumni{!access.canWrite && " · Akses hanya baca"}
      </p>
      <section
        aria-labelledby="identity-heading"
        className="mt-6 rounded-lg border bg-white p-5 sm:p-6"
      >
        <h2
          id="identity-heading"
          className="text-lg font-semibold text-primary"
        >
          Identitas alumni
        </h2>
        <dl className="mt-5 grid gap-5 sm:grid-cols-3">
          <DetailItem label="Sekolah">
            {school.data?.name ?? "Sekolah tidak tersedia"}
          </DetailItem>
          <DetailItem label="Tahun kelulusan">
            {alumni.graduation_year}
          </DetailItem>
          <DetailItem label="Jurusan">{alumni.major}</DetailItem>
        </dl>
        {access.canWrite && (
          <details className="mt-6 border-t pt-4">
            <summary className="flex min-h-11 cursor-pointer items-center rounded text-sm font-medium text-accent underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
              Edit identitas alumni
            </summary>
            <div className="mt-4 max-w-2xl">
              <AlumniForm key={alumni.id} alumni={alumni} />
            </div>
          </details>
        )}
      </section>
      <section
        aria-labelledby="placement-heading"
        className="mt-6 rounded-lg border bg-white p-5 sm:p-6"
      >
        <h2
          id="placement-heading"
          className="text-lg font-semibold text-primary"
        >
          Penempatan saat ini
        </h2>
        {placement ? (
          <>
            <div className="mt-3">
              <PlacementBadge status={placement.status} />
            </div>
            <dl className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <DetailItem label="Negara tujuan">
                {formatCountryName(placement.destination_country)}
              </DetailItem>
              <DetailItem label="Perusahaan">
                {placement.company_name ?? "Belum dicatat"}
              </DetailItem>
              <DetailItem label="Sektor pekerjaan">
                {placement.work_sector ?? "Belum dicatat"}
              </DetailItem>
              <DetailItem label="Rencana keberangkatan">
                {formatDate(placement.planned_departure)}
              </DetailItem>
              <DetailItem label="Keberangkatan aktual">
                {formatDate(placement.actual_departure)}
              </DetailItem>
              <DetailItem label="Mulai bekerja">
                {formatDate(placement.employment_start)}
              </DetailItem>
              <DetailItem label="Selesai kontrak">
                {formatDate(placement.contract_end_date)}
              </DetailItem>
            </dl>
            {access.canWrite && (
              <div className="mt-5">
                <StatusAction
                  placementId={placement.id}
                  status={placement.status}
                  alumniName={alumni.full_name}
                  context="detail"
                />
              </div>
            )}
          </>
        ) : (
          <>
            <p className="mt-3 text-sm text-muted-foreground">
              {hasPlacement
                ? "Terdapat penempatan terdahulu, tetapi tidak ada penempatan saat ini. Hubungi Admin Dinas untuk memeriksa data."
                : "Belum ada penempatan. Data identitas alumni sudah tersimpan."}
            </p>
            {access.canWrite && !hasPlacement && (
              <div className="mt-6 max-w-2xl border-t pt-6">
                <PlacementForm alumniId={alumni.id} />
              </div>
            )}
          </>
        )}
      </section>
      <section
        aria-labelledby="history-heading"
        className="mt-6 rounded-lg border bg-white p-5 sm:p-6"
      >
        {access.canWrite &&
          placement &&
          ["selesai_kontrak", "batal_berangkat"].includes(placement.status) && (
            <details className="mb-6 border-b pb-6">
              <summary className="min-h-11 cursor-pointer content-center font-semibold text-accent">
                Daftarkan penempatan berikutnya
              </summary>
              <p className="my-4 text-sm leading-6">
                Penempatan sebelumnya dan seluruh riwayat tetap tersimpan.
                Penempatan baru akan menjadi penempatan saat ini.
              </p>
              <PlacementForm
                key={placement.id}
                alumniId={alumni.id}
                expectedCurrentId={placement.id}
              />
            </details>
          )}
        <h2 id="history-heading" className="text-lg font-semibold text-primary">
          Riwayat Status
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Riwayat dikelompokkan per penempatan. Waktu ditampilkan dalam WIB.
        </p>
        {histories.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Riwayat akan tersedia setelah penempatan awal dicatat.
          </p>
        ) : (
          histories.map(({ placement: item, current: isCurrent, history }) => (
            <section
              key={item.id}
              aria-labelledby={`history-${item.id}`}
              className="mt-6 border-t pt-5"
            >
              <h3
                id={`history-${item.id}`}
                className="break-words text-base font-semibold text-primary"
              >
                {formatCountryName(item.destination_country)} ·{" "}
                {item.company_name || "Perusahaan belum dicatat"}
              </h3>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <span>
                  {isCurrent ? "Penempatan saat ini" : "Penempatan terdahulu"}
                </span>
                <PlacementBadge status={item.status} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Dicatat {formatDate(item.created_at)}
              </p>
              <StatusHistory {...history} />
              {!isCurrent && (
                <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <DetailItem label="Sektor pekerjaan">
                    {item.work_sector || "Belum dicatat"}
                  </DetailItem>
                  <DetailItem label="Rencana keberangkatan">
                    {formatDate(item.planned_departure)}
                  </DetailItem>
                  <DetailItem label="Keberangkatan aktual">
                    {formatDate(item.actual_departure)}
                  </DetailItem>
                  <DetailItem label="Mulai bekerja">
                    {formatDate(item.employment_start)}
                  </DetailItem>
                  <DetailItem label="Selesai kontrak">
                    {formatDate(item.contract_end_date)}
                  </DetailItem>
                </dl>
              )}
            </section>
          ))
        )}
      </section>
    </AlumniPageFrame>
  );
}
