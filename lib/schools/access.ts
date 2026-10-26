import "server-only";
import { createClient } from "@/lib/supabase/server";

export async function getSchoolAccess() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || typeof userId !== "string") {
    return { allowed: false as const, reason: "session" as const };
  }
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("user_id", userId)
    .maybeSingle();
  if (profileError)
    return { allowed: false as const, reason: "error" as const };
  if (
    !profile ||
    profile.is_active !== true ||
    (profile.role !== "admin_dinas" && profile.role !== "viewer_dinas")
  ) {
    return { allowed: false as const, reason: "denied" as const };
  }
  return {
    allowed: true as const,
    canManage: profile.role === "admin_dinas",
    supabase,
  };
}
