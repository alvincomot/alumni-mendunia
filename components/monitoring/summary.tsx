import { statusLabels } from "@/lib/alumni/schema";
import { summarize, type MonitoringRow } from "@/lib/monitoring/model";
import {
  DashboardIcon,
  type DashboardIconName,
} from "@/components/dashboard-icon";

export function MonitoringSummary({ rows }: { rows: MonitoringRow[] }) {
  const summary = summarize(rows);
  const values = [
    ["Total alumni", summary.total],
    ...Object.entries(summary.statuses).map(([status, count]) => [
      statusLabels[status as keyof typeof statusLabels],
      count,
    ]),
    ["Belum ada penempatan", summary.unplaced],
  ];
  return (
    <dl className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 xl:grid-cols-3">
      {values.map(([label, count]) => (
        <div key={label} className="bg-white p-5">
          <dt className="text-sm text-muted-foreground">{label}</dt>
          <dd className="type-stat mt-2 text-primary">
            {Number(count).toLocaleString("id-ID")}
          </dd>
        </div>
      ))}
    </dl>
  );
}

const dashboardCards: Array<{
  key:
    | "total"
    | "persiapan_berangkat"
    | "aktif_bekerja"
    | "selesai_kontrak"
    | "batal_berangkat"
    | "unplaced";
  label: string;
  tag: string;
  icon: DashboardIconName;
  iconStyle: string;
  tagStyle: string;
}> = [
  {
    key: "total",
    label: "Total Alumni",
    tag: "Data",
    icon: "alumni",
    iconStyle: "bg-primary/10 text-primary",
    tagStyle: "bg-primary/10 text-primary",
  },
  {
    key: "persiapan_berangkat",
    label: "Persiapan Berangkat",
    tag: "Proses",
    icon: "plane",
    iconStyle: "bg-amber-50 text-amber-900",
    tagStyle: "bg-amber-50 text-amber-900",
  },
  {
    key: "aktif_bekerja",
    label: "Aktif Bekerja",
    tag: "Aktif",
    icon: "briefcase",
    iconStyle: "bg-[#D8F7E9] text-[#00563A]",
    tagStyle: "bg-[#E1F4EB] text-[#006B49]",
  },
  {
    key: "selesai_kontrak",
    label: "Selesai Kontrak",
    tag: "Selesai",
    icon: "clipboard",
    iconStyle: "bg-[#E6E8EA] text-[#444653]",
    tagStyle: "bg-[#E6E8EA] text-[#5D5F6B]",
  },
  {
    key: "batal_berangkat",
    label: "Batal Berangkat",
    tag: "Batal",
    icon: "cancel",
    iconStyle: "bg-[#FFDAD6] text-[#BA1A1A]",
    tagStyle: "bg-[#FFDAD6] text-[#93000A]",
  },
  {
    key: "unplaced",
    label: "Belum Ada Penempatan",
    tag: "Menunggu",
    icon: "clock",
    iconStyle: "bg-[#E0E3E5] text-[#5D5F6B]",
    tagStyle: "bg-[#E6E8EA] text-[#5D5F6B]",
  },
];

export function DashboardSummary({ rows }: { rows: MonitoringRow[] }) {
  const summary = summarize(rows);
  const values = {
    total: summary.total,
    ...summary.statuses,
    unplaced: summary.unplaced,
  };

  return (
    <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {dashboardCards.map((card) => (
        <div
          key={card.key}
          className="flex min-h-32 flex-col justify-between rounded-xl border bg-card p-4"
        >
          <div className="flex items-center justify-between gap-3">
            <span
              className={`flex size-10 items-center justify-center rounded-full ${card.iconStyle}`}
            >
              <DashboardIcon name={card.icon} className="size-5" />
            </span>
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none ${card.tagStyle}`}
            >
              {card.tag}
            </span>
          </div>
          <div className="mt-4">
            <dd className="type-stat text-[#191C1E]">
              {values[card.key].toLocaleString("id-ID")}
            </dd>
            <dt className="type-label mt-1 text-[#444653]">
              {card.label}
            </dt>
          </div>
        </div>
      ))}
    </dl>
  );
}
