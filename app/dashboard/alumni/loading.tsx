import { TableSkeleton } from "@/components/ui/loading";

export default function LoadingAlumni() {
  return (
    <TableSkeleton
      label="Memuat data alumni"
      columns={7}
      rows={6}
      filterFields={4}
      inlineFilterActions
      showHeader={false}
      minWidth={950}
    />
  );
}
