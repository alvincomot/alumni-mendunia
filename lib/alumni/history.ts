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

function isMissingBatchHistoryRpc(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? error.code : null;
  return code === "42883" || code === "PGRST202";
}

export async function getPlacementHistories(
  supabase: SupabaseClient,
  placementIds: string[],
): Promise<Map<string, StatusHistoryResult>> {
  const uniqueIds = [...new Set(placementIds)];
  const results = new Map<string, StatusHistoryResult>();
  if (uniqueIds.length === 0) return results;

  try {
    const { data, error } = await supabase.rpc("get_status_histories", {
      p_placement_ids: uniqueIds,
    });
    if (!error) {
      const parsed = historyEntrySchema.array().safeParse(data);
      if (
        parsed.success &&
        parsed.data.every((entry) => uniqueIds.includes(entry.placement_id))
      ) {
        for (const id of uniqueIds)
          results.set(id, { entries: [], error: false });
        for (const entry of parsed.data)
          results.get(entry.placement_id)?.entries.push(entry);
        for (const result of results.values())
          result.entries.sort(
            (a, b) =>
              Date.parse(a.changed_at) - Date.parse(b.changed_at) ||
              a.id.localeCompare(b.id),
          );
        return results;
      }
      for (const id of uniqueIds)
        results.set(id, { entries: [], error: true });
      return results;
    }
    if (!isMissingBatchHistoryRpc(error)) {
      for (const id of uniqueIds)
        results.set(id, { entries: [], error: true });
      return results;
    }
  } catch {
    for (const id of uniqueIds)
      results.set(id, { entries: [], error: true });
    return results;
  }

  const fallback = await Promise.all(
    uniqueIds.map(async (id) => [id, await getPlacementHistory(supabase, id)] as const),
  );
  return new Map(fallback);
}
