"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { Controller } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CountryCombobox } from "@/components/alumni/country-combobox";
import {
  placementSchema,
  statusLabels,
  type PlacementInput,
  type MutationResult,
} from "@/lib/alumni/schema";
import { registerPlacement } from "@/app/dashboard/alumni/actions";

export function PlacementForm({
  alumniId,
  expectedCurrentId = null,
}: {
  alumniId: string;
  expectedCurrentId?: string | null;
}) {
  const router = useRouter();
  const busy = useRef(false);
  const [result, setResult] = useState<MutationResult | null>(null);
  const {
    register,
    handleSubmit,
    control,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<PlacementInput>({
    defaultValues: {
      status: "persiapan_berangkat",
      confirm_existing_condition: false,
      destination_country: "",
      company_name: "",
      work_sector: "",
      planned_departure: "",
      actual_departure: "",
      employment_start: "",
      contract_end_date: "",
    },
  });
  const status = watch("status");
  async function submit(values: PlacementInput) {
    if (busy.current || result?.success) return;
    const parsed = placementSchema.safeParse(values);
    if (!parsed.success) {
      parsed.error.issues.forEach((issue) =>
        setError(
          issue.path[0] as keyof PlacementInput,
          { message: issue.message },
          { shouldFocus: true },
        ),
      );
      return;
    }
    busy.current = true;
    setResult(null);
    try {
      const response = await registerPlacement(
        alumniId,
        expectedCurrentId,
        parsed.data,
      );
      setResult(response);
      if (response.success) router.refresh();
    } catch {
      setResult({
        success: false,
        message:
          "Koneksi bermasalah. Muat ulang detail untuk memeriksa hasil sebelum mencoba lagi.",
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
      <p className="text-sm leading-6 text-muted-foreground">
        Identitas alumni sudah tersimpan. Jika penempatan gagal disimpan,
        lanjutkan dari halaman ini tanpa mendaftarkan alumni kembali.
      </p>
      <fieldset
        disabled={isSubmitting || result?.success}
        className="grid gap-4 sm:grid-cols-2"
      >
        <div className="space-y-2">
          <Label htmlFor="destination_country">Negara tujuan (wajib)</Label>
          <Controller
            name="destination_country"
            control={control}
            render={({ field }) => (
              <CountryCombobox
                ref={field.ref}
                id="destination_country"
                value={field.value}
                onValueChange={(nextValue) => {
                  field.onChange(nextValue);
                  setResult(null);
                }}
                disabled={isSubmitting || result?.success}
                required
                onBlur={field.onBlur}
                invalid={!!errors.destination_country}
                describedBy={
                  errors.destination_country
                    ? "destination_country-error"
                    : undefined
                }
                ariaLabel="Negara tujuan"
              />
            )}
          />
          {errors.destination_country && (
            <p id="destination_country-error" className="text-sm text-red-800">
              {errors.destination_country.message}
            </p>
          )}
        </div>
        {(
          [
            ["company_name", "Perusahaan", 200],
            ["work_sector", "Sektor pekerjaan", 150],
          ] as const
        ).map(([field, label, max]) => (
          <div key={field} className="space-y-2">
            <Label htmlFor={field}>{label}</Label>
            <Input
              {...register(field)}
              id={field}
              maxLength={max}
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
        <div className="space-y-2">
          <Label htmlFor="initial-status">Status awal (wajib)</Label>
          <select
            {...register("status")}
            id="initial-status"
            className="block min-h-11 w-full rounded-md border bg-white px-3 text-sm focus-visible:outline-accent"
          >
            {Object.entries(statusLabels).map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        {status !== "persiapan_berangkat" && (
          <div className="sm:col-span-2">
            <label className="flex min-h-11 items-start gap-3 text-sm leading-6">
              <input
                type="checkbox"
                {...register("confirm_existing_condition")}
                className="mt-1 size-5 shrink-0"
                aria-invalid={!!errors.confirm_existing_condition}
                aria-describedby={
                  errors.confirm_existing_condition
                    ? "condition-error"
                    : undefined
                }
              />
              Saya memastikan status ini sesuai kondisi alumni saat pertama kali
              dicatat, bukan perubahan status penempatan yang sudah ada.
            </label>
            {errors.confirm_existing_condition && (
              <p id="condition-error" className="text-sm text-red-800">
                {errors.confirm_existing_condition.message}
              </p>
            )}
          </div>
        )}
        {(
          [
            ["planned_departure", "Rencana berangkat"],
            ["actual_departure", "Keberangkatan aktual"],
            ["employment_start", "Mulai bekerja"],
            ["contract_end_date", "Selesai kontrak"],
          ] as const
        ).map(([field, label]) => (
          <div key={field} className="space-y-2">
            <Label htmlFor={field}>{label}</Label>
            <Input
              {...register(field)}
              id={field}
              type="date"
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
        <p className="text-sm leading-6 text-muted-foreground sm:col-span-2">
          Tanggal bersifat opsional. Keberangkatan aktual dan mulai bekerja
          hanya untuk status aktif bekerja atau selesai kontrak. Tanggal selesai
          kontrak hanya untuk status selesai kontrak.
        </p>
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
          disabled={isSubmitting || result?.success}
          className="min-h-11"
        >
          {isSubmitting
            ? "Menyimpan..."
            : expectedCurrentId
              ? "Simpan penempatan berikutnya"
              : "Simpan penempatan awal"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={isSubmitting}
          className="min-h-11"
          onClick={() => router.refresh()}
        >
          Muat ulang detail
        </Button>
      </div>
    </form>
  );
}
