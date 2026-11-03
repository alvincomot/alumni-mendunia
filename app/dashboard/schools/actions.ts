"use server";

import { revalidatePath } from "next/cache";
import { getAlumniAccess } from "@/lib/alumni/access";
import { getSchoolAccess } from "@/lib/schools/access";
import { createAdminClient } from "@/lib/users/admin";
import { readSchoolAccountStatus } from "@/lib/schools/accounts";
import {
  schoolAccountStatusSchema,
  type SchoolAccountDetailsResult,
  type SchoolAccountMutationResult,
} from "@/lib/users/schema";
import {
  schoolSchema,
  schoolIdSchema,
  schoolStatusSchema,
  schoolErrorMessage,
  type SchoolResult,
} from "@/lib/schools/schema";

function revalidateSchoolViews() {
  for (const path of [
    "/dashboard/schools",
    "/dashboard",
    "/dashboard/users",
    "/dashboard/alumni",
    "/dashboard/reports",
  ])
    revalidatePath(path);
  revalidatePath("/dashboard/alumni/[id]", "page");
}

export async function saveSchool(
  id: unknown,
  input: unknown,
): Promise<SchoolResult> {
  try {
    const access = await getSchoolAccess();
    if (!access.allowed || !access.canManage) {
      return {
        success: false,
        message:
          "Akses ditolak. Pastikan sesi dan profil Admin Dinas Anda masih aktif.",
      };
    }
    const parsed = schoolSchema.safeParse(input);
    if (
      !parsed.success ||
      (id !== null && !schoolIdSchema.safeParse(id).success)
    ) {
      return {
        success: false,
        message: "Data tidak valid. Periksa NPSN, nama sekolah, dan kota.",
      };
    }
    const query =
      id === null
        ? access.supabase
            .from("schools")
            .insert({ ...parsed.data, is_active: true })
        : access.supabase
            .from("schools")
            .update(parsed.data)
            .eq("id", id as string);
    const { data, error } = await query.select("id").maybeSingle();
    if (error)
      return { success: false, message: schoolErrorMessage(error.code) };
    if (!data)
      return {
        success: false,
        message:
          "Sekolah tidak ditemukan atau akses sudah berubah. Muat ulang halaman.",
      };
  } catch {
    return {
      success: false,
      message: "Tidak dapat menghubungi layanan. Silakan coba kembali.",
    };
  }
  revalidateSchoolViews();
  return { success: true, message: "Data sekolah berhasil disimpan." };
}

export async function changeSchoolStatus(
  input: unknown,
): Promise<SchoolResult> {
  try {
    const access = await getSchoolAccess();
    if (!access.allowed || !access.canManage) {
      return {
        success: false,
        message:
          "Akses ditolak. Hanya Admin Dinas aktif yang dapat mengubah status sekolah.",
      };
    }
    const parsed = schoolStatusSchema.safeParse(input);
    if (!parsed.success)
      return { success: false, message: "Perubahan status tidak valid." };
    const { id, isActive } = parsed.data;
    const { data, error } = await access.supabase
      .from("schools")
      .update({ is_active: isActive })
      .eq("id", id)
      .eq("is_active", !isActive)
      .select("id")
      .maybeSingle();
    if (error)
      return { success: false, message: schoolErrorMessage(error.code) };
    if (!data)
      return {
        success: false,
        message:
          "Status atau akses sekolah sudah berubah. Muat ulang halaman sebelum mencoba kembali.",
      };
  } catch {
    return {
      success: false,
      message: "Tidak dapat menghubungi layanan. Silakan coba kembali.",
    };
  }
  revalidateSchoolViews();
  return { success: true, message: "Status sekolah berhasil diperbarui." };
}

async function activeAdminStillValid(
  access: Extract<
    Awaited<ReturnType<typeof getAlumniAccess>>,
    { allowed: true }
  >,
) {
  const result = await access.supabase
    .from("profiles")
    .select("user_id")
    .eq("user_id", access.userId)
    .eq("role", "admin_dinas")
    .eq("is_active", true)
    .maybeSingle();
  return !result.error && result.data?.user_id === access.userId;
}

async function requireActiveAdmin() {
  const access = await getAlumniAccess();
  if (!access.allowed || access.role !== "admin_dinas") return null;
  return access;
}

export async function getSchoolAccountDetails(
  schoolId: unknown,
): Promise<SchoolAccountDetailsResult> {
  try {
    const access = await requireActiveAdmin();
    const parsed = schoolIdSchema.safeParse(schoolId);
    if (!access || !parsed.success)
      return {
        success: false,
        message: "Akses ditolak atau sekolah tidak valid.",
      };

    const school = await access.supabase
      .from("schools")
      .select("id, name, npsn, is_active")
      .eq("id", parsed.data)
      .maybeSingle();
    if (school.error || !school.data)
      return {
        success: false,
        message: "Sekolah tidak ditemukan atau akses sudah berubah.",
      };

    let accounts: {
      user_id: string;
      full_name: string;
      is_active: boolean;
      must_change_password?: boolean;
    }[] = [];
    const profiles = await access.supabase
      .from("profiles")
      .select("user_id, full_name, is_active, must_change_password")
      .eq("school_id", parsed.data)
      .eq("role", "petugas_sekolah");
    if (profiles.error) {
      const fallback = await access.supabase
        .from("profiles")
        .select("user_id, full_name, is_active")
        .eq("school_id", parsed.data)
        .eq("role", "petugas_sekolah");
      if (fallback.error) throw new Error("School account lookup failed");
      accounts = fallback.data ?? [];
    } else {
      accounts = profiles.data ?? [];
    }

    if (!(await activeAdminStillValid(access)))
      return {
        success: false,
        message: "Akses administrator sudah berubah. Muat ulang halaman.",
      };
    const admin = createAdminClient();
    const status = await readSchoolAccountStatus(admin, school.data.npsn);
    const summaries = await Promise.all(
      accounts.map(async (account) => {
        const { data, error } = await admin.auth.admin.getUserById(
          account.user_id,
        );
        if (error || data.user?.id !== account.user_id)
          throw new Error("Linked account unavailable");
        return {
          userId: account.user_id,
          fullName: account.full_name,
          isActive: account.is_active,
          mustChangePassword: account.must_change_password === true,
          email: data.user.email ?? null,
          emailVerified: Boolean(data.user.email_confirmed_at),
        };
      }),
    );
    return {
      success: true,
      details: {
        school: {
          id: school.data.id,
          name: school.data.name,
          npsn: school.data.npsn,
          isActive: school.data.is_active,
        },
        accounts: summaries,
        status,
      },
    };
  } catch {
    return {
      success: false,
      message: "Informasi akun belum dapat dimuat. Silakan coba kembali.",
    };
  }
}

export async function changeSchoolAccountStatus(
  input: unknown,
): Promise<SchoolAccountMutationResult> {
  try {
    const access = await requireActiveAdmin();
    const parsed = schoolAccountStatusSchema.safeParse(input);
    if (!access || !parsed.success)
      return {
        success: false,
        message: "Akses ditolak atau perubahan status tidak valid.",
      };
    const values = parsed.data;

    const school = await access.supabase
      .from("schools")
      .select("id, is_active")
      .eq("id", values.school_id)
      .maybeSingle();
    if (school.error || !school.data)
      return { success: false, message: "Sekolah tidak ditemukan." };
    if (values.is_active && !school.data.is_active)
      return {
        success: false,
        message:
          "Aktifkan sekolah terlebih dahulu sebelum mengaktifkan akunnya.",
      };

    const accounts = await access.supabase
      .from("profiles")
      .select("user_id, is_active")
      .eq("school_id", values.school_id)
      .eq("role", "petugas_sekolah");
    if (accounts.error) throw new Error("School account lookup failed");
    const candidates = (accounts.data ?? []).filter(
      (account) => account.is_active !== values.is_active,
    );
    if (candidates.length !== 1)
      return {
        success: false,
        message:
          candidates.length === 0
            ? "Status akun sudah berubah. Muat ulang informasi akun."
            : "Terdapat lebih dari satu akun yang perlu ditinjau melalui Manajemen Pengguna.",
      };

    if (!(await activeAdminStillValid(access)))
      return {
        success: false,
        message:
          "Akses administrator berubah. Muat ulang halaman dan masuk kembali.",
      };

    const updated = await access.supabase
      .from("profiles")
      .update({ is_active: values.is_active })
      .eq("user_id", candidates[0].user_id)
      .eq("school_id", values.school_id)
      .eq("role", "petugas_sekolah")
      .eq("is_active", !values.is_active)
      .select("user_id")
      .maybeSingle();
    if (updated.error)
      return {
        success: false,
        message:
          updated.error.code === "23505"
            ? "Sekolah sudah memiliki akun aktif lain. Muat ulang informasi akun."
            : "Status akun belum dapat diperbarui.",
      };
    if (!updated.data)
      return {
        success: false,
        message: "Status akun sudah berubah. Muat ulang informasi akun.",
      };

    revalidatePath("/dashboard/schools");
    revalidatePath("/dashboard/users");
    return {
      success: true,
      message: values.is_active
        ? "Akun sekolah berhasil diaktifkan kembali."
        : "Akun sekolah berhasil dinonaktifkan.",
    };
  } catch {
    return {
      success: false,
      message: "Perubahan status akun belum dapat diselesaikan.",
    };
  }
}
