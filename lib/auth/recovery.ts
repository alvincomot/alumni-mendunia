import { z } from "zod";

export const recoveryEmailSchema = z
  .string()
  .trim()
  .min(1, "Masukkan alamat email Anda.")
  .pipe(z.email("Masukkan alamat email yang valid.").max(254, "Masukkan alamat email yang valid."));

export const recoveryAcceptedMessage =
  "Jika akun memenuhi syarat, petunjuk pemulihan akan dikirim ke email yang terdaftar.";
export const recoveryUnavailableMessage =
  "Permintaan belum dapat diproses. Silakan coba beberapa saat lagi.";

export type RecoveryResult = {
  success: boolean;
  message: string;
  field?: "email";
};
