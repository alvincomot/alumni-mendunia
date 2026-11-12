const fixedDashboardPaths = new Set([
  "/dashboard",
  "/dashboard/alumni",
  "/dashboard/alumni/new",
  "/dashboard/schools",
  "/dashboard/users",
  "/dashboard/reports",
  "/dashboard/monitoring",
]);

const alumniDetailPath =
  /^\/dashboard\/alumni\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function normalizeMonitoredPath(value: unknown) {
  if (typeof value !== "string" || value.includes("?") || value.includes("#"))
    return null;
  const path = value.length > 1 ? value.replace(/\/+$/u, "") : value;
  if (fixedDashboardPaths.has(path)) return path;
  if (alumniDetailPath.test(path)) return "/dashboard/alumni/[id]";
  return null;
}

export function createPageViewDeduper(windowMilliseconds = 1_500) {
  let previous: { path: string; recordedAt: number } | null = null;
  return (path: string, recordedAt: number) => {
    if (
      previous?.path === path &&
      recordedAt - previous.recordedAt < windowMilliseconds
    )
      return false;
    previous = { path, recordedAt };
    return true;
  };
}

export const monitoringPathLabels: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/dashboard/alumni": "Data Alumni",
  "/dashboard/alumni/new": "Tambah Alumni",
  "/dashboard/alumni/[id]": "Detail Alumni",
  "/dashboard/schools": "Manajemen Sekolah",
  "/dashboard/users": "Manajemen Pengguna",
  "/dashboard/reports": "Laporan",
  "/dashboard/monitoring": "Monitoring Sistem",
};
