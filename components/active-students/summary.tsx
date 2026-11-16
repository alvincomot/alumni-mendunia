import {
  DashboardIcon,
  type DashboardIconName,
} from "@/components/dashboard-icon";
import type { ActiveStudentOverview } from "@/lib/active-students/data";

type MetricItem = {
  label: string;
  value: number;
  tag: string;
  icon: DashboardIconName;
  iconStyle: string;
  tagStyle: string;
};

function Metric({ item }: { item: MetricItem }) {
  return (
    <article className="flex min-h-32 flex-col justify-between rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <span
          className={`flex size-10 items-center justify-center rounded-full ${item.iconStyle}`}
        >
          <DashboardIcon name={item.icon} className="size-5" />
        </span>
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none ${item.tagStyle}`}
        >
          {item.tag}
        </span>
      </div>
      <div className="mt-4">
        <p className="type-stat tabular-nums text-[#191C1E]">
          {item.value.toLocaleString("id-ID")}
        </p>
        <p className="type-label mt-1 text-[#444653]">{item.label}</p>
      </div>
    </article>
  );
}

export function ActiveStudentSummary({
  overview,
  crossSchool,
}: {
  overview: ActiveStudentOverview;
  crossSchool: boolean;
}) {
  const metrics: MetricItem[] = crossSchool
    ? [
        {
          label: "Total Murid Berminat",
          value: overview.total,
          tag: "Data",
          icon: "users",
          iconStyle: "bg-primary/10 text-primary",
          tagStyle: "bg-primary/10 text-primary",
        },
        {
          label: "Sekolah Berpartisipasi",
          value: overview.schoolCount,
          tag: "Sekolah",
          icon: "schoolBuilding",
          iconStyle: "bg-[#E6E8EA] text-[#444653]",
          tagStyle: "bg-[#E6E8EA] text-[#5D5F6B]",
        },
        {
          label: "Aktif Pelatihan",
          value: overview.training.aktif_pelatihan,
          tag: "Aktif",
          icon: "book",
          iconStyle: "bg-[#E6F6F7] text-[#075E66]",
          tagStyle: "bg-[#E6F6F7] text-[#075E66]",
        },
        {
          label: "Selesai Pelatihan",
          value: overview.training.selesai_pelatihan,
          tag: "Selesai",
          icon: "clipboard",
          iconStyle: "bg-[#E1F4EB] text-[#006B49]",
          tagStyle: "bg-[#E1F4EB] text-[#006B49]",
        },
        {
          label: "Sudah Mendapat Penempatan",
          value: overview.placed,
          tag: "Penempatan",
          icon: "flag",
          iconStyle: "bg-amber-50 text-amber-900",
          tagStyle: "bg-amber-50 text-amber-900",
        },
      ]
    : [
        {
          label: "Total Murid",
          value: overview.total,
          tag: "Data",
          icon: "users",
          iconStyle: "bg-primary/10 text-primary",
          tagStyle: "bg-primary/10 text-primary",
        },
        {
          label: "Belum Pelatihan",
          value: overview.training.belum_pelatihan,
          tag: "Menunggu",
          icon: "clock",
          iconStyle: "bg-[#E6E8EA] text-[#444653]",
          tagStyle: "bg-[#E6E8EA] text-[#5D5F6B]",
        },
        {
          label: "Aktif Pelatihan",
          value: overview.training.aktif_pelatihan,
          tag: "Aktif",
          icon: "book",
          iconStyle: "bg-[#E6F6F7] text-[#075E66]",
          tagStyle: "bg-[#E6F6F7] text-[#075E66]",
        },
        {
          label: "Sudah Selesai Pelatihan",
          value: overview.training.selesai_pelatihan,
          tag: "Selesai",
          icon: "clipboard",
          iconStyle: "bg-[#E1F4EB] text-[#006B49]",
          tagStyle: "bg-[#E1F4EB] text-[#006B49]",
        },
        {
          label: "Sudah Mendapat Penempatan",
          value: overview.placed,
          tag: "Penempatan",
          icon: "flag",
          iconStyle: "bg-amber-50 text-amber-900",
          tagStyle: "bg-amber-50 text-amber-900",
        },
      ];
  return (
    <section aria-label="Ringkasan murid aktif" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {metrics.map((item) => (
        <Metric key={item.label} item={item} />
      ))}
    </section>
  );
}

function DistributionCard({
  title,
  values,
}: {
  title: string;
  values: { label: string; value: number }[];
}) {
  const total = values.reduce((sum, item) => sum + item.value, 0);
  return (
    <section className="rounded-xl border bg-card p-5">
      <h2 className="type-section-title text-primary">{title}</h2>
      <ul className="mt-5 space-y-4">
        {values.map((item) => {
          const percentage = total ? Math.round((item.value / total) * 100) : 0;
          return (
            <li key={item.label}>
              <div className="flex items-center justify-between gap-4 text-sm">
                <span>{item.label}</span>
                <span className="font-semibold tabular-nums">{item.value.toLocaleString("id-ID")}</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary" aria-hidden="true">
                <div className="h-full rounded-full bg-accent" style={{ width: `${percentage}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function ActiveStudentDistributions({
  overview,
}: {
  overview: ActiveStudentOverview;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <DistributionCard
        title="Distribusi Status Pelatihan"
        values={[
          { label: "Belum Pelatihan", value: overview.training.belum_pelatihan },
          { label: "Aktif Pelatihan", value: overview.training.aktif_pelatihan },
          { label: "Sudah Selesai Pelatihan", value: overview.training.selesai_pelatihan },
        ]}
      />
      <DistributionCard
        title="Distribusi Kelas"
        values={([10, 11, 12, 13] as const).map((grade) => ({
          label: `Kelas ${grade}`,
          value: overview.grades[grade],
        }))}
      />
    </div>
  );
}

