import { alumniReturnPath, alumniFormPath } from "@/lib/alumni/navigation";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAlumniAccess } from "@/lib/alumni/access";
import { idSchema, type AlumniRecord, type PlacementRecord } from "@/lib/alumni/schema";
import { AlumniPageFrame, AlumniAccessDenied, PlacementBadge } from "@/components/alumni/page-frame";
import { AlumniEditor } from "@/components/alumni/alumni-form";
import { PlacementEditor } from "@/components/alumni/placement-editor";
import { PlacementForm } from "@/components/alumni/placement-form";
import { Button } from "@/components/ui/button";
import { StatusAction } from "@/components/alumni/status-action";
import { StatusHistory } from "@/components/alumni/status-history";
import { getPlacementHistory } from "@/lib/alumni/history";
import { inferLegacyPlacementSecured, isMissingPlacementStateSchema } from "@/lib/alumni/placement-compat";
import { formatCountryName } from "@/lib/countries";
import { DashboardIcon, type DashboardIconName } from "@/components/dashboard-icon";

function DetailItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium">{children}</dd>
    </div>
  );
}

function IconDetailItem({
  icon,
  label,
  children,
  empty = false,
  divided = false,
}: {
  icon: DashboardIconName;
  label: string;
  children: React.ReactNode;
  empty?: boolean;
  divided?: boolean;
}) {
  return (
    <div className={`flex min-w-0 items-start gap-3 ${divided ? "md:border-l md:pl-5" : ""}`}>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary/70">
        <DashboardIcon name={icon} className="size-[18px]" />
      </span>
      <div className="min-w-0">
        <dt className="type-meta text-muted-foreground">{label}</dt>
        <dd className={`mt-0.5 break-words text-sm font-medium leading-5 ${empty ? "italic text-muted-foreground" : "text-foreground"}`}>
          {children}
        </dd>
      </div>
    </div>
  );
}

function SectionHeading({ id, icon, children }: { id: string; icon: DashboardIconName; children: React.ReactNode }) {
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

function formatDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("id-ID", {
        dateStyle: "long",
        timeZone: "UTC",
      }).format(new Date(value))
    : "Belum dicatat";
}

function placementStateLabel(value: boolean | null) {
  if (value === true) return "Sudah ada penempatan";
  if (value === false) return "Belum ada penempatan";
  return "Status penempatan belum tercatat";
}

export default async function AlumniDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const access = await getAlumniAccess();
  if (!access.allowed) {
    if (access.reason === "session") redirect("/auth/login");
    if (access.reason === "password_change") redirect("/auth/update-password");
    return <AlumniAccessDenied />;
  }
  const { id } = await params;
  const returnTo = alumniReturnPath((await searchParams).returnTo);
  if (!idSchema.safeParse(id).success) notFound();
  let query = access.supabase.from("alumni").select("id, school_id, full_name, graduation_year, major").eq("id", id);
  if (access.canWrite) query = query.eq("school_id", access.schoolId!);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error("Alumni detail unavailable");
  if (!data) notFound();
  const alumni = data as AlumniRecord;
  type PlacementDetailRow = PlacementRecord & {
    created_at: string;
    updated_at: string;
  };
  const loadPlacements = async () => {
    const result = await access.supabase
      .from("placements")
      .select(
        "id, alumni_id, destination_country, placement_secured, placement_provider_name, work_sector, company_name, status, planned_departure, actual_departure, employment_start, contract_end_date, is_current, created_at, updated_at",
      )
      .eq("alumni_id", id)
      .order("is_current", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id");
    if (isMissingPlacementStateSchema(result.error)) {
      const legacy = await access.supabase
        .from("placements")
        .select(
          "id, alumni_id, destination_country, work_sector, company_name, status, planned_departure, actual_departure, employment_start, contract_end_date, is_current, created_at, updated_at",
        )
        .eq("alumni_id", id)
        .order("is_current", { ascending: false })
        .order("created_at", { ascending: false })
        .order("id");
      return {
        error: legacy.error,
        data: legacy.data?.map((placement) => ({
          ...(placement as unknown as Omit<PlacementDetailRow, "placement_secured" | "placement_provider_name">),
          placement_secured: inferLegacyPlacementSecured(placement.status),
          placement_provider_name: null,
        })),
      };
    }
    return {
      error: result.error,
      data: result.data as unknown as PlacementDetailRow[] | null,
    };
  };
  const [school, placementRows] = await Promise.all([
    access.supabase.from("schools").select("name").eq("id", alumni.school_id).maybeSingle(),
    loadPlacements(),
  ]);
  if (school.error || placementRows.error) throw new Error("Alumni related data unavailable");
  const placements = placementRows.data ?? [];
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
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" className="-ml-3 min-h-11">
          <Link href={returnTo}>
            <DashboardIcon name="arrowLeft" />
            Kembali ke daftar
          </Link>
        </Button>
        {access.canWrite && (
          <Button asChild className="ml-auto min-h-11">
            <Link href={alumniFormPath("/dashboard/alumni/new", returnTo)}>
              <DashboardIcon name="plus" />
              Tambah alumni lain
            </Link>
          </Button>
        )}
      </div>
      <h1 className="mt-4 type-page-title break-words text-primary">{alumni.full_name}</h1>
      <p className="mt-2 text-sm text-muted-foreground">Detail alumni{!access.canWrite && " · Akses hanya baca"}</p>
      <section aria-labelledby="identity-heading" className="mt-6 rounded-xl border bg-card p-5 sm:p-6">
        <SectionHeading id="identity-heading" icon="user">
          Identitas alumni
        </SectionHeading>
        <dl className="mt-5 grid gap-5 md:grid-cols-3">
          <IconDetailItem icon="schoolBuilding" label="Sekolah">
            {school.data?.name ?? "Sekolah tidak tersedia"}
          </IconDetailItem>
          <IconDetailItem icon="calendar" label="Tahun kelulusan" divided>
            {alumni.graduation_year}
          </IconDetailItem>
          <IconDetailItem icon="book" label="Jurusan" divided>
            {alumni.major}
          </IconDetailItem>
        </dl>
        {access.canWrite && <AlumniEditor key={alumni.id} alumni={alumni} returnTo={returnTo} />}
      </section>
      <section aria-labelledby="placement-heading" className="mt-6 rounded-xl border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHeading id="placement-heading" icon="briefcase">
            Kondisi penempatan saat ini
          </SectionHeading>
          {placement && <PlacementBadge status={placement.status} />}
        </div>
        {placement ? (
          <>
            <dl className="mt-6 grid gap-x-6 gap-y-5 md:grid-cols-2 xl:grid-cols-3">
              <IconDetailItem icon="flag" label="Negara tujuan">
                {formatCountryName(placement.destination_country)}
              </IconDetailItem>
              <IconDetailItem icon="briefcase" label="Status perolehan penempatan">
                {placementStateLabel(placement.placement_secured)}
              </IconDetailItem>
              {placement.placement_secured === true && (
                <>
                  <IconDetailItem
                    icon="building"
                    label="LPK / Sending Organization / P3MI (Penyalur)"
                    empty={!placement.placement_provider_name}>
                    {placement.placement_provider_name ?? "Belum dicatat"}
                  </IconDetailItem>
                  <IconDetailItem icon="briefcase" label="Sektor pekerjaan" empty={!placement.work_sector}>
                    {placement.work_sector ?? "Belum dicatat"}
                  </IconDetailItem>
                  <IconDetailItem icon="calendar" label="Rencana keberangkatan" empty={!placement.planned_departure}>
                    {formatDate(placement.planned_departure)}
                  </IconDetailItem>
                </>
              )}
              {placement.placement_secured === null && (
                <>
                  {placement.work_sector && (
                    <IconDetailItem icon="briefcase" label="Sektor pekerjaan (data historis)">
                      {placement.work_sector}
                    </IconDetailItem>
                  )}
                  {placement.planned_departure && (
                    <IconDetailItem icon="calendar" label="Rencana keberangkatan (data historis)">
                      {formatDate(placement.planned_departure)}
                    </IconDetailItem>
                  )}
                </>
              )}
              {placement.company_name && (
                <IconDetailItem icon="building" label="Perusahaan/pemberi kerja (data historis)">
                  {placement.company_name}
                </IconDetailItem>
              )}
              <IconDetailItem icon="plane" label="Keberangkatan aktual" empty={!placement.actual_departure}>
                {formatDate(placement.actual_departure)}
              </IconDetailItem>
              <IconDetailItem icon="clock" label="Mulai bekerja" empty={!placement.employment_start}>
                {formatDate(placement.employment_start)}
              </IconDetailItem>
              <IconDetailItem icon="clipboard" label="Selesai kontrak" empty={!placement.contract_end_date}>
                {formatDate(placement.contract_end_date)}
              </IconDetailItem>
            </dl>
            {access.canWrite && (
              <div className="mt-6 grid grid-cols-1 gap-3 border-t pt-4 sm:grid-cols-[1fr_auto_auto]">
                <span className="hidden sm:block" aria-hidden="true" />
                <div className="min-w-0">
                  <StatusAction placementId={placement.id} status={placement.status} alumniName={alumni.full_name} context="detail" />
                </div>
                <PlacementEditor placement={placement} />
              </div>
            )}
          </>
        ) : (
          <>
            <p className="mt-3 text-sm text-muted-foreground">
              {hasPlacement
                ? "Terdapat penempatan terdahulu, tetapi tidak ada penempatan saat ini. Hubungi Admin Dinas untuk memeriksa data."
                : "Data penempatan belum tercatat. Data identitas alumni sudah tersimpan."}
            </p>
            {access.canWrite && !hasPlacement && (
              <div className="mt-6 max-w-2xl border-t pt-6">
                <PlacementForm alumniId={alumni.id} returnTo={returnTo} />
              </div>
            )}
          </>
        )}
      </section>
      <section aria-labelledby="history-heading" className="mt-6 rounded-xl border bg-card p-5 sm:p-6">
        {access.canWrite && placement && ["selesai_kontrak", "batal_berangkat"].includes(placement.status) && (
          <details className="mb-6 border-b pb-6">
            <summary className="min-h-11 cursor-pointer content-center font-semibold text-accent">Daftarkan penempatan berikutnya</summary>
            <p className="my-4 text-sm leading-6">
              Penempatan sebelumnya dan seluruh riwayat tetap tersimpan. Penempatan baru akan menjadi penempatan saat ini.
            </p>
            <PlacementForm key={placement.id} alumniId={alumni.id} expectedCurrentId={placement.id} returnTo={returnTo} />
          </details>
        )}
        <SectionHeading id="history-heading" icon="history">
          Riwayat Status
        </SectionHeading>
        <p className="mt-2 text-sm text-muted-foreground">Riwayat dikelompokkan per penempatan. Waktu ditampilkan dalam WIB.</p>
        {histories.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">Riwayat akan tersedia setelah penempatan awal dicatat.</p>
        ) : (
          histories.map(({ placement: item, current: isCurrent, history }) => (
            <section key={item.id} aria-labelledby={`history-${item.id}`} className="mt-6 border-t pt-5">
              <h3 id={`history-${item.id}`} className="type-card-title break-words text-primary">
                {formatCountryName(item.destination_country)} ·{" "}
                {item.placement_provider_name || (item.placement_secured === false ? "Belum ada penempatan" : "Penyalur belum dicatat")}
              </h3>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <span>{isCurrent ? "Penempatan saat ini" : "Penempatan terdahulu"}</span>
                <PlacementBadge status={item.status} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Dicatat {formatDate(item.created_at)}</p>
              <StatusHistory {...history} />
              {!isCurrent && (
                <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <DetailItem label="Status perolehan penempatan">{placementStateLabel(item.placement_secured)}</DetailItem>
                  {item.placement_secured !== false && (
                    <>
                      <DetailItem label="LPK / Sending Organization / P3MI (Penyalur)">
                        {item.placement_provider_name || "Belum dicatat"}
                      </DetailItem>
                      <DetailItem label="Sektor pekerjaan">{item.work_sector || "Belum dicatat"}</DetailItem>
                      <DetailItem label="Rencana keberangkatan">{formatDate(item.planned_departure)}</DetailItem>
                    </>
                  )}
                  {item.company_name && <DetailItem label="Perusahaan/pemberi kerja (data historis)">{item.company_name}</DetailItem>}
                  <DetailItem label="Keberangkatan aktual">{formatDate(item.actual_departure)}</DetailItem>
                  <DetailItem label="Mulai bekerja">{formatDate(item.employment_start)}</DetailItem>
                  <DetailItem label="Selesai kontrak">{formatDate(item.contract_end_date)}</DetailItem>
                </dl>
              )}
            </section>
          ))
        )}
      </section>
    </AlumniPageFrame>
  );
}
