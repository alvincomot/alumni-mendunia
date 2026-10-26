"use client";

import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  saveSchool,
  changeSchoolStatus,
} from "@/app/dashboard/schools/actions";
import {
  schoolSchema,
  type School,
  type SchoolInput,
  type SchoolResult,
} from "@/lib/schools/schema";

export function SchoolDialog({
  school,
  statusOnly = false,
}: {
  school?: School;
  statusOnly?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [result, setResult] = useState<SchoolResult | null>(null);
  const [pending, setPending] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<SchoolInput>();
  const title = statusOnly
    ? `${school?.is_active ? "Nonaktifkan" : "Aktifkan"} sekolah`
    : school
      ? "Edit sekolah"
      : "Tambah sekolah";
  const identity = `${school?.id ?? "new"}-${statusOnly ? "status" : "edit"}`;

  function open() {
    setResult(null);
    reset({
      npsn: school?.npsn ?? "",
      name: school?.name ?? "",
      city: school?.city ?? "",
    });
    dialog.current?.showModal();
  }

  async function submit(values: SchoolInput) {
    if (pending) return;
    const parsed = schoolSchema.safeParse(values);
    if (!statusOnly && !parsed.success) {
      for (const issue of parsed.error.issues) {
        setError(
          issue.path[0] as keyof SchoolInput,
          { message: issue.message },
          { shouldFocus: true },
        );
      }
      return;
    }
    setPending(true);
    setResult(null);
    try {
      const response =
        statusOnly && school
          ? await changeSchoolStatus({
              id: school.id,
              isActive: !school.is_active,
            })
          : await saveSchool(
              school?.id ?? null,
              parsed.success ? parsed.data : values,
            );
      setResult(response);
      if (response.success) router.refresh();
    } catch {
      setResult({
        success: false,
        message: "Permintaan gagal. Periksa koneksi dan coba kembali.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button
        onClick={open}
        variant={school ? "outline" : "default"}
        className="min-h-11"
        aria-label={school ? `${title}: ${school.name}` : title}
      >
        {statusOnly
          ? school?.is_active
            ? "Nonaktifkan"
            : "Aktifkan"
          : school
            ? "Edit"
            : "Tambah sekolah"}
      </Button>
      <dialog
        ref={dialog}
        aria-labelledby={`${identity}-title`}
        aria-describedby={statusOnly ? `${identity}-impact` : undefined}
        onCancel={(event) => {
          if (pending) event.preventDefault();
        }}
        className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-lg border bg-white p-6 text-foreground backdrop:bg-black/40 sm:p-8"
      >
        <h2
          id={`${identity}-title`}
          className="text-xl font-semibold text-primary"
        >
          {title}
        </h2>
        <form
          onSubmit={handleSubmit(submit)}
          noValidate
          className="mt-5 space-y-5"
          aria-busy={pending}
        >
          {statusOnly && school ? (
            <p
              id={`${identity}-impact`}
              className="break-words text-sm leading-6"
            >
              {school.is_active
                ? `Nonaktifkan ${school.name}? Petugas sekolah ini tidak dapat membaca atau mengelola data alumni dan penempatan sekolah selama sekolah nonaktif. Data tetap tersimpan dan Dinas tetap dapat melihatnya.`
                : `Aktifkan ${school.name}? Petugas dengan profil aktif dapat kembali mengakses data sesuai kewenangannya.`}
            </p>
          ) : (
            <fieldset
              disabled={pending || result?.success}
              className="space-y-4"
            >
              {(
                [
                  ["npsn", "NPSN", 8],
                  ["name", "Nama sekolah", 200],
                  ["city", "Kota", 100],
                ] as const
              ).map(([field, label, max]) => (
                <div key={field} className="space-y-2">
                  <Label htmlFor={`${identity}-${field}`}>
                    {label} (wajib)
                  </Label>
                  <Input
                    {...register(field)}
                    id={`${identity}-${field}`}
                    type="text"
                    inputMode={field === "npsn" ? "numeric" : "text"}
                    maxLength={max}
                    required
                    autoFocus={field === "npsn"}
                    aria-invalid={Boolean(errors[field])}
                    aria-describedby={
                      errors[field] ? `${identity}-${field}-error` : undefined
                    }
                    className="min-h-11"
                  />
                  {errors[field] && (
                    <p
                      id={`${identity}-${field}-error`}
                      className="text-sm text-red-800"
                    >
                      {errors[field]?.message}
                    </p>
                  )}
                </div>
              ))}
            </fieldset>
          )}
          {result && (
            <p
              role={result.success ? "status" : "alert"}
              className={`text-sm ${result.success ? "text-green-800" : "text-red-800"}`}
            >
              {result.message}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-3">
            <Button
              type="button"
              autoFocus={statusOnly}
              variant="outline"
              disabled={pending}
              className="min-h-11"
              onClick={() => dialog.current?.close()}
            >
              {result?.success ? "Tutup" : "Batal"}
            </Button>
            {!result?.success && (
              <Button type="submit" disabled={pending} className="min-h-11">
                {pending
                  ? "Menyimpan..."
                  : statusOnly
                    ? "Konfirmasi"
                    : "Simpan"}
              </Button>
            )}
          </div>
        </form>
      </dialog>
    </>
  );
}
