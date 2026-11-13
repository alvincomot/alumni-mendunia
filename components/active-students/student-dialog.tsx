"use client";

import { useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { saveActiveStudent } from "@/app/dashboard/murid-aktif/actions";
import { CountryCombobox } from "@/components/alumni/country-combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingIndicator } from "@/components/ui/loading";
import { FormSession, useFormActivity } from "@/components/ui/form-session";
import { useToast } from "@/components/ui/toast";
import {
  activeStudentFormSchema,
  trainingStatusLabels,
  type ActiveStudentFormValues,
  type ActiveStudentRecord,
} from "@/lib/active-students/schema";

type SchoolIdentity = { name: string; npsn: string };

function defaults(
  student: ActiveStudentRecord | undefined,
): ActiveStudentFormValues {
  return {
    full_name: student?.full_name ?? "",
    skill_concentration: student?.skill_concentration ?? "",
    grade: student?.grade ?? 10,
    kjp_status:
      student?.kjp_status == null ? "" : student.kjp_status ? "ya" : "tidak",
    parent_consent: student?.parent_consent ?? false,
    training_status: student?.training_status ?? "belum_pelatihan",
    provider_name: student?.provider_name ?? "",
    placement_status: student?.placement_status ?? "belum",
    placement_country: student?.placement_country ?? "",
    placement_date: student?.placement_date ?? "",
    data_year: student?.data_year ?? new Date().getFullYear(),
    expected_updated_at: student?.updated_at,
  };
}

function StudentDialogContent({
  student,
  school,
  triggerLabel,
}: {
  student?: ActiveStudentRecord;
  school: SchoolIdentity;
  triggerLabel?: string;
}) {
  const [dialogElement, setDialogElement] = useState<HTMLDialogElement | null>(null);
  const busy = useRef(false);
  const router = useRouter();
  const active = useFormActivity();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const identity = `active-student-${student?.id ?? "new"}`;
  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    setValue,
    clearErrors,
    watch,
    formState: { errors },
  } = useForm<ActiveStudentFormValues>({ defaultValues: defaults(student) });
  const placementStatus = watch("placement_status");

  useEffect(() => {
    if (placementStatus !== "belum") return;
    setValue("placement_country", "", { shouldValidate: false });
    setValue("placement_date", "", { shouldValidate: false });
    clearErrors(["placement_country", "placement_date"]);
  }, [placementStatus, setValue, clearErrors]);

  function open() {
    setMessage("");
    reset(defaults(student));
    dialogElement?.showModal();
  }

  function clearField(name: keyof ActiveStudentFormValues) {
    clearErrors(name);
    setMessage("");
  }

  async function submit(values: ActiveStudentFormValues) {
    if (busy.current) return;
    const submission = {
      ...values,
      parent_consent: student ? true : values.parent_consent,
    };
    const parsed = activeStudentFormSchema.safeParse(submission);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof ActiveStudentFormValues;
        setError(field, { message: issue.message }, { shouldFocus: true });
      }
      return;
    }

    busy.current = true;
    setPending(true);
    setMessage("");
    try {
      const result = await saveActiveStudent(student?.id ?? null, submission);
      if (!active.current) return;
      if (result.success) {
        toast(result.message);
        dialogElement?.close();
        reset(defaults(undefined));
        router.refresh();
        return;
      }
      if (result.fieldErrors) {
        for (const [field, messages] of Object.entries(result.fieldErrors)) {
          setError(field as keyof ActiveStudentFormValues, {
            message: messages[0],
          });
        }
      }
      setMessage(result.message);
      if (result.refresh) router.refresh();
    } catch {
      if (active.current)
        setMessage("Permintaan gagal. Periksa koneksi dan coba kembali.");
    } finally {
      busy.current = false;
      if (active.current) setPending(false);
    }
  }

  const error = (field: keyof ActiveStudentFormValues) =>
    errors[field]?.message ? String(errors[field]?.message) : undefined;

  return (
    <>
      <Button
        type="button"
        onClick={open}
        variant={student ? "outline" : "default"}
        aria-label={student ? `Edit ${student.full_name}` : "Tambah murid"}
      >
        {triggerLabel ?? (student ? "Edit" : "Tambah Murid")}
      </Button>
      <dialog
        ref={setDialogElement}
        aria-labelledby={`${identity}-title`}
        onCancel={(event) => {
          if (busy.current) event.preventDefault();
        }}
        className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto rounded-xl border bg-card p-5 text-foreground backdrop:bg-slate-950/45 sm:p-6"
      >
        <div className="pr-12">
          <h2 id={`${identity}-title`} className="type-section-title text-primary">
            {student ? "Edit data murid" : "Tambah murid aktif"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Data sekolah ditetapkan otomatis dari akun Petugas Sekolah.
          </p>
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Tutup dialog"
          disabled={pending}
          onClick={() => dialogElement?.close()}
          className="absolute right-3 top-3"
        >
          <span aria-hidden="true" className="text-xl leading-none">×</span>
        </Button>

        <form
          onSubmit={handleSubmit(submit)}
          noValidate
          aria-busy={pending}
          className="mt-6 space-y-6"
        >
          <fieldset disabled={pending} className="space-y-6">
            <section aria-labelledby={`${identity}-school`}>
              <h3 id={`${identity}-school`} className="type-card-title text-primary">
                Identitas sekolah
              </h3>
              <dl className="mt-3 grid gap-3 rounded-xl border bg-secondary/50 p-4 sm:grid-cols-2">
                <div>
                  <dt className="type-meta text-muted-foreground">NPSN</dt>
                  <dd className="mt-1 font-semibold tabular-nums">{school.npsn}</dd>
                </div>
                <div>
                  <dt className="type-meta text-muted-foreground">Nama sekolah</dt>
                  <dd className="mt-1 font-semibold">{school.name}</dd>
                </div>
              </dl>
            </section>

            <section aria-labelledby={`${identity}-identity`}>
              <h3 id={`${identity}-identity`} className="type-card-title text-primary">
                Identitas murid
              </h3>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor={`${identity}-name`}>Nama murid (wajib)</Label>
                  <Input
                    {...register("full_name", { onChange: () => clearField("full_name") })}
                    id={`${identity}-name`}
                    maxLength={150}
                    autoFocus
                    required
                    aria-invalid={Boolean(error("full_name"))}
                    aria-describedby={error("full_name") ? `${identity}-name-error` : undefined}
                  />
                  {error("full_name") && <p id={`${identity}-name-error`} className="text-sm text-red-800">{error("full_name")}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`${identity}-skill`}>Konsentrasi keahlian (wajib)</Label>
                  <Input
                    {...register("skill_concentration", { onChange: () => clearField("skill_concentration") })}
                    id={`${identity}-skill`}
                    maxLength={150}
                    required
                    aria-invalid={Boolean(error("skill_concentration"))}
                    aria-describedby={error("skill_concentration") ? `${identity}-skill-error` : undefined}
                  />
                  {error("skill_concentration") && <p id={`${identity}-skill-error`} className="text-sm text-red-800">{error("skill_concentration")}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`${identity}-grade`}>Kelas (wajib)</Label>
                  <select
                    {...register("grade", { onChange: () => clearField("grade") })}
                    id={`${identity}-grade`}
                    className="form-control"
                    aria-invalid={Boolean(error("grade"))}
                  >
                    {[10, 11, 12, 13].map((grade) => <option key={grade} value={grade}>Kelas {grade}</option>)}
                  </select>
                  {error("grade") && <p className="text-sm text-red-800">{error("grade")}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`${identity}-kjp`}>Status KJP (opsional)</Label>
                  <select {...register("kjp_status")} id={`${identity}-kjp`} className="form-control">
                    <option value="">Belum dicatat</option>
                    <option value="ya">Ya</option>
                    <option value="tidak">Tidak</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`${identity}-year`}>Tahun Pendataan (wajib)</Label>
                  <Input
                    {...register("data_year", { valueAsNumber: true, onChange: () => clearField("data_year") })}
                    id={`${identity}-year`}
                    type="number"
                    min={2000}
                    max={2100}
                    readOnly={Boolean(student)}
                    required
                    aria-invalid={Boolean(error("data_year"))}
                  />
                  <p className="type-meta text-muted-foreground">
                    {student ? "Tahun pertama pendataan tidak dapat diubah." : "Gunakan tahun kalender empat digit."}
                  </p>
                  {error("data_year") && <p className="text-sm text-red-800">{error("data_year")}</p>}
                </div>
              </div>
            </section>

            <section aria-labelledby={`${identity}-training`}>
              <h3 id={`${identity}-training`} className="type-card-title text-primary">
                Pelatihan dan penempatan
              </h3>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={`${identity}-training-status`}>Status pelatihan (wajib)</Label>
                  <select
                    {...register("training_status")}
                    id={`${identity}-training-status`}
                    className="form-control"
                  >
                    {Object.entries(trainingStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`${identity}-provider`}>Nama LKP / Sending Organization / P3MI</Label>
                  <Input {...register("provider_name")} id={`${identity}-provider`} maxLength={200} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`${identity}-placement-status`}>Sudah mendapat penempatan? (wajib)</Label>
                  <select
                    {...register("placement_status")}
                    id={`${identity}-placement-status`}
                    className="form-control"
                  >
                    <option value="belum">Belum</option>
                    <option value="sudah">Sudah</option>
                  </select>
                </div>
                {placementStatus === "sudah" && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor={`${identity}-country`}>Negara penempatan (wajib)</Label>
                      <Controller
                        control={control}
                        name="placement_country"
                        render={({ field }) => (
                          <CountryCombobox
                            id={`${identity}-country`}
                            value={field.value}
                            onValueChange={(value) => {
                              field.onChange(value);
                              clearField("placement_country");
                            }}
                            onBlur={field.onBlur}
                            invalid={Boolean(error("placement_country"))}
                            describedBy={error("placement_country") ? `${identity}-country-error` : undefined}
                            ariaLabel="Negara penempatan"
                            portalContainer={dialogElement}
                            required
                          />
                        )}
                      />
                      {error("placement_country") && <p id={`${identity}-country-error`} className="text-sm text-red-800">{error("placement_country")}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`${identity}-placement-date`}>Tanggal penempatan (wajib)</Label>
                      <Input
                        {...register("placement_date", { onChange: () => clearField("placement_date") })}
                        id={`${identity}-placement-date`}
                        type="date"
                        required
                        aria-invalid={Boolean(error("placement_date"))}
                      />
                      {error("placement_date") && <p className="text-sm text-red-800">{error("placement_date")}</p>}
                    </div>
                  </>
                )}
              </div>
            </section>

            <section className="rounded-xl border p-4" aria-labelledby={`${identity}-consent-title`}>
              <h3 id={`${identity}-consent-title`} className="type-card-title text-primary">Persetujuan orang tua/wali</h3>
              <label className="mt-3 flex cursor-pointer items-start gap-3 text-sm leading-6">
                <input
                  {...register("parent_consent", { onChange: () => clearField("parent_consent") })}
                  type="checkbox"
                  disabled={Boolean(student) || pending}
                  className="mt-1 size-5 shrink-0 accent-[#087E8B]"
                  aria-invalid={Boolean(error("parent_consent"))}
                />
                <span>Saya menyatakan bahwa murid ini telah memperoleh persetujuan dari orang tua/wali untuk mengikuti program persiapan kerja ke luar negeri.</span>
              </label>
              {student && <p className="mt-2 type-meta text-muted-foreground">Persetujuan telah dikonfirmasi saat data dibuat dan tidak dapat diubah.</p>}
              {error("parent_consent") && <p className="mt-2 text-sm text-red-800">{error("parent_consent")}</p>}
            </section>
          </fieldset>

          {message && <p role="alert" className="text-sm text-red-800">{message}</p>}
          <div className="flex flex-col-reverse gap-3 border-t pt-5 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" disabled={pending} onClick={() => dialogElement?.close()}>Batal</Button>
            <Button type="submit" disabled={pending}>
              {pending && <LoadingIndicator size="sm" />}
              {pending ? "Menyimpan..." : "Simpan"}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}

export function StudentDialog(
  props: React.ComponentProps<typeof StudentDialogContent>,
) {
  return (
    <FormSession key={props.student?.id ?? "new-active-student"}>
      <StudentDialogContent {...props} />
    </FormSession>
  );
}

