"use server";

import { revalidatePath } from "next/cache";
import { getAlumniAccess } from "@/lib/alumni/access";
import {
  alumniSchema,
  alumniRegistrationSchema,
  initialPlacementSchema,
  placementDetailsEditSchema,
  placementSchema,
  idSchema,
  type PlacementInput,
  type PlacementEditResult,
  type MutationResult,
  type RegistrationResult,
} from "@/lib/alumni/schema";

const denied: MutationResult = {
  success: false,
  message: "Akses ditolak. Diperlukan profil petugas dan sekolah yang aktif.",
};

type GrantedAlumniAccess = Extract<
  Awaited<ReturnType<typeof getAlumniAccess>>,
  { allowed: true }
>;

function revalidateAlumni(id: string) {
  revalidatePath("/dashboard/alumni");
  revalidatePath(`/dashboard/alumni/${id}`);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/reports");
}

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
  revalidateAlumni(savedId);
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
  const parsed = initialPlacementSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      message: "Periksa kembali data penempatan awal alumni.",
    };
  return registerPlacement(alumniId, null, parsed.data);
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
    const result = await persistPlacement(
      access,
      id,
      expectedCurrentId as string | null,
      parsed.data,
    );
    if (!result.success) return result;
    revalidateAlumni(id);
    return result;
  } catch {
    return {
      success: false,
      message:
        "Koneksi bermasalah. Data alumni tetap tersedia. Muat ulang detail untuk memeriksa penempatan.",
    };
  }
}

export async function updatePlacementDetails(
  input: unknown,
): Promise<PlacementEditResult> {
  try {
    const access = await getAlumniAccess();
    if (!access.allowed || !access.canWrite || !access.schoolId) return denied;
    const parsed = placementDetailsEditSchema.safeParse(input);
    if (!parsed.success)
      return {
        success: false,
        message: "Periksa kembali kondisi penempatan dan urutan tanggal.",
      };

    const values = parsed.data;
    const { data: current, error: currentError } = await access.supabase
      .from("placements")
      .select(
        "id, alumni_id, status, is_current, planned_departure, updated_at",
      )
      .eq("id", values.placement_id)
      .maybeSingle();
    if (currentError)
      return {
        success: false,
        message: "Kondisi penempatan belum dapat diperiksa. Coba lagi.",
      };
    if (!current || current.is_current !== true)
      return {
        success: false,
        refresh: true,
        message:
          "Penempatan saat ini sudah berubah. Muat ulang detail sebelum mengedit kembali.",
      };

    const { data: alumni, error: alumniError } = await access.supabase
      .from("alumni")
      .select("id")
      .eq("id", current.alumni_id)
      .eq("school_id", access.schoolId)
      .maybeSingle();
    if (alumniError || !alumni) return denied;
    if (
      current.status !== values.expected_status ||
      current.updated_at !== values.expected_updated_at
    )
      return {
        success: false,
        refresh: true,
        message:
          "Kondisi penempatan telah diperbarui di tab lain. Muat ulang detail sebelum mencoba kembali.",
      };

    const { data, error } = await access.supabase.rpc(
      "update_current_placement_details",
      {
        p_placement_id: values.placement_id,
        p_expected_status: values.expected_status,
        p_expected_updated_at: values.expected_updated_at,
        p_destination_country: values.destination_country,
        p_placement_secured: values.placement_secured,
        p_placement_provider_name: values.placement_provider_name || null,
        p_work_sector: values.work_sector || null,
        p_planned_departure:
          current.status === "persiapan_berangkat" ||
          current.status === "batal_berangkat"
            ? values.planned_departure || null
            : current.planned_departure,
        p_actual_departure: values.actual_departure || null,
        p_employment_start: values.employment_start || null,
        p_contract_end_date: values.contract_end_date || null,
      },
    );
    if (error?.code === "PGRST202" || error?.code === "42883")
      return {
        success: false,
        message:
          "Edit kondisi penempatan belum diaktifkan. Administrator database perlu menerapkan migration terbaru.",
      };
    if (
      error?.code === "P0001" &&
      error.message === "Planned departure does not match current status"
    )
      return {
        success: false,
        message:
          "Edit kondisi penempatan memerlukan migration perbaikan terbaru.",
      };
    if (error?.code === "P0001")
      return {
        success: false,
        refresh: true,
        message:
          "Kondisi penempatan telah berubah. Muat ulang detail sebelum mencoba kembali.",
      };
    if (error || !data)
      return {
        success: false,
        message:
          "Perubahan belum dapat dikonfirmasi tersimpan. Muat ulang detail sebelum mencoba kembali.",
      };

    revalidateAlumni(current.alumni_id);
    return {
      success: true,
      message: "Kondisi penempatan berhasil diperbarui.",
    };
  } catch {
    return {
      success: false,
      refresh: true,
      message:
        "Koneksi bermasalah. Muat ulang detail untuk memeriksa kondisi penempatan terbaru.",
    };
  }
}

async function persistPlacement(
  access: GrantedAlumniAccess,
  alumniId: string,
  expectedCurrentId: string | null,
  values: PlacementInput,
): Promise<MutationResult> {
  const { data: alumni, error: alumniError } = await access.supabase
    .from("alumni")
    .select("id")
    .eq("id", alumniId)
    .eq("school_id", access.schoolId!)
    .maybeSingle();
  if (alumniError || !alumni)
    return {
      success: false,
      message: "Alumni tidak ditemukan atau akses tidak diizinkan.",
    };

  const { data: existing, error: existingError } = await access.supabase
    .from("placements")
    .select("id, status")
    .eq("alumni_id", alumniId)
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

  const { data, error } = await access.supabase.rpc(
    "create_placement_guarded",
    {
      p_alumni_id: alumniId,
      p_expected_current_id: expectedCurrentId,
      p_destination_country: values.destination_country,
      p_placement_secured: values.placement_secured,
      p_placement_provider_name: values.placement_provider_name || null,
      p_work_sector: values.work_sector || null,
      p_planned_departure: values.planned_departure || null,
      p_initial_status: values.status,
      p_actual_departure: values.actual_departure || null,
      p_employment_start: values.employment_start || null,
      p_contract_end_date: values.contract_end_date || null,
    },
  );
  if (error?.code === "PGRST202" || error?.code === "42883")
    return {
      success: false,
      message:
        "Registrasi penempatan belum diaktifkan. Administrator database perlu menerapkan migration status perolehan penempatan terlebih dahulu.",
    };
  if (error || !data)
    return {
      success: false,
      message:
        "Penempatan belum dapat dikonfirmasi tersimpan. Data alumni tetap tersedia. Buka detail alumni sebelum mencoba lagi.",
    };
  return { success: true, message: "Penempatan berhasil dicatat." };
}

export async function registerAlumniWithPlacement(
  savedAlumniId: unknown,
  input: unknown,
): Promise<RegistrationResult> {
  let alumniId: string | null = null;
  let identityConfirmed = false;
  try {
    const access = await getAlumniAccess();
    if (!access.allowed || !access.canWrite || !access.schoolId) return denied;

    const parsed = alumniRegistrationSchema.safeParse(input);
    const parsedId =
      savedAlumniId === null ? null : idSchema.safeParse(savedAlumniId);
    if (!parsed.success || (parsedId !== null && !parsedId.success))
      return {
        success: false,
        message: "Periksa kembali identitas dan data penempatan alumni.",
      };

    if (parsedId) {
      alumniId = parsedId.data;
      const { data: existingIdentity, error: identityError } =
        await access.supabase
          .from("alumni")
          .select("id, full_name, graduation_year, major")
          .eq("id", alumniId)
          .eq("school_id", access.schoolId)
          .maybeSingle();
      if (identityError || !existingIdentity)
        return {
          success: false,
          message:
            "Data alumni yang tersimpan belum dapat diverifikasi. Periksa daftar alumni sebelum mencoba kembali.",
        };
      identityConfirmed = true;

      const identityChanged =
        existingIdentity.full_name !== parsed.data.identity.full_name ||
        existingIdentity.graduation_year !==
          parsed.data.identity.graduation_year ||
        existingIdentity.major !== parsed.data.identity.major;
      if (identityChanged) {
        const { data, error } = await access.supabase
          .from("alumni")
          .update(parsed.data.identity)
          .eq("id", alumniId)
          .eq("school_id", access.schoolId)
          .select("id")
          .maybeSingle();
        if (error || !data)
          return {
            success: false,
            id: alumniId,
            identitySaved: true,
            message:
              "Identitas alumni sudah tersimpan, tetapi perubahan terakhir belum dapat diterapkan. Buka detail alumni untuk melanjutkan.",
          };
      }
    } else {
      const { data, error } = await access.supabase
        .from("alumni")
        .insert(parsed.data.identity)
        .select("id")
        .maybeSingle();
      if (error || !data)
        return {
          success: false,
          message:
            "Data belum dapat dikonfirmasi tersimpan. Periksa daftar alumni sebelum mengirim ulang.",
        };
      alumniId = data.id;
      identityConfirmed = true;
    }

    if (!alumniId)
      return {
        success: false,
        message: "Data alumni belum dapat dikonfirmasi tersimpan.",
      };
    const confirmedAlumniId = alumniId;
    const placement = await persistPlacement(
      access,
      confirmedAlumniId,
      null,
      parsed.data.placement,
    );
    revalidateAlumni(confirmedAlumniId);
    if (!placement.success)
      return {
        ...placement,
        id: confirmedAlumniId,
        identitySaved: true,
      };

    return {
      success: true,
      id: confirmedAlumniId,
      identitySaved: true,
      message: "Alumni dan penempatan awal berhasil disimpan.",
    };
  } catch {
    if (alumniId && identityConfirmed) {
      revalidateAlumni(alumniId);
      return {
        success: false,
        id: alumniId,
        identitySaved: true,
        message:
          "Identitas alumni sudah tersimpan, tetapi penempatan belum dapat dikonfirmasi. Buka detail alumni sebelum mencoba lagi.",
      };
    }
    return {
      success: false,
      message:
        "Koneksi terputus. Periksa daftar alumni sebelum mencoba kembali untuk menghindari duplikasi.",
    };
  }
}
