import "server-only";
import type { requireAccess } from "@/lib/auth/access";
import { readAllRows } from "@/lib/data/read-all";
import { activeStudentRowsSchema } from "./model";

type Access = Awaited<ReturnType<typeof requireAccess>>;

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

