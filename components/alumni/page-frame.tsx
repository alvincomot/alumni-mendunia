import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";
import { Button } from "@/components/ui/button";
import { statusLabels, type PlacementStatus } from "@/lib/alumni/schema";

export function AlumniPageFrame({
  children,
}: {
  children: React.ReactNode;
  canWrite: boolean;
}) {
  return <>{children}</>;
}

export function AlumniAccessDenied() {
  return (
    <main className="mx-auto max-w-xl px-5 py-12">
      <h1 className="text-2xl font-semibold text-primary">
        Akses tidak diizinkan
      </h1>
      <p className="my-5 text-sm leading-6">
        Periksa hak akses Anda dengan Admin Dinas. Petugas memerlukan profil
        aktif yang terhubung ke sekolah aktif. Pengguna Dinas hanya dapat
        membaca data alumni.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button asChild variant="outline" className="min-h-11">
          <Link href="/dashboard">Kembali ke dashboard</Link>
        </Button>
        <LogoutButton />
      </div>
    </main>
  );
}

const statusStyles: Record<PlacementStatus, string> = {
  persiapan_berangkat: "bg-amber-50 text-amber-900",
  aktif_bekerja: "bg-green-50 text-green-800",
  selesai_kontrak: "bg-slate-100 text-slate-700",
  batal_berangkat: "bg-red-50 text-red-800",
};

export function PlacementBadge({ status }: { status: PlacementStatus }) {
  return (
    <span
      className={`inline-block rounded px-2 py-1 text-xs font-medium ${statusStyles[status]}`}
    >
      {statusLabels[status]}
    </span>
  );
}
