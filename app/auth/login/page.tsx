import { Suspense } from "react";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { LoadingIndicator } from "@/components/ui/loading";
import { createClient } from "@/lib/supabase/server";
import { getSchoolActivationContext } from "@/lib/auth/school-activation";
import type { LoginMode } from "@/lib/auth/login-schema";

type LoginPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

async function LoginContent({ searchParams }: LoginPageProps) {
  const params = searchParams ? await searchParams : undefined;
  const requestedMode = Array.isArray(params?.mode)
    ? params.mode[0]
    : params?.mode;
  const initialMode: LoginMode =
    requestedMode === "dinas" ? "dinas" : "school";
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (typeof data?.claims?.sub === "string") {
    const verified = await supabase.auth.getUser();
    if (!verified.error && verified.data.user?.id === data.claims.sub) {
      const profile = await supabase.from("profiles").select("role").eq("user_id", data.claims.sub).maybeSingle();
      if (profile.error) throw new Error("Profile unavailable");
      const activation = !profile.data || profile.data.role === "petugas_sekolah"
        ? await getSchoolActivationContext(data.claims.sub) : null;
      redirect(activation ? "/auth/update-password" : "/dashboard");
    }
  }

  return <LoginScreen initialMode={initialMode} />;
}

function LoginScreen({
  isCheckingSession = false,
  initialMode = "school",
}: {
  isCheckingSession?: boolean;
  initialMode?: LoginMode;
}) {
  return (
    <main className="min-h-svh w-full bg-background lg:grid lg:h-svh lg:grid-cols-2 lg:overflow-hidden">
      <section className="hidden bg-primary px-10 py-12 text-primary-foreground lg:flex lg:min-h-svh lg:flex-col lg:justify-between xl:px-16">

        <div className="relative z-10 my-auto max-w-xl">
          <h1 className="type-auth-hero">
            Pendataan alumni yang bekerja di luar negeri.
          </h1>
          <p className="mt-7 max-w-lg text-lg leading-7 text-slate-300">
            Akses terbatas untuk petugas sekolah dan pengguna Dinas Pendidikan
            Provinsi DKI Jakarta.
          </p>
        </div>

        <p className="relative z-10 text-xs font-medium leading-5 text-slate-400">
          © 2026 Dinas Pendidikan Provinsi DKI Jakarta. All Rights Reserved.
        </p>
      </section>

      <section className="flex min-h-svh min-w-0 items-start justify-center overflow-y-auto px-4 py-8 sm:px-8 lg:min-h-0">
        <div className="my-auto w-full min-w-0 max-w-md rounded-xl border bg-card p-6 sm:p-8">
          {isCheckingSession ? (
            <div role="status" aria-live="polite">
              <LoadingIndicator className="mb-5 text-primary" />
              <h1 className="type-page-title text-slate-900">
                Memeriksa sesi
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Menyiapkan akses masuk Anda.
              </p>
            </div>
          ) : (
            <LoginForm initialMode={initialMode} />
          )}
        </div>
      </section>
    </main>
  );
}

export default function LoginPage({ searchParams }: LoginPageProps = {}) {
  return (
    <Suspense fallback={<LoginScreen isCheckingSession />}>
      <LoginContent searchParams={searchParams} />
    </Suspense>
  );
}
