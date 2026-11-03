import { PageSkeleton } from "./page-skeleton";
import { Skeleton } from "./skeleton";

export function DetailSkeleton({
  label = "Memuat detail",
}: {
  label?: string;
}) {
  return (
    <PageSkeleton label={label} action>
      <div aria-hidden="true" className="mt-6 space-y-6">
        {[3, 7, 4].map((items, section) => (
          <section
            key={section}
            className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6"
          >
            <Skeleton className="h-5 w-44" />
            <Skeleton className="mt-2 h-3 w-64 max-w-full" />
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: items }, (_, index) => (
                <div key={index}>
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="mt-2 h-4 w-36 max-w-full" />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </PageSkeleton>
  );
}
