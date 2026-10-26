export default function DashboardLoading() {
  return (
    <main className="flex min-h-svh items-center justify-center px-5 py-10">
      <div
        role="status"
        aria-live="polite"
        className="w-full max-w-sm rounded-lg border bg-white p-6"
      >
        <div className="h-1 w-12 rounded-sm bg-accent" aria-hidden="true" />
        <p className="mt-5 font-medium text-primary">Memuat dashboard</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Sedang memeriksa sesi dan hak akses akun Anda.
        </p>
      </div>
    </main>
  );
}
