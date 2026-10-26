import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { historyEntrySchema, type StatusHistoryResult } from "./status";

export async function getPlacementHistory(
  supabase: SupabaseClient,
  placementId: string,
): Promise<StatusHistoryResult> {
  try {
    const { data, error } = await supabase.rpc("get_status_history", {
      p_placement_id: placementId,
    });
    if (error) return { entries: [], error: true };
    const parsed = historyEntrySchema.array().safeParse(data);
    if (
      !parsed.success ||
      parsed.data.some((entry) => entry.placement_id !== placementId)
    )
      return { entries: [], error: true };
    return {
      entries: parsed.data.sort(
        (a, b) =>
          Date.parse(a.changed_at) - Date.parse(b.changed_at) ||
          a.id.localeCompare(b.id),
      ),
      error: false,
    };
  } catch {
    return { entries: [], error: true };
  }
}
