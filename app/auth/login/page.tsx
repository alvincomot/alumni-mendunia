import { LoginForm } from "@/components/login-form";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";

async function LoginContent() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (typeof data?.claims?.sub === "string") {
    redirect("/dashboard");
  }

  return <LoginScreen />;
}

function LoginScreen({ isCheckingSession = false }) {
  return (
    <main className="min-h-svh bg-background lg:grid lg:grid-cols-[minmax(20rem,0.9fr)_minmax(28rem,1.1fr)]">
      <section className="bg-primary px-6 py-7 text-primary-foreground sm:px-10 lg:flex lg:min-h-svh lg:flex-col lg:justify-between lg:px-14 lg:py-12">
        <div>
          <p className="text-lg font-semibold tracking-tight">
            Alumni Mendunia SMK
          </p>
          <div className="mt-5 h-1 w-16 rounded-sm bg-accent" aria-hidden="true" />
        </div>

        <div className="mt-16 hidden max-w-md lg:block">
          <h2 className="text-3xl font-semibold leading-tight">
            Pendataan alumni yang bekerja di luar negeri.
          </h2>
          <p className="mt-5 text-base leading-7 text-slate-200">
            Akses terbatas untuk petugas sekolah dan pengguna Dinas Pendidikan
            Provinsi DKI Jakarta.
          </p>
        </div>

        <p className="mt-10 text-xs leading-5 text-slate-300 lg:mt-16">
          Dinas Pendidikan Provinsi DKI Jakarta
        </p>
      </section>

      <section className="flex items-center justify-center px-5 py-10 sm:px-10 lg:px-14">
        <div className="w-full max-w-md">
          {isCheckingSession ? (
            <div
              role="status"
              aria-live="polite"
              className="rounded-lg border bg-white p-6 sm:p-8"
            >
              <div
                className="h-1 w-12 rounded-sm bg-accent"
                aria-hidden="true"
              />
              <p className="mt-5 font-medium text-primary">Memeriksa sesi</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Menyiapkan akses masuk Anda.
              </p>
            </div>
          ) : (
            <>
              <LoginForm />
              <p className="mt-5 text-center text-xs leading-5 text-muted-foreground">
                Pembuatan akun dilakukan oleh Admin Dinas.
              </p>
            </>
          )}
        </div>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginScreen isCheckingSession />}>
      <LoginContent />
    </Suspense>
  );
}
