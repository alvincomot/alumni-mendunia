import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isMissingPasswordChangeColumn } from "@/lib/auth/password-change";

export async function getSchoolAccess() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || typeof userId !== "string") {
    return { allowed: false as const, reason: "session" as const };
  }
  let profileResult = await supabase
    .from("profiles")
    .select("role, is_active, must_change_password")
    .eq("user_id", userId)
    .maybeSingle();
  if (isMissingPasswordChangeColumn(profileResult.error)) {
    const fallback = await supabase
      .from("profiles")
      .select("role, is_active")
      .eq("user_id", userId)
      .maybeSingle();
    profileResult = {
      ...fallback,
      data: fallback.data
        ? { ...fallback.data, must_change_password: false }
        : null,
    } as typeof profileResult;
  }
  const { data: profile, error: profileError } = profileResult;
  if (profileError)
    return { allowed: false as const, reason: "error" as const };
  if (
    !profile ||
    profile.is_active !== true ||
    (profile.role !== "admin_dinas" && profile.role !== "viewer_dinas")
  ) {
    return { allowed: false as const, reason: "denied" as const };
  }
  if (profile.must_change_password === true)
    return { allowed: false as const, reason: "password_change" as const };
  return {
    allowed: true as const,
    canManage: profile.role === "admin_dinas",
    supabase,
  };
}
