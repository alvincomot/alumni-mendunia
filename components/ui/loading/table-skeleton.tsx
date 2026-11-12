import { FilterSkeleton, PageSkeleton } from "./page-skeleton";
import { Skeleton } from "./skeleton";

export function TableSkeleton({
  label,
  columns = 6,
  rows = 6,
  filterFields = 4,
  inlineFilterActions = false,
  action = false,
  showHeader = true,
  minWidth = 760,
}: {
  label: string;
  columns?: number;
  rows?: number;
  filterFields?: number;
  inlineFilterActions?: boolean;
  action?: boolean;
  showHeader?: boolean;
  minWidth?: number;
}) {
  return (
    <PageSkeleton label={label} action={action} showHeader={showHeader}>
      {filterFields > 0 && (
        <FilterSkeleton
          fields={filterFields}
          inlineActions={inlineFilterActions}
        />
      )}
      <TableRowsSkeleton
        columns={columns}
        rows={rows}
        minWidth={minWidth}
      />
    </PageSkeleton>
  );
}

export function TableRowsSkeleton({
  columns = 6,
  rows = 6,
  minWidth = 760,
  withPagination = true,
}: {
  columns?: number;
  rows?: number;
  minWidth?: number;
  withPagination?: boolean;
}) {
  const gridTemplateColumns = `repeat(${columns}, minmax(7rem, 1fr))`;
  return (
    <>
      <div
        aria-hidden="true"
        className="overflow-hidden rounded-xl border border-slate-200 bg-white"
      >
        <div className="overflow-hidden" style={{ minWidth }}>
          <div
            className="grid gap-5 border-b border-slate-200 bg-[#F2F4F6] px-4 py-4"
            style={{ gridTemplateColumns }}
          >
            {Array.from({ length: columns }, (_, index) => (
              <Skeleton key={index} className="h-3 w-20 bg-slate-300" />
            ))}
          </div>
          {Array.from({ length: rows }, (_, row) => (
            <div
              key={row}
              className="grid gap-5 border-b border-slate-100 px-4 py-5 last:border-0"
              style={{ gridTemplateColumns }}
            >
              {Array.from({ length: columns }, (__, column) => (
                <Skeleton
                  key={column}
                  className={column === 0 ? "h-4 w-32" : "h-4 w-20"}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      {withPagination && (
        <div aria-hidden="true" className="mt-5 flex justify-between gap-4">
          <Skeleton className="h-4 w-36" />
          <div className="flex gap-2">
            <Skeleton className="h-11 w-24 bg-white ring-1 ring-slate-200" />
            <Skeleton className="h-11 w-24 bg-white ring-1 ring-slate-200" />
          </div>
        </div>
      )}
    </>
  );
}
