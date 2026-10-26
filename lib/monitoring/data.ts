import "server-only";
import type { requireAccess } from "@/lib/auth/access";
import { readAllRows } from "@/lib/data/read-all";
import { monitoringRowSchema } from "./model";
import type { MonitoringFilters } from "./model";
import { z } from "zod";
import { getCountryStorageNames } from "@/lib/countries";

export async function loadMonitoring(
  access: Awaited<ReturnType<typeof requireAccess>>,
) {
  const rows = await readAllRows((start, end) => {
    let query = access.supabase
      .from("alumni")
      .select(
        "id, school_id, full_name, graduation_year, major, schools(name), placements(id, status, destination_country, work_sector, company_name, planned_departure, actual_departure, employment_start, contract_end_date, is_current)",
        { count: "exact" },
      )
      .eq("placements.is_current", true);
    if (access.canWrite) query = query.eq("school_id", access.schoolId!);
    return query.order("id").range(start, end);
  });
  const parsed = monitoringRowSchema.array().parse(rows);
  if (new Set(parsed.map((row) => row.id)).size !== parsed.length)
    throw new Error("Data changed during pagination; reload required");
  return parsed;
}

export async function loadRecentActivity(
  access: Awaited<ReturnType<typeof requireAccess>>,
  filters: MonitoringFilters,
) {
  if (filters.status === "unplaced") return [];
  let query = access.supabase
    .from("status_histories")
    .select(
      "id, old_status, new_status, changed_at, placements!inner(is_current, destination_country, status, work_sector, alumni!inner(id, school_id, full_name, graduation_year))",
    )
    .eq("placements.is_current", true);
  if (access.canWrite)
    query = query.eq("placements.alumni.school_id", access.schoolId!);
  else if (filters.school)
    query = query.eq("placements.alumni.school_id", filters.school);
  if (filters.year)
    query = query.eq("placements.alumni.graduation_year", filters.year);
  if (filters.country) {
    const storageNames = getCountryStorageNames(filters.country);
    if (!storageNames.length) return [];
    const countryFilters = storageNames.map(
      (name) =>
        `destination_country.ilike."${name.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`,
    );
    query = query.or(countryFilters.join(","), {
      referencedTable: "placements",
    });
  }
  if (filters.status) query = query.eq("placements.status", filters.status);
  if (filters.sector)
    query = query.eq("placements.work_sector", filters.sector);
  if (filters.q)
    query = query.ilike(
      "placements.alumni.full_name",
      `%${filters.q.replace(/[\\%_]/g, "\\$&")}%`,
    );
  const result = await query
    .order("changed_at", { ascending: false })
    .order("id")
    .limit(8);
  if (result.error) throw new Error("Recent activities unavailable");
  const status = monitoringRowSchema.shape.placements.element.shape.status;
  return z
    .array(
      z.object({
        id: z.string(),
        old_status: status.nullable(),
        new_status: status,
        changed_at: z.string(),
        placements: z.object({
          alumni: z.object({ id: z.string(), full_name: z.string() }),
        }),
      }),
    )
    .parse(result.data);
}
