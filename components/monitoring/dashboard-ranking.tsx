import { DashboardIcon } from "@/components/dashboard-icon";
import { DashboardPanel } from "@/components/dashboard-panel";

type RankingRow = { id: string; name: string; count: number };

export function DashboardRanking({
  title,
  description,
  rows,
  variant,
}: {
  title: string;
  description?: string;
  rows: RankingRow[];
  variant: "year" | "school";
}) {
  const visibleRows =
    variant === "year"
      ? [...rows]
          .sort((a, b) => Number(b.name) - Number(a.name))
          .slice(0, 3)
      : rows.slice(0, 3);

  return (
    <DashboardPanel
      title={title}
      description={description}
      height="md"
      icon={
        <DashboardIcon
          name={variant === "year" ? "calendar" : "building"}
          className="size-5"
        />
      }
    >
      {!visibleRows.length ? (
        <p className="text-sm leading-6 text-[#6B6D7A]">
          Belum ada data sesuai filter yang dipilih.
        </p>
      ) : (
        <ol className="divide-y divide-[#ECEEF0]">
          {visibleRows.map((row, index) => {
            const marker =
              variant === "year" ? row.name.slice(-2) : String(index + 1);
            const markerStyle =
              index === 0
                ? "bg-primary text-primary-foreground"
                : index === 1
                  ? "bg-primary/10 text-primary"
                  : "bg-[#D8F7E9] text-[#00563A]";
            return (
              <li
                key={row.id}
                className="flex min-h-[4.5rem] items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={`flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${markerStyle}`}
                  >
                    {marker}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-[#191C1E]">
                      {variant === "year" ? `Angkatan ${row.name}` : row.name}
                    </span>
                    <span className="type-meta mt-0.5 block text-[#6B6D7A]">
                      {variant === "year" && index === 0
                        ? "Lulusan terbaru"
                        : variant === "year"
                          ? "Tahun kelulusan"
                          : "Alumni terdata"}
                    </span>
                  </span>
                </div>
                <span
                  className={`shrink-0 text-base font-bold tabular-nums ${index === 0 ? "text-primary" : "text-[#191C1E]"}`}
                >
                  {row.count.toLocaleString("id-ID")}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </DashboardPanel>
  );
}
