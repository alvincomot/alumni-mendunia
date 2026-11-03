import { FormSkeleton } from "@/components/ui/loading";
import { requireAccess } from "@/lib/auth/access";

export default async function NewAlumniLoading() {
  await requireAccess(["petugas_sekolah"]);
  return (
    <FormSkeleton
      label="Memuat formulir pendaftaran alumni"
      fields={3}
      withSummary
    />
  );
}
