"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Controller, useForm, useWatch, type Path } from "react-hook-form";
import { useRouter } from "next/navigation";
import { saveActiveStudent } from "@/app/dashboard/murid-aktif/actions";
import { CountryCombobox } from "@/components/alumni/country-combobox";
import { DashboardIcon } from "@/components/dashboard-icon";
import { Button } from "@/components/ui/button";
import { FormSession, useFormActivity } from "@/components/ui/form-session";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingIndicator } from "@/components/ui/loading";
import { useToast } from "@/components/ui/toast";
import {
  activeStudentFormSchema,
  activeStudentIdentitySchema,
  placementStatusLabels,
  trainingStatusLabels,
  type ActiveStudentFormValues,
} from "@/lib/active-students/schema";

type SchoolIdentity = { name: string; npsn: string };

function createDefaultValues(): ActiveStudentFormValues {
  return {
    full_name: "",
    skill_concentration: "",
    grade: 10,
    kjp_status: "",
    parent_consent: false,
    training_status: "belum_pelatihan",
    provider_name: "",
    placement_status: "belum",
    placement_country: "",
    placement_date: "",
    data_year: new Date().getFullYear(),
  };
}

function readableDate(value?: string) {
  if (!value) return undefined;
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function SummaryRow({
  icon,
  label,
  value,
}: {
  icon: "user" | "alumni" | "book" | "clipboard" | "briefcase" | "flag" | "calendar";
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

function StudentRegistrationFormContent({
  school,
}: {
  school: SchoolIdentity;
}) {
  const router = useRouter();
  const active = useFormActivity();
  const { toast } = useToast();
  const busy = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [message, setMessage] = useState("");
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
  } = useForm<ActiveStudentFormValues>({
    defaultValues: createDefaultValues(),
  });
  const values = useWatch({ control });
  const placementStatus = values.placement_status ?? "belum";

  useEffect(() => {
    if (placementStatus !== "belum") return;
    setValue("placement_country", "", { shouldValidate: false });
    setValue("placement_date", "", { shouldValidate: false });
    clearErrors(["placement_country", "placement_date"]);
  }, [placementStatus, setValue, clearErrors]);

  function applyIssues(
    issues: { path: PropertyKey[]; message: string }[],
  ) {
    issues.forEach((issue, index) => {
      const field = issue.path.join(".") as Path<ActiveStudentFormValues>;
      setError(field, { message: issue.message }, { shouldFocus: index === 0 });
    });
  }

  function clearField(field: Path<ActiveStudentFormValues>) {
    clearErrors(field);
    setMessage("");
  }

  function advanceToProgram() {
    if (step === 2) return;
    clearErrors();
    const parsed = activeStudentIdentitySchema.safeParse(getValues());
    if (!parsed.success) {
      applyIssues(parsed.error.issues);
      return;
    }
    setMessage("");
    setStep(2);
  }

  async function submit(input: ActiveStudentFormValues) {
    if (busy.current) return;
    clearErrors();
    const parsed = activeStudentFormSchema.safeParse(input);
    if (!parsed.success) {
      applyIssues(parsed.error.issues);
      const identityFields = new Set([
        "full_name",
        "skill_concentration",
        "grade",
        "kjp_status",
        "data_year",
      ]);
      if (parsed.error.issues.some((issue) => identityFields.has(String(issue.path[0]))))
        setStep(1);
      return;
    }

    busy.current = true;
    setSubmitting(true);
    setMessage("");
    try {
      const result = await saveActiveStudent(null, input);
      if (!active.current) return;
      if (result.success) {
        reset(createDefaultValues());
        setStep(1);
        toast(result.message, {
          destination: "/dashboard/murid-aktif",
          action: {
            label: "Tambah Murid Lagi",
            href: "/dashboard/murid-aktif/new",
          },
        });
        router.replace("/dashboard/murid-aktif");
        router.refresh();
        return;
      }
      if (result.fieldErrors) {
        const identityFields = new Set([
          "full_name",
          "skill_concentration",
          "grade",
          "kjp_status",
          "data_year",
        ]);
        for (const [field, messages] of Object.entries(result.fieldErrors)) {
          setError(field as Path<ActiveStudentFormValues>, {
            message: messages[0],
          });
        }
        if (Object.keys(result.fieldErrors).some((field) => identityFields.has(field)))
          setStep(1);
      }
      setMessage(result.message);
    } catch {
      if (active.current)
        setMessage(
          "Koneksi terputus. Periksa daftar murid sebelum mencoba kembali untuk menghindari duplikasi.",
        );
    } finally {
      busy.current = false;
      if (active.current) setSubmitting(false);
    }
  }

  function onFormSubmit(event: FormEvent<HTMLFormElement>) {
    if (step === 1) {
      event.preventDefault();
      advanceToProgram();
      return;
    }
    void handleSubmit(submit)(event);
  }

  const kjpLabel =
    values.kjp_status === "ya"
      ? "Ya"
      : values.kjp_status === "tidak"
        ? "Tidak"
        : "Belum dicatat";
  const trainingLabel = values.training_status
    ? trainingStatusLabels[values.training_status]
    : undefined;
  const placementLabel = placementStatusLabels[placementStatus];
  const dataYear =
    typeof values.data_year === "number" && Number.isInteger(values.data_year)
      ? values.data_year
      : undefined;

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)]">
      <form
        onSubmit={onFormSubmit}
        noValidate
        aria-busy={submitting}
        className="min-w-0 rounded-xl border bg-card p-5 sm:p-7"
      >
        <ol
          aria-label="Tahap pendataan murid aktif"
          className="mx-auto mb-7 grid w-full max-w-[39rem] grid-cols-[max-content_minmax(0,1fr)_max-content] items-start gap-x-3 sm:gap-x-4"
        >
          <li className="min-w-0">
            <button
              type="button"
              onClick={() => setStep(1)}
              disabled={submitting}
              aria-label="Buka langkah 1, Identitas Murid"
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
                  Identitas Murid
                </span>
                <span className="mt-0.5 block text-xs text-[#6B6D7A]">
                  Data dasar murid
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
              onClick={advanceToProgram}
              disabled={submitting}
              aria-label="Buka langkah 2, Pelatihan dan Penempatan"
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
                  Pelatihan dan Penempatan
                </span>
                <span className="mt-0.5 block text-xs text-[#6B6D7A]">
                  Kesiapan program murid
                </span>
              </span>
            </button>
          </li>
        </ol>

        <fieldset disabled={submitting}>
          {step === 1 ? (
            <section aria-labelledby="student-identity-step-heading">
              <div className="mb-6 flex items-start gap-3 border-b border-slate-200 pb-5">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <DashboardIcon name="user" className="size-5" />
                </span>
                <div>
                  <h2
                    id="student-identity-step-heading"
                    className="type-section-title text-[#172B3A]"
                  >
                    Identitas Murid
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-[#6B6D7A]">
                    Masukkan data dasar murid yang mengikuti program persiapan kerja luar negeri.
                  </p>
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="active-student-full-name">Nama murid (wajib)</Label>
                  <Input
                    id="active-student-full-name"
                    {...register("full_name", {
                      onChange: () => clearField("full_name"),
                    })}
                    placeholder="Nama lengkap sesuai data sekolah"
                    maxLength={150}
                    autoFocus
                    className="min-h-12 bg-white"
                    aria-invalid={Boolean(errors.full_name)}
                    aria-describedby={errors.full_name ? "active-student-full-name-error" : undefined}
                  />
                  {errors.full_name && (
                    <p id="active-student-full-name-error" className="text-sm text-red-800">
                      {errors.full_name.message}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="active-student-skill">Konsentrasi keahlian (wajib)</Label>
                  <Input
                    id="active-student-skill"
                    {...register("skill_concentration", {
                      onChange: () => clearField("skill_concentration"),
                    })}
                    placeholder="Contoh: Teknik Kendaraan Ringan"
                    maxLength={150}
                    className="min-h-12 bg-white"
                    aria-invalid={Boolean(errors.skill_concentration)}
                    aria-describedby={errors.skill_concentration ? "active-student-skill-error" : undefined}
                  />
                  {errors.skill_concentration && (
                    <p id="active-student-skill-error" className="text-sm text-red-800">
                      {errors.skill_concentration.message}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="active-student-grade">Kelas (wajib)</Label>
                  <select
                    id="active-student-grade"
                    {...register("grade", {
                      valueAsNumber: true,
                      onChange: () => clearField("grade"),
                    })}
                    className="form-control block min-h-12"
                    aria-invalid={Boolean(errors.grade)}
                  >
                    {[10, 11, 12, 13].map((grade) => (
                      <option key={grade} value={grade}>
                        Kelas {grade}
                      </option>
                    ))}
                  </select>
                  {errors.grade && <p className="text-sm text-red-800">{errors.grade.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="active-student-kjp">Status KJP (opsional)</Label>
                  <select
                    id="active-student-kjp"
                    {...register("kjp_status")}
                    className="form-control block min-h-12"
                  >
                    <option value="">Belum dicatat</option>
                    <option value="ya">Ya</option>
                    <option value="tidak">Tidak</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="active-student-year">Tahun Pendataan (wajib)</Label>
                  <Input
                    id="active-student-year"
                    {...register("data_year", {
                      valueAsNumber: true,
                      onChange: () => clearField("data_year"),
                    })}
                    type="number"
                    inputMode="numeric"
                    min={2000}
                    max={2100}
                    className="min-h-12 bg-white"
                    aria-invalid={Boolean(errors.data_year)}
                    aria-describedby={errors.data_year ? "active-student-year-error" : "active-student-year-help"}
                  />
                  <p id="active-student-year-help" className="type-meta text-muted-foreground">
                    Gunakan tahun kalender empat digit.
                  </p>
                  {errors.data_year && (
                    <p id="active-student-year-error" className="text-sm text-red-800">
                      {errors.data_year.message}
                    </p>
                  )}
                </div>
              </div>
            </section>
          ) : (
            <section aria-labelledby="student-program-step-heading">
              <div className="mb-6 flex items-start gap-3 border-b border-slate-200 pb-5">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
                  <DashboardIcon name="briefcase" className="size-5" />
                </span>
                <div>
                  <h2
                    id="student-program-step-heading"
                    className="type-section-title text-[#172B3A]"
                  >
                    Pelatihan dan Penempatan
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-[#6B6D7A]">
                    Catat kesiapan pelatihan, lembaga pendamping, dan penempatan murid.
                  </p>
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="active-student-training">Status pelatihan (wajib)</Label>
                  <select
                    id="active-student-training"
                    {...register("training_status")}
                    className="form-control block min-h-12"
                  >
                    {Object.entries(trainingStatusLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="active-student-provider">
                    Nama LKP / Sending Organization / P3MI
                  </Label>
                  <Input
                    id="active-student-provider"
                    {...register("provider_name")}
                    placeholder="Masukkan nama lembaga jika ada"
                    maxLength={200}
                    className="min-h-12 bg-white"
                    aria-invalid={Boolean(errors.provider_name)}
                  />
                  {errors.provider_name && (
                    <p className="text-sm text-red-800">{errors.provider_name.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="active-student-placement">Sudah mendapat penempatan? (wajib)</Label>
                  <select
                    id="active-student-placement"
                    {...register("placement_status")}
                    className="form-control block min-h-12"
                  >
                    <option value="belum">Belum</option>
                    <option value="sudah">Sudah</option>
                  </select>
                </div>
                {placementStatus === "sudah" && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="active-student-country">Negara penempatan (wajib)</Label>
                      <Controller
                        name="placement_country"
                        control={control}
                        render={({ field }) => (
                          <CountryCombobox
                            ref={field.ref}
                            id="active-student-country"
                            value={field.value}
                            onValueChange={(value) => {
                              field.onChange(value);
                              clearField("placement_country");
                            }}
                            onBlur={field.onBlur}
                            disabled={submitting}
                            invalid={Boolean(errors.placement_country)}
                            describedBy={errors.placement_country ? "active-student-country-error" : undefined}
                            ariaLabel="Negara penempatan"
                            required
                          />
                        )}
                      />
                      {errors.placement_country && (
                        <p id="active-student-country-error" className="text-sm text-red-800">
                          {errors.placement_country.message}
                        </p>
                      )}
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="active-student-placement-date">Tanggal penempatan (wajib)</Label>
                      <Input
                        id="active-student-placement-date"
                        {...register("placement_date", {
                          onChange: () => clearField("placement_date"),
                        })}
                        type="date"
                        className="min-h-12 bg-white"
                        aria-invalid={Boolean(errors.placement_date)}
                        aria-describedby={errors.placement_date ? "active-student-placement-date-error" : undefined}
                      />
                      {errors.placement_date && (
                        <p id="active-student-placement-date-error" className="text-sm text-red-800">
                          {errors.placement_date.message}
                        </p>
                      )}
                    </div>
                  </>
                )}
                <div className="sm:col-span-2">
                  <label className="flex min-h-11 items-start gap-3 rounded-lg border border-slate-200 bg-[#F7F9FC] p-4 text-sm leading-6 text-[#444653]">
                    <input
                      type="checkbox"
                      {...register("parent_consent", {
                        onChange: () => clearField("parent_consent"),
                      })}
                      className="mt-0.5 size-5 shrink-0 accent-primary"
                      aria-invalid={Boolean(errors.parent_consent)}
                      aria-describedby={errors.parent_consent ? "active-student-consent-error" : undefined}
                    />
                    Saya menyatakan bahwa murid ini telah memperoleh persetujuan dari orang tua/wali untuk mengikuti program persiapan kerja ke luar negeri.
                  </label>
                  {errors.parent_consent && (
                    <p id="active-student-consent-error" className="mt-2 text-sm text-red-800">
                      {errors.parent_consent.message}
                    </p>
                  )}
                </div>
              </div>
            </section>
          )}
        </fieldset>

        {message && (
          <div
            role="alert"
            className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-900"
          >
            {message}
          </div>
        )}

        <div className="mt-7 flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
          {step === 1 ? (
            <Button asChild variant="outline" className="min-h-12 border-slate-300 bg-white px-6">
              <Link href="/dashboard/murid-aktif">Batal</Link>
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep(1)}
              disabled={submitting}
              className="min-h-12 border-slate-300 bg-white px-6"
            >
              Kembali ke identitas
            </Button>
          )}

          {step === 1 ? (
            <Button type="button" onClick={advanceToProgram} className="min-h-12 px-6">
              Lanjut ke pelatihan
            </Button>
          ) : (
            <Button type="submit" disabled={submitting} className="min-h-12 px-7">
              {submitting && <LoadingIndicator size="sm" />}
              {submitting ? "Menyimpan murid..." : "Simpan Murid"}
            </Button>
          )}
        </div>
      </form>

      <aside
        aria-labelledby="active-student-summary-heading"
        className="min-w-0 rounded-xl border bg-card p-5 xl:sticky xl:top-0"
      >
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-white">
            <DashboardIcon name="clipboard" className="size-5" />
          </span>
          <div>
            <h2 id="active-student-summary-heading" className="type-section-title text-[#172B3A]">
              Ringkasan Input
            </h2>
            <p className="mt-1 text-sm leading-6 text-[#6B6D7A]">
              Informasi akan diperbarui saat Anda mengisi formulir.
            </p>
          </div>
        </div>

        <dl className="mt-5 divide-y divide-slate-200 rounded-xl bg-[#F7F9FC] px-4">
          <SummaryRow icon="alumni" label="Sekolah" value={school.name} />
          <SummaryRow icon="user" label="Nama murid" value={values.full_name?.trim()} />
          <SummaryRow icon="book" label="Konsentrasi" value={values.skill_concentration?.trim()} />
          <SummaryRow icon="clipboard" label="Kelas" value={values.grade ? `Kelas ${values.grade}` : undefined} />
          <SummaryRow icon="clipboard" label="Status KJP" value={kjpLabel} />
          <SummaryRow icon="calendar" label="Tahun Pendataan" value={dataYear} />
          <SummaryRow icon="briefcase" label="Status pelatihan" value={trainingLabel} />
          {values.provider_name?.trim() && (
            <SummaryRow icon="briefcase" label="LKP / SO / P3MI" value={values.provider_name.trim()} />
          )}
          <SummaryRow icon="flag" label="Status penempatan" value={placementLabel} />
          {placementStatus === "sudah" && (
            <>
              <SummaryRow icon="flag" label="Negara" value={values.placement_country} />
              <SummaryRow icon="calendar" label="Tanggal" value={readableDate(values.placement_date)} />
            </>
          )}
        </dl>

        <div className="mt-4 rounded-xl border border-primary/25 bg-primary/5 p-4">
          <p className="type-card-title text-primary">Belum disimpan</p>
          <p className="mt-1 text-sm leading-6 text-[#526274]">
            Data baru dikirim setelah Anda memilih Simpan Murid pada langkah kedua.
          </p>
        </div>
      </aside>
    </div>
  );
}

export function StudentRegistrationForm(
  props: React.ComponentProps<typeof StudentRegistrationFormContent>,
) {
  return (
    <FormSession>
      <StudentRegistrationFormContent {...props} />
    </FormSession>
  );
}
