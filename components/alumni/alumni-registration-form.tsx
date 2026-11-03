"use client";

import { FormSession, useFormActivity } from "@/components/ui/form-session";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { Controller, useForm, useWatch, type Path } from "react-hook-form";
import { alumniFormPath, alumniReturnPath } from "@/lib/alumni/navigation";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CountryCombobox } from "@/components/alumni/country-combobox";
import { DashboardIcon } from "@/components/dashboard-icon";
import { LoadingIndicator } from "@/components/ui/loading";
import { useToast } from "@/components/ui/toast";
import {
  alumniRegistrationSchema,
  alumniSchema,
  destinationCountrySchema,
  initialPlacementDateFields,
  statusLabels,
  type AlumniRegistrationInput,
  type PlacementStatus,
  type RegistrationResult,
} from "@/lib/alumni/schema";
import { registerAlumniWithPlacement } from "@/app/dashboard/alumni/actions";

type RegistrationFormValues = Omit<AlumniRegistrationInput, "identity"> & {
  identity: Omit<AlumniRegistrationInput["identity"], "graduation_year"> & {
    graduation_year?: number;
  };
};

function createDefaultValues(): RegistrationFormValues {
  return {
    identity: {
      full_name: "",
      graduation_year: undefined,
      major: "",
    },
    placement: {
      destination_country: "",
      company_name: "",
      work_sector: "",
      status: "persiapan_berangkat",
      planned_departure: "",
      actual_departure: "",
      employment_start: "",
      contract_end_date: "",
      confirm_existing_condition: false,
    },
  };
}

function readableDate(value?: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}

function SummaryRow({
  icon,
  label,
  value,
}: {
  icon: "user" | "alumni" | "clipboard" | "plane" | "briefcase";
  label: string;
  value?: string | number;
}) {
  const empty = value === undefined || value === "";
  return (
    <div className="grid grid-cols-[1.25rem_minmax(0,7rem)_minmax(0,1fr)] items-start gap-3 py-3 text-sm">
      <DashboardIcon name={icon} className="mt-0.5 size-[18px] text-primary" />
      <dt className="text-[#6B6D7A]">{label}</dt>
      <dd
        className={`min-w-0 break-words text-right font-medium ${empty ? "text-[#6B6D7A]" : "text-[#191C1E]"}`}
      >
        {empty ? "Belum diisi" : value}
      </dd>
    </div>
  );
}

function AlumniRegistrationFormContent({
  schoolName,
  returnTo,
}: {
  schoolName: string;
  returnTo?: string;
}) {
  const router = useRouter();
  const active = useFormActivity();
  const destination = alumniReturnPath(returnTo);
  const [completed, setCompleted] = useState(false);
  const { toast } = useToast();
  const busy = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [savedAlumniId, setSavedAlumniId] = useState<string | null>(null);
  const [result, setResult] = useState<RegistrationResult | null>(null);
  const {
    register,
    control,
    getValues,
    handleSubmit,
    setError,
    clearErrors,
    setValue,
    reset,
    formState: { errors },
  } = useForm<RegistrationFormValues>({
    defaultValues: createDefaultValues(),
  });

  const isSubmitting = submitting || completed;
  const values = useWatch({ control });
  const status =
    values.placement?.status ?? ("persiapan_berangkat" as PlacementStatus);
  const dateField = initialPlacementDateFields[status];
  const dateError = dateField ? errors.placement?.[dateField.name] : undefined;

  function applyIssues(
    issues: { path: PropertyKey[]; message: string }[],
    prefix?: "identity" | "placement",
  ) {
    issues.forEach((issue, index) => {
      const path = [prefix, ...issue.path]
        .filter(Boolean)
        .join(".") as Path<RegistrationFormValues>;
      setError(path, { message: issue.message }, { shouldFocus: index === 0 });
    });
  }

  function advanceToPlacement() {
    if (step === 2) return;
    clearErrors();
    const parsed = alumniSchema.safeParse(getValues("identity"));
    if (!parsed.success) {
      applyIssues(parsed.error.issues, "identity");
      return;
    }
    setResult(null);
    setStep(2);
  }

  function validateDestinationCountry() {
    const parsed = destinationCountrySchema.safeParse(
      getValues("placement.destination_country"),
    );
    if (parsed.success) {
      clearErrors("placement.destination_country");
      return;
    }
    setError("placement.destination_country", {
      type: "validate",
      message: parsed.error.issues[0].message,
    });
  }

  function changeStatus(nextStatus: PlacementStatus) {
    setValue("placement.status", nextStatus, { shouldDirty: true });
    setResult(null);
    if (nextStatus === "persiapan_berangkat")
      setValue("placement.confirm_existing_condition", false);
    setValue("placement.planned_departure", "", { shouldDirty: true });
    setValue("placement.actual_departure", "", { shouldDirty: true });
    setValue("placement.employment_start", "", { shouldDirty: true });
    setValue("placement.contract_end_date", "", { shouldDirty: true });
    clearErrors([
      "placement.planned_departure",
      "placement.actual_departure",
      "placement.employment_start",
      "placement.contract_end_date",
    ]);
  }

  async function submit(input: RegistrationFormValues) {
    if (busy.current || completed) return;
    clearErrors();
    const parsed = alumniRegistrationSchema.safeParse(input);
    if (!parsed.success) {
      applyIssues(parsed.error.issues);
      if (parsed.error.issues.some((issue) => issue.path[0] === "identity"))
        setStep(1);
      return;
    }

    busy.current = true;
    setSubmitting(true);
    setResult(null);
    try {
      const response = await registerAlumniWithPlacement(
        savedAlumniId,
        parsed.data,
      );
      if (!active.current) return;
      if (response.success && response.id) {
        setCompleted(true);
        setResult(null);
        setStep(1);
        reset(createDefaultValues());
        setSavedAlumniId(null);
        toast("Alumni berhasil ditambahkan.", {
          destination: "/dashboard/alumni",
          action: {
            label: "Tambah Alumni Lagi",
            href: alumniFormPath("/dashboard/alumni/new", destination),
          },
        });
        router.replace(destination);
        router.refresh();
      } else {
        setResult(
          response.success
            ? {
                success: false,
                message:
                  "Data alumni belum dapat dikonfirmasi. Periksa daftar alumni sebelum mencoba kembali.",
              }
            : response,
        );
        if (response.id) setSavedAlumniId(response.id);
      }
    } catch {
      if (!active.current) return;
      setResult({
        success: false,
        id: savedAlumniId ?? undefined,
        identitySaved: Boolean(savedAlumniId),
        message: savedAlumniId
          ? "Identitas alumni sudah tersimpan. Buka detail alumni untuk memeriksa penempatan sebelum mencoba lagi."
          : "Koneksi terputus. Periksa daftar alumni sebelum mencoba kembali untuk menghindari duplikasi.",
      });
    } finally {
      busy.current = false;
      setSubmitting(false);
    }
  }

  function onFormSubmit(event: FormEvent<HTMLFormElement>) {
    if (step === 1) {
      event.preventDefault();
      advanceToPlacement();
      return;
    }
    void handleSubmit(submit)(event);
  }

  const identity = values.identity;
  const placement = values.placement;
  const year = Number.isInteger(identity?.graduation_year)
    ? identity?.graduation_year
    : undefined;

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)]">
      <form
        onSubmit={onFormSubmit}
        noValidate
        aria-busy={isSubmitting}
        className="min-w-0 rounded-xl border bg-card p-5 sm:p-7"
      >
        <ol
          aria-label="Tahap pendaftaran alumni"
          className="mx-auto mb-7 grid w-full max-w-[36.25rem] grid-cols-[max-content_minmax(0,1fr)_max-content] items-start gap-x-3 sm:gap-x-4"
        >
          <li className="min-w-0">
            <button
              type="button"
              onClick={() => setStep(1)}
              disabled={isSubmitting}
              aria-label="Buka langkah 1, Identitas Alumni"
              aria-current={step === 1 ? "step" : undefined}
              className="flex min-h-12 items-center gap-3 rounded-lg text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-wait"
            >
              <span
                className={`flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${step === 1 ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"}`}
              >
                1
              </span>
              <span className="hidden min-w-0 sm:block">
                <span className="block text-sm font-semibold text-[#191C1E]">
                  Identitas Alumni
                </span>
                <span className="mt-0.5 block text-xs text-[#6B6D7A]">
                  Data dasar alumni
                </span>
              </span>
            </button>
          </li>
          <li aria-hidden="true" className="flex h-12 items-center">
            <span
              className={`h-[3px] w-full rounded-full ${step === 2 ? "bg-primary/30" : "bg-slate-200"}`}
            />
          </li>
          <li className="min-w-0">
            <button
              type="button"
              onClick={advanceToPlacement}
              disabled={isSubmitting}
              aria-label="Buka langkah 2, Penempatan Awal"
              aria-current={step === 2 ? "step" : undefined}
              className="flex min-h-12 items-center gap-3 rounded-lg text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-wait"
            >
              <span
                className={`flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${step === 2 ? "bg-primary text-primary-foreground" : "bg-[#E6E8EA] text-[#5D5F6B]"}`}
              >
                2
              </span>
              <span className="hidden min-w-0 sm:block">
                <span className="block text-sm font-semibold text-[#191C1E]">
                  Penempatan Awal
                </span>
                <span className="mt-0.5 block text-xs text-[#6B6D7A]">
                  Informasi karier dan rencana
                </span>
              </span>
            </button>
          </li>
        </ol>

        <fieldset disabled={isSubmitting}>
          {step === 1 ? (
            <section aria-labelledby="identity-step-heading">
              <div className="mb-6 flex items-start gap-3 border-b border-slate-200 pb-5">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <DashboardIcon name="user" className="size-5" />
                </span>
                <div>
                  <h2
                    id="identity-step-heading"
                    className="type-section-title text-[#172B3A]"
                  >
                    Identitas Alumni
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-[#6B6D7A]">
                    Masukkan data dasar yang menjadi identitas utama alumni.
                  </p>
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="registration-full-name">
                    Nama lengkap (wajib)
                  </Label>
                  <Input
                    id="registration-full-name"
                    {...register("identity.full_name")}
                    placeholder="Nama lengkap sesuai data sekolah"
                    maxLength={150}
                    autoComplete="name"
                    className="min-h-12 bg-white"
                    aria-invalid={!!errors.identity?.full_name}
                    aria-describedby={
                      errors.identity?.full_name ? "full-name-error" : undefined
                    }
                  />
                  {errors.identity?.full_name && (
                    <p id="full-name-error" className="text-sm text-red-800">
                      {errors.identity.full_name.message}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="registration-year">
                    Tahun kelulusan (wajib)
                  </Label>
                  <Input
                    id="registration-year"
                    {...register("identity.graduation_year", {
                      valueAsNumber: true,
                    })}
                    type="number"
                    inputMode="numeric"
                    placeholder="Contoh: 2024"
                    min={1990}
                    max={2100}
                    className="min-h-12 bg-white"
                    aria-invalid={!!errors.identity?.graduation_year}
                    aria-describedby={
                      errors.identity?.graduation_year
                        ? "graduation-year-error"
                        : undefined
                    }
                  />
                  {errors.identity?.graduation_year && (
                    <p
                      id="graduation-year-error"
                      className="text-sm text-red-800"
                    >
                      {errors.identity.graduation_year.message}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="registration-major">Jurusan (wajib)</Label>
                  <Input
                    id="registration-major"
                    {...register("identity.major")}
                    placeholder="Contoh: Teknik Kendaraan Ringan"
                    maxLength={150}
                    className="min-h-12 bg-white"
                    aria-invalid={!!errors.identity?.major}
                    aria-describedby={
                      errors.identity?.major ? "major-error" : undefined
                    }
                  />
                  {errors.identity?.major && (
                    <p id="major-error" className="text-sm text-red-800">
                      {errors.identity.major.message}
                    </p>
                  )}
                </div>
              </div>
            </section>
          ) : (
            <section aria-labelledby="placement-step-heading">
              <div className="mb-6 flex items-start gap-3 border-b border-slate-200 pb-5">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
                  <DashboardIcon name="briefcase" className="size-5" />
                </span>
                <div>
                  <h2
                    id="placement-step-heading"
                    className="type-section-title text-[#172B3A]"
                  >
                    Penempatan Awal
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-[#6B6D7A]">
                    Catat tujuan dan kondisi penempatan alumni saat ini.
                  </p>
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="registration-country">
                    Negara tujuan (wajib)
                  </Label>
                  <Controller
                    name="placement.destination_country"
                    control={control}
                    render={({ field }) => (
                      <CountryCombobox
                        ref={field.ref}
                        id="registration-country"
                        value={field.value}
                        onValueChange={(value) => {
                          field.onChange(value);
                          clearErrors("placement.destination_country");
                          setResult(null);
                        }}
                        onBlur={() => {
                          field.onBlur();
                          validateDestinationCountry();
                        }}
                        disabled={isSubmitting}
                        invalid={!!errors.placement?.destination_country}
                        describedBy={
                          errors.placement?.destination_country
                            ? "country-error"
                            : undefined
                        }
                        required
                      />
                    )}
                  />
                  {errors.placement?.destination_country && (
                    <p id="country-error" className="text-sm text-red-800">
                      {errors.placement.destination_country.message}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="registration-status">
                    Status awal (wajib)
                  </Label>
                  <select
                    id="registration-status"
                    value={status}
                    onChange={(event) =>
                      changeStatus(event.target.value as PlacementStatus)
                    }
                    className="form-control block min-h-12"
                  >
                    {Object.entries(statusLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="registration-company">Perusahaan</Label>
                  <Input
                    id="registration-company"
                    {...register("placement.company_name")}
                    placeholder="Nama perusahaan jika sudah diketahui"
                    maxLength={200}
                    className="min-h-12 bg-white"
                    aria-invalid={!!errors.placement?.company_name}
                    aria-describedby={
                      errors.placement?.company_name
                        ? "company-error"
                        : undefined
                    }
                  />
                  {errors.placement?.company_name && (
                    <p id="company-error" className="text-sm text-red-800">
                      {errors.placement.company_name.message}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="registration-sector">Sektor pekerjaan</Label>
                  <Input
                    id="registration-sector"
                    {...register("placement.work_sector")}
                    placeholder="Contoh: Manufaktur"
                    maxLength={150}
                    className="min-h-12 bg-white"
                    aria-invalid={!!errors.placement?.work_sector}
                    aria-describedby={
                      errors.placement?.work_sector ? "sector-error" : undefined
                    }
                  />
                  {errors.placement?.work_sector && (
                    <p id="sector-error" className="text-sm text-red-800">
                      {errors.placement.work_sector.message}
                    </p>
                  )}
                </div>
                {dateField && (
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor={`registration-${dateField.name}`}>
                      {dateField.label}
                    </Label>
                    <Input
                      id={`registration-${dateField.name}`}
                      {...register(`placement.${dateField.name}`)}
                      type="date"
                      className="min-h-12 bg-white"
                      aria-invalid={!!dateError}
                      aria-describedby={
                        dateError ? "placement-date-error" : undefined
                      }
                    />
                    {dateError && (
                      <p
                        id="placement-date-error"
                        className="text-sm text-red-800"
                      >
                        {dateError.message}
                      </p>
                    )}
                  </div>
                )}

                {status !== "persiapan_berangkat" && (
                  <div className="sm:col-span-2">
                    <label className="flex min-h-11 items-start gap-3 rounded-lg border border-slate-200 bg-[#F7F9FC] p-4 text-sm leading-6 text-[#444653]">
                      <input
                        type="checkbox"
                        {...register("placement.confirm_existing_condition")}
                        className="mt-0.5 size-5 shrink-0 accent-primary"
                        aria-invalid={
                          !!errors.placement?.confirm_existing_condition
                        }
                        aria-describedby={
                          errors.placement?.confirm_existing_condition
                            ? "condition-error"
                            : undefined
                        }
                      />
                      Saya memastikan status ini sesuai kondisi alumni saat
                      pertama kali dicatat, bukan perubahan status penempatan
                      yang sudah ada.
                    </label>
                    {errors.placement?.confirm_existing_condition && (
                      <p
                        id="condition-error"
                        className="mt-2 text-sm text-red-800"
                      >
                        {errors.placement.confirm_existing_condition.message}
                      </p>
                    )}
                  </div>
                )}
              </div>
              <p className="mt-5 text-sm leading-6 text-[#6B6D7A]">
                Tanggal bersifat opsional dan hanya ditampilkan ketika sesuai
                dengan status awal yang dipilih.
              </p>
            </section>
          )}
        </fieldset>

        {result && !result.success && (
          <div
            role="alert"
            className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-900"
          >
            <p>{result.message}</p>
            {!result.success && result.identitySaved && result.id && (
              <Link
                href={`/dashboard/alumni/${result.id}`}
                className="mt-2 inline-flex min-h-11 items-center font-semibold underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-800"
              >
                Buka detail alumni
              </Link>
            )}
          </div>
        )}

        <div className="mt-7 flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
          {step === 1 ? (
            <Button
              asChild
              variant="outline"
              className="min-h-12 border-slate-300 bg-white px-6"
            >
              <Link href={destination}>Batal</Link>
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep(1)}
              disabled={isSubmitting}
              className="min-h-12 border-slate-300 bg-white px-6"
            >
              Kembali ke identitas
            </Button>
          )}

          {step === 1 ? (
            <Button
              key="advance-placement"
              type="button"
              onClick={advanceToPlacement}
              className="min-h-12 px-6"
            >
              Lanjut ke penempatan
            </Button>
          ) : (
            <Button
              key="save-registration"
              type="submit"
              disabled={isSubmitting}
              className="min-h-12 px-7"
            >
              {isSubmitting && <LoadingIndicator size="sm" />}
              {isSubmitting
                ? "Menyimpan alumni..."
                : savedAlumniId
                  ? "Coba simpan penempatan"
                  : "Simpan Alumni"}
            </Button>
          )}
        </div>
      </form>

      <aside
        aria-labelledby="registration-summary-heading"
        className="min-w-0 rounded-xl border bg-card p-5 xl:sticky xl:top-0"
      >
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-white">
            <DashboardIcon name="clipboard" className="size-5" />
          </span>
          <div>
            <h2
              id="registration-summary-heading"
              className="type-section-title text-[#172B3A]"
            >
              Ringkasan Input
            </h2>
            <p className="mt-1 text-sm leading-6 text-[#6B6D7A]">
              Informasi akan diperbarui saat Anda mengisi formulir.
            </p>
          </div>
        </div>

        <dl className="mt-5 divide-y divide-slate-200 rounded-xl bg-[#F7F9FC] px-4">
          <SummaryRow icon="alumni" label="Sekolah" value={schoolName} />
          <SummaryRow
            icon="user"
            label="Nama alumni"
            value={identity?.full_name?.trim()}
          />
          <SummaryRow icon="alumni" label="Tahun kelulusan" value={year} />
          <SummaryRow
            icon="clipboard"
            label="Jurusan"
            value={identity?.major?.trim()}
          />
          <SummaryRow
            icon="plane"
            label="Negara tujuan"
            value={placement?.destination_country}
          />
          <SummaryRow
            icon="briefcase"
            label="Perusahaan"
            value={placement?.company_name?.trim()}
          />
          <SummaryRow
            icon="briefcase"
            label="Sektor pekerjaan"
            value={placement?.work_sector?.trim()}
          />
          {dateField && (
            <SummaryRow
              icon="plane"
              label={dateField.label}
              value={
                placement?.[dateField.name]
                  ? readableDate(placement[dateField.name])
                  : undefined
              }
            />
          )}
        </dl>

        <div className="mt-4 rounded-xl border border-primary/25 bg-primary/5 p-4">
          <p className="type-card-title text-primary">
            {savedAlumniId ? "Identitas tersimpan" : "Belum disimpan"}
          </p>
          <p className="mt-1 text-sm leading-6 text-[#526274]">
            {savedAlumniId
              ? "Identitas tidak akan dibuat ulang saat Anda mencoba menyimpan penempatan kembali."
              : "Data baru dikirim setelah Anda memilih Simpan Alumni pada langkah kedua."}
          </p>
        </div>
      </aside>
    </div>
  );
}

export function AlumniRegistrationForm(
  props: React.ComponentProps<typeof AlumniRegistrationFormContent>,
) {
  return (
    <FormSession>
      <AlumniRegistrationFormContent {...props} />
    </FormSession>
  );
}
