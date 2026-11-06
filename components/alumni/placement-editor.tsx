"use client";

import { FormSession, useFormActivity } from "@/components/ui/form-session";
import { useId, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingIndicator } from "@/components/ui/loading";
import { useToast } from "@/components/ui/toast";
import { CountryCombobox } from "@/components/alumni/country-combobox";
import { updatePlacementDetails } from "@/app/dashboard/alumni/actions";
import {
  placementDetailsEditSchema,
  statusLabels,
  type PlacementDetailsEditFormInput,
  type PlacementEditResult,
  type PlacementRecord,
} from "@/lib/alumni/schema";

type EditablePlacement = PlacementRecord & { updated_at: string };

function PlacementEditForm({
  placement,
  onSaved,
  onCancel,
}: {
  placement: EditablePlacement;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const id = useId();
  const router = useRouter();
  const active = useFormActivity();
  const { toast } = useToast();
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<PlacementEditResult | null>(null);
  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    setError,
    clearErrors,
    formState: { errors, isDirty },
  } = useForm<PlacementDetailsEditFormInput>({
    defaultValues: {
      placement_id: placement.id,
      expected_status: placement.status,
      expected_updated_at: placement.updated_at,
      destination_country: placement.destination_country,
      placement_secured:
        placement.placement_secured === null
          ? ""
          : String(placement.placement_secured),
      placement_provider_name: placement.placement_provider_name ?? "",
      work_sector: placement.work_sector ?? "",
      planned_departure: placement.planned_departure ?? "",
      actual_departure: placement.actual_departure ?? "",
      employment_start: placement.employment_start ?? "",
      contract_end_date: placement.contract_end_date ?? "",
    },
  });
  const status = placement.status;
  const canEditPlacementState =
    status === "persiapan_berangkat" || status === "batal_berangkat";
  const placementState = watch("placement_secured");
  const placementSecured = canEditPlacementState
    ? placementState === "true"
    : true;
  const showPlannedDeparture =
    placementSecured &&
    (status === "persiapan_berangkat" || status === "batal_berangkat");
  const showWorkingDates =
    status === "aktif_bekerja" || status === "selesai_kontrak";

  function changePlacementState(value: string) {
    setValue("placement_secured", value, {
      shouldDirty: true,
      shouldValidate: false,
    });
    if (value === "false") {
      setValue("placement_provider_name", "", { shouldDirty: true });
      setValue("work_sector", "", { shouldDirty: true });
      setValue("planned_departure", "", { shouldDirty: true });
    }
    clearErrors([
      "placement_secured",
      "placement_provider_name",
      "work_sector",
      "planned_departure",
    ]);
    setResult(null);
  }

  async function submit(values: PlacementDetailsEditFormInput) {
    if (busy.current) return;
    clearErrors();
    const parsed = placementDetailsEditSchema.safeParse(values);
    if (!parsed.success) {
      setResult({
        success: false,
        message:
          parsed.error.issues[0]?.message ??
          "Periksa kembali kondisi penempatan dan urutan tanggal.",
      });
      parsed.error.issues.forEach((issue, index) => {
        const field = issue.path[0] as keyof PlacementDetailsEditFormInput;
        setError(
          field,
          { message: issue.message },
          { shouldFocus: index === 0 },
        );
      });
      return;
    }

    busy.current = true;
    setPending(true);
    setResult(null);
    try {
      const response = await updatePlacementDetails(values);
      if (!active.current) return;
      if (response.success) {
        toast(response.message);
        onSaved();
        router.refresh();
      } else {
        setResult(response);
        if (response.refresh) router.refresh();
      }
    } catch {
      if (!active.current) return;
      setResult({
        success: false,
        refresh: true,
        message:
          "Koneksi bermasalah. Muat ulang detail untuk memeriksa perubahan terbaru.",
      });
      router.refresh();
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit(submit)}
      noValidate
      aria-busy={pending}
      className="mt-4 max-w-3xl space-y-5"
    >
      <input type="hidden" {...register("placement_id")} />
      <input type="hidden" {...register("expected_status")} />
      <input type="hidden" {...register("expected_updated_at")} />
      {!canEditPlacementState && (
        <input type="hidden" {...register("placement_secured")} />
      )}
      <p className="text-sm leading-6 text-muted-foreground">
        Status tetap {statusLabels[status]}. Gunakan aksi perubahan status untuk
        mengubah tahap penempatan.
      </p>
      <fieldset disabled={pending} className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${id}-destination`}>Negara tujuan (wajib)</Label>
          <Controller
            name="destination_country"
            control={control}
            render={({ field }) => (
              <CountryCombobox
                ref={field.ref}
                id={`${id}-destination`}
                value={field.value}
                onValueChange={(value) => {
                  field.onChange(value);
                  clearErrors("destination_country");
                  setResult(null);
                }}
                disabled={pending}
                required
                onBlur={field.onBlur}
                invalid={!!errors.destination_country}
                describedBy={
                  errors.destination_country
                    ? `${id}-destination-error`
                    : undefined
                }
                ariaLabel="Negara tujuan"
              />
            )}
          />
          {errors.destination_country && (
            <p id={`${id}-destination-error`} className="text-sm text-red-800">
              {errors.destination_country.message}
            </p>
          )}
        </div>
        {canEditPlacementState ? (
          <div className="space-y-2">
            <Label htmlFor={`${id}-secured`}>
              Status perolehan penempatan (wajib)
            </Label>
            <select
              id={`${id}-secured`}
              {...register("placement_secured")}
              onChange={(event) => changePlacementState(event.target.value)}
              className="form-control block"
              aria-invalid={!!errors.placement_secured}
              aria-describedby={
                errors.placement_secured ? `${id}-secured-error` : undefined
              }
            >
              <option value="">Pilih status penempatan</option>
              <option value="true">Sudah ada penempatan</option>
              <option value="false">Belum ada penempatan</option>
            </select>
            {errors.placement_secured && (
              <p id={`${id}-secured-error`} className="text-sm text-red-800">
                {errors.placement_secured.message}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-1">
            <p className="type-label text-muted-foreground">
              Status perolehan penempatan
            </p>
            <p className="text-sm font-medium">Sudah ada penempatan</p>
          </div>
        )}
        {placementSecured && (
          <>
            <div className="space-y-2">
              <Label htmlFor={`${id}-provider`}>
                LPK / Sending Organization / P3MI (Penyalur)
              </Label>
              <Input
                id={`${id}-provider`}
                {...register("placement_provider_name")}
                maxLength={200}
                className="min-h-11"
                aria-invalid={!!errors.placement_provider_name}
                aria-describedby={
                  errors.placement_provider_name
                    ? `${id}-provider-error`
                    : undefined
                }
              />
              {errors.placement_provider_name && (
                <p id={`${id}-provider-error`} className="text-sm text-red-800">
                  {errors.placement_provider_name.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${id}-sector`}>Sektor pekerjaan</Label>
              <Input
                id={`${id}-sector`}
                {...register("work_sector")}
                maxLength={150}
                className="min-h-11"
                aria-invalid={!!errors.work_sector}
                aria-describedby={
                  errors.work_sector ? `${id}-sector-error` : undefined
                }
              />
              {errors.work_sector && (
                <p id={`${id}-sector-error`} className="text-sm text-red-800">
                  {errors.work_sector.message}
                </p>
              )}
            </div>
          </>
        )}
        {showPlannedDeparture && (
          <DateField
            id={`${id}-planned`}
            label="Rencana keberangkatan"
            field="planned_departure"
            register={register}
            error={errors.planned_departure?.message}
          />
        )}
        {showWorkingDates && (
          <>
            <DateField
              id={`${id}-actual`}
              label="Keberangkatan aktual (wajib)"
              field="actual_departure"
              register={register}
              error={errors.actual_departure?.message}
              required
            />
            <DateField
              id={`${id}-employment`}
              label="Mulai bekerja"
              field="employment_start"
              register={register}
              error={errors.employment_start?.message}
            />
          </>
        )}
        {status === "selesai_kontrak" && (
          <DateField
            id={`${id}-contract`}
            label="Selesai kontrak"
            field="contract_end_date"
            register={register}
            error={errors.contract_end_date?.message}
          />
        )}
      </fieldset>
      {result && (
        <p role="alert" className="text-sm text-red-800">
          {result.message}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button
          type="submit"
          disabled={pending || !isDirty}
          className="min-h-11"
        >
          {pending && <LoadingIndicator size="sm" />}
          {pending ? "Menyimpan..." : "Simpan perubahan"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          className="min-h-11"
          onClick={onCancel}
        >
          Batal
        </Button>
      </div>
    </form>
  );
}

function DateField({
  id,
  label,
  field,
  register,
  error,
  required = false,
}: {
  id: string;
  label: string;
  field:
    | "planned_departure"
    | "actual_departure"
    | "employment_start"
    | "contract_end_date";
  register: ReturnType<
    typeof useForm<PlacementDetailsEditFormInput>
  >["register"];
  error?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="date"
        {...register(field)}
        required={required}
        className="min-h-11"
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error && (
        <p id={`${id}-error`} className="text-sm text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}

function PlacementEditorContent({
  placement,
}: {
  placement: EditablePlacement;
}) {
  const [open, setOpen] = useState(false);
  const editorId = useId();
  return (
    <>
      <Button
        type="button"
        aria-expanded={open}
        aria-controls={editorId}
        className="min-h-11"
        onClick={() => setOpen((value) => !value)}
      >
        Edit penempatan
      </Button>
      {open && (
        <div id={editorId} className="sm:col-span-3">
          <PlacementEditForm
            placement={placement}
            onSaved={() => setOpen(false)}
            onCancel={() => setOpen(false)}
          />
        </div>
      )}
    </>
  );
}

export function PlacementEditor({
  placement,
}: {
  placement: EditablePlacement;
}) {
  return (
    <FormSession key={`${placement.id}:${placement.updated_at}`}>
      <PlacementEditorContent placement={placement} />
    </FormSession>
  );
}
