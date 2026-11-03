"use client";

import { LogoutButton } from "@/components/logout-button";
import { Button } from "@/components/ui/button";

export default function DashboardError({ reset }: { reset: () => void }) {
  return (
    <main className="flex min-h-[60svh] items-center justify-center py-8">
      <section className="w-full max-w-xl rounded-xl border bg-card">
        <div className="p-6 sm:p-8">
          <h1 className="type-page-title text-foreground">
            Dashboard tidak dapat ditampilkan
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Terjadi kendala saat memuat halaman. Coba muat kembali atau keluar
            dari akun.
          </p>
          <div className="mt-7 flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-start sm:justify-between">
            <Button
              type="button"
              onClick={reset}
              className="min-h-11"
            >
              Muat kembali
            </Button>
            <LogoutButton />
          </div>
        </div>
      </section>
    </main>
  );
}
