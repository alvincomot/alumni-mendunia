import { z } from "zod";
import { statusLabels, type PlacementStatus } from "@/lib/alumni/schema";
import {
  formatCountryName,
  getCanonicalCountryName,
} from "@/lib/countries";

export const monitoringRowSchema = z.object({
  id: z.uuid(),
  school_id: z.uuid(),
  full_name: z.string(),
  graduation_year: z.number(),
  major: z.string(),
  schools: z.object({ name: z.string() }).nullable(),
  placements: z
    .array(
      z.object({
        id: z.uuid(),
        status: z.enum([
          "persiapan_berangkat",
          "aktif_bekerja",
          "selesai_kontrak",
          "batal_berangkat",
        ]),
        destination_country: z.string(),
        work_sector: z.string().nullable(),
        company_name: z.string().nullable(),
        planned_departure: z.string().nullable(),
        actual_departure: z.string().nullable(),
        employment_start: z.string().nullable(),
        contract_end_date: z.string().nullable(),
        is_current: z.literal(true),
      }),
    )
    .max(1),
});
export type MonitoringRow = z.infer<typeof monitoringRowSchema>;
export type SearchParams = Record<string, string | string[] | undefined>;
export type MonitoringFilters = Record<
  "q" | "school" | "year" | "country" | "status" | "sector" | "sort",
  string
>;

export function parseFilters(params: SearchParams): MonitoringFilters {
  const text = (key: string) =>
    typeof params[key] === "string" ? params[key].trim().slice(0, 150) : "";
  const country = text("country");
  return {
    q: text("q"),
    school: text("school"),
    year: text("year"),
    country: getCanonicalCountryName(country) ?? country,
    status: text("status"),
    sector: text("sector"),
    sort: ["name", "name_desc", "year", "year_desc"].includes(text("sort"))
      ? text("sort")
      : "name",
  };
}

export function filterRows(rows: MonitoringRow[], filter: MonitoringFilters) {
  const term = filter.q.toLocaleLowerCase("id");
  return rows
    .filter((row) => {
      const current = row.placements[0];
      return (
        (!term || row.full_name.toLocaleLowerCase("id").includes(term)) &&
        (!filter.school || row.school_id === filter.school) &&
        (!filter.year || String(row.graduation_year) === filter.year) &&
        (!filter.country ||
          (current &&
            getCanonicalCountryName(current.destination_country) ===
              filter.country)) &&
        (!filter.sector || current?.work_sector === filter.sector) &&
        (!filter.status ||
          (filter.status === "unplaced"
            ? !current
            : current?.status === filter.status))
      );
    })
    .sort((a, b) => {
      const order = filter.sort.startsWith("year")
        ? a.graduation_year - b.graduation_year
        : a.full_name.localeCompare(b.full_name, "id");
      return (
        (filter.sort.endsWith("desc") ? -order : order) ||
        a.id.localeCompare(b.id)
      );
    });
}

export function summarize(rows: MonitoringRow[]) {
  const statuses: Record<PlacementStatus, number> = {
    persiapan_berangkat: 0,
    aktif_bekerja: 0,
    selesai_kontrak: 0,
    batal_berangkat: 0,
  };
  let unplaced = 0;
  for (const row of rows) {
    const current = row.placements[0];
    if (current) statuses[current.status]++;
    else unplaced++;
  }
  return { total: rows.length, unplaced, statuses };
}

export function distribution(
  rows: MonitoringRow[],
  dimension: "school" | "country" | "year" | "sector",
) {
  const counts = new Map<string, { name: string; count: number }>();
  for (const row of rows) {
    const value =
      dimension === "school"
        ? row.school_id
        : dimension === "year"
          ? String(row.graduation_year)
          : dimension === "country"
            ? row.placements[0]?.destination_country
            : row.placements[0]?.work_sector;
    const key = value || "__missing";
    const name =
      dimension === "school"
        ? (row.schools?.name ?? "Sekolah tidak tersedia")
        : dimension === "country" && value
          ? formatCountryName(value)
          : value || "Belum dicatat";
    const normalizedKey = dimension === "country" && value ? name : key;
    const item = counts.get(normalizedKey);
    counts.set(normalizedKey, { name, count: (item?.count ?? 0) + 1 });
  }
  return [...counts.entries()]
    .map(([id, value]) => ({ id, ...value }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "id"));
}

export const reportHeaders = [
  "Nama alumni",
  "Sekolah",
  "Tahun kelulusan",
  "Jurusan",
  "Negara tujuan",
  "Status penempatan",
  "Sektor pekerjaan",
  "Perusahaan",
  "Rencana berangkat",
  "Keberangkatan aktual",
  "Mulai bekerja",
  "Selesai kontrak",
];
export function reportValues(row: MonitoringRow): string[] {
  const p = row.placements[0];
  return [
    row.full_name,
    row.schools?.name ?? "Sekolah tidak tersedia",
    String(row.graduation_year),
    row.major,
    p?.destination_country ? formatCountryName(p.destination_country) : "",
    p ? statusLabels[p.status] : "Belum ada penempatan",
    p?.work_sector ?? "",
    p?.company_name ?? "",
    p?.planned_departure ?? "",
    p?.actual_departure ?? "",
    p?.employment_start ?? "",
    p?.contract_end_date ?? "",
  ];
}

export function csvCell(value: string) {
  const safe =
    /^[\s\uFEFF]*[=+\-@]/u.test(value) || /^[\t\r\n]/u.test(value)
      ? `'${value}`
      : value;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function exportCsv(rows: MonitoringRow[]) {
  return (
    "\uFEFF" +
    [reportHeaders, ...rows.map(reportValues)]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n") +
    "\r\n"
  );
}
