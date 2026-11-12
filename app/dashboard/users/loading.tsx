import { TableSkeleton } from "@/components/ui/loading";
import { requireAccess } from "@/lib/auth/access";

export default async function UsersLoading() {
  await requireAccess(["admin_dinas"]);
  return (
    <TableSkeleton
      label="Memuat manajemen pengguna"
      columns={6}
      rows={6}
      filterFields={4}
      inlineFilterActions
      action
      showHeader={false}
      minWidth={900}
    />
  );
}
