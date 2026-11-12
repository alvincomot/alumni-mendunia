import { requireAccess } from "@/lib/auth/access";
import type { SearchParams } from "@/lib/monitoring/model";
import {
  checkSystemHealth,
  loadRecentMonitoringActivity,
  loadSystemMonitoringSummary,
} from "@/lib/system-monitoring/data";
import { resolveMonitoringPeriod } from "@/lib/system-monitoring/period";
import { AuditLogPanel } from "@/components/monitoring/audit-log-panel";
import { HealthPanel } from "@/components/monitoring/health-panel";
import {
  SystemTabs,
  type SystemMonitoringTab,
} from "@/components/monitoring/system-tabs";
import {
  MonitoringPeriodFilter,
  UsagePanel,
} from "@/components/monitoring/usage-panel";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

function monitoringTab(value: SearchParams[string]): SystemMonitoringTab {
  return value === "audit" || value === "health" ? value : "usage";
}

export default async function MonitoringPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const access = await requireAccess(["admin_dinas"]);
  const raw = await searchParams;
  const tab = monitoringTab(raw.tab);
  const refreshParams = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string" && value.length <= 150)
      refreshParams.set(key, value);
  }
  if (tab !== "usage") refreshParams.set("tab", tab);
  const refreshHref = `/dashboard/monitoring${refreshParams.size ? `?${refreshParams}` : ""}`;

  return (
    <>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="type-page-title text-primary">Monitoring Sistem</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            Pantau penggunaan aplikasi, aktivitas data, dan kondisi layanan
            berdasarkan sumber yang tersedia.
          </p>
        </div>
        <Button asChild variant="outline" className="self-start">
          <a href={refreshHref}>
            <RefreshCw aria-hidden="true" />
            Perbarui data
          </a>
        </Button>
      </header>
      <SystemTabs active={tab} />
      {tab === "usage" && <UsageTab access={access} raw={raw} />}
      {tab === "audit" && <AuditLogPanel access={access} raw={raw} />}
      {tab === "health" && (
        <div
          id="monitoring-panel-health"
          role="tabpanel"
          aria-labelledby="monitoring-tab-health"
        >
          <HealthPanel health={await checkSystemHealth(access)} />
        </div>
      )}
    </>
  );
}

async function UsageTab({
  access,
  raw,
}: {
  access: Awaited<ReturnType<typeof requireAccess>>;
  raw: SearchParams;
}) {
  const resolved = resolveMonitoringPeriod(raw);
  const [summary, recentActivity] = resolved.error
    ? [null, []]
    : await Promise.all([
        loadSystemMonitoringSummary(access, resolved.period),
        loadRecentMonitoringActivity(access),
      ]);

  return (
    <div
      id="monitoring-panel-usage"
      role="tabpanel"
      aria-labelledby="monitoring-tab-usage"
    >
      <MonitoringPeriodFilter period={resolved.period} />
      {resolved.error ? (
        <p role="alert" className="rounded-xl border bg-card p-5 text-red-800">
          {resolved.error}
        </p>
      ) : summary?.available ? (
        <UsagePanel data={summary.data} recentActivity={recentActivity} />
      ) : (
        <section className="rounded-xl border bg-card p-6">
          <h2 className="type-section-title text-primary">
            Ringkasan belum dapat dimuat
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            {summary?.reason === "migration"
              ? "Migration monitoring belum diterapkan pada database. Terapkan migration yang disiapkan sebelum menggunakan telemetry dan ringkasan penggunaan."
              : "Sumber monitoring tidak tersedia atau mengembalikan data yang tidak valid. Data operasional lain tetap dapat digunakan."}
          </p>
        </section>
      )}
    </div>
  );
}
