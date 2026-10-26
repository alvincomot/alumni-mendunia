"use server";

import { revalidatePath } from "next/cache";
import { getSchoolAccess } from "@/lib/schools/access";
import {
  schoolSchema,
  schoolIdSchema,
  schoolStatusSchema,
  schoolErrorMessage,
  type SchoolResult,
} from "@/lib/schools/schema";

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
  revalidatePath("/dashboard/schools");
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
  revalidatePath("/dashboard/schools");
  return { success: true, message: "Status sekolah berhasil diperbarui." };
}
