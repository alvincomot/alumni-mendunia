import {
  FilterSkeleton,
  PageSkeleton,
  Skeleton,
  SummarySkeleton,
} from "@/components/ui/loading";
import { requireAccess } from "@/lib/auth/access";

export default async function MonitoringLoading() {
  await requireAccess(["admin_dinas"]);
  return (
    <PageSkeleton label="Memuat Monitoring Sistem">
      <div
        aria-hidden="true"
        className="my-6 flex gap-1 rounded-xl border bg-card px-2"
      >
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-12 flex-1 rounded-none" />
        ))}
      </div>
      <FilterSkeleton fields={4} />
      <SummarySkeleton cards={4} />
      <div
        aria-hidden="true"
        className="mt-6 grid gap-4 xl:grid-cols-[2fr_1fr]"
      >
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
      <div aria-hidden="true" className="mt-6 grid gap-4 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-64 rounded-xl" />
        ))}
      </div>
    </PageSkeleton>
  );
}
