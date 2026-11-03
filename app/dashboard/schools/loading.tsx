import { TableSkeleton } from "@/components/ui/loading";
import { requireAccess } from "@/lib/auth/access";

export default async function SchoolsLoading() {
  const access = await requireAccess(["admin_dinas", "viewer_dinas"]);
  return (
    <TableSkeleton
      label="Memuat daftar sekolah"
      columns={access.role === "admin_dinas" ? 7 : 4}
      rows={6}
      filterFields={2}
      action={access.role === "admin_dinas"}
      minWidth={access.role === "admin_dinas" ? 960 : 680}
    />
  );
}
