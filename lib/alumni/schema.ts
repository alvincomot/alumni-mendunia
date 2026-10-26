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
export const placementSchema = z
  .object({
    destination_country: z
      .string()
      .trim()
      .refine(
        (value) => getCanonicalCountryName(value) !== null,
        "Pilih negara tujuan yang valid",
      )
      .transform((value) => getCanonicalCountryName(value)!),
    work_sector: z.string().trim().max(150, "Sektor maksimal 150 karakter."),
    company_name: z
      .string()
      .trim()
      .max(200, "Perusahaan maksimal 200 karakter."),
    status: z.enum([
      "persiapan_berangkat",
      "aktif_bekerja",
      "selesai_kontrak",
      "batal_berangkat",
    ]),
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

export type AlumniInput = z.infer<typeof alumniSchema>;
export type PlacementInput = z.infer<typeof placementSchema>;
export type AlumniRecord = AlumniInput & { id: string; school_id: string };
export type PlacementRecord = Omit<
  PlacementInput,
  | "confirm_existing_condition"
  | "planned_departure"
  | "actual_departure"
  | "employment_start"
  | "contract_end_date"
  | "company_name"
  | "work_sector"
> & {
  id: string;
  alumni_id: string;
  is_current: boolean;
  planned_departure: string | null;
  actual_departure: string | null;
  employment_start: string | null;
  contract_end_date: string | null;
  company_name: string | null;
  work_sector: string | null;
};
export type MutationResult = { success: boolean; message: string; id?: string };
