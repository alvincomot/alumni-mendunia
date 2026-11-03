import { Skeleton } from "./skeleton";

export function ChartSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div aria-hidden="true" className="space-y-5">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index}>
          <div className="mb-2 flex justify-between gap-4">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-3 w-20" />
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-slate-100">
            <Skeleton
              className="h-full rounded-full bg-slate-200"
              style={{ width: `${88 - index * 15}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SummarySkeleton({ cards = 5 }: { cards?: number }) {
  return (
    <div
      aria-hidden="true"
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
    >
      {Array.from({ length: cards }, (_, index) => (
        <div
          key={index}
          className="rounded-xl border border-slate-200 bg-white p-4"
        >
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-4 h-7 w-16" />
        </div>
      ))}
    </div>
  );
}
