import "server-only";
import type { createAdminClient } from "@/lib/users/admin";
import { schoolLookupSchema } from "@/lib/auth/school-auth";

// Call only after authorizing the Dinas administrator and reading the school.
export async function readSchoolAccountStatus(
  admin: ReturnType<typeof createAdminClient>,
  npsn: string,
) {
  const { data, error } = await admin.rpc("school_auth_lookup", {
    p_npsn: npsn,
  });
  const parsed = schoolLookupSchema.safeParse(data);
  if (error || !parsed.success || parsed.data.npsn !== npsn)
    throw new Error("School activation status unavailable");
  return parsed.data.status;
}
