import { z } from "zod";

const passwordSchema = z.string().min(1, "Kata sandi wajib diisi.");
const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Masukkan alamat email yang valid.").max(254));

export const loginSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("school"),
    identity: z
      .string()
      .trim()
      .regex(/^\d{8}$/, "NPSN harus terdiri dari 8 digit."),
    password: passwordSchema,
  }),
  z.object({
    mode: z.literal("dinas"),
    identity: emailSchema,
    password: passwordSchema,
  }),
]);

export type LoginMode = z.infer<typeof loginSchema>["mode"];

export type LoginResult = {
  success: boolean;
  message?: string;
  redirectTo?: "/dashboard" | "/auth/update-password";
};
