import Link from "next/link";
import { requireAccess } from "@/lib/auth/access";
import { loadMonitoring, loadRecentActivity } from "@/lib/monitoring/data";
import { distribution, filterRows, parseFilters, type SearchParams } from "@/lib/monitoring/model";
import { MonitoringFilterForm } from "@/components/monitoring/filters";
import { MonitoringSummary } from "@/components/monitoring/summary";
import { CountryChart } from "@/components/monitoring/country-chart";
import { DistributionTable } from "@/components/monitoring/distribution";
import { Button } from "@/components/ui/button";
import { statusLabels } from "@/lib/alumni/schema";
import { DashboardPanel } from "@/components/dashboard-panel";

export default async function Dashboard({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const access = await requireAccess();
  const filters = parseFilters(await searchParams);
  if (access.canWrite) filters.school = "";
  const all = await loadMonitoring(access);
  const rows = filterRows(all, filters);
  const countries = distribution(rows, "country");
  const recent = await loadRecentActivity(access, filters);
  let schoolCounts: { total: number; active: number } | null = null;
  if (!access.canWrite) {
    const [total, active] = await Promise.all([
      access.supabase.from("schools").select("id", { count: "exact", head: true }),
      access.supabase.from("schools").select("id", { count: "exact", head: true }).eq("is_active", true),
    ]);
    if (total.error || active.error) throw new Error("School statistics unavailable");
    schoolCounts = { total: total.count ?? 0, active: active.count ?? 0 };
  }
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-primary">Monitoring Alumni</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            {access.canWrite ? "Perkembangan alumni sekolah Anda." : "Perkembangan alumni SMK lintas sekolah."} Statistik menggunakan satu
            penempatan saat ini per alumni, bukan jumlah seluruh riwayat.
          </p>
        </div>
        {access.canWrite && (
          <div className="flex flex-wrap gap-2">
            <Button asChild className="min-h-11">
              <Link href="/dashboard/alumni/new">Tambah alumni</Link>
            </Button>
            <Button asChild variant="outline" className="min-h-11">
              <Link href="/dashboard/alumni">Data alumni</Link>
            </Button>
          </div>
        )}
      </div>
      {schoolCounts && (
        <p className="mt-5 border-l-4 border-accent bg-white px-4 py-3 text-sm">
          <strong>{schoolCounts.total}</strong> sekolah terdaftar · <strong>{schoolCounts.active}</strong> sekolah aktif. Jumlah sekolah
          mencakup seluruh sekolah, tidak mengikuti filter alumni.
        </p>
      )}
      <MonitoringFilterForm rows={all} values={filters} path="/dashboard" showSchools={!access.canWrite} />
      <MonitoringSummary rows={rows} />
      {!rows.length && (
        <p role="status" className="mt-4 text-sm text-muted-foreground">
          Belum ada alumni sesuai filter yang dipilih.
        </p>
      )}
      <section className="mt-6 min-w-0 rounded-lg border bg-white p-5">
        <h2 className="text-lg font-semibold text-primary">Sebaran negara tujuan</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Grafik menampilkan paling banyak delapan kelompok terbesar. Seluruh nilai tersedia pada tabel di bawah.
        </p>
        <CountryChart data={countries} />
      </section>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <DashboardPanel title="Alumni per negara" height="md">
          <div className="flex justify-between border-b pb-3 text-sm font-semibold">
            <span>Kelompok</span>
            <span>Alumni</span>
          </div>

          <div className="divide-y divide-slate-200">
            {countries.map((country) => (
              <div key={country.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                <span>{country.name}</span>
                <span className="font-medium tabular-nums">{country.count}</span>
              </div>
            ))}
          </div>
        </DashboardPanel>

        <DashboardPanel title="Alumni per tahun kelulusan" height="md">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="pb-3 text-left font-semibold text-[#17324D]">
                  Tahun Kelulusan
                </th>
                <th className="pb-3 text-right font-semibold text-[#17324D]">
                  Alumni
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200">
              {distribution(rows, "year").map((item) => (
                <tr key={item.id}>
                  <td className="py-3 text-slate-700">
                    {item.name}
                  </td>
                  <td className="py-3 text-right font-medium tabular-nums text-slate-700">
                    {item.count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DashboardPanel>

        {!access.canWrite && <DistributionTable title="Alumni per sekolah" rows={distribution(rows, "school")} />}
        <DashboardPanel
          title="Aktivitas status terbaru"
          description="Delapan catatan terakhir pada penempatan saat ini."
          height="lg"
          className="xl:col-span-2">
          <ul className="m-0 list-none divide-y divide-slate-200 p-0">
            {recent.map((item) => (
              <li key={item.id} className="py-4 first:pt-0 last:pb-0">
                <div className="flex flex-col gap-1">
                  <Link
                    href={`/dashboard/alumni/${item.placements.alumni.id}`}
                    className="inline-flex min-h-11 items-center font-medium text-accent underline underline-offset-4">
                    {item.placements.alumni.full_name}
                  </Link>
                  <p>
                    {item.old_status ? statusLabels[item.old_status] + " → " : "Pencatatan awal: "}
                    {statusLabels[item.new_status]}
                  </p>
                  <time dateTime={item.changed_at} className="mt-1 block text-xs text-muted-foreground">
                    {new Intl.DateTimeFormat("id-ID", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: "Asia/Jakarta",
                    }).format(new Date(item.changed_at))}{" "}
                    WIB
                  </time>
                </div>
              </li>
            ))}
          </ul>
        </DashboardPanel>
      </div>
    </>
  );
}
