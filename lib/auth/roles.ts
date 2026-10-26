export const applicationRoles = [
  "admin_dinas",
  "viewer_dinas",
  "petugas_sekolah",
] as const;

export type ApplicationRole = (typeof applicationRoles)[number];

export const roleDetails: Record<
  ApplicationRole,
  { label: string; accessSummary: string }
> = {
  admin_dinas: {
    label: "Admin Dinas",
    accessSummary: "Pengelolaan seluruh sekolah dan akun pengguna",
  },
  viewer_dinas: {
    label: "Viewer Dinas",
    accessSummary: "Pemantauan data alumni lintas sekolah",
  },
  petugas_sekolah: {
    label: "Petugas Sekolah",
    accessSummary: "Pengelolaan data alumni sekolah",
  },
};

export function isApplicationRole(value: unknown): value is ApplicationRole {
  return (
    typeof value === "string" &&
    applicationRoles.some((role) => role === value)
  );
}
