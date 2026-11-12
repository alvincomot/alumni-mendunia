import { z } from "zod";
import type { SearchParams } from "@/lib/monitoring/model";

const datePattern = /^\d{4}-\d{2}-\d{2}$/u;

export type MonitoringPeriodKey = "today" | "7d" | "30d" | "custom";

export type MonitoringPeriod = {
  key: MonitoringPeriodKey;
  from: string;
  to: string;
};

function wibDate(now: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isRealDate(value: string) {
  if (!datePattern.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function inclusiveDays(from: string, to: string) {
  return (
    Math.floor(
      (new Date(`${to}T00:00:00.000Z`).getTime() -
        new Date(`${from}T00:00:00.000Z`).getTime()) /
        86_400_000,
    ) + 1
  );
}

export function resolveMonitoringPeriod(
  params: SearchParams,
  now = new Date(),
): { period: MonitoringPeriod; error?: string } {
  const today = wibDate(now);
  const rawKey = typeof params.period === "string" ? params.period : "7d";
  const key: MonitoringPeriodKey = ["today", "7d", "30d", "custom"].includes(
    rawKey,
  )
    ? (rawKey as MonitoringPeriodKey)
    : "7d";
  if (key === "today") return { period: { key, from: today, to: today } };
  if (key === "7d")
    return { period: { key, from: shiftDate(today, -6), to: today } };
  if (key === "30d")
    return { period: { key, from: shiftDate(today, -29), to: today } };

  const from = typeof params.from === "string" ? params.from : "";
  const to = typeof params.to === "string" ? params.to : "";
  if (!isRealDate(from) || !isRealDate(to))
    return {
      period: { key, from, to },
      error: "Isi tanggal awal dan akhir yang valid untuk rentang khusus.",
    };
  if (from > to)
    return {
      period: { key, from, to },
      error: "Tanggal akhir tidak boleh mendahului tanggal awal.",
    };
  if (to > today)
    return {
      period: { key, from, to },
      error: "Rentang monitoring tidak dapat melewati hari ini.",
    };
  if (inclusiveDays(from, to) > 90)
    return {
      period: { key, from, to },
      error: "Rentang khusus maksimal 90 hari.",
    };
  return { period: { key, from, to } };
}

export const monitoringPeriodSchema = z.object({
  generated_at: z.iso.datetime(),
  range: z.object({ from: z.iso.date(), to: z.iso.date() }),
  traffic: z.object({
    total: z.coerce.number().int().nonnegative(),
    today: z.coerce.number().int().nonnegative(),
    last_7_days: z.coerce.number().int().nonnegative(),
    last_30_days: z.coerce.number().int().nonnegative(),
    selected_period: z.coerce.number().int().nonnegative(),
    trend: z.array(
      z.object({
        day: z.string().transform((value, context) => {
          const normalized = value.slice(0, 10);
          if (!isRealDate(normalized)) {
            context.addIssue({ code: "custom", message: "Invalid trend date" });
            return z.NEVER;
          }
          return normalized;
        }),
        count: z.coerce.number().int().nonnegative(),
      }),
    ),
    top_paths: z.array(
      z.object({
        path: z.string(),
        count: z.coerce.number().int().nonnegative(),
      }),
    ),
  }),
  schools: z.object({
    total: z.coerce.number().int().nonnegative(),
    active_accounts: z.coerce.number().int().nonnegative(),
    not_activated: z.coerce.number().int().nonnegative(),
    pending_activation: z.coerce.number().int().nonnegative(),
    suspended: z.coerce.number().int().nonnegative(),
    activation_percentage: z.coerce.number().nonnegative().max(100),
    schools_with_changes_7_days: z.coerce.number().int().nonnegative(),
    schools_with_changes_30_days: z.coerce.number().int().nonnegative(),
  }),
  features: z.object({
    alumni_created: z.coerce.number().int().nonnegative(),
    alumni_updated: z.coerce.number().int().nonnegative(),
    placement_changes: z.coerce.number().int().nonnegative(),
    departure_confirmations: z.coerce.number().int().nonnegative(),
    school_management: z.coerce.number().int().nonnegative(),
    user_management: z.coerce.number().int().nonnegative(),
  }),
});

export type SystemMonitoringSummary = z.infer<typeof monitoringPeriodSchema>;
