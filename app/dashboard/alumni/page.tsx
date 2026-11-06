import { alumniListPath, alumniFormPath } from "@/lib/alumni/navigation";
import Link from "next/link";
import { requireAccess } from "@/lib/auth/access";
import { loadMonitoring } from "@/lib/monitoring/data";
import {
  filterRows,
  parseFilters,
  type SearchParams,
} from "@/lib/monitoring/model";
import { MonitoringFilterForm } from "@/components/monitoring/filters";
import { PlacementBadge } from "@/components/alumni/page-frame";
import { StatusAction } from "@/components/alumni/status-action";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/data/pagination";
import { formatCountryName } from "@/lib/countries";

export default async function AlumniPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const access = await requireAccess();
  const params = await searchParams;
  const filters = parseFilters(params);
  const returnTo = alumniListPath(params);
  if (access.canWrite) filters.school = "";
  const all = await loadMonitoring(access);
  const rows = filterRows(all, filters);
  const requested =
    typeof params.page === "string" && /^\d{1,6}$/.test(params.page)
      ? Number(params.page)
      : 1;
  const page = Math.min(
    Math.max(1, requested),
    Math.max(1, Math.ceil(rows.length / 20)),
  );
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="type-page-title text-primary">Data Alumni</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {access.canWrite
              ? "Kelola identitas, penempatan, dan perkembangan alumni sekolah Anda."
              : "Lihat alumni dan penempatan seluruh sekolah. Akses hanya baca."}
          </p>
        </div>
        {access.canWrite && (
          <Button asChild className="min-h-11">
            <Link href={alumniFormPath("/dashboard/alumni/new", returnTo)}>
              Tambah alumni
            </Link>
          </Button>
        )}
      </div>
      <MonitoringFilterForm
        rows={all}
        values={filters}
        path="/dashboard/alumni"
        showSchools={!access.canWrite}
        showSearch
        showSort={false}
        inlineActions
      />
      {rows.length === 0 ? (
        <section className="rounded-xl border bg-card p-6">
          <h2 className="type-section-title">Belum ada alumni sesuai filter</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Ubah filter atau gunakan Tambah alumni jika Anda petugas sekolah.
          </p>
        </section>
      ) : (
        <div
          role="region"
          aria-label="Daftar alumni, geser untuk melihat seluruh kolom"
          tabIndex={0}
          className="min-w-0 overflow-x-auto rounded-xl border bg-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
        >
          <table className="w-full min-w-[950px] text-left text-sm">
            <caption className="sr-only">
              Alumni dan penempatan saat ini
            </caption>
            <thead className="border-b bg-secondary text-primary">
              <tr>
                {[
                  "Nama lengkap",
                  "Tahun lulus",
                  "Jurusan",
                  "Sekolah",
                  "Negara tujuan",
                  "Status",
                  "Tindakan",
                ].map((label) => (
                  <th scope="col" key={label} className="px-4 py-3">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice((page - 1) * 20, page * 20).map((row) => {
                const p = row.placements[0];
                return (
                  <tr key={row.id} className="border-b last:border-0">
                    <th
                      scope="row"
                      className="max-w-56 break-words px-4 py-4 font-medium"
                    >
                      {row.full_name}
                    </th>
                    <td className="px-4 py-4 tabular-nums">
                      {row.graduation_year}
                    </td>
                    <td className="max-w-48 break-words px-4 py-4">
                      {row.major}
                    </td>
                    <td className="max-w-56 break-words px-4 py-4">
                      {row.schools?.name ?? "Sekolah tidak tersedia"}
                    </td>
                    <td className="max-w-40 break-words px-4 py-4">
                      {p?.destination_country
                        ? formatCountryName(p.destination_country)
                        : "Belum dicatat"}
                    </td>
                    <td className="px-4 py-4">
                      {p ? (
                        <PlacementBadge status={p.status} />
                      ) : (
                        "Belum ada penempatan"
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-2">
                        <Button asChild variant="outline" className="min-h-11">
                          <Link
                            href={alumniFormPath(
                              "/dashboard/alumni/" + row.id,
                              returnTo,
                            )}
                            aria-label={"Lihat detail " + row.full_name}
                          >
                            Detail
                          </Link>
                        </Button>
                        {access.canWrite && p && (
                          <StatusAction
                            placementId={p.id}
                            status={p.status}
                            alumniName={row.full_name}
                            context="list"
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pagination
        path="/dashboard/alumni"
        params={filters}
        page={page}
        total={rows.length}
      />
    </>
  );
}
