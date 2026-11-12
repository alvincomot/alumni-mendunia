import "server-only";
import type { requireAccess } from "@/lib/auth/access";
import {
  monitoringPeriodSchema,
  type MonitoringPeriod,
} from "@/lib/system-monitoring/period";

type Access = Awaited<ReturnType<typeof requireAccess>>;

export type RecentMonitoringActivity = {
  id: string;
  action: string;
  entityType: string;
  actorName: string;
  occurredAt: string;
};

function errorCode(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  return typeof error.code === "string" ? error.code : null;
}

export async function loadSystemMonitoringSummary(
  access: Access,
  period: MonitoringPeriod,
) {
  const result = await access.supabase.rpc("get_system_monitoring_summary", {
    p_from: period.from,
    p_to: period.to,
  });
  if (result.error) {
    const code = errorCode(result.error);
    if (code === "42883" || code === "PGRST202")
      return { available: false as const, reason: "migration" as const };
    return { available: false as const, reason: "unavailable" as const };
  }
  const parsed = monitoringPeriodSchema.safeParse(result.data);
  if (!parsed.success)
    return { available: false as const, reason: "invalid" as const };
  return { available: true as const, data: parsed.data };
}

export async function checkSystemHealth(access: Access) {
  const startedAt = Date.now();
  try {
    const result = await access.supabase.from("schools").select("id").limit(1);
    return {
      databaseAvailable: !result.error,
      checkedAt: new Date().toISOString(),
      durationMilliseconds: Date.now() - startedAt,
    };
  } catch {
    return {
      databaseAvailable: false,
      checkedAt: new Date().toISOString(),
      durationMilliseconds: Date.now() - startedAt,
    };
  }
}

export async function loadRecentMonitoringActivity(
  access: Access,
): Promise<RecentMonitoringActivity[]> {
  const result = await access.supabase
    .from("audit_logs")
    .select("id, actor_id, action, entity_type, occurred_at")
    .order("occurred_at", { ascending: false })
    .limit(4);
  if (result.error || !result.data?.length) return [];

  const actorIds = Array.from(
    new Set(
      result.data
        .map((row) => row.actor_id)
        .filter((value): value is string => typeof value === "string"),
    ),
  );
  const profilesResult = actorIds.length
    ? await access.supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", actorIds)
    : { data: [], error: null };
  const actorNames = new Map(
    (profilesResult.data ?? []).map((profile) => [
      profile.user_id,
      profile.full_name,
    ]),
  );

  return result.data.map((row) => ({
    id: row.id,
    action: row.action,
    entityType: row.entity_type,
    actorName: row.actor_id
      ? (actorNames.get(row.actor_id) ?? "Profil tidak tersedia")
      : "Pelaku tidak tercatat",
    occurredAt: row.occurred_at,
  }));
}
