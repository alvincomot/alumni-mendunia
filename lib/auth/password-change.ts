import { z } from "zod";

export const passwordChangeSchema = z
  .object({
    password: z
      .string()
      .min(8, "Kata sandi harus minimal 8 karakter.")
      .max(128, "Kata sandi maksimal 128 karakter."),
    confirmation: z.string(),
  })
  .refine((values) => values.password === values.confirmation, {
    path: ["confirmation"],
    message: "Konfirmasi kata sandi tidak cocok.",
  });

export type PasswordChangeResult = {
  success: boolean;
  message: string;
  redirectTo?: "/dashboard" | "/auth/login";
};

export function isMissingPasswordChangeColumn(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? error.code : undefined;
  return code === "42703" || code === "PGRST204";
}
