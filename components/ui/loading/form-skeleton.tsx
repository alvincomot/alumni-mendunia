import { PageSkeleton } from "./page-skeleton";
import { Skeleton } from "./skeleton";

export function FormSkeleton({
  label = "Memuat formulir",
  fields = 6,
  withSummary = false,
}: {
  label?: string;
  fields?: number;
  withSummary?: boolean;
}) {
  return (
    <PageSkeleton label={label}>
      <div
        className={`mt-6 grid items-start gap-6 ${withSummary ? "xl:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)]" : ""}`}
      >
        <section
          aria-hidden="true"
          className="rounded-xl border border-slate-200 bg-white p-5 sm:p-7"
        >
          <div className="mb-7 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Skeleton className="size-10 rounded-full" />
              <Skeleton className="h-4 w-32" />
            </div>
            <Skeleton className="h-px flex-1" />
            <div className="flex items-center gap-3">
              <Skeleton className="size-10 rounded-full" />
              <Skeleton className="hidden h-4 w-32 sm:block" />
            </div>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            {Array.from({ length: fields }, (_, index) => (
              <div key={index} className={index === 0 ? "sm:col-span-2" : ""}>
                <Skeleton className="mb-2 h-3 w-28" />
                <Skeleton className="h-12 w-full bg-white ring-1 ring-slate-200" />
              </div>
            ))}
          </div>
          <div className="mt-7 flex justify-between gap-3 border-t border-slate-200 pt-5">
            <Skeleton className="h-12 w-28 bg-white ring-1 ring-slate-200" />
            <Skeleton className="h-12 w-44" />
          </div>
        </section>
        {withSummary && (
          <aside
            aria-hidden="true"
            className="rounded-xl border border-slate-200 bg-white p-5"
          >
            <div className="flex items-center gap-3">
              <Skeleton className="size-10" />
              <div className="flex-1">
                <Skeleton className="h-5 w-36" />
                <Skeleton className="mt-2 h-3 w-full" />
              </div>
            </div>
            <div className="mt-5 space-y-4 rounded-xl bg-[#F7F9FC] p-4">
              {Array.from({ length: 7 }, (_, index) => (
                <div key={index} className="flex justify-between gap-4">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-28" />
                </div>
              ))}
            </div>
          </aside>
        )}
      </div>
    </PageSkeleton>
  );
}
