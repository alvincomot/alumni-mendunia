"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { saveActiveStudent } from "@/app/dashboard/murid-aktif/actions";
import { CountryCombobox } from "@/components/alumni/country-combobox";
import { CompleteTrainingDialog } from "@/components/active-students/student-actions";
import { Button } from "@/components/ui/button";
import { FormSession, useFormActivity } from "@/components/ui/form-session";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingIndicator } from "@/components/ui/loading";
import { useToast } from "@/components/ui/toast";
import {
  activeStudentFormSchema,
  trainingStatusLabels,
  type ActiveStudentFormValues,
  type ActiveStudentRecord,
} from "@/lib/active-students/schema";

type EditorMode = "identity" | "program";

function defaults(student: ActiveStudentRecord): ActiveStudentFormValues {
  return {
    full_name: student.full_name,
    skill_concentration: student.skill_concentration,
    grade: student.grade,
    kjp_status:
      student.kjp_status == null ? "" : student.kjp_status ? "ya" : "tidak",
    parent_consent: true,
    training_status: student.training_status,
    provider_name: student.provider_name ?? "",
    placement_status: student.placement_status,
    placement_country: student.placement_country ?? "",
    placement_date: student.placement_date ?? "",
    data_year: student.data_year,
    expected_updated_at: student.updated_at,
  };
}

function ActiveStudentEditForm({
  student,
  mode,
  onCancel,
  onSaved,
}: {
  student: ActiveStudentRecord;
  mode: EditorMode;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const formId = useId();
  const busy = useRef(false);
  const active = useFormActivity();
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const initialValues = defaults(student);
  const {
    register,
    control,
    handleSubmit,
    setError,
    setValue,
    clearErrors,
    watch,
    formState: { errors },
  } = useForm<ActiveStudentFormValues>({ defaultValues: initialValues });
  const placementStatus = watch("placement_status");

  useEffect(() => {
    if (mode !== "program" || placementStatus !== "belum") return;
    setValue("placement_country", "", { shouldValidate: false });
    setValue("placement_date", "", { shouldValidate: false });
    clearErrors(["placement_country", "placement_date"]);
  }, [clearErrors, mode, placementStatus, setValue]);

  function clearField(name: keyof ActiveStudentFormValues) {
    clearErrors(name);
    setMessage("");
  }

  const error = (field: keyof ActiveStudentFormValues) =>
    errors[field]?.message ? String(errors[field]?.message) : undefined;

  async function submit(values: ActiveStudentFormValues) {
    if (busy.current) return;
    const submission: ActiveStudentFormValues = {
      ...initialValues,
      ...values,
      parent_consent: true,
      data_year: student.data_year,
      expected_updated_at: student.updated_at,
    };
    const parsed = activeStudentFormSchema.safeParse(submission);
    if (!parsed.success) {
      const relevantFields = new Set<keyof ActiveStudentFormValues>(
        mode === "identity"
          ? ["full_name", "skill_concentration", "grade", "kjp_status"]
          : [
              "training_status",
              "provider_name",
              "placement_status",
              "placement_country",
              "placement_date",
            ],
      );
      const relevantIssues = parsed.error.issues.filter((issue) =>
        relevantFields.has(issue.path[0] as keyof ActiveStudentFormValues),
      );
      for (const issue of relevantIssues) {
        setError(
          issue.path[0] as keyof ActiveStudentFormValues,
          { message: issue.message },
          { shouldFocus: true },
        );
      }
      setMessage(
        relevantIssues[0]?.message ??
          "Data tersimpan sebelumnya belum lengkap. Muat ulang halaman dan coba kembali.",
      );
      return;
    }

    busy.current = true;
    setPending(true);
    setMessage("");
    try {
      const result = await saveActiveStudent(student.id, submission);
      if (!active.current) return;
      if (result.success) {
        toast(result.message);
        onSaved();
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
      if (active.current) {
        setMessage("Permintaan gagal. Periksa koneksi dan coba kembali.");
      }
    } finally {
      busy.current = false;
      if (active.current) setPending(false);
    }
  }

  return (
    <form
      aria-label={
        mode === "identity"
          ? "Form edit identitas murid"
          : "Form edit pelatihan dan penempatan"
      }
      aria-busy={pending}
      className="mt-6 max-w-3xl space-y-5"
      noValidate
      onSubmit={handleSubmit(submit)}
    >
      <fieldset disabled={pending}>
        {mode === "identity" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor={`${formId}-name`}>Nama murid (wajib)</Label>
              <Input
                {...register("full_name", {
                  onChange: () => clearField("full_name"),
                })}
                id={`${formId}-name`}
                maxLength={150}
                autoFocus
                required
                aria-invalid={Boolean(error("full_name"))}
                aria-describedby={
                  error("full_name") ? `${formId}-name-error` : undefined
                }
              />
              {error("full_name") && (
                <p id={`${formId}-name-error`} className="text-sm text-red-800">
                  {error("full_name")}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${formId}-skill`}>
                Konsentrasi keahlian (wajib)
              </Label>
              <Input
                {...register("skill_concentration", {
                  onChange: () => clearField("skill_concentration"),
                })}
                id={`${formId}-skill`}
                maxLength={150}
                required
                aria-invalid={Boolean(error("skill_concentration"))}
                aria-describedby={
                  error("skill_concentration")
                    ? `${formId}-skill-error`
                    : undefined
                }
              />
              {error("skill_concentration") && (
                <p id={`${formId}-skill-error`} className="text-sm text-red-800">
                  {error("skill_concentration")}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${formId}-grade`}>Kelas (wajib)</Label>
              <select
                {...register("grade", {
                  valueAsNumber: true,
                  onChange: () => clearField("grade"),
                })}
                id={`${formId}-grade`}
                className="form-control"
                required
                aria-invalid={Boolean(error("grade"))}
              >
                {[10, 11, 12, 13].map((grade) => (
                  <option key={grade} value={grade}>
                    Kelas {grade}
                  </option>
                ))}
              </select>
              {error("grade") && (
                <p className="text-sm text-red-800">{error("grade")}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${formId}-kjp`}>Status KJP (wajib)</Label>
              <select
                {...register("kjp_status", {
                  onChange: () => clearField("kjp_status"),
                })}
                id={`${formId}-kjp`}
                className="form-control"
                required
                aria-invalid={Boolean(error("kjp_status"))}
              >
                <option value="">Pilih status KJP</option>
                <option value="ya">Ya</option>
                <option value="tidak">Tidak</option>
              </select>
              {error("kjp_status") && (
                <p className="text-sm text-red-800">{error("kjp_status")}</p>
              )}
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`${formId}-training-status`}>
                Status pelatihan (wajib)
              </Label>
              <select
                {...register("training_status", {
                  onChange: () => clearField("training_status"),
                })}
                id={`${formId}-training-status`}
                className="form-control"
                required
              >
                {Object.entries(trainingStatusLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${formId}-provider`}>
                Nama LKP / Sending Organization / P3MI (wajib)
              </Label>
              <Input
                {...register("provider_name", {
                  onChange: () => clearField("provider_name"),
                })}
                id={`${formId}-provider`}
                maxLength={200}
                required
                aria-invalid={Boolean(error("provider_name"))}
                aria-describedby={
                  error("provider_name")
                    ? `${formId}-provider-error`
                    : undefined
                }
              />
              {error("provider_name") && (
                <p
                  id={`${formId}-provider-error`}
                  className="text-sm text-red-800"
                >
                  {error("provider_name")}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${formId}-placement-status`}>
                Sudah mendapat penempatan? (wajib)
              </Label>
              <select
                {...register("placement_status", {
                  onChange: () => clearField("placement_status"),
                })}
                id={`${formId}-placement-status`}
                className="form-control"
                required
              >
                <option value="belum">Belum</option>
                <option value="sudah">Sudah</option>
              </select>
            </div>
            {placementStatus === "sudah" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor={`${formId}-country`}>
                    Negara penempatan (wajib)
                  </Label>
                  <Controller
                    control={control}
                    name="placement_country"
                    render={({ field }) => (
                      <CountryCombobox
                        id={`${formId}-country`}
                        value={field.value}
                        onValueChange={(value) => {
                          field.onChange(value);
                          clearField("placement_country");
                        }}
                        onBlur={field.onBlur}
                        invalid={Boolean(error("placement_country"))}
                        describedBy={
                          error("placement_country")
                            ? `${formId}-country-error`
                            : undefined
                        }
                        ariaLabel="Negara penempatan"
                        required
                      />
                    )}
                  />
                  {error("placement_country") && (
                    <p
                      id={`${formId}-country-error`}
                      className="text-sm text-red-800"
                    >
                      {error("placement_country")}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`${formId}-placement-date`}>
                    Tanggal penempatan (wajib)
                  </Label>
                  <Input
                    {...register("placement_date", {
                      onChange: () => clearField("placement_date"),
                    })}
                    id={`${formId}-placement-date`}
                    type="date"
                    required
                    aria-invalid={Boolean(error("placement_date"))}
                  />
                  {error("placement_date") && (
                    <p className="text-sm text-red-800">
                      {error("placement_date")}
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </fieldset>

      {message && (
        <p role="alert" className="text-sm text-red-800">
          {message}
        </p>
      )}
      <div className="flex flex-col-reverse gap-3 sm:flex-row">
        <Button type="submit" disabled={pending}>
          {pending && <LoadingIndicator size="sm" />}
          {pending ? "Menyimpan..." : "Simpan perubahan"}
        </Button>
        <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>
          Batal
        </Button>
      </div>
    </form>
  );
}

function InlineStudentEditor({
  student,
  mode,
}: {
  student: ActiveStudentRecord;
  mode: EditorMode;
}) {
  const [open, setOpen] = useState(false);
  const editorId = useId();
  const isIdentity = mode === "identity";
  const triggerLabel = isIdentity
    ? "Edit identitas murid"
    : "Edit pelatihan dan penempatan";

  return (
    <div className="mt-6 border-t pt-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        {!isIdentity && student.training_status === "aktif_pelatihan" && (
          <CompleteTrainingDialog student={student} />
        )}
        <Button
          type="button"
          aria-expanded={open}
          aria-controls={editorId}
          onClick={() => setOpen((value) => !value)}
        >
          {triggerLabel}
        </Button>
      </div>
      {open && (
        <div id={editorId}>
          <FormSession key={`${student.id}-${student.updated_at}-${mode}`}>
            <ActiveStudentEditForm
              student={student}
              mode={mode}
              onCancel={() => setOpen(false)}
              onSaved={() => setOpen(false)}
            />
          </FormSession>
        </div>
      )}
    </div>
  );
}

export function StudentIdentityEditor({
  student,
}: {
  student: ActiveStudentRecord;
}) {
  return <InlineStudentEditor student={student} mode="identity" />;
}

export function StudentProgramEditor({
  student,
}: {
  student: ActiveStudentRecord;
}) {
  return <InlineStudentEditor student={student} mode="program" />;
}
