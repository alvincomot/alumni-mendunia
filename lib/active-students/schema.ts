import { z } from "zod";
import { getCanonicalCountryName } from "@/lib/countries";

export const activeStudentIdSchema = z.string().uuid();

export const trainingStatusLabels = {
  belum_pelatihan: "Belum Pelatihan",
  aktif_pelatihan: "Aktif Pelatihan",
  selesai_pelatihan: "Sudah Selesai Pelatihan",
} as const;

export const placementStatusLabels = {
  belum: "Belum",
  sudah: "Sudah",
} as const;

export const historyChangeLabels = {
  training_status: "Status pelatihan",
  provider_name: "LKP / SO / P3MI",
  placement_status: "Status penempatan",
  placement_country: "Negara penempatan",
  placement_date: "Tanggal penempatan",
} as const;

export type TrainingStatus = keyof typeof trainingStatusLabels;
export type StudentPlacementStatus = keyof typeof placementStatusLabels;
export type ActiveStudentHistoryType = keyof typeof historyChangeLabels;

const dateSchema = z
  .string()
  .refine(
    (value) =>
      !value ||
      (/^\d{4}-\d{2}-\d{2}$/u.test(value) &&
        new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value),
    "Tanggal penempatan tidak valid.",
  );

export const activeStudentIdentitySchema = z.object({
    full_name: z
      .string()
      .trim()
      .min(1, "Nama murid wajib diisi.")
      .max(150, "Nama murid maksimal 150 karakter."),
    skill_concentration: z
      .string()
      .trim()
      .min(1, "Konsentrasi keahlian wajib diisi.")
      .max(150, "Konsentrasi keahlian maksimal 150 karakter."),
    grade: z.coerce
      .number({ error: "Kelas wajib dipilih." })
      .int()
      .min(10, "Kelas harus 10, 11, 12, atau 13.")
      .max(13, "Kelas harus 10, 11, 12, atau 13."),
    kjp_status: z.enum(["", "ya", "tidak"]),
    data_year: z.coerce
      .number({ error: "Tahun Pendataan wajib berupa angka." })
      .int("Tahun Pendataan harus berupa bilangan bulat.")
      .min(2000, "Tahun Pendataan minimal 2000.")
      .max(2100, "Tahun Pendataan maksimal 2100."),
});

export const activeStudentFormSchema = activeStudentIdentitySchema
  .extend({
    parent_consent: z.boolean().refine((value) => value, {
      message: "Persetujuan orang tua/wali wajib dikonfirmasi.",
    }),
    training_status: z.enum([
      "belum_pelatihan",
      "aktif_pelatihan",
      "selesai_pelatihan",
    ]),
    provider_name: z
      .string()
      .trim()
      .max(200, "Nama lembaga maksimal 200 karakter."),
    placement_status: z.enum(["belum", "sudah"]),
    placement_country: z.string().trim(),
    placement_date: dateSchema,
    expected_updated_at: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.placement_status === "sudah") {
      if (!value.placement_country) {
        ctx.addIssue({
          code: "custom",
          path: ["placement_country"],
          message: "Negara penempatan wajib dipilih.",
        });
      } else if (!getCanonicalCountryName(value.placement_country)) {
        ctx.addIssue({
          code: "custom",
          path: ["placement_country"],
          message: "Pilih negara penempatan yang valid.",
        });
      }
      if (!value.placement_date) {
        ctx.addIssue({
          code: "custom",
          path: ["placement_date"],
          message: "Tanggal penempatan wajib diisi.",
        });
      }
    }
  })
  .transform((value) => ({
    ...value,
    kjp_status:
      value.kjp_status === "" ? null : value.kjp_status === "ya",
    provider_name: value.provider_name || null,
    placement_country:
      value.placement_status === "sudah"
        ? getCanonicalCountryName(value.placement_country)
        : null,
    placement_date:
      value.placement_status === "sudah" ? value.placement_date : null,
  }));

export type ActiveStudentFormValues = z.input<typeof activeStudentFormSchema>;
export type ActiveStudentInput = z.output<typeof activeStudentFormSchema>;

export type ActiveStudentRecord = {
  id: string;
  school_id: string;
  full_name: string;
  skill_concentration: string;
  grade: number;
  kjp_status: boolean | null;
  parent_consent: true;
  parent_consent_at: string;
  parent_consent_by: string;
  training_status: TrainingStatus;
  provider_name: string | null;
  placement_status: StudentPlacementStatus;
  placement_country: string | null;
  placement_date: string | null;
  data_year: number;
  created_at: string;
  updated_at: string;
  schools: { name: string; npsn: string } | null;
};

export type ActiveStudentHistory = {
  id: string;
  student_id: string;
  change_type: ActiveStudentHistoryType;
  old_value: string | null;
  new_value: string | null;
  changed_by: string | null;
  changed_by_name: string | null;
  changed_at: string;
};

export type ActiveStudentMutationResult = {
  success: boolean;
  message: string;
  id?: string;
  refresh?: boolean;
  fieldErrors?: Record<string, string[]>;
};

