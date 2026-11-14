import { z } from "zod";
import {
  type ActiveStudentRecord,
  placementStatusLabels,
  trainingStatusLabels,
} from "./schema";

const rowSchema = z.object({
  id: z.string().uuid(),
  school_id: z.string().uuid(),
  full_name: z.string(),
  skill_concentration: z.string(),
  grade: z.number().int().min(10).max(13),
  kjp_status: z.boolean().nullable(),
  parent_consent: z.literal(true),
  parent_consent_at: z.string(),
  parent_consent_by: z.string().uuid(),
  training_status: z.enum([
    "belum_pelatihan",
    "aktif_pelatihan",
    "selesai_pelatihan",
  ]),
  provider_name: z.string().nullable(),
  placement_status: z.enum(["belum", "sudah"]),
  placement_country: z.string().nullable(),
  placement_date: z.string().nullable(),
  data_year: z.number().int(),
  created_at: z.string(),
  updated_at: z.string(),
  schools: z.object({ name: z.string(), npsn: z.string() }).nullable(),
});

export const activeStudentRowsSchema = rowSchema.array();

export type ActiveStudentFilters = Record<
  "q" | "school" | "grade" | "training" | "placement" | "year",
  string
>;

export type ActiveStudentSearchParams = Record<
  string,
  string | string[] | undefined
>;

const safeValue = (value: string | string[] | undefined, max = 150) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

export function parseActiveStudentFilters(
  params: ActiveStudentSearchParams,
): ActiveStudentFilters {
  const grade = safeValue(params.grade, 2);
  const training = safeValue(params.training, 30);
  const placement = safeValue(params.placement, 10);
  const year = safeValue(params.year, 4);
  return {
    q: safeValue(params.q),
    school: safeValue(params.school, 36),
    grade: ["10", "11", "12", "13"].includes(grade) ? grade : "",
    training: Object.hasOwn(trainingStatusLabels, training) ? training : "",
    placement: Object.hasOwn(placementStatusLabels, placement)
      ? placement
      : "",
    year: /^\d{4}$/u.test(year) ? year : "",
  };
}

export function filterActiveStudents(
  rows: ActiveStudentRecord[],
  filters: ActiveStudentFilters,
) {
  const query = filters.q.toLocaleLowerCase("id-ID");
  return rows
    .filter((row) => !query || row.full_name.toLocaleLowerCase("id-ID").includes(query))
    .filter((row) => !filters.school || row.school_id === filters.school)
    .filter((row) => !filters.grade || String(row.grade) === filters.grade)
    .filter(
      (row) => !filters.training || row.training_status === filters.training,
    )
    .filter(
      (row) => !filters.placement || row.placement_status === filters.placement,
    )
    .filter((row) => !filters.year || String(row.data_year) === filters.year)
    .sort(
      (left, right) =>
        left.full_name.localeCompare(right.full_name, "id-ID") ||
        left.id.localeCompare(right.id),
    );
}

export function activeStudentSummary(rows: ActiveStudentRecord[]) {
  return rows.reduce(
    (summary, row) => {
      summary.total += 1;
      summary.training[row.training_status] += 1;
      if (row.placement_status === "sudah") summary.placed += 1;
      summary.schools.add(row.school_id);
      summary.grades[row.grade as 10 | 11 | 12 | 13] += 1;
      const school = summary.bySchool.get(row.school_id) ?? {
        id: row.school_id,
        name: row.schools?.name ?? "Sekolah tidak tersedia",
        npsn: row.schools?.npsn ?? "-",
        total: 0,
        activeTraining: 0,
        completedTraining: 0,
        placed: 0,
      };
      school.total += 1;
      if (row.training_status === "aktif_pelatihan") school.activeTraining += 1;
      if (row.training_status === "selesai_pelatihan") school.completedTraining += 1;
      if (row.placement_status === "sudah") school.placed += 1;
      summary.bySchool.set(row.school_id, school);
      return summary;
    },
    {
      total: 0,
      placed: 0,
      training: {
        belum_pelatihan: 0,
        aktif_pelatihan: 0,
        selesai_pelatihan: 0,
      },
      grades: { 10: 0, 11: 0, 12: 0, 13: 0 },
      schools: new Set<string>(),
      bySchool: new Map<
        string,
        {
          id: string;
          name: string;
          npsn: string;
          total: number;
          activeTraining: number;
          completedTraining: number;
          placed: number;
        }
      >(),
    },
  );
}

