import Link from "next/link";
import { BarChart3, FileClock, ShieldCheck } from "lucide-react";

export type SystemMonitoringTab = "usage" | "audit" | "health";

const tabs: { value: SystemMonitoringTab; label: string; href: string }[] = [
  {
    value: "usage",
    label: "Ringkasan Penggunaan",
    href: "/dashboard/monitoring",
  },
  {
    value: "audit",
    label: "Audit Log",
    href: "/dashboard/monitoring?tab=audit",
  },
  {
    value: "health",
    label: "Kesehatan Sistem",
    href: "/dashboard/monitoring?tab=health",
  },
];

const icons = {
  usage: BarChart3,
  audit: FileClock,
  health: ShieldCheck,
};

export function SystemTabs({ active }: { active: SystemMonitoringTab }) {
  return (
    <nav
      aria-label="Bagian Monitoring Sistem"
      role="tablist"
      className="my-6 grid min-w-0 grid-cols-3 rounded-xl border bg-card px-1 sm:px-2"
    >
      {tabs.map((tab) => {
        const selected = active === tab.value;
        const Icon = icons[tab.value];
        return (
          <Link
            key={tab.value}
            id={`monitoring-tab-${tab.value}`}
            href={tab.href}
            role="tab"
            aria-selected={selected}
            aria-controls={`monitoring-panel-${tab.value}`}
            className={`relative flex min-h-12 min-w-0 items-center justify-center gap-1 border-b-2 px-1 py-2 text-center text-[11px] font-medium leading-4 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring sm:gap-2 sm:px-4 sm:text-sm sm:leading-5 ${
              selected
                ? "border-accent text-primary"
                : "border-transparent text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
            }`}
          >
            <Icon aria-hidden="true" className="size-3.5 shrink-0 sm:size-4" />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
