import { z } from "zod";
import { applicationRoles } from "@/lib/auth/roles";

export const profileInputSchema = z
  .object({
    full_name: z
      .string()
      .trim()
      .min(1, "Nama lengkap wajib diisi.")
      .max(150, "Nama lengkap maksimal 150 karakter."),
    role: z.enum(applicationRoles),
    school_id: z.union([z.uuid(), z.literal("")]),
    is_active: z.boolean(),
  })
  .superRefine((value, context) => {
    if (value.role === "petugas_sekolah" && !value.school_id)
      context.addIssue({
        code: "custom",
        path: ["school_id"],
        message: "Pilih sekolah aktif untuk petugas.",
      });
    if (value.role !== "petugas_sekolah" && value.school_id)
      context.addIssue({
        code: "custom",
        path: ["school_id"],
        message: "Pengguna Dinas tidak ditugaskan ke sekolah.",
      });
  });

export const invitationSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  profile: profileInputSchema,
  recover: z.boolean(),
});
export type ProfileInput = z.infer<typeof profileInputSchema>;
export type UserProfile = Omit<ProfileInput, "school_id"> & {
  user_id: string;
  school_id: string | null;
};
export type UserResult = { success: boolean; message: string };
