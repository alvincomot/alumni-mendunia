import Link from "next/link";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  BarChart3,
  Briefcase,
  CheckCircle2,
  Clock,
  Mail,
  Plane,
  School,
  TrendingUp,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RecentMonitoringActivity } from "@/lib/system-monitoring/data";
import { monitoringPathLabels } from "@/lib/system-monitoring/paths";
import type {
  MonitoringPeriod,
  SystemMonitoringSummary,
} from "@/lib/system-monitoring/period";

function formatDay(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}

function formatGeneratedAt(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}

export function MonitoringPeriodFilter({ period }: { period: MonitoringPeriod }) {
  return (
    <form
      action="/dashboard/monitoring"
      method="get"
      className="mb-5 grid items-end gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 xl:grid-cols-[minmax(10rem,0.8fr)_minmax(10rem,1fr)_minmax(10rem,1fr)_auto]"
    >
      <input type="hidden" name="tab" value="usage" />
      <label className="type-label block space-y-2">
        <span>Periode pemantauan</span>
        <select
          name="period"
          defaultValue={period.key}
          className="form-control block font-normal"
        >
          <option value="today">Hari ini</option>
          <option value="7d">7 hari terakhir</option>
          <option value="30d">30 hari terakhir</option>
          <option value="custom">Rentang khusus</option>
        </select>
      </label>
      <label className="type-label block space-y-2">
        <span>Dari tanggal</span>
        <input
          type="date"
          name="from"
          defaultValue={period.key === "custom" ? period.from : ""}
          className="form-control block font-normal"
        />
      </label>
      <label className="type-label block space-y-2">
        <span>Sampai tanggal</span>
        <input
          type="date"
          name="to"
          defaultValue={period.key === "custom" ? period.to : ""}
          className="form-control block font-normal"
        />
      </label>
      <Button type="submit">Terapkan</Button>
    </form>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  note,
  tone = "neutral",
}: {
  icon: typeof School;
  label: string;
  value: number | string;
  note: string;
  tone?: "neutral" | "positive" | "warning";
}) {
  const toneClasses = {
    neutral: "bg-secondary text-primary",
    positive: "bg-emerald-100 text-emerald-700",
    warning: "bg-red-100 text-red-700",
  };
  return (
    <div className="min-w-0 rounded-xl border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        <span
          className={`grid size-9 shrink-0 place-items-center rounded-full ${toneClasses[tone]}`}
        >
          <Icon aria-hidden="true" className="size-[18px]" />
        </span>
      </div>
      <p className="mt-4 text-3xl font-bold tabular-nums text-primary">{value}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{note}</p>
    </div>
  );
}

function TrafficTrend({ data }: { data: SystemMonitoringSummary["traffic"] }) {
  if (!data.trend.length || data.selected_period === 0)
    return (
      <div className="grid min-h-64 place-items-center rounded-lg bg-secondary/60 p-6 text-center">
        <div>
          <BarChart3
            aria-hidden="true"
            className="mx-auto size-8 text-muted-foreground"
          />
          <p className="mt-3 font-medium">Belum ada pageview pada periode ini</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Grafik akan terisi setelah halaman dashboard dikunjungi.
          </p>
        </div>
      </div>
    );

  const chartWidth = 720;
  const chartHeight = 220;
  const insetX = 24;
  const insetY = 20;
  const maximum = Math.max(...data.trend.map((item) => item.count), 1);
  const plotWidth = chartWidth - insetX * 2;
  const plotHeight = chartHeight - insetY * 2;
  const points = data.trend.map((item, index) => {
    const x =
      data.trend.length === 1
        ? chartWidth / 2
        : insetX + (index / (data.trend.length - 1)) * plotWidth;
    const y = insetY + plotHeight - (item.count / maximum) * plotHeight;
    return { ...item, x, y };
  });
  const linePath = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`)
    .join(" ");
  const lastPoint = points.at(-1) ?? points[0];
  const areaPath = `${linePath} L${lastPoint.x},${chartHeight - insetY} L${points[0].x},${chartHeight - insetY} Z`;
  const average = Math.round(data.selected_period / data.trend.length);

  return (
    <>
      <div
        className="min-h-64 w-full"
        role="img"
        aria-label="Grafik tren pageview dashboard"
      >
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="h-64 w-full"
          aria-hidden="true"
        >
          {[0, 0.5, 1].map((position) => (
            <line
              key={position}
              x1={insetX}
              x2={chartWidth - insetX}
              y1={insetY + plotHeight * position}
              y2={insetY + plotHeight * position}
              stroke="currentColor"
              className="text-border"
              strokeDasharray="4 5"
            />
          ))}
          <path d={areaPath} fill="hsl(var(--accent) / 0.1)" />
          <path
            d={linePath}
            fill="none"
            stroke="hsl(var(--accent))"
            strokeWidth="3"
          />
          {points.map((point) => (
            <circle
              key={point.day}
              cx={point.x}
              cy={point.y}
              r="4"
              fill="white"
              stroke="hsl(var(--accent))"
              strokeWidth="3"
            >
              <title>{`${formatDay(point.day)}: ${point.count} pageview`}</title>
            </circle>
          ))}
        </svg>
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{formatDay(data.trend[0].day)}</span>
        <span>{formatDay(lastPoint.day)}</span>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-4 text-sm">
        <span>
          Total periode:{" "}
          <strong className="tabular-nums text-primary">
            {data.selected_period} pageview
          </strong>
        </span>
        <span className="text-muted-foreground">Rata-rata {average} per hari</span>
      </div>
    </>
  );
}

const actionLabels: Record<string, string> = {
  INSERT: "Menambah",
  UPDATE: "Mengubah",
  DELETE: "Menghapus",
};

const entityLabels: Record<string, string> = {
  schools: "sekolah",
  profiles: "profil pengguna",
  alumni: "alumni",
  placements: "penempatan",
};

export function UsagePanel({
  data,
  recentActivity,
}: {
  data: SystemMonitoringSummary;
  recentActivity: RecentMonitoringActivity[];
}) {
  const withoutRecentChanges = Math.max(
    data.schools.total - data.schools.schools_with_changes_30_days,
    0,
  );
  const activityItems = [
    {
      label: "Alumni ditambahkan",
      value: data.features.alumni_created,
      icon: UserPlus,
    },
    {
      label: "Penempatan diperbarui",
      value: data.features.placement_changes,
      icon: Briefcase,
    },
    {
      label: "Keberangkatan dikonfirmasi",
      value: data.features.departure_confirmations,
      icon: Plane,
    },
    {
      label: "Data alumni diperbarui",
      value: data.features.alumni_updated,
      icon: Activity,
    },
  ];

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-3 rounded-xl border bg-card px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="size-2.5 shrink-0 rounded-full bg-emerald-600"
            aria-hidden="true"
          />
          <p className="min-w-0">
            <strong className="font-semibold text-primary">
              Sumber pemantauan aktif:
            </strong>{" "}
            pageview agregat, lifecycle akun sekolah, dan Audit Log.
          </p>
        </div>
        <Link
          href="/dashboard/monitoring?tab=health"
          className="shrink-0 font-semibold text-accent hover:underline"
        >
          Lihat kesehatan sistem
          <ArrowRight aria-hidden="true" className="ml-1 inline size-4" />
        </Link>
      </section>

      <section aria-labelledby="monitoring-kpi-heading">
        <h2 id="monitoring-kpi-heading" className="sr-only">
          Ringkasan angka pemantauan
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            icon={School}
            label="Total sekolah"
            value={data.schools.total}
            note="Terdaftar dalam sistem"
          />
          <KpiCard
            icon={CheckCircle2}
            label="Sudah aktivasi"
            value={data.schools.active_accounts}
            note={`${data.schools.activation_percentage}% dari sekolah terdaftar`}
            tone="positive"
          />
          <KpiCard
            icon={AlertCircle}
            label="Belum aktivasi"
            value={data.schools.not_activated}
            note={`${data.schools.pending_activation} akun menunggu aktivasi`}
            tone="warning"
          />
          <KpiCard
            icon={TrendingUp}
            label="Kunjungan 7 hari"
            value={data.traffic.last_7_days}
            note="Total pageview dashboard"
          />
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,0.9fr)]">
        <section
          aria-labelledby="trend-heading"
          className="rounded-xl border bg-card p-5"
        >
          <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 id="trend-heading" className="type-section-title text-primary">
                Tren penggunaan
              </h2>
              <p className="text-sm text-muted-foreground">
                Pageview dashboard berdasarkan periode terpilih.
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Diperbarui {formatGeneratedAt(data.generated_at)} WIB
            </p>
          </div>
          <TrafficTrend data={data.traffic} />
          {data.traffic.top_paths.length > 0 && (
            <div className="mt-4 border-t pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Halaman paling sering dibuka
              </p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {data.traffic.top_paths.slice(0, 3).map((item) => (
                  <li
                    key={item.path}
                    className="rounded-full bg-secondary px-3 py-1 text-xs"
                  >
                    {monitoringPathLabels[item.path] ?? item.path} ·{" "}
                    <strong>{item.count}</strong>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section
          aria-labelledby="attention-heading"
          className="rounded-xl border bg-card p-5"
        >
          <h2 id="attention-heading" className="type-section-title text-primary">
            Perlu perhatian
          </h2>
          <p className="text-sm text-muted-foreground">
            Kondisi yang dapat ditindaklanjuti admin.
          </p>
          <div className="mt-4 divide-y">
            <div className="py-4 first:pt-0">
              <div className="flex gap-3">
                <AlertCircle
                  aria-hidden="true"
                  className="mt-0.5 size-5 shrink-0 text-red-700"
                />
                <div>
                  <p className="font-semibold">
                    {data.schools.not_activated} sekolah belum aktivasi
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Akun belum berstatus ACTIVE.
                  </p>
                  <Link
                    href="/dashboard/schools"
                    className="mt-2 inline-flex items-center text-xs font-semibold text-accent hover:underline"
                  >
                    Lihat sekolah
                    <ArrowRight aria-hidden="true" className="ml-1 size-3.5" />
                  </Link>
                </div>
              </div>
            </div>
            <div className="py-4">
              <div className="flex gap-3">
                <Clock
                  aria-hidden="true"
                  className="mt-0.5 size-5 shrink-0 text-muted-foreground"
                />
                <div>
                  <p className="font-semibold">
                    {withoutRecentChanges} sekolah tanpa perubahan data
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Tidak muncul sebagai pelaku perubahan dalam 30 hari terakhir.
                  </p>
                  <Link
                    href="/dashboard/monitoring?tab=audit"
                    className="mt-2 inline-flex items-center text-xs font-semibold text-accent hover:underline"
                  >
                    Tinjau aktivitas
                    <ArrowRight aria-hidden="true" className="ml-1 size-3.5" />
                  </Link>
                </div>
              </div>
            </div>
            <div className="py-4 last:pb-0">
              <div className="flex gap-3">
                <Mail
                  aria-hidden="true"
                  className="mt-0.5 size-5 shrink-0 text-muted-foreground"
                />
                <div>
                  <p className="font-semibold">
                    Pemantauan email belum tersedia
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Telemetry provider belum terintegrasi.
                  </p>
                  <Link
                    href="/dashboard/monitoring?tab=health"
                    className="mt-2 inline-flex items-center text-xs font-semibold text-accent hover:underline"
                  >
                    Lihat layanan
                    <ArrowRight aria-hidden="true" className="ml-1 size-3.5" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <section
          aria-labelledby="activation-heading"
          className="flex min-h-64 flex-col rounded-xl border bg-card p-5"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 id="activation-heading" className="type-card-title text-primary">
              Aktivasi sekolah
            </h2>
            <span className="text-xs text-muted-foreground">
              {data.schools.activation_percentage}% aktif
            </span>
          </div>
          <div
            className="mt-5 h-2.5 overflow-hidden rounded-full bg-secondary"
            role="progressbar"
            aria-label="Persentase aktivasi sekolah"
            aria-valuenow={data.schools.activation_percentage}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${data.schools.activation_percentage}%` }}
            />
          </div>
          <dl className="mt-5 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3 rounded-lg bg-secondary/70 px-3 py-2.5">
              <dt>Sudah aktivasi</dt>
              <dd className="font-semibold tabular-nums">
                {data.schools.active_accounts}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg bg-secondary/70 px-3 py-2.5">
              <dt>Belum aktivasi</dt>
              <dd className="font-semibold tabular-nums">
                {data.schools.not_activated}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg bg-secondary/70 px-3 py-2.5">
              <dt>Ditangguhkan</dt>
              <dd className="font-semibold tabular-nums">
                {data.schools.suspended}
              </dd>
            </div>
          </dl>
          <Link
            href="/dashboard/schools"
            className="mt-auto pt-5 text-sm font-semibold text-accent hover:underline"
          >
            Lihat semua sekolah
            <ArrowRight aria-hidden="true" className="ml-1 inline size-4" />
          </Link>
        </section>

        <section
          aria-labelledby="data-activity-heading"
          className="rounded-xl border bg-card p-5"
        >
          <h2 id="data-activity-heading" className="type-card-title text-primary">
            Aktivitas data
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Periode yang sedang dipilih
          </p>
          <dl className="mt-4 space-y-2">
            {activityItems.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.label}
                  className="flex items-center justify-between gap-3 rounded-lg bg-secondary/70 px-3 py-3 text-sm"
                >
                  <dt className="flex min-w-0 items-center gap-3">
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white text-accent">
                      <Icon aria-hidden="true" className="size-4" />
                    </span>
                    <span>{item.label}</span>
                  </dt>
                  <dd className="font-semibold tabular-nums">{item.value}</dd>
                </div>
              );
            })}
          </dl>
        </section>

        <section
          aria-labelledby="recent-audit-heading"
          className="flex min-h-64 flex-col rounded-xl border bg-card p-5"
        >
          <h2 id="recent-audit-heading" className="type-card-title text-primary">
            Audit terbaru
          </h2>
          {recentActivity.length ? (
            <ol className="mt-4 divide-y">
              {recentActivity.map((item) => (
                <li
                  key={item.id}
                  className="grid grid-cols-[4.5rem_1fr] gap-3 py-3 text-sm first:pt-0"
                >
                  <time
                    dateTime={item.occurredAt}
                    className="text-xs tabular-nums text-muted-foreground"
                  >
                    {formatTime(item.occurredAt)}
                  </time>
                  <div className="min-w-0">
                    <p className="font-medium">
                      {actionLabels[item.action] ?? item.action}{" "}
                      {entityLabels[item.entityType] ?? item.entityType}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {item.actorName}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <div className="grid flex-1 place-items-center py-8 text-center text-sm text-muted-foreground">
              Belum ada catatan audit yang dapat ditampilkan.
            </div>
          )}
          <Link
            href="/dashboard/monitoring?tab=audit"
            className="mt-auto pt-4 text-sm font-semibold text-accent hover:underline"
          >
            Lihat Audit Log
            <ArrowRight aria-hidden="true" className="ml-1 inline size-4" />
          </Link>
        </section>
      </div>

      <p className="text-xs leading-5 text-muted-foreground">
        Pageview tidak sama dengan pengunjung unik. Aplikasi tidak menyimpan
        query string, identitas pengguna, atau session analytics pada agregat ini.
      </p>
    </div>
  );
}
