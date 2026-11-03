"use server";

import { headers } from "next/headers";
import { loginSchema, type LoginResult } from "@/lib/auth/login-schema";
import {
  clearLoginAttempts,
  consumeLoginAttempt,
} from "@/lib/auth/login-rate-limit";
import { resolveSchoolAuthIdentity } from "@/lib/auth/school-login";
import { isMissingPasswordChangeColumn } from "@/lib/auth/password-change";
import { createClient } from "@/lib/supabase/server";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

const invalidLogin: LoginResult = {
  success: false,
  message: "Identitas atau kata sandi tidak valid.",
};

async function clientKey() {
  const requestHeaders = await headers();
  return (
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    requestHeaders.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

async function rejectAuthenticatedLogin(supabase: ServerClient) {
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {}
  return invalidLogin;
}

export async function loginWithPassword(input: unknown): Promise<LoginResult> {
  const key = await clientKey();
  if (!consumeLoginAttempt(key)) return invalidLogin;

  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return invalidLogin;

  const supabase = await createClient();
  try {
    const schoolIdentity =
      parsed.data.mode === "school"
        ? await resolveSchoolAuthIdentity(parsed.data.identity)
        : null;
    if (parsed.data.mode === "school" && !schoolIdentity)
      return rejectAuthenticatedLogin(supabase);

    const email =
      parsed.data.mode === "school"
        ? schoolIdentity!.email
        : parsed.data.identity;
    const signIn = await supabase.auth.signInWithPassword({
      email,
      password: parsed.data.password,
    });
    if (signIn.error) return rejectAuthenticatedLogin(supabase);

    const claims = await supabase.auth.getClaims();
    const userId = claims.data?.claims?.sub;
    if (claims.error || typeof userId !== "string")
      return rejectAuthenticatedLogin(supabase);

    let profile = await supabase
      .from("profiles")
      .select("role, school_id, is_active, must_change_password")
      .eq("user_id", userId)
      .maybeSingle();
    if (isMissingPasswordChangeColumn(profile.error)) {
      const fallback = await supabase
        .from("profiles")
        .select("role, school_id, is_active")
        .eq("user_id", userId)
        .maybeSingle();
      profile = {
        ...fallback,
        data: fallback.data
          ? { ...fallback.data, must_change_password: false }
          : null,
      } as typeof profile;
    }
    if (profile.error || !profile.data || profile.data.is_active !== true)
      return rejectAuthenticatedLogin(supabase);

    if (parsed.data.mode === "dinas") {
      if (
        !["admin_dinas", "viewer_dinas"].includes(profile.data.role) ||
        profile.data.school_id !== null
      )
        return rejectAuthenticatedLogin(supabase);
    } else {
      if (
        profile.data.role !== "petugas_sekolah" ||
        profile.data.school_id !== schoolIdentity!.schoolId ||
        userId !== schoolIdentity!.userId
      )
        return rejectAuthenticatedLogin(supabase);
      if (profile.data.must_change_password !== true) {
        const school = await supabase
          .from("schools")
          .select("id, npsn, is_active")
          .eq("id", profile.data.school_id)
          .maybeSingle();
        if (
          school.error ||
          !school.data ||
          school.data.is_active !== true ||
          school.data.npsn !== parsed.data.identity
        )
          return rejectAuthenticatedLogin(supabase);
      }
    }

    clearLoginAttempts(key);
    return {
      success: true,
      redirectTo:
        profile.data.must_change_password === true
          ? "/auth/update-password"
          : "/dashboard",
    };
  } catch {
    return rejectAuthenticatedLogin(supabase);
  }
}
