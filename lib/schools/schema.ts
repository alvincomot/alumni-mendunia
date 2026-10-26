import { z } from "zod";

export const schoolSchema = z.object({
  npsn: z
    .string()
    .regex(/^[0-9]{8}$/, "NPSN harus terdiri dari tepat 8 digit angka."),
  name: z
    .string()
    .trim()
    .min(1, "Nama sekolah wajib diisi.")
    .max(200, "Nama sekolah maksimal 200 karakter."),
  city: z
    .string()
    .trim()
    .min(1, "Kota wajib diisi.")
    .max(100, "Kota maksimal 100 karakter."),
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
