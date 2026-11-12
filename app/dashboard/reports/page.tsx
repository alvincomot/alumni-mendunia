import { requireAccess } from "@/lib/auth/access";
import { loadMonitoring } from "@/lib/monitoring/data";
import {
  distribution,
  reportHeaders,
  reportValues,
  securedPlacementRows,
  type SearchParams,
} from "@/lib/monitoring/model";
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
  const rows = await loadMonitoring(access);
  const confirmedPlacementRows = securedPlacementRows(rows);
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
      <h1 className="sr-only">Laporan Alumni</h1>
      <div className="mb-6 flex justify-end">
        <Button asChild className="min-h-11">
          <a href="/dashboard/reports/export">Unduh CSV</a>
        </Button>
      </div>
      <MonitoringSummary rows={rows} />
      <div className="my-6 grid gap-6 xl:grid-cols-2">
        {(["school", "country", "year", "sector"] as const).map((dimension) => (
          <DistributionTable
            key={dimension}
            title={
              {
                school: "Alumni per sekolah",
                country: "Penempatan terkonfirmasi per negara",
                year: "Alumni per tahun kelulusan",
                sector: "Penempatan terkonfirmasi per sektor pekerjaan",
              }[dimension]
            }
            rows={
              distribution(
                dimension === "country" || dimension === "sector"
                  ? confirmedPlacementRows
                  : rows,
                dimension,
              )
            }
          />
        ))}
      </div>
      <h2 className="type-section-title mb-4 text-primary">
        Rincian alumni
      </h2>
      {rows.length ? (
        <ReportTable
          headers={reportHeaders}
          rows={rows.slice((page - 1) * 20, page * 20).map(reportValues)}
        />
      ) : (
        <p className="rounded-xl border bg-card p-6">
          Belum ada data alumni untuk ditampilkan. Ekspor tetap berisi judul
          kolom.
        </p>
      )}
      <Pagination
        path="/dashboard/reports"
        params={{}}
        page={page}
        total={rows.length}
      />
    </>
  );
}
