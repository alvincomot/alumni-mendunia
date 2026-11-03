import {
  ChartSkeleton,
  FilterSkeleton,
  PageSkeleton,
  SummarySkeleton,
  TableRowsSkeleton,
  Skeleton,
} from "@/components/ui/loading";
import { requireAccess } from "@/lib/auth/access";

export default async function ReportsLoading() {
  await requireAccess(["admin_dinas", "viewer_dinas"]);
  return (
    <PageSkeleton label="Memuat laporan alumni" action>
      <FilterSkeleton fields={7} />
      <SummarySkeleton cards={6} />
      <div aria-hidden="true" className="my-6 grid gap-6 xl:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <section
            key={index}
            className="rounded-xl border border-slate-200 bg-white p-5"
          >
            <Skeleton className="mb-6 h-5 w-40" />
            <ChartSkeleton rows={4} />
          </section>
        ))}
      </div>
      <div className="mt-6" aria-hidden="true">
        <Skeleton className="mb-4 h-5 w-36" />
        <TableRowsSkeleton columns={8} rows={5} minWidth={1100} />
      </div>
    </PageSkeleton>
  );
}
