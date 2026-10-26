"use server";

import { revalidatePath } from "next/cache";
import { getAlumniAccess } from "@/lib/alumni/access";
import {
  alumniSchema,
  placementSchema,
  idSchema,
  type MutationResult,
} from "@/lib/alumni/schema";

const denied: MutationResult = {
  success: false,
  message: "Akses ditolak. Diperlukan profil petugas dan sekolah yang aktif.",
};

export async function saveAlumni(
  id: unknown,
  input: unknown,
): Promise<MutationResult> {
  let savedId: string;
  try {
    const access = await getAlumniAccess();
    if (!access.allowed || !access.canWrite || !access.schoolId) return denied;
    const parsed = alumniSchema.safeParse(input);
    if (!parsed.success || (id !== null && !idSchema.safeParse(id).success))
      return {
        success: false,
        message: "Periksa nama, tahun kelulusan (1990–2100), dan jurusan.",
      };
    // school_id is deliberately omitted: the database assigns it from auth.uid().
    const query =
      id === null
        ? access.supabase.from("alumni").insert(parsed.data)
        : access.supabase
            .from("alumni")
            .update(parsed.data)
            .eq("id", id as string)
            .eq("school_id", access.schoolId);
    const { data, error } = await query.select("id").maybeSingle();
    if (error || !data)
      return {
        success: false,
        message:
          "Data belum dapat dikonfirmasi tersimpan. Periksa daftar alumni sebelum mengirim ulang.",
      };
    savedId = data.id;
  } catch {
    return {
      success: false,
      message:
        "Koneksi terputus. Periksa daftar alumni sebelum mencoba kembali untuk menghindari duplikasi.",
    };
  }
  revalidatePath("/dashboard/alumni");
  revalidatePath(`/dashboard/alumni/${savedId}`);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/reports");
  return {
    success: true,
    id: savedId,
    message: "Data alumni berhasil disimpan.",
  };
}

export async function registerInitialPlacement(
  alumniId: unknown,
  input: unknown,
): Promise<MutationResult> {
  return registerPlacement(alumniId, null, input);
}

export async function registerPlacement(
  alumniId: unknown,
  expectedCurrentId: unknown,
  input: unknown,
): Promise<MutationResult> {
  try {
    const access = await getAlumniAccess();
    if (!access.allowed || !access.canWrite || !access.schoolId) return denied;
    const parsed = placementSchema.safeParse(input);
    if (
      !idSchema.safeParse(alumniId).success ||
      !parsed.success ||
      (expectedCurrentId !== null &&
        !idSchema.safeParse(expectedCurrentId).success)
    )
      return {
        success: false,
        message: "Periksa data penempatan, status awal, dan urutan tanggal.",
      };
    const id = alumniId as string;
    const { data: alumni, error: alumniError } = await access.supabase
      .from("alumni")
      .select("id")
      .eq("id", id)
      .eq("school_id", access.schoolId)
      .maybeSingle();
    if (alumniError || !alumni)
      return {
        success: false,
        message: "Alumni tidak ditemukan atau akses tidak diizinkan.",
      };
    const { data: existing, error: existingError } = await access.supabase
      .from("placements")
      .select("id, status")
      .eq("alumni_id", id)
      .eq("is_current", true)
      .limit(1)
      .maybeSingle();
    if (existingError)
      return {
        success: false,
        message: "Penempatan belum dapat diperiksa. Coba muat ulang halaman.",
      };
    if (
      (existing?.id ?? null) !== expectedCurrentId ||
      (existing &&
        !["selesai_kontrak", "batal_berangkat"].includes(existing.status))
    )
      return {
        success: false,
        message:
          "Penempatan telah berubah atau belum selesai. Muat ulang halaman untuk melihat data terbaru.",
      };
    const v = parsed.data;
    const { data, error } = await access.supabase.rpc(
      "create_placement_guarded",
      {
        p_alumni_id: id,
        p_expected_current_id: expectedCurrentId,
        p_destination_country: v.destination_country,
        p_work_sector: v.work_sector || null,
        p_company_name: v.company_name || null,
        p_planned_departure: v.planned_departure || null,
        p_initial_status: v.status,
        p_actual_departure: v.actual_departure || null,
        p_employment_start: v.employment_start || null,
        p_contract_end_date: v.contract_end_date || null,
      },
    );
    if (error?.code === "PGRST202" || error?.code === "42883")
      return {
        success: false,
        message:
          "Registrasi penempatan belum diaktifkan. Administrator database perlu menerapkan migration pengaman penempatan terlebih dahulu.",
      };
    if (error || !data)
      return {
        success: false,
        message:
          "Penempatan belum dapat dikonfirmasi tersimpan. Data alumni tetap tersedia. Muat ulang detail sebelum mencoba lagi.",
      };
  } catch {
    return {
      success: false,
      message:
        "Koneksi bermasalah. Data alumni tetap tersedia. Muat ulang detail untuk memeriksa penempatan.",
    };
  }
  revalidatePath("/dashboard/alumni");
  revalidatePath(`/dashboard/alumni/${alumniId}`);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/reports");
  return { success: true, message: "Penempatan berhasil dicatat." };
}
