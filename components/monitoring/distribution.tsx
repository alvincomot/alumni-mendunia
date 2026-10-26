export function DistributionTable({
  title,
  rows,
}: {
  title: string;
  rows: { id: string; name: string; count: number }[];
}) {
  return (
    <section className="min-w-0 rounded-lg border bg-white p-5">
      <h2 className="text-lg font-semibold text-primary">{title}</h2>
      {!rows.length ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Belum ada data sesuai filter.
        </p>
      ) : (
        <div
          className="mt-4 max-h-80 overflow-y-auto"
          tabIndex={0}
          role="region"
          aria-label={title}
        >
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{title}</caption>
            <thead className="sticky top-0 bg-white">
              <tr>
                <th scope="col" className="pb-3">
                  Kelompok
                </th>
                <th scope="col" className="pb-3 text-right">
                  Alumni
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t">
                  <th
                    scope="row"
                    className="max-w-64 break-words py-3 pr-3 font-normal"
                  >
                    {row.name}
                  </th>
                  <td className="py-3 text-right tabular-nums">{row.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
