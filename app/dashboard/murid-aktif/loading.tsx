import {
  FilterSkeleton,
  PageSkeleton,
  SummarySkeleton,
  TableRowsSkeleton,
} from "@/components/ui/loading";

export default function ActiveStudentsLoading() {
  return (
    <PageSkeleton label="Memuat Data Murid Aktif" showHeader={false}>
      <SummarySkeleton cards={5} />
      <FilterSkeleton fields={5} inlineActions />
      <TableRowsSkeleton columns={7} rows={6} minWidth={1180} />
    </PageSkeleton>
  );
}

