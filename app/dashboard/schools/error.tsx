"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function SchoolsError({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto max-w-xl px-5 py-12">
      <h1 className="text-2xl font-semibold text-primary">
        Data sekolah belum dapat dimuat
      </h1>
      <p className="my-5 text-sm leading-6">
        Terjadi kendala saat memeriksa akses atau mengambil data. Silakan coba
        kembali.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button onClick={reset} className="min-h-11">
          Coba kembali
        </Button>
        <Button asChild variant="outline" className="min-h-11">
          <Link href="/dashboard">Kembali ke dashboard</Link>
        </Button>
      </div>
    </main>
  );
}
