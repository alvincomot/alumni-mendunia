import { z } from "zod";
import {
  idSchema,
  optionalDateSchema,
  type PlacementRecord,
  type PlacementStatus,
} from "./schema";

const statusSchema = z.enum([
  "persiapan_berangkat",
  "aktif_bekerja",
  "selesai_kontrak",
  "batal_berangkat",
]);
const transitions: Record<PlacementStatus, readonly PlacementStatus[]> = {
  persiapan_berangkat: ["aktif_bekerja", "batal_berangkat"],
  aktif_bekerja: ["selesai_kontrak"],
  selesai_kontrak: [],
  batal_berangkat: [],
};

export function canTransition(from: PlacementStatus, to: PlacementStatus) {
  return transitions[from]?.includes(to) ?? false;
}

export const statusChangeSchema = z
  .object({
    placement_id: idSchema,
    expected_status: statusSchema,
    new_status: statusSchema,
    note: z.string().trim().max(500, "Catatan maksimal 500 karakter."),
    actual_departure: optionalDateSchema,
    contract_end_date: optionalDateSchema,
  })
  .superRefine((value, ctx) => {
    const issue = (field: keyof typeof value, message: string) =>
      ctx.addIssue({ code: "custom", path: [field], message });
    if (!canTransition(value.expected_status, value.new_status))
      issue("new_status", "Perubahan status tidak sesuai alur yang diizinkan.");
    if (value.new_status !== "aktif_bekerja" && value.actual_departure)
      issue(
        "actual_departure",
        "Tanggal keberangkatan hanya untuk konfirmasi berangkat.",
      );
    if (value.new_status !== "selesai_kontrak" && value.contract_end_date)
      issue(
        "contract_end_date",
        "Tanggal selesai kontrak hanya untuk penyelesaian kontrak.",
      );
    const today = new Date().toISOString().slice(0, 10);
    if (value.actual_departure > today)
      issue(
        "actual_departure",
        "Keberangkatan aktual tidak boleh di masa depan.",
      );
    if (value.contract_end_date > today)
      issue("contract_end_date", "Selesai kontrak tidak boleh di masa depan.");
  });

export type StatusChangeInput = z.infer<typeof statusChangeSchema>;
export type StatusChangeResult = {
  success: boolean;
  message: string;
  refresh?: boolean;
};

export function statusDateError(
  input: StatusChangeInput,
  placement: Pick<PlacementRecord, "actual_departure" | "employment_start">,
): string | null {
  if (
    input.actual_departure &&
    placement.employment_start &&
    input.actual_departure > placement.employment_start
  )
    return "Keberangkatan aktual tidak boleh setelah tanggal mulai bekerja.";
  if (
    input.contract_end_date &&
    ((placement.actual_departure &&
      input.contract_end_date < placement.actual_departure) ||
      (placement.employment_start &&
        input.contract_end_date < placement.employment_start))
  )
    return "Selesai kontrak tidak boleh sebelum keberangkatan aktual atau mulai bekerja.";
  return null;
}

export const historyEntrySchema = z.object({
  id: idSchema,
  placement_id: idSchema,
  old_status: statusSchema.nullable(),
  new_status: statusSchema,
  changed_by_name: z.string().nullable(),
  note: z.string().nullable(),
  changed_at: z.string().datetime({ offset: true }),
});
export type StatusHistoryEntry = z.infer<typeof historyEntrySchema>;
export type StatusHistoryResult = {
  entries: StatusHistoryEntry[];
  error: boolean;
};
