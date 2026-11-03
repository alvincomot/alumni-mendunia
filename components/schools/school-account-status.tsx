import type { SchoolLookup } from "@/lib/auth/school-auth";

const statuses = {
  UNCLAIMED: ["Belum Aktivasi", "bg-slate-100 text-slate-700"],
  PENDING_ACTIVATION: ["Menunggu Aktivasi", "bg-amber-50 text-amber-900"],
  ACTIVE: ["Aktif", "bg-green-50 text-green-800"],
  SUSPENDED: ["Ditangguhkan", "bg-red-50 text-red-800"],
} as const;

export function SchoolAccountStatus({
  status,
}: {
  status: SchoolLookup["status"] | null;
}) {
  const [label, style] = status
    ? statuses[status]
    : ["Belum dapat dimuat", "bg-slate-100 text-slate-700"];
  return (
    <span
      className={`inline-block rounded px-2 py-1 text-xs font-medium ${style}`}
    >
      {label}
    </span>
  );
}
