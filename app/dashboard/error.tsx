"use client";

import { LogoutButton } from "@/components/logout-button";
import { Button } from "@/components/ui/button";

export default function DashboardError({ reset }: { reset: () => void }) {
  return (
    <main className="flex min-h-svh items-center justify-center px-5 py-10">
      <section className="w-full max-w-xl overflow-hidden rounded-lg border bg-white">
        <div className="h-2 bg-primary" aria-hidden="true" />
        <div className="p-6 sm:p-8">
          <div className="h-1 w-12 rounded-sm bg-accent" aria-hidden="true" />
          <h1 className="mt-5 text-2xl font-semibold text-primary">
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
              className="min-h-11 bg-accent text-accent-foreground hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
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
