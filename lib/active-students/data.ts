import "server-only";
import type { requireAccess } from "@/lib/auth/access";
import { readAllRows } from "@/lib/data/read-all";
import {
  activeStudentRowsSchema,
  type ActiveStudentFilters,
} from "./model";
import { z } from "zod";

type Access = Awaited<ReturnType<typeof requireAccess>>;

const trainingStatusSchema = z.enum([
  "belum_pelatihan",
  "aktif_pelatihan",
  "selesai_pelatihan",
]);
const placementStatusSchema = z.enum(["belum", "sudah"]);
const schoolSummarySchema = z.object({
  name: z.string(),
  npsn: z.string(),
});
const summaryRowsSchema = z.array(
  z.object({
    school_id: z.string().uuid(),
    grade: z.number().int().min(10).max(13),
    training_status: trainingStatusSchema,
    placement_status: placementStatusSchema,
    schools: schoolSummarySchema.nullable(),
  }),
);
const filterRowsSchema = z.array(
  z.object({
    school_id: z.string().uuid(),
    data_year: z.number().int(),
    schools: schoolSummarySchema.nullable(),
  }),
);
const overviewRpcSchema = z.object({
  total: z.number().int().nonnegative(),
  placed: z.number().int().nonnegative(),
  school_count: z.number().int().nonnegative(),
  training: z.object({
    belum_pelatihan: z.number().int().nonnegative(),
    aktif_pelatihan: z.number().int().nonnegative(),
    selesai_pelatihan: z.number().int().nonnegative(),
  }),
  grades: z.object({
    "10": z.number().int().nonnegative(),
    "11": z.number().int().nonnegative(),
    "12": z.number().int().nonnegative(),
    "13": z.number().int().nonnegative(),
  }),
  by_school: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      npsn: z.string(),
      total: z.number().int().nonnegative(),
      active_training: z.number().int().nonnegative(),
      completed_training: z.number().int().nonnegative(),
      placed: z.number().int().nonnegative(),
    }),
  ),
  filter_schools: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      npsn: z.string(),
    }),
  ),
  filter_years: z.array(z.number().int()),
});

export type ActiveStudentOverview = {
  total: number;
  placed: number;
  schoolCount: number;
  training: {
    belum_pelatihan: number;
    aktif_pelatihan: number;
    selesai_pelatihan: number;
  };
  grades: Record<10 | 11 | 12 | 13, number>;
  bySchool: Array<{
    id: string;
    name: string;
    npsn: string;
    total: number;
    activeTraining: number;
    completedTraining: number;
    placed: number;
  }>;
  filterSchools: Array<{ id: string; name: string; npsn: string }>;
  filterYears: number[];
};

export type ActiveStudentPageResult = {
  rows: z.infer<typeof activeStudentRowsSchema>;
  total: number;
  page: number;
};

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

function isMissingOverviewRpc(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? error.code : null;
  return code === "42883" || code === "PGRST202";
}

function overviewFromRows(
  summaryRows: z.infer<typeof summaryRowsSchema>,
  filterRows: z.infer<typeof filterRowsSchema>,
): ActiveStudentOverview {
  const bySchool = new Map<string, ActiveStudentOverview["bySchool"][number]>();
  const overview: ActiveStudentOverview = {
    total: 0,
    placed: 0,
    schoolCount: 0,
    training: {
      belum_pelatihan: 0,
      aktif_pelatihan: 0,
      selesai_pelatihan: 0,
    },
    grades: { 10: 0, 11: 0, 12: 0, 13: 0 },
    bySchool: [],
    filterSchools: [],
    filterYears: [],
  };
  for (const row of summaryRows) {
    overview.total += 1;
    overview.training[row.training_status] += 1;
    overview.grades[row.grade as 10 | 11 | 12 | 13] += 1;
    if (row.placement_status === "sudah") overview.placed += 1;
    const school = bySchool.get(row.school_id) ?? {
      id: row.school_id,
      name: row.schools?.name ?? "Sekolah tidak tersedia",
      npsn: row.schools?.npsn ?? "-",
      total: 0,
      activeTraining: 0,
      completedTraining: 0,
      placed: 0,
    };
    school.total += 1;
    if (row.training_status === "aktif_pelatihan")
      school.activeTraining += 1;
    if (row.training_status === "selesai_pelatihan")
      school.completedTraining += 1;
    if (row.placement_status === "sudah") school.placed += 1;
    bySchool.set(row.school_id, school);
  }
  overview.bySchool = [...bySchool.values()].sort(
    (left, right) =>
      right.total - left.total ||
      left.name.localeCompare(right.name, "id-ID") ||
      left.id.localeCompare(right.id),
  );
  overview.schoolCount = bySchool.size;

  const filterSchools = new Map<string, { id: string; name: string; npsn: string }>();
  const filterYears = new Set<number>();
  for (const row of filterRows) {
    filterYears.add(row.data_year);
    if (!filterSchools.has(row.school_id))
      filterSchools.set(row.school_id, {
        id: row.school_id,
        name: row.schools?.name ?? "Sekolah tidak tersedia",
        npsn: row.schools?.npsn ?? "-",
      });
  }
  overview.filterSchools = [...filterSchools.values()].sort(
    (left, right) =>
      left.name.localeCompare(right.name, "id-ID") ||
      left.id.localeCompare(right.id),
  );
  overview.filterYears = [...filterYears].sort((left, right) => right - left);
  return overview;
}

async function loadActiveStudentOverviewFallback(
  access: Access,
  filters: ActiveStudentFilters,
) {
  const [summaryRows, filterRows] = await Promise.all([
    readAllRows<unknown>((start, end) => {
      let query = access.supabase
        .from("active_students")
        .select(
          "school_id, grade, training_status, placement_status, schools(name, npsn)",
          { count: "exact" },
        );
      if (access.canWrite) query = query.eq("school_id", access.schoolId!);
      if (filters.q)
        query = query.ilike(
          "full_name",
          `%${filters.q.replace(/[\\%_]/gu, "\\$&")}%`,
        );
      if (filters.school) query = query.eq("school_id", filters.school);
      if (filters.grade) query = query.eq("grade", Number(filters.grade));
      if (filters.training)
        query = query.eq("training_status", filters.training);
      if (filters.placement)
        query = query.eq("placement_status", filters.placement);
      if (filters.year) query = query.eq("data_year", Number(filters.year));
      return query.order("id").range(start, end);
    }),
    readAllRows<unknown>((start, end) => {
      let query = access.supabase
        .from("active_students")
        .select("school_id, data_year, schools(name, npsn)", {
          count: "exact",
        });
      if (access.canWrite) query = query.eq("school_id", access.schoolId!);
      return query.order("id").range(start, end);
    }),
  ]);
  return overviewFromRows(
    summaryRowsSchema.parse(summaryRows),
    filterRowsSchema.parse(filterRows),
  );
}

export async function loadActiveStudentOverview(
  access: Access,
  filters: ActiveStudentFilters,
): Promise<ActiveStudentOverview> {
  const result = await access.supabase.rpc("get_active_student_overview", {
    p_search: filters.q || null,
    p_school_id: filters.school || null,
    p_grade: filters.grade ? Number(filters.grade) : null,
    p_training_status: filters.training || null,
    p_placement_status: filters.placement || null,
    p_data_year: filters.year ? Number(filters.year) : null,
  });
  if (result.error) {
    if (isMissingOverviewRpc(result.error))
      return loadActiveStudentOverviewFallback(access, filters);
    throw new Error("Active student overview unavailable");
  }
  const parsed = overviewRpcSchema.safeParse(result.data);
  if (!parsed.success) throw new Error("Active student overview invalid");
  return {
    total: parsed.data.total,
    placed: parsed.data.placed,
    schoolCount: parsed.data.school_count,
    training: parsed.data.training,
    grades: {
      10: parsed.data.grades["10"],
      11: parsed.data.grades["11"],
      12: parsed.data.grades["12"],
      13: parsed.data.grades["13"],
    },
    bySchool: parsed.data.by_school.map((school) => ({
      id: school.id,
      name: school.name,
      npsn: school.npsn,
      total: school.total,
      activeTraining: school.active_training,
      completedTraining: school.completed_training,
      placed: school.placed,
    })),
    filterSchools: parsed.data.filter_schools,
    filterYears: parsed.data.filter_years,
  };
}

async function fetchActiveStudentPage(
  access: Access,
  filters: ActiveStudentFilters,
  page: number,
  pageSize: number,
) {
  let query = access.supabase
    .from("active_students")
    .select(
      "id, school_id, full_name, skill_concentration, grade, kjp_status, parent_consent, parent_consent_at, parent_consent_by, training_status, provider_name, placement_status, placement_country, placement_date, data_year, created_at, updated_at, schools(name, npsn)",
      { count: "exact" },
    );
  if (access.canWrite) query = query.eq("school_id", access.schoolId!);
  if (filters.q)
    query = query.ilike(
      "full_name",
      `%${filters.q.replace(/[\\%_]/gu, "\\$&")}%`,
    );
  if (filters.school) query = query.eq("school_id", filters.school);
  if (filters.grade) query = query.eq("grade", Number(filters.grade));
  if (filters.training)
    query = query.eq("training_status", filters.training);
  if (filters.placement)
    query = query.eq("placement_status", filters.placement);
  if (filters.year) query = query.eq("data_year", Number(filters.year));
  return query
    .order("full_name")
    .order("id")
    .range((page - 1) * pageSize, page * pageSize - 1);
}

export async function loadActiveStudentPage(
  access: Access,
  filters: ActiveStudentFilters,
  requestedPage: number,
  pageSize: number,
): Promise<ActiveStudentPageResult> {
  const requested = Math.max(1, requestedPage);
  let result = await fetchActiveStudentPage(
    access,
    filters,
    requested,
    pageSize,
  );
  if (result.error) throw new Error("Active student list unavailable");
  const total = result.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requested, totalPages);
  if (page !== requested) {
    result = await fetchActiveStudentPage(access, filters, page, pageSize);
    if (result.error) throw new Error("Active student list unavailable");
  }
  return {
    rows: activeStudentRowsSchema.parse(result.data ?? []),
    total,
    page,
  };
}

