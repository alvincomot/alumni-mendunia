import {
  FilterSkeleton,
  PageSkeleton,
  SummarySkeleton,
  TableRowsSkeleton,
} from "@/components/ui/loading";

export default function ActiveStudentsLoading() {
  return (
    <PageSkeleton label="Memuat Data Murid Aktif">
      <SummarySkeleton cards={5} />
      <FilterSkeleton fields={5} />
      <TableRowsSkeleton columns={7} rows={6} minWidth={1180} />
    </PageSkeleton>
  );
}

