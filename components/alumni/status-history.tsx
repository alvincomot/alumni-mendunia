"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { statusLabels } from "@/lib/alumni/schema";
import { type StatusHistoryResult } from "@/lib/alumni/status";

export function StatusHistory({ entries, error }: StatusHistoryResult) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  if (error)
    return (
      <div className="mt-4 space-y-3" aria-busy={pending}>
        <p role="alert" className="text-sm text-red-800">
          Riwayat penempatan ini belum dapat dimuat.
        </p>
        <Button
          variant="outline"
          disabled={pending}
          className="min-h-11"
          onClick={() => startTransition(() => router.refresh())}
        >
          {pending ? "Memuat riwayat..." : "Coba muat riwayat lagi"}
        </Button>
      </div>
    );
  if (!entries.length)
    return (
      <p className="mt-4 text-sm text-muted-foreground">
        Belum ada riwayat status untuk penempatan ini.
      </p>
    );
  return (
    <ol
      className="mt-4 divide-y"
      aria-label="Perubahan status, dari yang paling awal"
    >
      {entries.map((entry) => (
        <li key={entry.id} className="min-w-0 py-4 first:pt-0 last:pb-0">
          <p className="text-sm font-medium text-primary">
            {entry.old_status === null
              ? `Pencatatan awal: ${statusLabels[entry.new_status]}`
              : `${statusLabels[entry.old_status]} menjadi ${statusLabels[entry.new_status]}`}
          </p>
          <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">
            <time dateTime={entry.changed_at}>
              {new Intl.DateTimeFormat("id-ID", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: "Asia/Jakarta",
              }).format(new Date(entry.changed_at))}{" "}
              WIB
            </time>{" "}
            · {entry.changed_by_name || "Pengguna tidak tersedia"}
          </p>
          {entry.note && (
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">
              {entry.note}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}
