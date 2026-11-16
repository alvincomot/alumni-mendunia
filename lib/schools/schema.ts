import { z } from "zod";

export const SUDIN_OPTIONS = [
  "Jakarta Pusat I",
  "Jakarta Pusat II",
  "Jakarta Utara I",
  "Jakarta Utara II",
  "Jakarta Barat I",
  "Jakarta Barat II",
  "Jakarta Selatan I",
  "Jakarta Selatan II",
  "Jakarta Timur I",
  "Jakarta Timur II",
  "Kepulauan Seribu",
] as const;

export type Sudin = (typeof SUDIN_OPTIONS)[number];

const sudinSet = new Set<string>(SUDIN_OPTIONS);

export function isSudin(value: unknown): value is Sudin {
  return typeof value === "string" && sudinSet.has(value);
}

export function normalizeSudin(value: unknown): Sudin | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/g, " ");
  if (isSudin(normalized)) return normalized;
  if (/^(?:jakarta )?kepulauan seribu$/i.test(normalized))
    return "Kepulauan Seribu";

  const match = normalized.match(
    /^jakarta (pusat|utara|barat|selatan|timur) (1|2|i|ii)$/i,
  );
  if (!match) return null;
  const region =
    match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
  const area = /^(?:1|i)$/i.test(match[2]) ? "I" : "II";
  const candidate = `Jakarta ${region} ${area}`;
  return isSudin(candidate) ? candidate : null;
}

export const schoolSchema = z.object({
  npsn: z
    .string()
    .regex(/^[0-9]{8}$/, "NPSN harus terdiri dari tepat 8 digit angka."),
  name: z
    .string()
    .trim()
    .min(1, "Nama sekolah wajib diisi.")
    .max(200, "Nama sekolah maksimal 200 karakter."),
  sudin: z
    .string()
    .trim()
    .refine((value): boolean => isSudin(value), "Sudin wajib dipilih."),
});

export const schoolIdSchema = z.string().uuid();
export const schoolStatusSchema = z.object({
  id: schoolIdSchema,
  isActive: z.boolean(),
});
export type SchoolInput = z.infer<typeof schoolSchema>;
export type School = SchoolInput & { id: string; is_active: boolean };
export type SchoolResult = { success: boolean; message: string };

export function schoolErrorMessage(code?: string) {
  if (code === "23505") return "NPSN sudah digunakan oleh sekolah lain.";
  if (code === "42501")
    return "Anda tidak memiliki izin untuk menyimpan perubahan ini.";
  return "Perubahan belum tersimpan. Silakan coba kembali.";
}
