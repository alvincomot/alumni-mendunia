"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { statusLabels, type PlacementStatus } from "@/lib/alumni/schema";
import {
  statusChangeSchema,
  type StatusChangeInput,
  type StatusChangeResult,
} from "@/lib/alumni/status";
import { changePlacementStatus } from "@/app/dashboard/alumni/status-actions";

const actionLabels = {
  aktif_bekerja: "Konfirmasi Berangkat",
  selesai_kontrak: "Selesaikan Kontrak",
  batal_berangkat: "Batalkan Keberangkatan",
} as const;
type Target = keyof typeof actionLabels;
type Fields = Pick<
  StatusChangeInput,
  "note" | "actual_departure" | "contract_end_date"
>;

export function StatusAction({
  placementId,
  status,
  alumniName,
  context,
}: {
  placementId: string;
  status: PlacementStatus;
  alumniName: string;
  context: "list" | "detail";
}) {
  const router = useRouter();
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const feedback = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<{
    id: string;
    from: PlacementStatus;
    to: Target;
  } | null>(null);
  const [result, setResult] = useState<StatusChangeResult | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<Fields>({
    defaultValues: { note: "", actual_departure: "", contract_end_date: "" },
  });
  const target: Target | null =
    context === "list"
      ? status === "persiapan_berangkat"
        ? "aktif_bekerja"
        : null
      : status === "persiapan_berangkat"
        ? "batal_berangkat"
        : status === "aktif_bekerja"
          ? "selesai_kontrak"
          : null;
  function show() {
    if (!target || busy.current) return;
    setSnapshot({ id: placementId, from: status, to: target });
    reset({ note: "", actual_departure: "", contract_end_date: "" });
    setResult(null);
    setOpen(true);
    dialog.current?.showModal();
    closeButton.current?.focus();
  }
  async function submit(fields: Fields) {
    if (busy.current || !snapshot || result?.success || result?.refresh) return;
    const parsed = statusChangeSchema.safeParse({
      ...fields,
      placement_id: snapshot.id,
      expected_status: snapshot.from,
      new_status: snapshot.to,
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (
          field === "note" ||
          field === "actual_departure" ||
          field === "contract_end_date"
        )
          setError(field, { message: issue.message }, { shouldFocus: true });
      }
      return;
    }
    busy.current = true;
    setPending(true);
    setResult(null);
    try {
      const response = await changePlacementStatus(parsed.data);
      setResult(response);
      if (response.refresh || response.success) router.refresh();
    } catch {
      setResult({
        success: false,
        refresh: true,
        message:
          "Koneksi bermasalah. Tutup dialog dan periksa status terbaru sebelum mencoba kembali.",
      });
      router.refresh();
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  const dateField =
    snapshot?.to === "aktif_bekerja"
      ? "actual_departure"
      : snapshot?.to === "selesai_kontrak"
        ? "contract_end_date"
        : null;
  return (
    <div
      ref={feedback}
      tabIndex={-1}
      className="space-y-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
    >
      {target && (
        <Button
          type="button"
          variant={target === "batal_berangkat" ? "destructive" : "default"}
          className="min-h-11"
          onClick={show}
          aria-label={`${actionLabels[target]}: ${alumniName}`}
        >
          {actionLabels[target]}
        </Button>
      )}
      {!open && result && (
        <p
          role={result.success ? "status" : "alert"}
          className={`max-w-sm text-sm ${result.success ? "text-green-800" : "text-red-800"}`}
        >
          {result.message}
        </p>
      )}
      <dialog
        ref={dialog}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-impact`}
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const controls = event.currentTarget.querySelectorAll<HTMLElement>(
            "button:not(:disabled), input:not(:disabled), textarea:not(:disabled)",
          );
          const first = controls[0];
          const last = controls[controls.length - 1];
          if (!first) event.preventDefault();
          else if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
        onCancel={(event) => {
          if (busy.current) event.preventDefault();
        }}
        onClose={() => {
          setOpen(false);
          feedback.current?.focus();
        }}
        className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-lg border bg-white p-5 text-foreground backdrop:bg-black/40 sm:p-8"
      >
        <h2 id={`${id}-title`} className="text-xl font-semibold text-primary">
          {snapshot ? actionLabels[snapshot.to] : "Ubah status"}
        </h2>
        <p id={`${id}-impact`} className="mt-3 break-words text-sm leading-6">
          {alumniName}:{" "}
          {snapshot &&
            `${statusLabels[snapshot.from]} menjadi ${statusLabels[snapshot.to]}.`}{" "}
          {snapshot?.to === "batal_berangkat"
            ? "Pembatalan mengakhiri penempatan ini. Data alumni dan riwayat tetap tersimpan."
            : snapshot?.to === "selesai_kontrak"
              ? "Penempatan ini akan ditandai selesai dan tetap menjadi penempatan yang dipantau."
              : "Pastikan alumni sudah benar-benar berangkat sebelum mengonfirmasi."}
        </p>
        <form
          onSubmit={handleSubmit(submit)}
          noValidate
          aria-busy={pending}
          className="mt-5 space-y-5"
        >
          <fieldset
            disabled={pending || result?.success || result?.refresh}
            className="min-w-0 space-y-4"
          >
            {dateField && (
              <div className="space-y-2">
                <Label htmlFor={`${id}-date`}>
                  {dateField === "actual_departure"
                    ? "Tanggal keberangkatan aktual"
                    : "Tanggal selesai kontrak"}{" "}
                  (opsional)
                </Label>
                <Input
                  id={`${id}-date`}
                  type="date"
                  {...register(dateField)}
                  className="min-h-11"
                  aria-invalid={!!errors[dateField]}
                  aria-describedby={
                    errors[dateField] ? `${id}-date-error` : undefined
                  }
                />
                {errors[dateField] && (
                  <p id={`${id}-date-error`} className="text-sm text-red-800">
                    {errors[dateField]?.message}
                  </p>
                )}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor={`${id}-note`}>
                Catatan (opsional, maksimal 500 karakter)
              </Label>
              <textarea
                id={`${id}-note`}
                {...register("note")}
                maxLength={500}
                rows={3}
                className="block w-full resize-y rounded-md border border-input px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                aria-invalid={!!errors.note}
                aria-describedby={errors.note ? `${id}-note-error` : undefined}
              />
              {errors.note && (
                <p id={`${id}-note-error`} className="text-sm text-red-800">
                  {errors.note.message}
                </p>
              )}
            </div>
          </fieldset>
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
              ref={closeButton}
              autoFocus
              variant="outline"
              disabled={pending}
              className="min-h-11"
              onClick={() => dialog.current?.close()}
            >
              {result?.success || result?.refresh ? "Tutup" : "Kembali"}
            </Button>
            {!result?.success && !result?.refresh && (
              <Button
                type="submit"
                variant={
                  snapshot?.to === "batal_berangkat"
                    ? "destructive"
                    : "default"
                }
                disabled={pending}
                className="min-h-11"
              >
                {pending ? "Menyimpan..." : "Ya, konfirmasi"}
              </Button>
            )}
          </div>
        </form>
      </dialog>
    </div>
  );
}
