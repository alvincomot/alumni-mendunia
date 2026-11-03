"use client";

import { useEffect, useState } from "react";
import { getSchoolAccountDetails } from "@/app/dashboard/schools/actions";
import type { School } from "@/lib/schools/schema";
import type { SchoolAccountDetailsResult } from "@/lib/users/schema";
import { SchoolAccountStatus } from "./school-account-status";
import { Button } from "@/components/ui/button";
import { LoadingRegion, Skeleton } from "@/components/ui/loading";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

function AccountDetails({ schoolId }: { schoolId: string }) {
  const [result, setResult] = useState<SchoolAccountDetailsResult | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    getSchoolAccountDetails(schoolId)
      .then((response) => {
        if (active) setResult(response);
      })
      .catch(() => {
        if (active)
          setResult({
            success: false,
            message: "Informasi akun belum dapat dimuat. Silakan coba kembali.",
          });
      });
    return () => {
      active = false;
    };
  }, [schoolId, attempt]);

  if (!result)
    return (
      <LoadingRegion label="Memuat detail akun sekolah" className="mt-5">
        <div aria-hidden="true" className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-5 w-full" />
            </div>
          ))}
        </div>
      </LoadingRegion>
    );
  if (!result.success)
    return (
      <div className="mt-5 space-y-4">
        <p role="alert" className="text-sm text-red-800">
          {result.message}
        </p>
        <Button
          variant="outline"
          onClick={() => {
            setResult(null);
            setAttempt((value) => value + 1);
          }}
        >
          Coba lagi
        </Button>
      </div>
    );
  const { school, accounts, status } = result.details;
  return (
    <div className="mt-5 space-y-5 text-sm">
      <dl className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <dt className="text-muted-foreground">Nama sekolah</dt>
          <dd className="mt-1 break-words font-medium">{school.name}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">NPSN</dt>
          <dd className="mt-1 tabular-nums">{school.npsn}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Status sekolah</dt>
          <dd className="mt-1">{school.isActive ? "Aktif" : "Nonaktif"}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="mb-1 text-muted-foreground">Status aktivasi akun</dt>
          <dd>
            <SchoolAccountStatus status={status} />
          </dd>
        </div>
      </dl>
      {!school.isActive && (
        <p className="rounded-lg border bg-secondary p-3 leading-6">
          Akses akun ditangguhkan selama sekolah nonaktif. Mengaktifkan sekolah
          tidak mengubah status profil petugas yang ditangguhkan.
        </p>
      )}
      {accounts.length === 0 ? (
        <div className="rounded-lg border p-4 leading-6">
          <p>Belum ada petugas yang terhubung.</p>
          <p className="mt-1 text-muted-foreground">
            {status === "PENDING_ACTIVATION"
              ? "Aktivasi belum selesai. Email terdaftar tersedia di sini setelah profil petugas terbentuk."
              : status === "UNCLAIMED"
                ? "Petugas sekolah dapat memulai aktivasi mandiri melalui NPSN."
                : "Penugasan petugas perlu diperiksa melalui Manajemen Pengguna."}
          </p>
        </div>
      ) : (
        <section aria-label="Petugas dan email terdaftar" className="space-y-3">
          {accounts.map((account) => (
            <dl
              key={account.userId}
              className="space-y-3 rounded-lg border p-4"
            >
              <div>
                <dt className="text-muted-foreground">Petugas</dt>
                <dd className="mt-1 break-words font-medium">
                  {account.fullName}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Email terdaftar</dt>
                <dd className="mt-1 break-all">
                  {account.email ?? "Email tidak tersedia"}
                </dd>
              </div>
              {account.email && (
                <div>
                  <dt className="text-muted-foreground">Verifikasi email</dt>
                  <dd className="mt-1">
                    {account.emailVerified
                      ? "Terverifikasi"
                      : "Belum terverifikasi"}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-muted-foreground">Status profil petugas</dt>
                <dd className="mt-1">
                  {account.isActive ? "Aktif" : "Ditangguhkan"}
                </dd>
              </div>
              {account.mustChangePassword && (
                <p className="text-muted-foreground">
                  Petugas perlu menyelesaikan penggantian kata sandi sebelum
                  mengakses aplikasi.
                </p>
              )}
            </dl>
          ))}
        </section>
      )}
    </div>
  );
}

export function SchoolAccountDialog({
  school,
  open,
  onOpenChange,
  onCloseAutoFocus,
}: {
  school: School;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open === undefined && (
        <DialogTrigger asChild>
          <Button variant="outline">Detail akun</Button>
        </DialogTrigger>
      )}
      <DialogContent onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle>Detail Akun Sekolah</DialogTitle>
          <DialogDescription>
            Informasi aktivasi dan akun petugas yang terhubung ke sekolah.
          </DialogDescription>
        </DialogHeader>
        <AccountDetails key={school.id} schoolId={school.id} />
      </DialogContent>
    </Dialog>
  );
}
