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
        placement_secured: z.boolean().nullable(),
        placement_provider_name: z.string().nullable(),
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

export const legacyMonitoringRowSchema = monitoringRowSchema.extend({
  placements: z
    .array(
      monitoringRowSchema.shape.placements.element.omit({
        placement_secured: true,
        placement_provider_name: true,
      }),
    )
    .max(1),
});
export type SearchParams = Record<string, string | string[] | undefined>;
export type MonitoringFilters = Record<
  "q" | "school" | "year" | "country" | "status" | "sector" | "sort",
  string
>;

export function placementStateLabel(
  placement: MonitoringRow["placements"][number] | undefined,
) {
  if (placement?.placement_secured === true) return "Sudah ada penempatan";
  if (placement?.placement_secured === false) return "Belum ada penempatan";
  return "Status penempatan belum tercatat";
}

export function securedPlacementRows(rows: MonitoringRow[]) {
  return rows.filter(
    (row) => row.placements[0]?.placement_secured === true,
  );
}

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
            ? current?.placement_secured !== true
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
    if (current?.placement_secured !== true) unplaced++;
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

type CurrentPlacement = MonitoringRow["placements"][number] | undefined;

export type ReportColumnDefinition = {
  order: number;
  source: string;
  header: string;
  format: (row: MonitoringRow, placement: CurrentPlacement) => string;
};

export function formatReportDate(value: string | null | undefined) {
  if (!value) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/u.exec(value);
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  )
    return "";
  return `${match[3]}/${match[2]}/${match[1]}`;
}

const reportColumnDefinitions = [
  {
    order: 1,
    source: "full_name",
    header: "Nama alumni",
    format: (row: MonitoringRow) => row.full_name,
  },
  {
    order: 2,
    source: "schools.name",
    header: "Sekolah",
    format: (row: MonitoringRow) =>
      row.schools?.name ?? "Sekolah tidak tersedia",
  },
  {
    order: 3,
    source: "graduation_year",
    header: "Tahun kelulusan",
    format: (row: MonitoringRow) => String(row.graduation_year),
  },
  {
    order: 4,
    source: "major",
    header: "Jurusan",
    format: (row: MonitoringRow) => row.major,
  },
  {
    order: 5,
    source: "placements.destination_country",
    header: "Negara tujuan",
    format: (_row: MonitoringRow, placement: CurrentPlacement) =>
      placement?.destination_country
        ? formatCountryName(placement.destination_country)
        : "",
  },
  {
    order: 6,
    source: "placements.status",
    header: "Status penempatan",
    format: (_row: MonitoringRow, placement: CurrentPlacement) =>
      placement ? statusLabels[placement.status] : "Belum dicatat",
  },
  {
    order: 7,
    source: "placements.placement_secured",
    header: "Status perolehan penempatan",
    format: (_row: MonitoringRow, placement: CurrentPlacement) =>
      placementStateLabel(placement),
  },
  {
    order: 8,
    source: "placements.placement_provider_name",
    header: "LPK / Sending Organization / P3MI (Penyalur)",
    format: (_row: MonitoringRow, placement: CurrentPlacement) =>
      placement?.placement_provider_name ?? "",
  },
  {
    order: 9,
    source: "placements.work_sector",
    header: "Sektor pekerjaan",
    format: (_row: MonitoringRow, placement: CurrentPlacement) =>
      placement?.work_sector ?? "",
  },
  {
    order: 10,
    source: "placements.company_name",
    header: "Perusahaan/pemberi kerja (data historis)",
    format: (_row: MonitoringRow, placement: CurrentPlacement) =>
      placement?.company_name ?? "",
  },
  {
    order: 11,
    source: "placements.planned_departure",
    header: "Rencana berangkat",
    format: (_row: MonitoringRow, placement: CurrentPlacement) =>
      formatReportDate(placement?.planned_departure),
  },
  {
    order: 12,
    source: "placements.actual_departure",
    header: "Keberangkatan aktual",
    format: (_row: MonitoringRow, placement: CurrentPlacement) =>
      formatReportDate(placement?.actual_departure),
  },
  {
    order: 13,
    source: "placements.employment_start",
    header: "Mulai bekerja",
    format: (_row: MonitoringRow, placement: CurrentPlacement) =>
      formatReportDate(placement?.employment_start),
  },
  {
    order: 14,
    source: "placements.contract_end_date",
    header: "Selesai kontrak",
    format: (_row: MonitoringRow, placement: CurrentPlacement) =>
      formatReportDate(placement?.contract_end_date),
  },
] satisfies ReportColumnDefinition[];

export const reportColumns = [...reportColumnDefinitions].sort(
  (left, right) => left.order - right.order,
);
export const reportHeaders = reportColumns.map((column) => column.header);

export function reportValues(row: MonitoringRow): string[] {
  const placement = row.placements[0];
  return reportColumns.map((column) => column.format(row, placement));
}

type CsvValue = string | number | null | undefined;

export function csvCell(value: CsvValue) {
  const text = value == null ? "" : String(value);
  const safe =
    /^[\s\uFEFF]*[=+\-@]/u.test(text) || /^[\t\r\n]/u.test(text)
      ? `'${text}`
      : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function serializeCsv(
  headers: readonly CsvValue[],
  rows: readonly (readonly CsvValue[])[],
  delimiter: ";" | ",",
) {
  const columnCount = headers.length;
  const serializedRows = [headers, ...rows].map((row) => {
    if (row.length !== columnCount)
      throw new Error("CSV row does not match the report column count");
    return row.map(csvCell).join(delimiter);
  });
  return `\uFEFF${serializedRows.join("\r\n")}\r\n`;
}

export function exportCsv(rows: MonitoringRow[]) {
  return serializeCsv(reportHeaders, rows.map(reportValues), ";");
}

export function reportFileName(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `laporan-alumni-${value("year")}-${value("month")}-${value("day")}.csv`;
}
