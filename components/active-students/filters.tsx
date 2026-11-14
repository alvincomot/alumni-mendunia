import { Filters, type FilterField } from "@/components/data/filters";
import {
  placementStatusLabels,
  trainingStatusLabels,
  type ActiveStudentRecord,
} from "@/lib/active-students/schema";
import type { ActiveStudentFilters } from "@/lib/active-students/model";

export function ActiveStudentFilterForm({
  rows,
  values,
  showSchools,
}: {
  rows: ActiveStudentRecord[];
  values: ActiveStudentFilters;
  showSchools: boolean;
}) {
  const schools = new Map(
    rows.map((row) => [
      row.school_id,
      `${row.schools?.name ?? "Sekolah tidak tersedia"} · ${row.schools?.npsn ?? "NPSN tidak tersedia"}`,
    ]),
  );
  const years = [...new Set(rows.map((row) => String(row.data_year)))].sort(
    (left, right) => right.localeCompare(left),
  );
  const fields: FilterField[] = [
    {
      name: "q",
      label: "Cari nama murid",
      placeholder: "Masukkan nama murid",
    },
    ...(showSchools
      ? [
          {
            name: "school",
            label: "Sekolah",
            options: [...schools]
              .map(([value, label]) => ({ value, label }))
              .sort((left, right) => left.label.localeCompare(right.label, "id-ID")),
          },
        ]
      : []),
    {
      name: "grade",
      label: "Kelas",
      options: [10, 11, 12, 13].map((grade) => ({
        value: String(grade),
        label: `Kelas ${grade}`,
      })),
    },
    {
      name: "training",
      label: "Status pelatihan",
      options: Object.entries(trainingStatusLabels).map(([value, label]) => ({
        value,
        label,
      })),
    },
    {
      name: "placement",
      label: "Status penempatan",
      options: Object.entries(placementStatusLabels).map(([value, label]) => ({
        value,
        label,
      })),
    },
    {
      name: "year",
      label: "Tahun Pendataan",
      options: years.map((year) => ({ value: year, label: year })),
    },
  ];
  return (
    <Filters
      path="/dashboard/murid-aktif"
      values={values}
      fields={fields}
      inlineActions
    />
  );
}

