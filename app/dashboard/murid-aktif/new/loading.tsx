import { FormSkeleton } from "@/components/ui/loading";
import { requireAccess } from "@/lib/auth/access";

export default async function NewActiveStudentLoading() {
  await requireAccess(["petugas_sekolah"]);
  return (
    <FormSkeleton
      label="Memuat formulir pendataan murid"
      fields={5}
      withSummary
    />
  );
}
