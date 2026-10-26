import { statusLabels } from "@/lib/alumni/schema";
import { summarize, type MonitoringRow } from "@/lib/monitoring/model";

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
          <dd className="mt-2 text-3xl font-semibold tabular-nums text-primary">
            {Number(count).toLocaleString("id-ID")}
          </dd>
        </div>
      ))}
    </dl>
  );
}
