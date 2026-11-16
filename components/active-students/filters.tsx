import { Filters, type FilterField } from "@/components/data/filters";
import {
  placementStatusLabels,
  trainingStatusLabels,
} from "@/lib/active-students/schema";
import type { ActiveStudentFilters } from "@/lib/active-students/model";

export function ActiveStudentFilterForm({
  schools,
  years,
  values,
  showSchools,
}: {
  schools: Array<{ id: string; name: string; npsn: string }>;
  years: number[];
  values: ActiveStudentFilters;
  showSchools: boolean;
}) {
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
            options: schools
              .map((school) => ({
                value: school.id,
                label: `${school.name} · ${school.npsn}`,
              }))
              .sort((left, right) =>
                left.label.localeCompare(right.label, "id-ID"),
              ),
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
      options: years.map((year) => ({
        value: String(year),
        label: String(year),
      })),
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
