import {
  historyChangeLabels,
  placementStatusLabels,
  trainingStatusLabels,
  type ActiveStudentHistory,
} from "@/lib/active-students/schema";
import { formatCountryName } from "@/lib/countries";

function formatDate(value: string | null) {
  if (!value) return "Belum dicatat";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "long",
    timeZone: "Asia/Jakarta",
  }).format(new Date(`${value.slice(0, 10)}T00:00:00+07:00`));
}

function displayHistoryValue(
  type: ActiveStudentHistory["change_type"],
  value: string | null,
) {
  if (!value) return "Belum dicatat";
  if (type === "training_status" && Object.hasOwn(trainingStatusLabels, value))
    return trainingStatusLabels[value as keyof typeof trainingStatusLabels];
  if (
    type === "placement_status" &&
    Object.hasOwn(placementStatusLabels, value)
  )
    return placementStatusLabels[value as keyof typeof placementStatusLabels];
  if (type === "placement_country") return formatCountryName(value);
  if (type === "placement_date") return formatDate(value);
  return value;
}

export function ActiveStudentHistoryList({
  history,
  error,
}: {
  history: ActiveStudentHistory[];
  error?: string;
}) {
  if (error)
    return (
      <p role="alert" className="mt-4 text-sm text-red-800">
        {error}
      </p>
    );
  if (history.length === 0)
    return (
      <p className="mt-4 text-sm text-muted-foreground">
        Belum ada riwayat perubahan untuk murid ini.
      </p>
    );
  return (
    <ol
      className="mt-4 divide-y rounded-xl border px-4"
      aria-label="Riwayat perubahan murid, dari yang paling awal"
    >
      {history.map((item) => (
        <li key={item.id} className="min-w-0 py-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-primary">
              {historyChangeLabels[item.change_type]}
            </p>
            <time
              className="type-meta text-muted-foreground"
              dateTime={item.changed_at}
            >
              {new Intl.DateTimeFormat("id-ID", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: "Asia/Jakarta",
              }).format(new Date(item.changed_at))} WIB
            </time>
          </div>
          <p className="mt-1 break-words text-sm">
            {displayHistoryValue(item.change_type, item.old_value)}{" "}
            <span aria-hidden="true">→</span>
            <span className="sr-only"> menjadi </span>{" "}
            {displayHistoryValue(item.change_type, item.new_value)}
          </p>
          <p className="mt-1 type-meta text-muted-foreground">
            Oleh {item.changed_by_name ?? "Akun tidak tersedia"}
          </p>
        </li>
      ))}
    </ol>
  );
}
