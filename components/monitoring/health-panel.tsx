import {
  AlertTriangle,
  Cloud,
  Database,
  Globe2,
  Info,
  KeyRound,
  Mail,
  Server,
  ShieldCheck,
} from "lucide-react";

type SystemHealth = {
  databaseAvailable: boolean;
  checkedAt: string;
  durationMilliseconds: number;
};

function checkedTime(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Asia/Jakarta",
  }).format(new Date(value));
}

function StatusBadge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "verified" | "warning" | "unknown";
}) {
  const classes = {
    verified: "bg-emerald-100 text-emerald-800",
    warning: "bg-red-100 text-red-800",
    unknown: "bg-secondary text-muted-foreground",
  };
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${classes[tone]}`}>
      {children}
    </span>
  );
}

function ServiceCard({
  icon: Icon,
  title,
  subtitle,
  status,
  tone,
  description,
  footer,
}: {
  icon: typeof Globe2;
  title: string;
  subtitle: string;
  status: string;
  tone: "verified" | "warning" | "unknown";
  description: string;
  footer: string;
}) {
  return (
    <article className="flex min-h-48 flex-col rounded-xl border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary text-primary">
            <Icon aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0">
            <h3 className="type-card-title text-primary">{title}</h3>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        <StatusBadge tone={tone}>{status}</StatusBadge>
      </div>
      <p className="mt-4 text-sm leading-6">{description}</p>
      <p className="mt-auto pt-5 text-xs leading-5 text-muted-foreground">
        {footer}
      </p>
    </article>
  );
}

export function HealthPanel({ health }: { health: SystemHealth }) {
  const verifiedChecks = health.databaseAvailable ? 3 : 2;
  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary text-primary">
            <Server aria-hidden="true" className="size-5" />
          </span>
          <div>
            <h2 className="type-card-title text-primary">
              {verifiedChecks} pemeriksaan tersedia · 1 telemetri provider belum terhubung
            </h2>
            <p className="mt-0.5 text-sm leading-6 text-muted-foreground">
              Hasil ini adalah pemeriksaan saat halaman dimuat, bukan riwayat
              uptime atau jaminan SLA.
            </p>
          </div>
        </div>
        <StatusBadge tone={health.databaseAvailable ? "verified" : "warning"}>
          {health.databaseAvailable ? "Pemeriksaan lokal selesai" : "Database bermasalah"}
        </StatusBadge>
      </section>

      <section aria-labelledby="service-status-heading">
        <h2 id="service-status-heading" className="sr-only">
          Status layanan
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <ServiceCard
            icon={Globe2}
            title="Aplikasi Web"
            subtitle="Next.js dashboard"
            status="Tersedia"
            tone="verified"
            description="Halaman Monitoring Sistem berhasil dirender untuk permintaan admin saat ini."
            footer={`Pemeriksaan halaman: ${checkedTime(health.checkedAt)} WIB`}
          />
          <ServiceCard
            icon={Database}
            title="Database PostgreSQL"
            subtitle="Supabase"
            status={health.databaseAvailable ? "Terverifikasi" : "Gagal diperiksa"}
            tone={health.databaseAvailable ? "verified" : "warning"}
            description={
              health.databaseAvailable
                ? "Query baca terbatas ke tabel sekolah berhasil pada pemeriksaan ini."
                : "Query pemeriksaan ke database tidak berhasil. Coba perbarui data dan periksa Supabase."
            }
            footer={`Durasi query pemeriksaan: ${health.durationMilliseconds} ms`}
          />
          <ServiceCard
            icon={ShieldCheck}
            title="Autentikasi"
            subtitle="Supabase Auth dan otorisasi aplikasi"
            status="Terverifikasi"
            tone="verified"
            description="Sesi admin_dinas dan hak akses Monitoring Sistem diverifikasi sebelum halaman ditampilkan."
            footer="Status ini hanya mewakili sesi yang sedang digunakan."
          />
          <ServiceCard
            icon={Mail}
            title="Pengiriman Email"
            subtitle="Provider email transaksi"
            status="Belum dipantau"
            tone="unknown"
            description="Aplikasi belum menerima telemetry pengiriman, kegagalan, atau kuota email dari provider."
            footer="Periksa dashboard provider untuk status pengiriman aktual."
          />
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(18rem,0.8fr)]">
        <section aria-labelledby="incident-heading" className="rounded-xl border bg-card p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 id="incident-heading" className="type-section-title text-primary">
                Riwayat gangguan dan error
              </h2>
              <p className="text-sm text-muted-foreground">
                Catatan kegagalan aplikasi dari sumber telemetry terintegrasi.
              </p>
            </div>
            <StatusBadge tone="unknown">Belum tersedia</StatusBadge>
          </div>
          <div className="mt-5 grid min-h-52 place-items-center rounded-lg border border-dashed bg-secondary/40 p-6 text-center">
            <div className="max-w-lg">
              <AlertTriangle
                aria-hidden="true"
                className="mx-auto size-8 text-muted-foreground"
              />
              <p className="mt-3 font-semibold text-primary">
                Error history belum terintegrasi
              </p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Aplikasi belum menyimpan error runtime, insiden deployment, atau
                histori uptime ke database internal. Tidak ada angka nol palsu
                yang ditampilkan.
              </p>
            </div>
          </div>
        </section>

        <section aria-labelledby="integration-heading" className="rounded-xl border bg-card p-5">
          <h2 id="integration-heading" className="type-section-title text-primary">
            Integrasi monitoring
          </h2>
          <p className="text-sm text-muted-foreground">
            Sumber pemeriksaan yang tersedia saat ini.
          </p>
          <ul className="mt-4 space-y-3">
            <li className="flex items-center gap-3 rounded-lg bg-secondary/60 p-3">
              <Database aria-hidden="true" className="size-5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1"><p className="font-medium">Supabase Database</p><p className="text-xs text-muted-foreground">Query pemeriksaan lokal</p></div>
              <StatusBadge tone={health.databaseAvailable ? "verified" : "warning"}>{health.databaseAvailable ? "Terverifikasi" : "Gagal"}</StatusBadge>
            </li>
            <li className="flex items-center gap-3 rounded-lg bg-secondary/60 p-3">
              <KeyRound aria-hidden="true" className="size-5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1"><p className="font-medium">Supabase Auth</p><p className="text-xs text-muted-foreground">Sesi admin saat ini</p></div>
              <StatusBadge tone="verified">Terverifikasi</StatusBadge>
            </li>
            <li className="flex items-center gap-3 rounded-lg bg-secondary/60 p-3">
              <Cloud aria-hidden="true" className="size-5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1"><p className="font-medium">Vercel Monitoring</p><p className="text-xs text-muted-foreground">Uptime, request, dan error</p></div>
              <StatusBadge tone="unknown">Belum dipantau</StatusBadge>
            </li>
            <li className="flex items-center gap-3 rounded-lg bg-secondary/60 p-3">
              <Mail aria-hidden="true" className="size-5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1"><p className="font-medium">Provider Email</p><p className="text-xs text-muted-foreground">Delivery dan quota telemetry</p></div>
              <StatusBadge tone="unknown">Belum dipantau</StatusBadge>
            </li>
          </ul>
          <div className="mt-4 flex gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs leading-5 text-blue-950">
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <p>Integrasi eksternal membutuhkan konfigurasi provider dan variabel lingkungan di Vercel.</p>
          </div>
        </section>
      </div>
    </div>
  );
}
