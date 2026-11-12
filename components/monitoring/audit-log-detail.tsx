"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export type AuditLogDetailProps = {
  time: string;
  actor: string;
  action: string;
  entity: string;
  objectName: string;
  identifier: string;
};

export function AuditLogDetail(props: AuditLogDetailProps) {
  const [copied, setCopied] = useState(false);

  async function copyIdentifier() {
    try {
      await navigator.clipboard.writeText(props.identifier);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Dialog onOpenChange={(open) => !open && setCopied(false)}>
      <DialogTrigger asChild>
        <Button variant="link" size="sm" className="min-h-0 px-0 py-1">
          Lihat detail
        </Button>
      </DialogTrigger>
      <DialogContent className="inset-y-0 left-auto right-0 top-0 h-dvh max-h-none w-full max-w-md translate-x-0 translate-y-0 rounded-none border-y-0 border-r-0 p-0 sm:max-w-lg">
        <DialogHeader className="border-b p-5 pr-14 sm:p-6 sm:pr-14">
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle>Detail Audit Log</DialogTitle>
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800">
              Metadata tercatat
            </span>
          </div>
          <DialogDescription>
            Metadata perubahan yang tersimpan oleh aplikasi.
          </DialogDescription>
        </DialogHeader>
        <div className="p-5 sm:p-6">
        <dl className="divide-y rounded-lg border text-sm">
          {[
            ["Waktu (WIB)", props.time],
            ["Pelaku", props.actor],
            ["Tindakan", props.action],
            ["Jenis objek", props.entity],
            ["Objek", props.objectName],
          ].map(([label, value]) => (
            <div key={label} className="grid gap-1 p-3 sm:grid-cols-[9rem_1fr]">
              <dt className="font-medium text-muted-foreground">{label}</dt>
              <dd className="break-words">{value}</dd>
            </div>
          ))}
          <div className="grid gap-2 p-3 sm:grid-cols-[9rem_1fr]">
            <dt className="font-medium text-muted-foreground">Identifier</dt>
            <dd className="min-w-0">
              <code className="block break-all text-xs">{props.identifier}</code>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={copyIdentifier}
              >
                {copied ? "ID tersalin" : "Salin ID"}
              </Button>
            </dd>
          </div>
        </dl>
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="font-medium text-amber-950">Detail perubahan tidak tersedia</p>
          <p className="mt-1 text-xs leading-5 text-amber-900">
            Skema Audit Log saat ini hanya menyimpan metadata tindakan, bukan
            nilai sebelum dan sesudah. Aplikasi tidak merekonstruksi data
            historis yang tidak pernah dicatat.
          </p>
        </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
