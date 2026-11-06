"use client";

import { FormSession, useFormActivity } from "@/components/ui/form-session";

import { useRef, useState } from "react";
import { alumniReturnPath } from "@/lib/alumni/navigation";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { Controller } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CountryCombobox } from "@/components/alumni/country-combobox";
import { LoadingIndicator } from "@/components/ui/loading";
import { useToast } from "@/components/ui/toast";
import {
  placementSchema,
  statusLabels,
  type PlacementInput,
  type MutationResult,
} from "@/lib/alumni/schema";
import { registerPlacement } from "@/app/dashboard/alumni/actions";

function PlacementFormContent({
  alumniId,
  expectedCurrentId = null,
  returnTo,
}: {
  alumniId: string;
  expectedCurrentId?: string | null;
  returnTo?: string;
}) {
  const router = useRouter();
  const active = useFormActivity();
  const [completed, setCompleted] = useState(false);
  const { toast } = useToast();
  const busy = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const isSubmitting = submitting;
  const [result, setResult] = useState<MutationResult | null>(null);
  const {
    register,
    handleSubmit,
    control,
    setError,
    clearErrors,
    setValue,
    reset,
    watch,
    formState: { errors },
  } = useForm<PlacementInput>({
    defaultValues: {
      status: "persiapan_berangkat",
      confirm_existing_condition: false,
      destination_country: "",
      placement_secured: false,
      placement_provider_name: "",
      work_sector: "",
      planned_departure: "",
      actual_departure: "",
      employment_start: "",
      contract_end_date: "",
    },
  });
  const status = watch("status");
  const placementSecured =
    status !== "persiapan_berangkat" || watch("placement_secured");
  const dateFields =
    status === "persiapan_berangkat"
      ? placementSecured
        ? (["planned_departure"] as const)
        : ([] as const)
      : status === "aktif_bekerja"
        ? (["actual_departure", "employment_start"] as const)
        : status === "selesai_kontrak"
          ? ([
              "actual_departure",
              "employment_start",
              "contract_end_date",
            ] as const)
          : ([] as const);
  function changeStatus(nextStatus: PlacementInput["status"]) {
    setValue("status", nextStatus, { shouldDirty: true });
    setValue("placement_secured", nextStatus !== "persiapan_berangkat", {
      shouldDirty: true,
    });
    setValue("planned_departure", "", { shouldDirty: true });
    setValue("actual_departure", "", { shouldDirty: true });
    setValue("employment_start", "", { shouldDirty: true });
    setValue("contract_end_date", "", { shouldDirty: true });
    if (nextStatus === "persiapan_berangkat") {
      setValue("confirm_existing_condition", false);
      setValue("placement_provider_name", "", { shouldDirty: true });
      setValue("work_sector", "", { shouldDirty: true });
    }
    clearErrors();
    setResult(null);
  }
  function changePlacementSecured(checked: boolean) {
    setValue("placement_secured", checked, { shouldDirty: true });
    if (!checked) {
      setValue("placement_provider_name", "", { shouldDirty: true });
      setValue("work_sector", "", { shouldDirty: true });
      setValue("planned_departure", "", { shouldDirty: true });
    }
    clearErrors([
      "placement_provider_name",
      "work_sector",
      "planned_departure",
    ]);
    setResult(null);
  }
  async function submit(values: PlacementInput) {
    if (busy.current || completed) return;
    clearErrors();
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
    setSubmitting(true);
    setResult(null);
    try {
      const response = await registerPlacement(
        alumniId,
        expectedCurrentId,
        parsed.data,
      );
      if (!active.current) return;
      if (response.success) {
        setCompleted(true);
        setResult(null);
        reset();
        toast(
          expectedCurrentId
            ? "Penempatan berikutnya berhasil dicatat."
            : "Penempatan awal berhasil disimpan.",
          { destination: "/dashboard/alumni" },
        );
        router.replace(alumniReturnPath(returnTo));
        router.refresh();
      } else setResult(response);
    } catch {
      if (!active.current) return;
      setResult({
        success: false,
        message:
          "Koneksi bermasalah. Muat ulang detail untuk memeriksa hasil sebelum mencoba lagi.",
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
      <p className="text-sm leading-6 text-muted-foreground">
        Identitas alumni sudah tersimpan. Jika penempatan gagal disimpan,
        lanjutkan dari halaman ini tanpa mendaftarkan alumni kembali.
      </p>
      <fieldset
        disabled={isSubmitting || completed}
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
                disabled={isSubmitting || completed}
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
        <div className="space-y-2">
          <Label htmlFor="initial-status">Status awal (wajib)</Label>
          <select
            id="initial-status"
            value={status}
            onChange={(event) =>
              changeStatus(event.target.value as PlacementInput["status"])
            }
            className="form-control block"
          >
            {Object.entries(statusLabels).map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        {status === "persiapan_berangkat" && (
          <div className="sm:col-span-2">
            <label className="flex min-h-11 items-center gap-3 text-sm leading-6">
              <Controller
                name="placement_secured"
                control={control}
                render={({ field }) => (
                  <input
                    ref={field.ref}
                    name={field.name}
                    type="checkbox"
                    checked={Boolean(field.value)}
                    onBlur={field.onBlur}
                    onChange={(event) =>
                      changePlacementSecured(event.target.checked)
                    }
                    className="size-5 shrink-0 accent-primary"
                  />
                )}
              />
              Sudah ada penempatan
            </label>
          </div>
        )}
        {placementSecured && (
          <>
            <div className="space-y-2">
              <Label htmlFor="placement_provider_name">
                LPK / Sending Organization / P3MI (Penyalur)
              </Label>
              <Input
                {...register("placement_provider_name")}
                id="placement_provider_name"
                placeholder="Masukkan nama lembaga penyalur"
                maxLength={200}
                className="min-h-11"
                aria-invalid={!!errors.placement_provider_name}
                aria-describedby={
                  errors.placement_provider_name
                    ? "placement_provider_name-error"
                    : undefined
                }
              />
              {errors.placement_provider_name && (
                <p
                  id="placement_provider_name-error"
                  className="text-sm text-red-800"
                >
                  {errors.placement_provider_name.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="work_sector">Sektor pekerjaan</Label>
              <Input
                {...register("work_sector")}
                id="work_sector"
                maxLength={150}
                className="min-h-11"
                aria-invalid={!!errors.work_sector}
                aria-describedby={
                  errors.work_sector ? "work_sector-error" : undefined
                }
              />
              {errors.work_sector && (
                <p id="work_sector-error" className="text-sm text-red-800">
                  {errors.work_sector.message}
                </p>
              )}
            </div>
          </>
        )}
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
        {dateFields.map((field) => (
          <div key={field} className="space-y-2">
            <Label htmlFor={field}>
              {
                {
                  planned_departure: "Rencana berangkat",
                  actual_departure: "Keberangkatan aktual",
                  employment_start: "Mulai bekerja",
                  contract_end_date: "Selesai kontrak",
                }[field]
              }
            </Label>
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
          Tanggal bersifat opsional dan hanya ditampilkan ketika sesuai dengan
          status awal yang dipilih.
        </p>
      </fieldset>
      {result && (
        <p role="alert" className="text-sm text-red-800">
          {result.message}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button
          type="submit"
          disabled={isSubmitting || completed}
          className="min-h-11"
        >
          {isSubmitting && <LoadingIndicator size="sm" />}
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

export function PlacementForm(
  props: React.ComponentProps<typeof PlacementFormContent>,
) {
  return (
    <FormSession
      key={`${props.alumniId}:${props.expectedCurrentId ?? "initial"}`}
    >
      <PlacementFormContent {...props} />
    </FormSession>
  );
}
