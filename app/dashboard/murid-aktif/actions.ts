"use server";

import { revalidatePath } from "next/cache";
import type { ZodError } from "zod";
import { getAlumniAccess } from "@/lib/alumni/access";
import {
  activeStudentFormSchema,
  activeStudentIdSchema,
  type ActiveStudentHistory,
  type ActiveStudentMutationResult,
} from "@/lib/active-students/schema";

const denied: ActiveStudentMutationResult = {
  success: false,
  message: "Akses ditolak. Hanya Petugas Sekolah aktif yang dapat mengubah data murid.",
};

function revalidateActiveStudents() {
  revalidatePath("/dashboard/murid-aktif");
  revalidatePath("/dashboard");
}

function validationResult(
  error: ZodError,
): ActiveStudentMutationResult {
  const flattened = error.flatten();
  return {
    success: false,
    message: "Periksa kembali field yang ditandai.",
    fieldErrors: flattened.fieldErrors as Record<string, string[]>,
  };
}

export async function saveActiveStudent(
  id: unknown,
  input: unknown,
): Promise<ActiveStudentMutationResult> {
  try {
    const access = await getAlumniAccess();
    if (!access.allowed || !access.canWrite || !access.schoolId) return denied;

    const parsed = activeStudentFormSchema.safeParse(input);
    if (!parsed.success) return validationResult(parsed.error);
    if (id !== null && !activeStudentIdSchema.safeParse(id).success)
      return { success: false, message: "Data murid tidak valid." };

    const {
      expected_updated_at: expectedUpdatedAt,
      data_year: dataYear,
      parent_consent: parentConsent,
      ...values
    } = parsed.data;
    const payload = {
      ...values,
      parent_consent: parentConsent,
      data_year: dataYear,
    };

    let savedId: string | null = null;
    let error: { code?: string } | null = null;
    let updatedCount: number | null = null;

    if (id === null) {
      const result = await access.supabase
        .from("active_students")
        .insert(payload)
        .select("id, updated_at")
        .maybeSingle();
      savedId = result.data?.id ?? null;
      error = result.error;
    } else {
      const result = await access.supabase
        .from("active_students")
        .update(values, { count: "exact" })
        .eq("id", id as string)
        .eq("school_id", access.schoolId)
        .eq("data_year", dataYear)
        .eq("updated_at", expectedUpdatedAt ?? "");
      error = result.error;
      updatedCount = result.count;
      if (!error && updatedCount === 1) savedId = id as string;
    }
    if (error)
      return {
        success: false,
        message:
          error.code === "23514"
            ? "Data tidak memenuhi aturan kelas, status, atau penempatan."
            : "Data murid belum dapat disimpan. Silakan periksa dan coba kembali.",
      };
    if (!savedId || (id !== null && updatedCount !== 1))
      return {
        success: false,
        refresh: id !== null,
        message:
          id === null
            ? "Data belum dapat dikonfirmasi tersimpan."
            : "Data sudah berubah atau Tahun Pendataan tidak cocok. Muat ulang sebelum mengedit kembali.",
      };

    revalidateActiveStudents();
    return {
      success: true,
      id: savedId,
      message:
        id === null
          ? "Data murid berhasil ditambahkan."
          : "Data murid berhasil diperbarui.",
    };
  } catch {
    return {
      success: false,
      message:
        "Koneksi bermasalah. Periksa daftar murid sebelum mengirim ulang untuk menghindari duplikasi.",
    };
  }
}

export async function deleteActiveStudent(
  id: unknown,
): Promise<ActiveStudentMutationResult> {
  try {
    const access = await getAlumniAccess();
    if (!access.allowed || !access.canWrite || !access.schoolId) return denied;
    const parsed = activeStudentIdSchema.safeParse(id);
    if (!parsed.success)
      return { success: false, message: "Data murid tidak valid." };

    const { data, error } = await access.supabase.rpc(
      "delete_active_student",
      { p_student_id: parsed.data },
    );
    if (error || data !== parsed.data)
      return {
        success: false,
        message:
          "Data murid tidak ditemukan, sudah dihapus, atau tidak berada di sekolah Anda.",
      };
    revalidateActiveStudents();
    return { success: true, id: parsed.data, message: "Data murid dihapus permanen." };
  } catch {
    return {
      success: false,
      message: "Penghapusan belum dapat diselesaikan. Silakan coba kembali.",
    };
  }
}

export type ActiveStudentHistoryResult =
  | { success: true; history: ActiveStudentHistory[] }
  | { success: false; message: string };

export async function getActiveStudentHistory(
  id: unknown,
): Promise<ActiveStudentHistoryResult> {
  try {
    const access = await getAlumniAccess();
    const parsed = activeStudentIdSchema.safeParse(id);
    if (!access.allowed || !parsed.success)
      return { success: false, message: "Riwayat tidak dapat diakses." };
    const { data, error } = await access.supabase.rpc(
      "get_active_student_history",
      { p_student_id: parsed.data },
    );
    if (error || !Array.isArray(data)) {
      const fallback = await access.supabase
        .from("active_student_histories")
        .select(
          "id, student_id, change_type, old_value, new_value, changed_by, changed_at",
        )
        .eq("student_id", parsed.data)
        .order("changed_at", { ascending: true })
        .order("id", { ascending: true });
      if (fallback.error || !Array.isArray(fallback.data))
        return { success: false, message: "Riwayat belum dapat dimuat." };
      return {
        success: true,
        history: fallback.data.map((item) => ({
          ...item,
          changed_by_name:
            item.changed_by === access.userId ? access.fullName : null,
        })) as ActiveStudentHistory[],
      };
    }
    return { success: true, history: data as ActiveStudentHistory[] };
  } catch {
    return { success: false, message: "Riwayat belum dapat dimuat." };
  }
}

