import type { ActiveStudentRecord } from "@/lib/active-students/schema";
import { activeStudentSummary } from "@/lib/active-students/model";

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <article className="rounded-xl border bg-card p-4 sm:p-5">
      <p className="type-supporting text-muted-foreground">{label}</p>
      <p className="type-stat mt-2 text-primary">{value.toLocaleString("id-ID")}</p>
    </article>
  );
}

export function ActiveStudentSummary({
  rows,
  crossSchool,
}: {
  rows: ActiveStudentRecord[];
  crossSchool: boolean;
}) {
  const summary = activeStudentSummary(rows);
  const metrics = crossSchool
    ? [
        ["Total Murid Berminat", summary.total],
        ["Sekolah Berpartisipasi", summary.schools.size],
        ["Aktif Pelatihan", summary.training.aktif_pelatihan],
        ["Selesai Pelatihan", summary.training.selesai_pelatihan],
        ["Sudah Mendapat Penempatan", summary.placed],
      ]
    : [
        ["Total Murid", summary.total],
        ["Belum Pelatihan", summary.training.belum_pelatihan],
        ["Aktif Pelatihan", summary.training.aktif_pelatihan],
        ["Sudah Selesai Pelatihan", summary.training.selesai_pelatihan],
        ["Sudah Mendapat Penempatan", summary.placed],
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

export function ActiveStudentDistributions({ rows }: { rows: ActiveStudentRecord[] }) {
  const summary = activeStudentSummary(rows);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <DistributionCard
        title="Distribusi Status Pelatihan"
        values={[
          { label: "Belum Pelatihan", value: summary.training.belum_pelatihan },
          { label: "Aktif Pelatihan", value: summary.training.aktif_pelatihan },
          { label: "Sudah Selesai Pelatihan", value: summary.training.selesai_pelatihan },
        ]}
      />
      <DistributionCard
        title="Distribusi Kelas"
        values={([10, 11, 12, 13] as const).map((grade) => ({
          label: `Kelas ${grade}`,
          value: summary.grades[grade],
        }))}
      />
    </div>
  );
}

