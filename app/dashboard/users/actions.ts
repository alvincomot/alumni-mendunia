"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAlumniAccess } from "@/lib/alumni/access";
import {
  createAdminClient,
  invitationRedirect,
  listAuthUsers,
  administrationMessage,
} from "@/lib/users/admin";
import {
  invitationSchema,
  profileInputSchema,
  type UserResult,
} from "@/lib/users/schema";

const denied: UserResult = {
  success: false,
  message: "Akses ditolak. Diperlukan profil Admin Dinas yang aktif.",
};

export async function saveUserProfile(
  userId: unknown,
  input: unknown,
): Promise<UserResult> {
  try {
    const access = await getAlumniAccess();
    if (!access.allowed || access.role !== "admin_dinas") return denied;
    const values = profileInputSchema.safeParse(input);
    if (!z.uuid().safeParse(userId).success || !values.success)
      return {
        success: false,
        message: "Periksa nama, peran, dan penugasan sekolah.",
      };
    const v = values.data;
    if (userId === access.userId && (!v.is_active || v.role !== "admin_dinas"))
      return {
        success: false,
        message:
          "Anda tidak dapat menonaktifkan atau menurunkan peran akun sendiri.",
      };
    if (v.school_id) {
      const school = await access.supabase
        .from("schools")
        .select("id")
        .eq("id", v.school_id)
        .eq("is_active", true)
        .maybeSingle();
      if (school.error || !school.data)
        return { success: false, message: "Pilih sekolah yang masih aktif." };
    }
    const { error, data } = await access.supabase
      .from("profiles")
      .update({ ...v, school_id: v.school_id || null })
      .eq("user_id", userId as string)
      .select("user_id")
      .maybeSingle();
    if (error || !data)
      return {
        success: false,
        message:
          "Profil belum dapat disimpan. Muat ulang daftar untuk memeriksa perubahan terbaru.",
      };
  } catch {
    return {
      success: false,
      message: "Koneksi bermasalah. Periksa daftar sebelum mencoba lagi.",
    };
  }
  revalidatePath("/dashboard", "layout");
  return { success: true, message: "Profil pengguna berhasil diperbarui." };
}

export async function inviteUser(input: unknown): Promise<UserResult> {
  let accountAvailable = false;
  let invitationAttempted = false;
  let recovered = false;
  const partialFailure =
    "Akun Auth tersedia, tetapi profil belum dapat dikonfirmasi. Muat ulang daftar; gunakan pemulihan profil jika profil belum ada. Jangan buat akun baru.";
  try {
    const access = await getAlumniAccess();
    if (!access.allowed || access.role !== "admin_dinas") return denied;
    const parsed = invitationSchema.safeParse(input);
    if (!parsed.success)
      return {
        success: false,
        message: "Periksa email, nama, peran, dan sekolah.",
      };
    const { email, profile, recover } = parsed.data;
    recovered = recover;
    const redirectTo = recover ? undefined : invitationRedirect();
    if (profile.school_id) {
      const school = await access.supabase
        .from("schools")
        .select("id")
        .eq("id", profile.school_id)
        .eq("is_active", true)
        .maybeSingle();
      if (school.error || !school.data)
        return { success: false, message: "Pilih sekolah yang masih aktif." };
    }
    const admin = createAdminClient();
    const users = await listAuthUsers(admin);
    const existing = users.find((user) => user.email?.toLowerCase() === email);
    let userId: string;
    if (existing) {
      const current = await access.supabase
        .from("profiles")
        .select("user_id")
        .eq("user_id", existing.id)
        .maybeSingle();
      if (current.error) throw new Error("Profile lookup unavailable");
      if (current.data)
        return {
          success: false,
          message:
            "Email sudah memiliki profil. Gunakan Edit profil pada pengguna tersebut.",
        };
      if (!recover)
        return {
          success: false,
          message:
            "Akun Auth sudah ada tanpa profil. Pilih pemulihan profil untuk menghubungkannya tanpa mengirim undangan ulang.",
        };
      userId = existing.id;
      accountAvailable = true;
    } else {
      if (recover)
        return {
          success: false,
          message:
            "Akun Auth belum ditemukan. Gunakan Undang pengguna setelah konfigurasi undangan tersedia.",
        };
      const currentAccess = await getAlumniAccess();
      if (
        !currentAccess.allowed ||
        currentAccess.role !== "admin_dinas" ||
        currentAccess.userId !== access.userId
      )
        return denied;
      invitationAttempted = true;
      const invitation = await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo,
      });
      if (invitation.error) throw invitation.error;
      if (!invitation.data.user)
        return {
          success: false,
          message:
            "Undangan belum dapat dikonfirmasi. Periksa daftar akun sebelum mencoba ulang; pastikan email dan konfigurasi pengiriman tersedia.",
        };
      userId = invitation.data.user.id;
      accountAvailable = true;
    }
    // INSERT, never upsert: a racing request must not overwrite an existing assignment.
    const result = await access.supabase.from("profiles").insert({
      user_id: userId,
      ...profile,
      school_id: profile.school_id || null,
    });
    if (result.error)
      return {
        success: false,
        message: partialFailure,
      };
  } catch (error) {
    return {
      success: false,
      message: accountAvailable
        ? partialFailure
        : administrationMessage(error) +
          (invitationAttempted
            ? " Muat ulang daftar untuk memastikan apakah akun sudah terbentuk sebelum mencoba lagi."
            : ""),
    };
  } finally {
    if (accountAvailable || invitationAttempted)
      revalidatePath("/dashboard/users");
  }
  return {
    success: true,
    message: recovered
      ? "Profil berhasil dipulihkan. Tidak ada undangan baru yang dikirim."
      : "Profil berhasil dibuat dan permintaan undangan diterima layanan email. Minta penerima memeriksa kotak masuk atau spam; penerimaan email belum dapat dipastikan oleh aplikasi.",
  };
}
