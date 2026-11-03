"use server";

import { revalidatePath } from "next/cache";
import {
  isMissingPasswordChangeColumn,
  passwordChangeSchema,
  type PasswordChangeResult,
} from "@/lib/auth/password-change";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, credentialDigest } from "@/lib/users/admin";
import { getSchoolActivationContext } from "@/lib/auth/school-activation";
import {
  logSchoolAuthFailure,
  schoolAuthCorrelationId,
  type SchoolAuthStage,
} from "@/lib/auth/school-auth-diagnostics";

export async function changePassword(
  input: unknown,
): Promise<PasswordChangeResult> {
  const parsed = passwordChangeSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      message:
        parsed.error.issues[0]?.message ?? "Kata sandi baru tidak valid.",
    };

  const correlationId = schoolAuthCorrelationId();
  let stage: SchoolAuthStage = "session_verification";
  try {
    const supabase = await createClient();
    const claims = await supabase.auth.getClaims();
    const userId = claims.data?.claims?.sub;
    if (claims.error || typeof userId !== "string") {
      logSchoolAuthFailure({
        operation: "password_change", stage, correlationId,
        error: claims.error ?? { code: "auth_claims_missing" },
      });
      return {
        success: false,
        message: "Sesi tidak valid. Masuk kembali sebelum mengganti kata sandi.",
      };
    }

    let profile = await supabase
      .from("profiles")
      .select("role, is_active, must_change_password")
      .eq("user_id", userId)
      .maybeSingle();
    if (isMissingPasswordChangeColumn(profile.error)) {
      const fallback = await supabase
        .from("profiles")
        .select("role, is_active")
        .eq("user_id", userId)
        .maybeSingle();
      profile = {
        ...fallback,
        data: fallback.data
          ? { ...fallback.data, must_change_password: false }
          : null,
      } as typeof profile;
    }
    if (profile.error) {
      logSchoolAuthFailure({
        operation: "password_change", stage, correlationId, error: profile.error,
      });
      return {
        success: false,
        message: "Profil aplikasi tidak aktif atau belum dikonfigurasi.",
      };
    }

    const currentUser = await supabase.auth.getUser();
    if (currentUser.error || currentUser.data.user?.id !== userId) {
      logSchoolAuthFailure({
        operation: "password_change", stage, correlationId,
        error: currentUser.error ?? { code: "auth_identity_mismatch" },
      });
      return {
        success: false,
        message: "Sesi tidak dapat diverifikasi. Masuk kembali dan coba lagi.",
      };
    }
    const activation = !profile.data || profile.data.role === "petugas_sekolah"
      ? await getSchoolActivationContext(userId)
      : null;
    if (!activation && (!profile.data || profile.data.is_active !== true))
      return { success: false, message: "Profil tidak aktif atau aktivasi telah kedaluwarsa. Kembali ke login untuk meminta tautan baru." };
    if (!activation && profile.data?.must_change_password === true) {
      const temporaryDigest =
        currentUser.data.user.app_metadata
          ?.school_temporary_password_digest;
      if (typeof temporaryDigest !== "string")
        return {
          success: false,
          message:
            "Penanda kredensial sementara tidak lengkap. Hubungi Admin Dinas; akses belum dibuka.",
        };
      if ((await credentialDigest(parsed.data.password)) === temporaryDigest)
        return {
          success: false,
          message:
            "Kata sandi baru harus berbeda dari kata sandi sementara.",
        };
    }

    stage = "password_update";
    const updated = await supabase.auth.updateUser({
      password: parsed.data.password,
    });
    const activationCompletionRetry =
      Boolean(activation) && updated.error?.code === "same_password";
    if (updated.error?.code === "weak_password")
      return {
        success: false,
        message:
          "Kata sandi ditolak oleh kebijakan Supabase Auth. Gunakan sedikitnya 8 karakter atau hubungi administrator.",
      };
    if (
      !activationCompletionRetry &&
      (updated.error || updated.data.user?.id !== userId)
    ) {
      logSchoolAuthFailure({
        operation: "password_change", stage, correlationId,
        error: updated.error ?? { code: "auth_identity_mismatch" },
      });
      return {
        success: false,
        message:
          "Kata sandi belum dapat diperbarui. Periksa ketentuan kata sandi dan coba kembali.",
      };
    }

    stage = "session_verification";
    const verified = await supabase.auth.getUser();
    if (verified.error || verified.data.user?.id !== userId) {
      logSchoolAuthFailure({
        operation: "password_change", stage, correlationId,
        error: verified.error ?? { code: "auth_identity_mismatch" },
      });
      return {
        success: false,
        message:
          "Kata sandi telah dikirim, tetapi sesi belum dapat diverifikasi. Jangan keluar; coba simpan kembali.",
      };
    }

    if (activation) {
      stage = "activation_completion";
      const completed = await createAdminClient().rpc("complete_school_activation", {
        p_user_id: userId,
        p_request_id: activation.request_id,
      });
      if (completed.error || completed.data !== true) {
        logSchoolAuthFailure({
          operation: "password_change", stage, correlationId,
          error: completed.error ?? { code: "activation_completion_rejected" },
        });
        return {
          success: false,
          message: "Kata sandi berhasil diperbarui, tetapi aktivasi belum selesai. Coba simpan lagi dengan kata sandi baru, atau minta tautan aktivasi baru dari halaman login.",
        };
      }
    } else if (profile.data?.must_change_password === true) {
      const admin = createAdminClient();
      const cleared = await admin.rpc(
        "complete_initial_password_change",
        { p_user_id: userId },
      );
      if (cleared.error || cleared.data !== true)
        return {
          success: false,
          message:
            "Kata sandi berhasil diperbarui, tetapi pembukaan akses belum selesai. Jangan keluar; coba simpan kembali atau hubungi Admin Dinas.",
        };
      const retainedMetadata = { ...(verified.data.user.app_metadata ?? {}) };
      delete retainedMetadata.school_temporary_password_digest;
      await admin.auth.admin.updateUserById(userId, {
        app_metadata: retainedMetadata,
      });
    } else {
      const signedOut = await supabase.auth.signOut({ scope: "local" });
      if (signedOut.error)
        return {
          success: false,
          message:
            "Kata sandi berhasil diperbarui, tetapi sesi belum dapat ditutup. Silakan coba beberapa saat lagi.",
        };
    }

    revalidatePath("/dashboard", "layout");
    return {
      success: true,
      message: "Kata sandi berhasil diperbarui.",
      redirectTo: activation || profile.data?.must_change_password === true
        ? "/dashboard"
        : "/auth/login",
    };
  } catch (error) {
    logSchoolAuthFailure({
      operation: "password_change", stage, correlationId, error,
    });
    return {
      success: false,
      message:
        "Layanan kata sandi belum dapat dihubungi. Periksa koneksi dan coba kembali.",
    };
  }
}
