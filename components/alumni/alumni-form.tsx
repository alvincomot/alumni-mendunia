"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  alumniSchema,
  type AlumniRecord,
  type AlumniInput,
  type MutationResult,
} from "@/lib/alumni/schema";
import { saveAlumni } from "@/app/dashboard/alumni/actions";

export function AlumniForm({ alumni }: { alumni?: AlumniRecord }) {
  const router = useRouter();
  const busy = useRef(false);
  const [result, setResult] = useState<MutationResult | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
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
    if (busy.current || (!alumni && result?.success)) return;
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
    setResult(null);
    try {
      const response = await saveAlumni(alumni?.id ?? null, parsed.data);
      setResult(response);
      if (response.success) {
        if (!alumni && response.id)
          router.replace(`/dashboard/alumni/${response.id}`);
        router.refresh();
      }
    } catch {
      setResult({
        success: false,
        message:
          "Koneksi bermasalah. Periksa daftar alumni sebelum mengirim ulang.",
      });
    } finally {
      busy.current = false;
    }
  }
  return (
    <form
      onSubmit={handleSubmit(submit)}
      noValidate
      className="space-y-5"
      aria-busy={isSubmitting}
    >
      <fieldset
        disabled={isSubmitting || (!alumni && result?.success)}
        className="grid gap-4 sm:grid-cols-2"
      >
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
        <p
          role={result.success ? "status" : "alert"}
          className={`text-sm ${result.success ? "text-green-800" : "text-red-800"}`}
        >
          {result.message}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button
          type="submit"
          disabled={isSubmitting || (!alumni && result?.success)}
          className="min-h-11"
        >
          {isSubmitting
            ? "Menyimpan..."
            : alumni
              ? "Simpan perubahan"
              : "Simpan alumni dan lanjutkan"}
        </Button>
        <Button asChild variant="outline" className="min-h-11">
          <Link href="/dashboard/alumni">
            {result && !result.success
              ? "Periksa daftar alumni"
              : "Kembali ke daftar"}
          </Link>
        </Button>
      </div>
    </form>
  );
}
