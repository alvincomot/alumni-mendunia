import { ChartSkeleton } from "./chart-skeleton";
import { LoadingIndicator } from "./loading-indicator";
import { LoadingRegion, Skeleton } from "./skeleton";

export function DashboardSkeleton() {
  return (
    <LoadingRegion
      label="Memuat dashboard. Sedang menyiapkan data, sesi, dan hak akses akun Anda."
      className="mx-auto w-full max-w-[90rem]"
    >
      <div aria-hidden="true" className="mb-5 flex items-start gap-3">
        <LoadingIndicator className="text-primary" />
        <div>
          <p className="type-card-title text-[#172B3A]">Memuat dashboard</p>
          <p className="mt-1 text-sm leading-6 text-[#6B6D7A]">
            Sedang menyiapkan data, sesi, dan hak akses akun Anda.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            aria-hidden="true"
            className="min-h-32 rounded-xl border border-slate-200 bg-white p-4"
          >
            <Skeleton className="size-10 rounded-full" />
            <Skeleton className="mt-5 h-6 w-16" />
            <Skeleton className="mt-2 h-3 w-32" />
          </div>
        ))}
      </div>

      <section
        aria-hidden="true"
        className="mt-6 rounded-xl border border-slate-200 bg-white p-5 sm:p-6"
      >
        <Skeleton className="h-5 w-44" />
        <Skeleton className="mt-2 h-3 w-72 max-w-full" />
        <div className="mt-7">
          <ChartSkeleton />
        </div>
      </section>

      <div aria-hidden="true" className="mt-6 grid gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }, (_, index) => (
          <section
            key={index}
            className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6"
          >
            <Skeleton className="h-5 w-40" />
            <div className="mt-6 space-y-4">
              {Array.from({ length: 4 }, (__, row) => (
                <div key={row} className="flex items-center gap-3">
                  <Skeleton className="size-8 rounded-full" />
                  <Skeleton className="h-3 flex-1" />
                  <Skeleton className="h-3 w-12" />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </LoadingRegion>
  );
}

export function DashboardSessionLoading() {
  return (
    <main
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="flex min-h-svh items-center justify-center bg-[#F7F9FB] px-5 py-10"
    >
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-7 text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-secondary text-primary">
          <LoadingIndicator />
        </div>
        <p className="type-section-title mt-5 text-[#172B3A]">
          Memuat dashboard
        </p>
        <p className="mt-2 text-sm leading-6 text-[#6B6D7A]">
          Sedang menyiapkan data, sesi, dan hak akses akun Anda.
        </p>
      </div>
    </main>
  );
}
