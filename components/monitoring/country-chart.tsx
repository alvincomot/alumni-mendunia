const palette = [
  { dot: "bg-primary", bar: "bg-primary" },
  { dot: "bg-accent", bar: "bg-accent" },
  { dot: "bg-[#00563A]", bar: "bg-[#00563A]" },
  { dot: "bg-[#757684]", bar: "bg-[#757684]" },
];

export function CountryChart({
  data,
}: {
  data: { id?: string; name: string; count: number }[];
}) {
  const countries = data.filter(
    (item) => item.id !== "__missing" && item.count > 0,
  );
  const total = countries.reduce((sum, item) => sum + item.count, 0);
  const leading = countries.slice(0, 3);
  const remaining = countries
    .slice(3)
    .reduce((sum, item) => sum + item.count, 0);
  const rows = remaining
    ? [...leading, { id: "__other", name: "Negara lainnya", count: remaining }]
    : countries.slice(0, 4);

  if (!rows.length || total === 0) {
    return (
      <p className="text-sm leading-6 text-[#6B6D7A]">
        Belum ada negara tujuan yang dapat ditampilkan.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {rows.map((item, index) => {
        const percentage = Math.round((item.count / total) * 100);
        const colors = palette[index] ?? palette[palette.length - 1];
        return (
          <div key={item.id ?? item.name}>
            <div className="type-label mb-1.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
              <span className="flex min-w-0 items-center gap-2 text-[#444653]">
                <span
                  className={`size-2.5 shrink-0 rounded-full ${colors.dot}`}
                  aria-hidden="true"
                />
                <span className="truncate">{item.name}</span>
              </span>
              <span className="font-semibold text-[#191C1E] tabular-nums">
                {item.count.toLocaleString("id-ID")} alumni ({percentage}%)
              </span>
            </div>
            <div
              className="h-3 overflow-hidden rounded-full bg-[#F2F4F6]"
              role="progressbar"
              aria-label={`${item.name}: ${item.count} alumni`}
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={item.count}
            >
              <div
                className={`h-full rounded-full ${colors.bar}`}
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
