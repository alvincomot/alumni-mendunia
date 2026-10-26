"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { applicationRoles, roleDetails } from "@/lib/auth/roles";
import {
  profileInputSchema,
  type ProfileInput,
  type UserProfile,
  type UserResult,
} from "@/lib/users/schema";
import { inviteUser, saveUserProfile } from "@/app/dashboard/users/actions";

export function UserDialog({
  profile,
  schools,
  enabled = true,
  recoveryOnly = false,
}: {
  profile?: UserProfile;
  schools: { id: string; name: string }[];
  enabled?: boolean;
  recoveryOnly?: boolean;
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const busy = useRef(false);
  const router = useRouter();
  const [result, setResult] = useState<UserResult | null>(null);
  const [email, setEmail] = useState("");
  const [recover, setRecover] = useState(recoveryOnly);
  const [confirmed, setConfirmed] = useState(false);
  const [open, setOpen] = useState(false);
  const [isSubmitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    clearErrors,
    reset,
    formState: { errors },
  } = useForm<ProfileInput>({
    defaultValues: {
      full_name: profile?.full_name ?? "",
      role: profile?.role ?? "petugas_sekolah",
      school_id: profile?.school_id ?? "",
      is_active: profile?.is_active ?? true,
    },
  });
  const role = watch("role");
  async function submit(input: ProfileInput) {
    if (busy.current || !confirmed) return;
    clearErrors();
    const parsed = profileInputSchema.safeParse(input);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === "full_name" || field === "school_id")
          setError(field, { message: issue.message }, { shouldFocus: true });
      }
      setResult({
        success: false,
        message: "Periksa nama dan penugasan sekolah sesuai peran.",
      });
      return;
    }
    busy.current = true;
    setSubmitting(true);
    try {
      const response = profile
        ? await saveUserProfile(profile.user_id, parsed.data)
        : await inviteUser({ email, profile: parsed.data, recover });
      setResult(response);
      if (response.success) {
        dialog.current?.close();
      }
      router.refresh();
    } catch {
      setResult({
        success: false,
        message: "Koneksi terputus. Muat ulang daftar sebelum mencoba lagi.",
      });
    } finally {
      busy.current = false;
      setSubmitting(false);
    }
  }
  return (
    <div>
      <Button
        variant={profile ? "outline" : "default"}
        disabled={!enabled}
        className="min-h-11"
        onClick={() => {
          setResult(null);
          setEmail("");
          setRecover(recoveryOnly);
          setConfirmed(false);
          reset({
            full_name: profile?.full_name ?? "",
            role: profile?.role ?? "petugas_sekolah",
            school_id: profile?.school_id ?? "",
            is_active: profile?.is_active ?? true,
          });
          dialog.current?.showModal();
          setOpen(true);
        }}
      >
        {profile
          ? "Edit profil"
          : recoveryOnly
            ? "Pulihkan profil"
            : "Undang pengguna"}
      </Button>
      {result && !open && (
        <p
          role={result.success ? "status" : "alert"}
          className="mt-2 max-w-lg text-sm"
        >
          {result.message}
        </p>
      )}
      <dialog
        ref={dialog}
        aria-labelledby={`${id}-title`}
        onClose={() => setOpen(false)}
        className="max-h-[90svh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-lg border bg-white p-5 text-foreground backdrop:bg-slate-950/40"
        onCancel={(event) => {
          if (busy.current) event.preventDefault();
        }}
      >
        <h2 id={`${id}-title`} className="text-xl font-semibold text-primary">
          {profile
            ? "Edit profil pengguna"
            : recoveryOnly
              ? "Pulihkan profil pengguna"
              : "Undang pengguna"}
        </h2>
        <p className="my-3 text-sm leading-6">
          Perubahan peran dan status langsung memengaruhi akses aplikasi.
          Pastikan penugasan sesuai kewenangan pengguna.
        </p>
        {recoveryOnly && (
          <p className="mb-4 text-sm">
            Hubungkan akun Auth yang sudah ada ke profil aplikasi. Tindakan ini
            tidak mengirim email atau mengganti kata sandi.
          </p>
        )}
        <form
          onSubmit={handleSubmit(submit)}
          aria-busy={isSubmitting}
          className="space-y-4"
        >
          <fieldset disabled={isSubmitting} className="space-y-4">
            {!profile && (
              <div className="space-y-2">
                <Label htmlFor={`${id}-email`}>Email (wajib)</Label>
                <Input
                  id={`${id}-email`}
                  type="email"
                  required
                  maxLength={254}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="min-h-11"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor={`${id}-name`}>Nama lengkap (wajib)</Label>
              <Input
                id={`${id}-name`}
                {...register("full_name")}
                required
                maxLength={150}
                aria-invalid={!!errors.full_name}
                aria-describedby={
                  errors.full_name ? `${id}-name-error` : undefined
                }
                className="min-h-11"
              />
              {errors.full_name && (
                <p id={`${id}-name-error`} className="text-sm text-red-800">
                  {errors.full_name.message}
                </p>
              )}
            </div>
            <label className="block space-y-2 text-sm font-medium">
              <span>Peran (wajib)</span>
              <select
                {...register("role", {
                  onChange: (e) => {
                    if (e.target.value !== "petugas_sekolah")
                      setValue("school_id", "");
                  },
                })}
                className="min-h-11 w-full rounded-md border bg-white px-3"
              >
                {applicationRoles.map((value) => (
                  <option key={value} value={value}>
                    {roleDetails[value].label}
                  </option>
                ))}
              </select>
            </label>
            {role === "petugas_sekolah" && (
              <label className="block space-y-2 text-sm font-medium">
                <span>Sekolah aktif (wajib)</span>
                <select
                  {...register("school_id")}
                  required
                  aria-invalid={!!errors.school_id}
                  aria-describedby={
                    errors.school_id ? `${id}-school-error` : undefined
                  }
                  className="min-h-11 w-full rounded-md border bg-white px-3"
                >
                  <option value="">Pilih sekolah</option>
                  {schools.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                {errors.school_id && (
                  <span
                    id={`${id}-school-error`}
                    className="block text-sm text-red-800"
                  >
                    {errors.school_id.message}
                  </span>
                )}
                {schools.length === 0 && (
                  <span className="block font-normal text-muted-foreground">
                    Belum ada sekolah aktif. Aktifkan atau tambahkan sekolah
                    sebelum menugaskan Petugas Sekolah.
                  </span>
                )}
              </label>
            )}
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                {...register("is_active")}
                className="size-5"
              />
              Profil aktif
            </label>
            {!profile && !recoveryOnly && (
              <label className="flex min-h-11 items-start gap-3 text-sm leading-6">
                <input
                  type="checkbox"
                  checked={recover}
                  onChange={(e) => setRecover(e.target.checked)}
                  className="mt-1 size-5 shrink-0"
                />
                Pulihkan profil untuk akun Auth yang sudah ada, tanpa mengirim
                undangan baru.
              </label>
            )}
            <label className="flex min-h-11 items-start gap-3 text-sm leading-6">
              <input
                type="checkbox"
                required
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-1 size-5 shrink-0"
              />
              Saya telah memeriksa peran, sekolah, dan status akun ini.
            </label>
          </fieldset>
          {result && (
            <p role="alert" className="text-sm text-red-800">
              {result.message}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={isSubmitting} className="min-h-11">
              {isSubmitting
                ? "Memproses..."
                : profile
                  ? "Simpan perubahan"
                  : recover
                    ? "Pulihkan profil"
                    : "Kirim undangan"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              className="min-h-11"
              onClick={() => dialog.current?.close()}
            >
              Batal
            </Button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
