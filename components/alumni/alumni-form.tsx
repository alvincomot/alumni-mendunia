"use client";

import { FormSession, useFormActivity } from "@/components/ui/form-session";

import Link from "next/link";
import { useId, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { alumniReturnPath } from "@/lib/alumni/navigation";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingIndicator } from "@/components/ui/loading";
import { useToast } from "@/components/ui/toast";
import {
  alumniSchema,
  type AlumniRecord,
  type AlumniInput,
  type MutationResult,
} from "@/lib/alumni/schema";
import { saveAlumni } from "@/app/dashboard/alumni/actions";

function AlumniFormContent({
  alumni,
  returnTo,
  onSaved,
}: {
  alumni?: AlumniRecord;
  returnTo?: string;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const active = useFormActivity();
  const { toast } = useToast();
  const busy = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const isSubmitting = submitting;
  const [result, setResult] = useState<MutationResult | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    reset,
    formState: { errors },
  } = useForm<AlumniInput>({
    defaultValues: alumni
      ? {
          full_name: alumni.full_name,
          graduation_year: alumni.graduation_year,
          major: alumni.major,
        }
      : undefined,
  });
  async function submit(values: AlumniInput) {
    if (busy.current) return;
    clearErrors();
    const parsed = alumniSchema.safeParse(values);
    if (!parsed.success) {
      parsed.error.issues.forEach((issue) =>
        setError(
          issue.path[0] as keyof AlumniInput,
          { message: issue.message },
          { shouldFocus: true },
        ),
      );
      return;
    }
    busy.current = true;
    setSubmitting(true);
    setResult(null);
    try {
      const response = await saveAlumni(alumni?.id ?? null, parsed.data);
      if (!active.current) return;
      if (response.success) {
        reset(parsed.data);
        setResult(null);
        toast(
          alumni
            ? "Data alumni berhasil diperbarui."
            : "Alumni berhasil ditambahkan.",
          alumni ? undefined : { destination: "/dashboard/alumni" },
        );
        if (!alumni && response.id) router.replace(alumniReturnPath(returnTo));
        onSaved?.();
        router.refresh();
      } else {
        setResult(response);
      }
    } catch {
      if (!active.current) return;
      setResult({
        success: false,
        message:
          "Koneksi bermasalah. Periksa daftar alumni sebelum mengirim ulang.",
      });
    } finally {
      busy.current = false;
      setSubmitting(false);
    }
  }
  return (
    <form
      onSubmit={handleSubmit(submit)}
      noValidate
      className="space-y-5"
      aria-busy={isSubmitting}
    >
      <fieldset disabled={isSubmitting} className="grid gap-4 sm:grid-cols-2">
        {(
          [
            ["full_name", "Nama lengkap", "text"],
            ["graduation_year", "Tahun kelulusan", "number"],
            ["major", "Jurusan", "text"],
          ] as const
        ).map(([field, label, type]) => (
          <div
            key={field}
            className={
              field === "full_name" ? "space-y-2 sm:col-span-2" : "space-y-2"
            }
          >
            <Label htmlFor={`alumni-${field}`}>{label} (wajib)</Label>
            <Input
              id={`alumni-${field}`}
              {...register(
                field,
                field === "graduation_year" ? { valueAsNumber: true } : {},
              )}
              type={type}
              required
              maxLength={type === "text" ? 150 : undefined}
              min={type === "number" ? 1990 : undefined}
              max={type === "number" ? 2100 : undefined}
              className="min-h-11"
              aria-invalid={!!errors[field]}
              aria-describedby={errors[field] ? `${field}-error` : undefined}
            />
            {errors[field] && (
              <p id={`${field}-error`} className="text-sm text-red-800">
                {errors[field]?.message}
              </p>
            )}
          </div>
        ))}
      </fieldset>
      {result && (
        <p role="alert" className="text-sm text-red-800">
          {result.message}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={isSubmitting} className="min-h-11">
          {isSubmitting && <LoadingIndicator size="sm" />}
          {isSubmitting
            ? "Menyimpan..."
            : alumni
              ? "Simpan perubahan"
              : "Simpan alumni dan lanjutkan"}
        </Button>
        <Button asChild variant="outline" className="min-h-11">
          <Link href={alumniReturnPath(returnTo)}>
            {result && !result.success
              ? "Periksa daftar alumni"
              : "Kembali ke daftar"}
          </Link>
        </Button>
      </div>
    </form>
  );
}

export function AlumniEditor({
  alumni,
  returnTo,
}: {
  alumni: AlumniRecord;
  returnTo?: string;
}) {
  const [open, setOpen] = useState(false);
  const editorId = useId();
  return (
    <div className="mt-6 border-t pt-4">
      <div className="flex justify-end">
        <Button
          type="button"
          aria-expanded={open}
          aria-controls={editorId}
          className="min-h-11"
          onClick={() => setOpen((value) => !value)}
        >
          Edit identitas alumni
        </Button>
      </div>
      {open && (
        <div id={editorId} className="mt-4 max-w-2xl">
          <AlumniForm
            alumni={alumni}
            returnTo={returnTo}
            onSaved={() => setOpen(false)}
          />
        </div>
      )}
    </div>
  );
}

export function AlumniForm(
  props: React.ComponentProps<typeof AlumniFormContent>,
) {
  return (
    <FormSession key={JSON.stringify(props.alumni)}>
      <AlumniFormContent {...props} />
    </FormSession>
  );
}
