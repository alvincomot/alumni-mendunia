import Link from "next/link";
import { requireAccess } from "@/lib/auth/access";
import { loadMonitoring, loadRecentActivity } from "@/lib/monitoring/data";
import {
  distribution,
  filterRows,
  parseFilters,
  type SearchParams,
} from "@/lib/monitoring/model";
import { MonitoringFilterForm } from "@/components/monitoring/filters";
import { DashboardSummary } from "@/components/monitoring/summary";
import { CountryChart } from "@/components/monitoring/country-chart";
import { DashboardRanking } from "@/components/monitoring/dashboard-ranking";
import { Button } from "@/components/ui/button";
import {
  statusLabels,
  type PlacementStatus,
} from "@/lib/alumni/schema";
import { DashboardPanel } from "@/components/dashboard-panel";
import {
  DashboardIcon,
  type DashboardIconName,
} from "@/components/dashboard-icon";

const activityStyles: Record<
  PlacementStatus,
  { icon: DashboardIconName; iconStyle: string; badgeStyle: string }
> = {
  persiapan_berangkat: {
    icon: "plane",
    iconStyle: "bg-amber-50 text-amber-900",
    badgeStyle: "bg-amber-50 text-amber-900",
  },
  aktif_bekerja: {
    icon: "briefcase",
    iconStyle: "bg-[#D8F7E9] text-[#00563A]",
    badgeStyle: "bg-[#E1F4EB] text-[#006B49]",
  },
  selesai_kontrak: {
    icon: "clipboard",
    iconStyle: "bg-[#E6E8EA] text-[#444653]",
    badgeStyle: "bg-[#E6E8EA] text-[#5D5F6B]",
  },
  batal_berangkat: {
    icon: "cancel",
    iconStyle: "bg-[#FFDAD6] text-[#BA1A1A]",
    badgeStyle: "bg-[#FFDAD6] text-[#93000A]",
  },
};

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const access = await requireAccess();
  const filters = parseFilters(await searchParams);
  if (access.canWrite) filters.school = "";

  const schoolCountsPromise = access.canWrite
    ? Promise.resolve(null)
    : Promise.all([
        access.supabase
          .from("schools")
          .select("id", { count: "exact", head: true }),
        access.supabase
          .from("schools")
          .select("id", { count: "exact", head: true })
          .eq("is_active", true),
      ]).then(([total, active]) => {
        if (total.error || active.error)
          throw new Error("School statistics unavailable");
        return { total: total.count ?? 0, active: active.count ?? 0 };
      });
  const [all, recent, schoolCounts] = await Promise.all([
    loadMonitoring(access),
    loadRecentActivity(access, filters),
    schoolCountsPromise,
  ]);
  const rows = filterRows(all, filters);
  const countries = distribution(rows, "country");
  const years = distribution(rows, "year");
  const schools = distribution(rows, "school");
  const hasActiveFilters = Object.entries(filters).some(([key, value]) =>
    key === "sort" ? value !== "name" : Boolean(value),
  );
  return (
    <div className="mx-auto w-full max-w-[90rem]">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="type-page-title text-[#191C1E]">
            Ringkasan Statistik
          </h1>
          <p className="type-supporting mt-1 text-[#6B6D7A]">
            {access.canWrite
              ? "Data alumni dari sekolah Anda."
              : "Data alumni SMK lintas sekolah sesuai akses Anda."}
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
          {access.canWrite && (
            <>
            <Button
              asChild
              className="px-4"
            >
              <Link href="/dashboard/alumni/new">Tambah alumni</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="px-4"
            >
              <Link href="/dashboard/alumni">Data alumni</Link>
            </Button>
            </>
          )}
          <details className="group relative">
            <summary
              className={`flex min-h-11 cursor-pointer list-none items-center rounded-lg border px-4 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden ${
                hasActiveFilters
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-[#C4C5D5] bg-white text-primary hover:bg-[#F2F4F6]"
              }`}
            >
              {hasActiveFilters ? "Filter aktif" : "Filter"}
            </summary>
            <div className="absolute right-0 z-20 mt-2 max-h-[75dvh] w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-slate-200/80 bg-white px-5 pb-5 pt-1 shadow-xl sm:w-[36rem] xl:w-[52rem] [&_form]:my-4">
              <MonitoringFilterForm
                rows={all}
                values={filters}
                path="/dashboard"
                showSchools={!access.canWrite}
              />
            </div>
          </details>
        </div>
      </div>

      <DashboardSummary rows={rows} />

      {!rows.length && (
        <p
          role="status"
          className="mt-4 rounded-2xl border border-slate-200/80 bg-white px-5 py-4 text-sm leading-6 text-[#6B6D7A]"
        >
          Belum ada alumni sesuai filter yang dipilih. Ubah atau reset filter
          untuk melihat data lain.
        </p>
      )}

      <section className="mt-6 rounded-xl border bg-card p-5 sm:p-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="type-section-title text-[#191C1E]">
              Sebaran Negara Tujuan
            </h2>
            <p className="type-supporting mt-1 text-[#6B6D7A]">
              Perbandingan negara tujuan dari alumni yang memiliki penempatan.
            </p>
          </div>
          <Link
            href={
              access.canWrite ? "/dashboard/alumni" : "/dashboard/reports"
            }
            className="inline-flex min-h-11 items-center text-xs font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Lihat semua
          </Link>
        </div>
        <CountryChart data={countries} />
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <DashboardRanking
          title="Berdasarkan Angkatan"
          rows={years}
          variant="year"
        />
        <DashboardRanking
          title="Top SMK Pengirim"
          description={
            schoolCounts
              ? `${schoolCounts.total.toLocaleString("id-ID")} sekolah terdaftar, ${schoolCounts.active.toLocaleString("id-ID")} aktif.`
              : "Distribusi alumni pada sekolah Anda."
          }
          rows={schools}
          variant="school"
        />

        <DashboardPanel
          title="Aktivitas Status Terbaru"
          description="Delapan catatan terakhir pada penempatan saat ini."
          height="lg"
          className="lg:col-span-2"
        >
          {!recent.length ? (
            <p className="text-sm leading-6 text-[#6B6D7A]">
              Belum ada aktivitas status sesuai filter yang dipilih.
            </p>
          ) : (
            <ul className="divide-y divide-[#ECEEF0]">
              {recent.map((item) => {
                const visual = activityStyles[item.new_status];
                return (
                  <li
                    key={item.id}
                    className="flex items-start gap-4 py-4 first:pt-0 last:pb-0"
                  >
                    <span
                      className={`flex size-10 shrink-0 items-center justify-center rounded-full ${visual.iconStyle}`}
                    >
                      <DashboardIcon
                        name={visual.icon}
                        className="size-5"
                      />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                        <Link
                          href={`/dashboard/alumni/${item.placements.alumni.id}`}
                          className="font-semibold text-[#191C1E] underline-offset-4 hover:text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                        >
                          {item.placements.alumni.full_name}
                        </Link>
                        <time
                          dateTime={item.changed_at}
                          className="shrink-0 text-[11px] text-[#6B6D7A]"
                        >
                          {new Intl.DateTimeFormat("id-ID", {
                            dateStyle: "medium",
                            timeStyle: "short",
                            timeZone: "Asia/Jakarta",
                          }).format(new Date(item.changed_at))}{" "}
                          WIB
                        </time>
                      </div>
                      <p className="type-supporting mt-1 text-[#444653]">
                        {item.old_status
                          ? `${statusLabels[item.old_status]} menjadi ${statusLabels[item.new_status]}`
                          : `Pencatatan awal: ${statusLabels[item.new_status]}`}
                      </p>
                      <span
                        className={`mt-1.5 inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none ${visual.badgeStyle}`}
                      >
                        {statusLabels[item.new_status]}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </DashboardPanel>
      </div>
    </div>
  );
}
