import type { ActiveStudentOverview } from "@/lib/active-students/data";

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <article className="rounded-xl border bg-card p-4 sm:p-5">
      <p className="type-supporting text-muted-foreground">{label}</p>
      <p className="type-stat mt-2 text-primary">{value.toLocaleString("id-ID")}</p>
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
  const metrics = crossSchool
    ? [
        ["Total Murid Berminat", overview.total],
        ["Sekolah Berpartisipasi", overview.schoolCount],
        ["Aktif Pelatihan", overview.training.aktif_pelatihan],
        ["Selesai Pelatihan", overview.training.selesai_pelatihan],
        ["Sudah Mendapat Penempatan", overview.placed],
      ]
    : [
        ["Total Murid", overview.total],
        ["Belum Pelatihan", overview.training.belum_pelatihan],
        ["Aktif Pelatihan", overview.training.aktif_pelatihan],
        ["Sudah Selesai Pelatihan", overview.training.selesai_pelatihan],
        ["Sudah Mendapat Penempatan", overview.placed],
      ];
  return (
    <section aria-label="Ringkasan murid aktif" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {metrics.map(([label, value]) => (
        <Metric key={label} label={String(label)} value={Number(value)} />
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

