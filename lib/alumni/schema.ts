import { z } from "zod";
import { getCanonicalCountryName } from "@/lib/countries";

export const idSchema = z.string().uuid();
export const alumniSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(1, "Nama wajib diisi.")
    .max(150, "Nama maksimal 150 karakter."),
  graduation_year: z
    .number({ error: "Tahun kelulusan wajib berupa angka." })
    .int("Tahun harus berupa bilangan bulat.")
    .min(1990, "Tahun minimal 1990.")
    .max(2100, "Tahun maksimal 2100."),
  major: z
    .string()
    .trim()
    .min(1, "Jurusan wajib diisi.")
    .max(150, "Jurusan maksimal 150 karakter."),
});
export const statusLabels = {
  persiapan_berangkat: "Persiapan berangkat",
  aktif_bekerja: "Aktif bekerja",
  selesai_kontrak: "Selesai kontrak",
  batal_berangkat: "Batal berangkat",
} as const;
export type PlacementStatus = keyof typeof statusLabels;
export const placementStatusSchema = z.enum([
  "persiapan_berangkat",
  "aktif_bekerja",
  "selesai_kontrak",
  "batal_berangkat",
]);
export const initialPlacementDateFields = {
  persiapan_berangkat: {
    name: "planned_departure",
    label: "Rencana keberangkatan",
  },
  aktif_bekerja: {
    name: "actual_departure",
    label: "Keberangkatan aktual",
  },
  selesai_kontrak: {
    name: "contract_end_date",
    label: "Selesai kontrak",
  },
  batal_berangkat: null,
} as const satisfies Record<
  PlacementStatus,
  {
    name: "planned_departure" | "actual_departure" | "contract_end_date";
    label: string;
  } | null
>;

const placementDateFieldNames = [
  "planned_departure",
  "actual_departure",
  "employment_start",
  "contract_end_date",
] as const;

export const optionalDateSchema = z
  .string()
  .refine(
    (value) =>
      !value ||
      (/^\d{4}-\d{2}-\d{2}$/.test(value) &&
        Number(value.slice(0, 4)) > 0 &&
        !Number.isNaN(Date.parse(value)) &&
        new Date(value).toISOString().slice(0, 10) === value),
    "Tanggal tidak valid.",
  );

export const destinationCountrySchema = z
  .string()
  .trim()
  .refine(
    (value) => getCanonicalCountryName(value) !== null,
    "Pilih negara tujuan yang valid",
  )
  .transform((value) => getCanonicalCountryName(value)!);

export const placementSchema = z
  .object({
    destination_country: destinationCountrySchema,
    placement_secured: z.boolean(),
    placement_provider_name: z
      .string()
      .trim()
      .max(200, "Nama lembaga penyalur maksimal 200 karakter."),
    work_sector: z.string().trim().max(150, "Sektor maksimal 150 karakter."),
    status: placementStatusSchema,
    planned_departure: optionalDateSchema,
    actual_departure: optionalDateSchema,
    employment_start: optionalDateSchema,
    contract_end_date: optionalDateSchema,
    confirm_existing_condition: z.boolean(),
  })
  .superRefine((value, ctx) => {
    const issue = (field: keyof typeof value, message: string) =>
      ctx.addIssue({ code: "custom", path: [field], message });
    if (
      value.status !== "persiapan_berangkat" &&
      !value.confirm_existing_condition
    )
      issue(
        "confirm_existing_condition",
        "Konfirmasi bahwa status ini sesuai kondisi awal alumni.",
      );
    if (value.status !== "persiapan_berangkat" && !value.placement_secured)
      issue(
        "placement_secured",
        "Status awal ini harus dicatat sebagai sudah memiliki penempatan.",
      );
    if (!value.placement_secured) {
      if (value.placement_provider_name)
        issue(
          "placement_provider_name",
          "Nama lembaga penyalur harus kosong jika belum ada penempatan.",
        );
      if (value.work_sector)
        issue(
          "work_sector",
          "Sektor pekerjaan harus kosong jika belum ada penempatan.",
        );
      if (value.planned_departure)
        issue(
          "planned_departure",
          "Rencana keberangkatan harus kosong jika belum ada penempatan.",
        );
    }
    if (value.status !== "persiapan_berangkat" && value.planned_departure)
      issue(
        "planned_departure",
        "Rencana keberangkatan hanya untuk status persiapan berangkat.",
      );
    const working =
      value.status === "aktif_bekerja" || value.status === "selesai_kontrak";
    if (!working && value.actual_departure)
      issue(
        "actual_departure",
        "Tanggal aktual hanya untuk aktif bekerja atau selesai kontrak.",
      );
    if (!working && value.employment_start)
      issue(
        "employment_start",
        "Tanggal mulai bekerja hanya untuk aktif bekerja atau selesai kontrak.",
      );
    if (value.status !== "selesai_kontrak" && value.contract_end_date)
      issue(
        "contract_end_date",
        "Tanggal selesai kontrak hanya untuk status selesai kontrak.",
      );
    const today = new Date().toISOString().slice(0, 10);
    if (value.actual_departure > today)
      issue(
        "actual_departure",
        "Keberangkatan aktual tidak boleh di masa depan.",
      );
    if (value.contract_end_date > today)
      issue("contract_end_date", "Selesai kontrak tidak boleh di masa depan.");
    if (
      value.actual_departure &&
      value.employment_start &&
      value.employment_start < value.actual_departure
    )
      issue(
        "employment_start",
        "Mulai bekerja tidak boleh sebelum keberangkatan aktual.",
      );
    if (
      value.contract_end_date &&
      ((value.employment_start &&
        value.contract_end_date < value.employment_start) ||
        (value.actual_departure &&
          value.contract_end_date < value.actual_departure))
    )
      issue(
        "contract_end_date",
        "Selesai kontrak tidak boleh sebelum keberangkatan atau mulai bekerja.",
      );
  });

export const initialPlacementSchema = placementSchema.superRefine(
  (value, ctx) => {
    const allowedField = initialPlacementDateFields[value.status]?.name;

    for (const field of placementDateFieldNames) {
      if (field !== allowedField && value[field]) {
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: "Tanggal tidak sesuai dengan status awal yang dipilih.",
        });
      }
    }
  },
);

export const placementDetailsEditSchema = z
  .object({
    placement_id: idSchema,
    expected_status: placementStatusSchema,
    expected_updated_at: z
      .string()
      .datetime({
        offset: true,
        message: "Versi data penempatan tidak valid.",
      }),
    destination_country: destinationCountrySchema,
    placement_secured: z
      .string()
      .refine(
        (value) => value === "true" || value === "false",
        "Pilih status perolehan penempatan.",
      )
      .transform((value) => value === "true"),
    placement_provider_name: z
      .string()
      .trim()
      .max(200, "Nama lembaga penyalur maksimal 200 karakter."),
    work_sector: z.string().trim().max(150, "Sektor maksimal 150 karakter."),
    planned_departure: optionalDateSchema,
    actual_departure: optionalDateSchema,
    employment_start: optionalDateSchema,
    contract_end_date: optionalDateSchema,
  })
  .superRefine((value, ctx) => {
    const issue = (field: keyof typeof value, message: string) =>
      ctx.addIssue({ code: "custom", path: [field], message });
    const working =
      value.expected_status === "aktif_bekerja" ||
      value.expected_status === "selesai_kontrak";
    if (working && !value.placement_secured)
      issue(
        "placement_secured",
        "Status ini harus tetap tercatat sudah memiliki penempatan.",
      );
    if (!value.placement_secured) {
      if (value.placement_provider_name)
        issue(
          "placement_provider_name",
          "Nama lembaga penyalur harus kosong jika belum ada penempatan.",
        );
      if (value.work_sector)
        issue(
          "work_sector",
          "Sektor pekerjaan harus kosong jika belum ada penempatan.",
        );
      if (value.planned_departure)
        issue(
          "planned_departure",
          "Rencana keberangkatan harus kosong jika belum ada penempatan.",
        );
    }
    if (!working && value.actual_departure)
      issue(
        "actual_departure",
        "Keberangkatan aktual tidak sesuai dengan status saat ini.",
      );
    if (!working && value.employment_start)
      issue(
        "employment_start",
        "Tanggal mulai bekerja tidak sesuai dengan status saat ini.",
      );
    if (working && !value.actual_departure)
      issue("actual_departure", "Tanggal keberangkatan aktual wajib diisi.");
    if (value.expected_status !== "selesai_kontrak" && value.contract_end_date)
      issue(
        "contract_end_date",
        "Tanggal selesai kontrak tidak sesuai dengan status saat ini.",
      );

    const today = new Date().toISOString().slice(0, 10);
    if (value.actual_departure > today)
      issue(
        "actual_departure",
        "Keberangkatan aktual tidak boleh di masa depan.",
      );
    if (value.contract_end_date > today)
      issue("contract_end_date", "Selesai kontrak tidak boleh di masa depan.");
    if (
      value.actual_departure &&
      value.employment_start &&
      value.employment_start < value.actual_departure
    )
      issue(
        "employment_start",
        "Mulai bekerja tidak boleh sebelum keberangkatan aktual.",
      );
    if (
      value.contract_end_date &&
      ((value.employment_start &&
        value.contract_end_date < value.employment_start) ||
        (value.actual_departure &&
          value.contract_end_date < value.actual_departure))
    )
      issue(
        "contract_end_date",
        "Selesai kontrak tidak boleh sebelum keberangkatan atau mulai bekerja.",
      );
  });

export const alumniRegistrationSchema = z.object({
  identity: alumniSchema,
  placement: initialPlacementSchema,
});

export type AlumniInput = z.infer<typeof alumniSchema>;
export type PlacementInput = z.infer<typeof placementSchema>;
export type PlacementDetailsEditFormInput = z.input<
  typeof placementDetailsEditSchema
>;
export type PlacementDetailsEditInput = z.output<
  typeof placementDetailsEditSchema
>;
export type AlumniRegistrationInput = z.infer<typeof alumniRegistrationSchema>;
export type AlumniRecord = AlumniInput & { id: string; school_id: string };
export type PlacementRecord = Omit<
  PlacementInput,
  | "confirm_existing_condition"
  | "planned_departure"
  | "actual_departure"
  | "employment_start"
  | "contract_end_date"
  | "placement_provider_name"
  | "placement_secured"
  | "work_sector"
> & {
  id: string;
  alumni_id: string;
  is_current: boolean;
  planned_departure: string | null;
  actual_departure: string | null;
  employment_start: string | null;
  contract_end_date: string | null;
  placement_secured: boolean | null;
  placement_provider_name: string | null;
  // Legacy employer data remains separate from the verified intermediary field.
  company_name: string | null;
  work_sector: string | null;
};
export type MutationResult = { success: boolean; message: string; id?: string };
export type PlacementEditResult = MutationResult & { refresh?: boolean };
export type RegistrationResult = MutationResult & {
  identitySaved?: boolean;
};
