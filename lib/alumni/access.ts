import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { isApplicationRole } from "@/lib/auth/roles";

function isMissingPasswordChangeColumn(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? error.code : undefined;
  return code === "42703" || code === "PGRST204";
}

export const getAlumniAccess = cache(async function getAlumniAccess() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || typeof data?.claims?.sub !== "string")
    return { allowed: false as const, reason: "session" as const };
  let profileResult = await supabase
    .from("profiles")
    .select("full_name, role, school_id, is_active, must_change_password")
    .eq("user_id", data.claims.sub)
    .maybeSingle();
  if (isMissingPasswordChangeColumn(profileResult.error)) {
    const fallback = await supabase
      .from("profiles")
      .select("full_name, role, school_id, is_active")
      .eq("user_id", data.claims.sub)
      .maybeSingle();
    profileResult = {
      ...fallback,
      data: fallback.data
        ? { ...fallback.data, must_change_password: false }
        : null,
    } as typeof profileResult;
  }
  const { data: profile, error: profileError } = profileResult;
  if (profileError) throw new Error("Profile unavailable");
  if (
    !profile ||
    profile.is_active !== true ||
    !isApplicationRole(profile.role)
  )
    return { allowed: false as const, reason: "denied" as const };
  if (profile.must_change_password === true)
    return {
      allowed: false as const,
      reason: "password_change" as const,
    };
  const canWrite = profile.role === "petugas_sekolah";
  const schoolId: string | null =
    typeof profile.school_id === "string" ? profile.school_id : null;
  let schoolName: string | null = null;
  if (canWrite) {
    if (!schoolId)
      return { allowed: false as const, reason: "denied" as const };
    const { data: school, error: schoolError } = await supabase
      .from("schools")
      .select("is_active, name")
      .eq("id", schoolId)
      .maybeSingle();
    if (schoolError) throw new Error("School unavailable");
    if (school?.is_active !== true)
      return { allowed: false as const, reason: "denied" as const };
    schoolName = typeof school.name === "string" ? school.name : null;
  }
  return {
    allowed: true as const,
    supabase,
    canWrite,
    schoolId,
    schoolName,
    role: profile.role,
    userId: data.claims.sub,
    fullName:
      typeof profile.full_name === "string" ? profile.full_name : "Pengguna",
  };
});
