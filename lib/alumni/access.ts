import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isApplicationRole } from "@/lib/auth/roles";

export async function getAlumniAccess() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || typeof data?.claims?.sub !== "string")
    return { allowed: false as const, reason: "session" as const };
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("full_name, role, school_id, is_active")
    .eq("user_id", data.claims.sub)
    .maybeSingle();
  if (profileError) throw new Error("Profile unavailable");
  if (
    !profile ||
    profile.is_active !== true ||
    !isApplicationRole(profile.role)
  )
    return { allowed: false as const, reason: "denied" as const };
  const canWrite = profile.role === "petugas_sekolah";
  const schoolId: string | null =
    typeof profile.school_id === "string" ? profile.school_id : null;
  if (canWrite) {
    if (!schoolId)
      return { allowed: false as const, reason: "denied" as const };
    const { data: school, error: schoolError } = await supabase
      .from("schools")
      .select("is_active")
      .eq("id", schoolId)
      .maybeSingle();
    if (schoolError) throw new Error("School unavailable");
    if (school?.is_active !== true)
      return { allowed: false as const, reason: "denied" as const };
  }
  return {
    allowed: true as const,
    supabase,
    canWrite,
    schoolId,
    role: profile.role,
    userId: data.claims.sub,
    fullName:
      typeof profile.full_name === "string" ? profile.full_name : "Pengguna",
  };
}
