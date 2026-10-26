import { requireAccess } from "@/lib/auth/access";
import { loadMonitoring } from "@/lib/monitoring/data";
import {
  distribution,
  filterRows,
  parseFilters,
  reportHeaders,
  reportValues,
  type SearchParams,
} from "@/lib/monitoring/model";
import { MonitoringFilterForm } from "@/components/monitoring/filters";
import { MonitoringSummary } from "@/components/monitoring/summary";
import { DistributionTable } from "@/components/monitoring/distribution";
import { ReportTable } from "@/components/data/report-table";
import { Pagination } from "@/components/data/pagination";
import { Button } from "@/components/ui/button";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const access = await requireAccess(["admin_dinas", "viewer_dinas"]);
  const params = await searchParams;
  const filters = parseFilters(params);
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
          <h1 className="text-2xl font-semibold text-primary">
            Laporan Alumni
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Satu baris per alumni dengan penempatan saat ini. Ringkasan dan
            ekspor mengikuti seluruh filter, bukan hanya halaman tabel.
          </p>
        </div>
        <Button asChild className="min-h-11">
          <a href={`/dashboard/reports/export?${new URLSearchParams(filters)}`}>
            Unduh CSV
          </a>
        </Button>
      </div>
      <MonitoringFilterForm
        rows={all}
        values={filters}
        path="/dashboard/reports"
        showSchools
        showSector
        showSearch
      />
      <MonitoringSummary rows={rows} />
      <div className="my-6 grid gap-6 xl:grid-cols-2">
        {(["school", "country", "year", "sector"] as const).map((dimension) => (
          <DistributionTable
            key={dimension}
            title={
              {
                school: "Alumni per sekolah",
                country: "Alumni per negara",
                year: "Alumni per tahun kelulusan",
                sector: "Alumni per sektor pekerjaan",
              }[dimension]
            }
            rows={distribution(rows, dimension)}
          />
        ))}
      </div>
      <h2 className="mb-4 text-lg font-semibold text-primary">
        Rincian alumni
      </h2>
      {rows.length ? (
        <ReportTable
          headers={reportHeaders}
          rows={rows.slice((page - 1) * 20, page * 20).map(reportValues)}
        />
      ) : (
        <p className="rounded-lg border bg-white p-6">
          Tidak ada data sesuai filter. Ekspor tetap berisi judul kolom.
        </p>
      )}
      <Pagination
        path="/dashboard/reports"
        params={filters}
        page={page}
        total={rows.length}
      />
    </>
  );
}
