import "server-only";
import { createAdminClient } from "@/lib/users/admin";

type SchoolAuthIdentity = {
  email: string;
  schoolId: string;
  userId: string;
};

export async function resolveSchoolAuthIdentity(
  npsn: string,
): Promise<SchoolAuthIdentity | null> {
  const admin = createAdminClient();
  const lifecycle = await admin.rpc("school_auth_lookup", { p_npsn: npsn });
  if (lifecycle.error || lifecycle.data?.status !== "ACTIVE") return null;
  const school = await admin
    .from("schools")
    .select("id")
    .eq("npsn", npsn)
    .eq("is_active", true)
    .maybeSingle();
  if (school.error || !school.data) return null;

  const profiles = await admin
    .from("profiles")
    .select("user_id")
    .eq("school_id", school.data.id)
    .eq("role", "petugas_sekolah")
    .eq("is_active", true)
    .limit(2);
  if (profiles.error || profiles.data.length !== 1) return null;

  const account = await admin.auth.admin.getUserById(
    profiles.data[0].user_id,
  );
  const email = account.data.user?.email?.trim();
  if (account.error || !email) return null;

  return {
    email,
    schoolId: school.data.id,
    userId: profiles.data[0].user_id,
  };
}
