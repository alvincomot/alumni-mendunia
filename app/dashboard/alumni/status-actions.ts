"use server";

import { revalidatePath } from "next/cache";
import { getAlumniAccess } from "@/lib/alumni/access";
import { type PlacementRecord } from "@/lib/alumni/schema";
import {
  canTransition,
  statusChangeSchema,
  statusDateError,
  type StatusChangeResult,
} from "@/lib/alumni/status";

const denied: StatusChangeResult = {
  success: false,
  message:
    "Akses ditolak. Perubahan status hanya untuk petugas sekolah yang berwenang.",
};
const stale: StatusChangeResult = {
  success: false,
  refresh: true,
  message:
    "Status atau penempatan sudah berubah. Data sedang dimuat ulang. Tutup dialog dan periksa kondisi terbaru sebelum melanjutkan.",
};

export async function changePlacementStatus(
  input: unknown,
): Promise<StatusChangeResult> {
  try {
    const access = await getAlumniAccess();
    if (!access.allowed || !access.canWrite || !access.schoolId) return denied;
    const parsed = statusChangeSchema.safeParse(input);
    if (!parsed.success)
      return {
        success: false,
        message:
          "Periksa perubahan status, tanggal, dan catatan (maksimal 500 karakter).",
      };
    const value = parsed.data;
    const { data, error } = await access.supabase
      .from("placements")
      .select(
        "id, alumni_id, status, is_current, actual_departure, employment_start",
      )
      .eq("id", value.placement_id)
      .maybeSingle();
    if (error)
      return {
        success: false,
        message: "Penempatan belum dapat diperiksa. Coba kembali.",
      };
    if (!data) return denied;
    const placement = data as Pick<
      PlacementRecord,
      | "id"
      | "alumni_id"
      | "status"
      | "is_current"
      | "actual_departure"
      | "employment_start"
    >;
    const { data: alumni, error: alumniError } = await access.supabase
      .from("alumni")
      .select("id")
      .eq("id", placement.alumni_id)
      .eq("school_id", access.schoolId)
      .maybeSingle();
    if (alumniError || !alumni) return denied;
    const refresh = () => {
      revalidatePath("/dashboard/alumni");
      revalidatePath("/dashboard");
      revalidatePath("/dashboard/reports");
      revalidatePath(`/dashboard/alumni/${placement.alumni_id}`);
    };
    // The browser's snapshot detects stale dialogs; only the verified DB status
    // supplies the RPC's optimistic concurrency condition.
    if (!placement.is_current || placement.status !== value.expected_status) {
      refresh();
      return stale;
    }
    if (!canTransition(placement.status, value.new_status))
      return {
        success: false,
        message: "Status penempatan ini tidak dapat diubah ke status tersebut.",
      };
    const dateError = statusDateError(value, placement);
    if (dateError) return { success: false, message: dateError };
    const { error: rpcError } = await access.supabase.rpc(
      "change_placement_status",
      {
        p_placement_id: placement.id,
        p_expected_status: placement.status,
        p_new_status: value.new_status,
        p_note: value.note || null,
        p_actual_departure: value.actual_departure || null,
        p_contract_end_date: value.contract_end_date || null,
      },
    );
    if (rpcError) {
      if (
        rpcError.code === "P0001" &&
        [
          "Status berubah, muat ulang data terlebih dahulu",
          "Hanya penempatan terkini yang bisa diubah",
        ].includes(rpcError.message)
      ) {
        refresh();
        return stale;
      }
      if (rpcError.code === "42501") return { ...denied, refresh: true };
      if (rpcError.code === "23514")
        return {
          success: false,
          refresh: true,
          message:
            "Tanggal tidak sesuai data penempatan terbaru. Muat ulang dan periksa urutan tanggal.",
        };
      return {
        success: false,
        refresh: true,
        message:
          "Perubahan belum dapat dikonfirmasi. Periksa status dan riwayat terbaru sebelum mencoba kembali.",
      };
    }
    // This RPC returns void; a null data payload is a successful response.
    refresh();
    return {
      success: true,
      refresh: true,
      message: "Status penempatan berhasil diperbarui.",
    };
  } catch {
    return {
      success: false,
      refresh: true,
      message:
        "Koneksi bermasalah. Periksa status dan riwayat terbaru sebelum mencoba kembali.",
    };
  }
}
