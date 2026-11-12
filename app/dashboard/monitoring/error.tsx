"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function MonitoringError({ reset }: { reset: () => void }) {
  return (
    <section className="mx-auto my-10 max-w-xl rounded-xl border bg-card p-6 sm:p-8">
      <h1 className="type-page-title text-primary">
        Monitoring Sistem tidak dapat dimuat
      </h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        Pemeriksaan monitoring mengalami kendala. Fitur operasional dashboard
        lainnya tetap dapat digunakan.
      </p>
      <div className="mt-6 flex flex-col gap-3 border-t pt-5 sm:flex-row">
        <Button type="button" onClick={reset}>Coba lagi</Button>
        <Button asChild variant="outline">
          <Link href="/dashboard">Kembali ke Dashboard</Link>
        </Button>
      </div>
    </section>
  );
}
