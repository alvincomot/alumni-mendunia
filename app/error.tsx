"use client";

import { Button } from "@/components/ui/button";
import { LogoutButton } from "@/components/logout-button";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto max-w-lg px-5 py-16">
      <h1 className="text-2xl font-semibold text-primary">
        Halaman belum dapat dimuat
      </h1>
      <p className="my-5 leading-7">
        Sesi atau data aplikasi belum dapat diperiksa. Coba lagi setelah koneksi
        tersedia, atau keluar dari akun.
      </p>
      <div className="flex flex-wrap justify-between gap-3">
        <Button className="min-h-11" onClick={reset}>
          Coba lagi
        </Button>
        <LogoutButton />
      </div>
    </main>
  );
}
