import { z } from "zod";

export const npsnSchema = z
  .string()
  .trim()
  .regex(/^\d{8}$/, "Masukkan NPSN yang terdiri dari 8 digit.");
export const schoolEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Masukkan email sekolah yang valid.").max(254));
export const schoolLookupSchema = z.object({
  name: z.string().min(1),
  npsn: npsnSchema,
  status: z.enum(["UNCLAIMED", "PENDING_ACTIVATION", "ACTIVE", "SUSPENDED"]),
  retry_after: z
    .number()
    .nullable()
    .transform((value) => Math.max(0, value ?? 0)),
});
export type SchoolLookup = z.infer<typeof schoolLookupSchema>;
export type SchoolAuthResult = {
  success: boolean;
  message?: string;
  school?: SchoolLookup;
  retryAfter?: number;
  cooldowns?: {
    school?: number;
    client?: number;
  };
  rateLimit?: "application" | "database" | "provider";
  failureKind?:
    | "application_rate_limit"
    | "database_cooldown"
    | "auth_rate_limit"
    | "provider_failure"
    | "invalid_account_state"
    | "configuration"
    | "unexpected";
};
export const schoolMailAccepted =
  "Permintaan email diterima oleh layanan Auth. Periksa Kotak Masuk atau Spam. Jika belum diterima, Anda dapat mencoba lagi setelah jeda pengiriman.";
export const schoolAuthUnavailable =
  "Permintaan belum dapat diproses. Tunggu sebentar dan coba lagi. Jika berulang, hubungi Dinas untuk memeriksa layanan email dan akun sekolah.";
