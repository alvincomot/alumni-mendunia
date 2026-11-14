import "server-only";
import type { requireAccess } from "@/lib/auth/access";
import { readAllRows } from "@/lib/data/read-all";
import { activeStudentRowsSchema } from "./model";

type Access = Awaited<ReturnType<typeof requireAccess>>;

export type ActiveStudentDashboardSummary = {
  total: number;
  activeTraining: number;
  completedTraining: number;
  placed: number;
};

export async function loadActiveStudentDashboardSummary(
  access: Access,
): Promise<ActiveStudentDashboardSummary> {
  if (!access.canWrite || !access.schoolId)
    throw new Error("School-scoped active student access unavailable");

  const count = (column?: "training_status" | "placement_status", value?: string) => {
    let query = access.supabase
      .from("active_students")
      .select("id", { count: "exact", head: true })
      .eq("school_id", access.schoolId!);
    if (column && value) query = query.eq(column, value);
    return query;
  };

  const [total, activeTraining, completedTraining, placed] = await Promise.all([
    count(),
    count("training_status", "aktif_pelatihan"),
    count("training_status", "selesai_pelatihan"),
    count("placement_status", "sudah"),
  ]);
  const results = [total, activeTraining, completedTraining, placed];
  if (results.some((result) => result.error))
    throw new Error("Active student dashboard summary unavailable");

  return {
    total: total.count ?? 0,
    activeTraining: activeTraining.count ?? 0,
    completedTraining: completedTraining.count ?? 0,
    placed: placed.count ?? 0,
  };
}

export async function loadActiveStudents(access: Access) {
  const rows = await readAllRows<unknown>((start, end) => {
    let query = access.supabase
      .from("active_students")
      .select(
        "id, school_id, full_name, skill_concentration, grade, kjp_status, parent_consent, parent_consent_at, parent_consent_by, training_status, provider_name, placement_status, placement_country, placement_date, data_year, created_at, updated_at, schools(name, npsn)",
        { count: "exact" },
      );
    if (access.canWrite) query = query.eq("school_id", access.schoolId!);
    return query.order("id").range(start, end);
  });
  const parsed = activeStudentRowsSchema.parse(rows);
  if (new Set(parsed.map((row) => row.id)).size !== parsed.length)
    throw new Error("Data murid berubah saat dimuat; muat ulang halaman");
  return parsed;
}

