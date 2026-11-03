import { UpdatePasswordForm } from "@/components/update-password-form";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LoadingIndicator } from "@/components/ui/loading";
import { UseAnotherAccount } from "@/components/use-another-account";
import { isMissingPasswordChangeColumn } from "@/lib/auth/password-change";
import { getSchoolActivationContext } from "@/lib/auth/school-activation";

async function Content() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || typeof userId !== "string") redirect("/auth/login");
  const verified = await supabase.auth.getUser();
  if (verified.error || verified.data.user?.id !== userId)
    redirect("/auth/login");
  let profile = await supabase
    .from("profiles")
    .select("role, is_active, must_change_password")
    .eq("user_id", userId)
    .maybeSingle();
  if (isMissingPasswordChangeColumn(profile.error)) {
    const fallback = await supabase
      .from("profiles")
      .select("role, is_active")
      .eq("user_id", userId)
      .maybeSingle();
    profile = {
      ...fallback,
      data: fallback.data
        ? { ...fallback.data, must_change_password: false }
        : null,
    } as typeof profile;
  }
  if (profile.error) throw new Error("Password profile unavailable");
  const activation = !profile.data || profile.data.role === "petugas_sekolah"
    ? await getSchoolActivationContext(userId)
    : null;
  if (!activation && !profile.data)
    return (
      <main className="flex min-h-svh items-center justify-center bg-background px-4 py-8 sm:p-8">
        <div className="w-full max-w-md space-y-4 rounded-xl border bg-card p-6">
          <h1 className="type-page-title text-primary">Aktivasi belum dapat dilanjutkan</h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Permintaan aktivasi telah kedaluwarsa atau belum terhubung ke akun.
            Pilih Gunakan akun lain untuk kembali ke login, lalu masukkan NPSN
            dan minta tautan aktivasi baru.
          </p>
          <UseAnotherAccount />
        </div>
      </main>
    );
  if (!activation && (!profile.data || profile.data.is_active !== true))
    redirect("/auth/access-denied");
  return (
    <main className="flex min-h-svh w-full items-center justify-center bg-background px-4 py-8 sm:p-8">
      <div className="w-full max-w-md space-y-4">
        <UpdatePasswordForm
          required={profile.data?.must_change_password === true}
          activation={activation ? { name: activation.name, npsn: activation.npsn } : undefined}
        />
        {(activation || profile.data?.must_change_password === true) && <UseAnotherAccount />}
      </div>
    </main>
  );
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-svh items-center justify-center bg-background px-4 py-8 sm:p-8">
          <div
            role="status"
            aria-live="polite"
            className="w-full max-w-md rounded-xl border bg-card p-6"
          >
            <LoadingIndicator className="text-accent" />
            <p className="mt-4 font-medium text-primary">Memeriksa sesi</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Menyiapkan formulir kata sandi baru.
            </p>
          </div>
        </main>
      }
    >
      <Content />
    </Suspense>
  );
}
