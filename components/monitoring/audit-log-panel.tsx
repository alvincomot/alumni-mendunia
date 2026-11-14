import { redirect } from "next/navigation";
import { auditFilterSchema, wibBoundary } from "@/lib/audit/filters";
import { readAllRows } from "@/lib/data/read-all";
import type { requireAccess } from "@/lib/auth/access";
import type { SearchParams } from "@/lib/monitoring/model";
import { Filters } from "@/components/data/filters";
import { Pagination } from "@/components/data/pagination";
import { AuditLogDetail } from "@/components/monitoring/audit-log-detail";
import { FileClock, LockKeyhole } from "lucide-react";

type Access = Awaited<ReturnType<typeof requireAccess>>;

const actions = { INSERT: "Tambah", UPDATE: "Ubah", DELETE: "Hapus" };
const entities = {
  schools: "Sekolah",
  profiles: "Profil pengguna",
  alumni: "Alumni",
  placements: "Penempatan",
  active_students: "Murid aktif",
};

function textValue(raw: SearchParams, key: string) {
  return typeof raw[key] === "string" ? raw[key].slice(0, 150) : "";
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}

export async function AuditLogPanel({
  access,
  raw,
}: {
  access: Access;
  raw: SearchParams;
}) {
  const values = Object.fromEntries(
    ["action", "actor", "entity", "id", "from", "to"].map((key) => [
      key,
      textValue(raw, key),
    ]),
  );
  const parsed = auditFilterSchema.safeParse(values);
  const requested =
    typeof raw.page === "string" && /^\d{1,6}$/u.test(raw.page)
      ? Number(raw.page)
      : 1;
  const page = Math.max(1, requested);
  let query = access.supabase
    .from("audit_logs")
    .select("id, actor_id, action, entity_type, entity_id, occurred_at", {
      count: "exact",
    });
  if (parsed.success) {
    const filters = parsed.data;
    if (filters.action) query = query.eq("action", filters.action);
    if (filters.actor) query = query.eq("actor_id", filters.actor);
    if (filters.entity) query = query.eq("entity_type", filters.entity);
    if (filters.id) query = query.eq("entity_id", filters.id);
    if (filters.from)
      query = query.gte("occurred_at", wibBoundary(filters.from));
    if (filters.to)
      query = query.lt("occurred_at", wibBoundary(filters.to, true));
  }
  const resultPromise = parsed.success
    ? query
        .order("occurred_at", { ascending: false })
        .order("id")
        .range((page - 1) * 20, page * 20 - 1)
    : Promise.resolve({ data: [], count: 0, error: null });
  const [profiles, result] = await Promise.all([
    readAllRows<{ user_id: string; full_name: string }>((start, end) =>
      access.supabase
        .from("profiles")
        .select("user_id, full_name", { count: "exact" })
        .order("user_id")
        .range(start, end),
    ),
    resultPromise,
  ]);
  const total = result.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / 20));
  if (result.error?.code === "PGRST103" || (!result.error && page > pages))
    redirect(
      `/dashboard/monitoring?${new URLSearchParams({ tab: "audit", ...values, page: "1" })}`,
    );
  if (result.error) throw new Error("Audit logs unavailable");

  const rows = result.data ?? [];
  const entityIds = (entity: keyof typeof entities) =>
    rows
      .filter((row) => row.entity_type === entity)
      .map((row) => row.entity_id);
  const schoolIds = entityIds("schools");
  const alumniIds = entityIds("alumni");
  const placementIds = entityIds("placements");
  const activeStudentIds = entityIds("active_students");
  const [schoolsResult, alumniResult, placementsResult, activeStudentsResult] = await Promise.all([
    schoolIds.length
      ? access.supabase.from("schools").select("id, name").in("id", schoolIds)
      : Promise.resolve({ data: [], error: null }),
    alumniIds.length
      ? access.supabase.from("alumni").select("id, full_name").in("id", alumniIds)
      : Promise.resolve({ data: [], error: null }),
    placementIds.length
      ? access.supabase
          .from("placements")
          .select("id, alumni_id")
          .in("id", placementIds)
      : Promise.resolve({ data: [], error: null }),
    activeStudentIds.length
      ? access.supabase
          .from("active_students")
          .select("id, full_name")
          .in("id", activeStudentIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const placementAlumniIds = (placementsResult.data ?? []).map(
    (item) => item.alumni_id,
  );
  const placementAlumniResult = placementAlumniIds.length
    ? await access.supabase
        .from("alumni")
        .select("id, full_name")
        .in("id", placementAlumniIds)
    : { data: [], error: null };

  const actorNames = new Map(
    profiles.map((profile) => [profile.user_id, profile.full_name]),
  );
  const schoolNames = new Map(
    (schoolsResult.data ?? []).map((school) => [school.id, school.name]),
  );
  const alumniNames = new Map(
    [...(alumniResult.data ?? []), ...(placementAlumniResult.data ?? [])].map(
      (alumni) => [alumni.id, alumni.full_name],
    ),
  );
  const placementNames = new Map(
    (placementsResult.data ?? []).map((placement) => [
      placement.id,
      alumniNames.has(placement.alumni_id)
        ? `Penempatan alumni ${alumniNames.get(placement.alumni_id)}`
        : "Penempatan tidak tersedia",
    ]),
  );
  const activeStudentNames = new Map(
    (activeStudentsResult.data ?? []).map((student) => [
      student.id,
      student.full_name,
    ]),
  );

  function objectName(entity: string, id: string) {
    if (entity === "schools") return schoolNames.get(id) ?? "Sekolah tidak tersedia";
    if (entity === "profiles")
      return actorNames.get(id) ?? "Profil pengguna tidak tersedia";
    if (entity === "alumni") return alumniNames.get(id) ?? "Alumni tidak tersedia";
    if (entity === "placements")
      return placementNames.get(id) ?? "Penempatan tidak tersedia";
    if (entity === "active_students")
      return activeStudentNames.get(id) ?? "Murid sudah dihapus atau tidak tersedia";
    return "Objek tidak tersedia";
  }

  return (
    <div
      id="monitoring-panel-audit"
      role="tabpanel"
      aria-labelledby="monitoring-tab-audit"
      className="space-y-5"
    >
      <section className="flex items-start gap-3 rounded-xl border bg-card px-4 py-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-primary">
          <LockKeyhole aria-hidden="true" className="size-5" />
        </span>
        <div>
          <p className="font-semibold text-primary">Catatan perubahan hanya baca</p>
          <p className="mt-0.5 max-w-4xl text-sm leading-6 text-muted-foreground">
            Filter tanggal menggunakan WIB. Perubahan Supabase Auth diperiksa
            melalui log Auth provider. Catatan tanpa identitas pelaku tetap
            ditampilkan sebagai tidak tercatat dan tidak diasumsikan.
          </p>
        </div>
      </section>

      <section aria-labelledby="audit-filter-heading" className="rounded-xl border bg-card p-4">
        <h2 id="audit-filter-heading" className="type-card-title text-primary">
          Filter Audit Log
        </h2>
        <div className="[&_form]:mb-0 [&_form]:mt-4">
          <Filters
            path="/dashboard/monitoring"
            values={values}
            fixedValues={{ tab: "audit" }}
            fields={[
              {
                name: "action",
                label: "Tindakan",
                options: Object.entries(actions).map(([value, label]) => ({ value, label })),
              },
              {
                name: "entity",
                label: "Jenis data",
                options: Object.entries(entities).map(([value, label]) => ({ value, label })),
              },
              {
                name: "actor",
                label: "Pelaku",
                options: profiles.map((profile) => ({
                  value: profile.user_id,
                  label: profile.full_name,
                })),
              },
              { name: "id", label: "Cari ID data (UUID)" },
              { name: "from", label: "Dari tanggal (WIB)", type: "date" },
              { name: "to", label: "Sampai tanggal (WIB)", type: "date" },
            ]}
          />
        </div>
      </section>
      {!parsed.success ? (
        <p role="alert" className="rounded-xl border bg-card p-5 text-red-800">
          Periksa ID data, pelaku, dan rentang tanggal. ID harus berbentuk UUID
          dan tanggal akhir tidak boleh mendahului tanggal awal.
        </p>
      ) : !rows.length ? (
        <p className="rounded-xl border bg-card p-6">
          Tidak ada catatan sesuai filter. Ubah atau reset filter untuk melihat
          catatan lain.
        </p>
      ) : (
        <section aria-labelledby="audit-table-heading" className="overflow-hidden rounded-xl border bg-card">
          <div className="flex items-center justify-between gap-4 border-b px-4 py-4 sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <FileClock aria-hidden="true" className="size-5 shrink-0 text-accent" />
              <div>
                <h2 id="audit-table-heading" className="type-card-title text-primary">
                  Riwayat perubahan data
                </h2>
                <p className="text-xs text-muted-foreground">
                  Menampilkan {rows.length} dari {total} catatan
                </p>
              </div>
            </div>
            <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-primary">
              Audit aktif
            </span>
          </div>
          <div
            role="region"
            aria-label="Catatan audit"
            tabIndex={0}
            className="min-w-0 overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
          >
            <table className="w-full min-w-[900px] text-left text-sm">
            <caption className="sr-only">Catatan perubahan data administratif</caption>
            <thead className="border-b bg-secondary">
              <tr>
                {["Waktu (WIB)", "Pelaku", "Tindakan", "Jenis data", "Objek", "Detail"].map(
                  (label) => (
                    <th key={label} scope="col" className="px-4 py-3">{label}</th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const actor = row.actor_id
                  ? (actorNames.get(row.actor_id) ?? "Profil tidak tersedia")
                  : "Pelaku tidak tercatat";
                const action = actions[row.action as keyof typeof actions] ?? row.action;
                const entity =
                  entities[row.entity_type as keyof typeof entities] ?? row.entity_type;
                const object = objectName(row.entity_type, row.entity_id);
                const time = formatTime(row.occurred_at);
                return (
                  <tr key={row.id} className="border-b last:border-0">
                    <td className="whitespace-nowrap px-4 py-4">
                      <time dateTime={row.occurred_at}>{time}</time>
                    </td>
                    <td className="max-w-56 break-words px-4 py-4">{actor}</td>
                    <td className="px-4 py-4">
                      <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-primary">
                        {action}
                      </span>
                    </td>
                    <td className="px-4 py-4">{entity}</td>
                    <td className="max-w-64 break-words px-4 py-4">{object}</td>
                    <td className="px-4 py-4">
                      <AuditLogDetail
                        time={time}
                        actor={actor}
                        action={action}
                        entity={entity}
                        objectName={object}
                        identifier={row.entity_id}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            </table>
          </div>
        </section>
      )}
      <Pagination
        path="/dashboard/monitoring"
        params={{ tab: "audit", ...values }}
        page={page}
        total={total}
      />
    </div>
  );
}
