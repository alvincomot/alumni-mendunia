import Link from "next/link";
import { DashboardIcon } from "@/components/dashboard-icon";
import { DashboardPanel } from "@/components/dashboard-panel";
import { Button } from "@/components/ui/button";
import type { ActiveStudentDashboardSummary } from "@/lib/active-students/data";

export type ActiveStudentDashboardState =
  | { status: "ready"; summary: ActiveStudentDashboardSummary }
  | { status: "error" };

export function ActiveStudentDashboardPanel({
  state,
}: {
  state: ActiveStudentDashboardState;
}) {
  return (
    <DashboardPanel
      title="Ringkasan Murid Aktif"
      height="md"
      icon={<DashboardIcon name="book" className="size-5" />}
    >
      {state.status === "error" ? (
        <p role="status" className="text-sm leading-6 text-[#6B6D7A]">
          Ringkasan murid belum dapat ditampilkan.
        </p>
      ) : state.summary.total === 0 ? (
        <div className="flex min-h-44 flex-col justify-between gap-5">
          <div>
            <p className="font-semibold text-[#191C1E]">
              Belum ada data murid aktif.
            </p>
            <p className="type-supporting mt-2 text-[#6B6D7A]">
              Tambahkan murid yang berminat bekerja ke luar negeri untuk mulai
              memantau perkembangan mereka.
            </p>
          </div>
          <Button asChild className="w-full sm:w-fit">
            <Link href="/dashboard/murid-aktif/new">Tambah Murid</Link>
          </Button>
        </div>
      ) : (
        <div className="flex min-h-44 flex-col">
          <div className="flex items-end justify-between gap-4 border-b border-[#ECEEF0] pb-4">
            <p className="type-supporting text-[#6B6D7A]">
              Murid berminat ke luar negeri
            </p>
            <p className="type-stat shrink-0 tabular-nums text-primary">
              {state.summary.total.toLocaleString("id-ID")}
            </p>
          </div>
          <dl className="divide-y divide-[#ECEEF0]">
            {[
              ["Aktif pelatihan", state.summary.activeTraining],
              ["Selesai pelatihan", state.summary.completedTraining],
              ["Sudah mendapat penempatan", state.summary.placed],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="flex min-h-11 items-center justify-between gap-4 py-2 text-sm"
              >
                <dt className="text-[#444653]">{label}</dt>
                <dd className="font-bold tabular-nums text-[#191C1E]">
                  {Number(value).toLocaleString("id-ID")}
                </dd>
              </div>
            ))}
          </dl>
          <Link
            href="/dashboard/murid-aktif"
            className="mt-auto inline-flex min-h-11 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Lihat Data Murid Aktif
          </Link>
        </div>
      )}
    </DashboardPanel>
  );
}
