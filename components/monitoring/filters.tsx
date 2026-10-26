import { Filters, type FilterField } from "@/components/data/filters";
import { statusLabels } from "@/lib/alumni/schema";
import type { MonitoringFilters, MonitoringRow } from "@/lib/monitoring/model";

export function MonitoringFilterForm({
  rows,
  values,
  path,
  showSchools,
  showSector = false,
  showSearch = false,
}: {
  rows: MonitoringRow[];
  values: MonitoringFilters;
  path: string;
  showSchools: boolean;
  showSector?: boolean;
  showSearch?: boolean;
}) {
  const distinct = (values: (string | undefined | null)[]) =>
    [...new Set(values.filter((value): value is string => !!value))]
      .sort((a, b) => a.localeCompare(b, "id"))
      .map((value) => ({ value, label: value }));
  const schools = new Map(
    rows.map((row) => [
      row.school_id,
      row.schools?.name ?? "Sekolah tidak tersedia",
    ]),
  );
  const fields: FilterField[] = [
    ...(showSearch ? [{ name: "q", label: "Cari nama alumni" }] : []),
    ...(showSchools
      ? [
          {
            name: "school",
            label: "Sekolah",
            options: [...schools]
              .map(([value, label]) => ({ value, label }))
              .sort((a, b) => a.label.localeCompare(b.label, "id")),
          },
        ]
      : []),
    {
      name: "year",
      label: "Tahun kelulusan",
      options: distinct(rows.map((row) => String(row.graduation_year))),
    },
    {
      name: "country",
      label: "Negara tujuan",
      country: true,
    },
    {
      name: "status",
      label: "Status penempatan",
      options: [
        ...Object.entries(statusLabels).map(([value, label]) => ({
          value,
          label,
        })),
        { value: "unplaced", label: "Belum ada penempatan" },
      ],
    },
    ...(showSector
      ? [
          {
            name: "sector",
            label: "Sektor pekerjaan",
            options: distinct(
              rows.map((row) => row.placements[0]?.work_sector),
            ),
          },
        ]
      : []),
    ...(showSearch
      ? [
          {
            name: "sort",
            label: "Urutkan",
            options: [
              { value: "name", label: "Nama A-Z" },
              { value: "name_desc", label: "Nama Z-A" },
              { value: "year_desc", label: "Kelulusan terbaru" },
              { value: "year", label: "Kelulusan terlama" },
            ],
          },
        ]
      : []),
  ];
  return <Filters path={path} fields={fields} values={values} />;
}
