import { TableSkeleton } from "@/components/ui/loading";
import { requireAccess } from "@/lib/auth/access";

export default async function AuditLogsLoading() {
  await requireAccess(["admin_dinas"]);
  return (
    <TableSkeleton
      label="Memuat catatan audit"
      columns={5}
      rows={7}
      filterFields={6}
      minWidth={850}
    />
  );
}
