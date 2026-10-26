import { redirect } from "next/navigation";
import { requireAccess } from "@/lib/auth/access";
import { readAllRows } from "@/lib/data/read-all";
import { auditFilterSchema, wibBoundary } from "@/lib/audit/filters";
import { Filters } from "@/components/data/filters";
import { Pagination } from "@/components/data/pagination";
import type { SearchParams } from "@/lib/monitoring/model";

const actions = { INSERT: "Tambah", UPDATE: "Ubah", DELETE: "Hapus" };
const entities = {
  schools: "Sekolah",
  profiles: "Profil pengguna",
  alumni: "Alumni",
  placements: "Penempatan",
};

export default async function AuditLogsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const access = await requireAccess(["admin_dinas"]);
  const raw = await searchParams;
  const values = Object.fromEntries(
    ["action", "actor", "entity", "id", "from", "to"].map((key) => [
      key,
      typeof raw[key] === "string" ? raw[key].slice(0, 150) : "",
    ]),
  );
  const parsed = auditFilterSchema.safeParse(values);
  const profiles = await readAllRows<{ user_id: string; full_name: string }>(
    (start, end) =>
      access.supabase
        .from("profiles")
        .select("user_id, full_name", { count: "exact" })
        .order("user_id")
        .range(start, end),
  );
  const names = new Map(
    profiles.map((profile) => [profile.user_id, profile.full_name]),
  );
  const requested =
    typeof raw.page === "string" && /^\d{1,6}$/.test(raw.page)
      ? Number(raw.page)
      : 1;
  const page = Math.max(1, requested);
  let query = access.supabase
    .from("audit_logs")
    .select("id, actor_id, action, entity_type, entity_id, occurred_at", {
      count: "exact",
    });
  if (parsed.success) {
    const f = parsed.data;
    if (f.action) query = query.eq("action", f.action);
    if (f.actor) query = query.eq("actor_id", f.actor);
    if (f.entity) query = query.eq("entity_type", f.entity);
    if (f.id) query = query.eq("entity_id", f.id);
    if (f.from) query = query.gte("occurred_at", wibBoundary(f.from));
    if (f.to) query = query.lt("occurred_at", wibBoundary(f.to, true));
  }
  const result = parsed.success
    ? await query
        .order("occurred_at", { ascending: false })
        .order("id")
        .range((page - 1) * 20, page * 20 - 1)
    : { data: [], count: 0, error: null };
  const total = result.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / 20));
  if (result.error?.code === "PGRST103" || (!result.error && page > pages))
    redirect(
      `/dashboard/audit-logs?${new URLSearchParams({ ...values, page: "1" })}`,
    );
  if (result.error) throw new Error("Audit logs unavailable");
  return (
    <>
      <h1 className="text-2xl font-semibold text-primary">Audit Log</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
        Catatan perubahan data, hanya baca. Filter tanggal menggunakan WIB.
        Undangan email dan perubahan pada Supabase Auth tidak dicatat oleh tabel
        ini; periksa log Auth pada layanan Supabase.
      </p>
      <Filters
        path="/dashboard/audit-logs"
        values={values}
        fields={[
          {
            name: "action",
            label: "Tindakan",
            options: Object.entries(actions).map(([value, label]) => ({
              value,
              label,
            })),
          },
          {
            name: "entity",
            label: "Jenis data",
            options: Object.entries(entities).map(([value, label]) => ({
              value,
              label,
            })),
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
      {!parsed.success ? (
        <p role="alert" className="rounded-lg border bg-white p-5 text-red-800">
          Periksa ID data, pelaku, dan rentang tanggal. ID harus berbentuk UUID
          dan tanggal akhir tidak boleh mendahului tanggal awal.
        </p>
      ) : !result.data?.length ? (
        <p className="rounded-lg border bg-white p-6">
          Tidak ada catatan sesuai filter.
        </p>
      ) : (
        <div
          role="region"
          aria-label="Catatan audit"
          tabIndex={0}
          className="overflow-x-auto rounded-lg border bg-white"
        >
          <table className="w-full min-w-[850px] text-left text-sm">
            <caption className="sr-only">
              Catatan perubahan data administratif
            </caption>
            <thead className="border-b bg-secondary">
              <tr>
                {[
                  "Waktu (WIB)",
                  "Pelaku",
                  "Tindakan",
                  "Jenis data",
                  "ID data",
                ].map((label) => (
                  <th key={label} scope="col" className="px-4 py-3">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.data.map((row) => (
                <tr key={row.id} className="border-b last:border-0">
                  <td className="px-4 py-4">
                    <time dateTime={row.occurred_at}>
                      {new Intl.DateTimeFormat("id-ID", {
                        dateStyle: "medium",
                        timeStyle: "short",
                        timeZone: "Asia/Jakarta",
                      }).format(new Date(row.occurred_at))}
                    </time>
                  </td>
                  <td className="max-w-56 break-words px-4 py-4">
                    {row.actor_id
                      ? (names.get(row.actor_id) ?? "Profil tidak tersedia")
                      : "Sistem / pelaku tidak tercatat"}
                  </td>
                  <td className="px-4 py-4">
                    {actions[row.action as keyof typeof actions] ?? row.action}
                  </td>
                  <td className="px-4 py-4">
                    {entities[row.entity_type as keyof typeof entities] ??
                      row.entity_type}
                  </td>
                  <td className="break-all px-4 py-4">{row.entity_id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination
        path="/dashboard/audit-logs"
        params={values}
        page={page}
        total={total}
      />
    </>
  );
}
