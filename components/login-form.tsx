"use client";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";

export function LoginForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isLoading) return;
    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError) {
        setError("Email atau kata sandi tidak sesuai.");
        return;
      }

      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("Tidak dapat masuk saat ini. Periksa koneksi lalu coba lagi.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn("w-full", className)} {...props}>
      <Card className="rounded-lg border-slate-200 shadow-sm">
        <CardHeader className="space-y-3 px-6 pb-5 pt-7 sm:px-8 sm:pt-8">
          <div className="h-1 w-12 rounded-sm bg-accent" aria-hidden="true" />
          <h1 className="text-2xl font-semibold leading-tight tracking-tight text-primary">
            Masuk ke sistem
          </h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Gunakan akun yang telah dibuat oleh Admin Dinas.
          </p>
        </CardHeader>
        <CardContent className="px-6 pb-7 sm:px-8 sm:pb-8">
          <form onSubmit={handleLogin} noValidate={false}>
            <div className="flex flex-col gap-5">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="nama@sekolah.sch.id"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="min-h-11 bg-white focus-visible:ring-2 focus-visible:ring-accent"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">Kata sandi</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="min-h-11 bg-white focus-visible:ring-2 focus-visible:ring-accent"
                />
              </div>
              {error && (
                <p
                  role="alert"
                  aria-live="polite"
                  className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm leading-5 text-red-800"
                >
                  {error}
                </p>
              )}
              <Button
                type="submit"
                className="min-h-11 w-full bg-accent text-accent-foreground shadow-sm hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
                disabled={isLoading}
              >
                {isLoading ? "Memeriksa akun..." : "Masuk"}
              </Button>
            </div>
          </form>
          <Link
            href="/auth/forgot-password"
            className="mt-4 inline-flex min-h-11 items-center text-sm text-accent underline underline-offset-4"
          >
            Lupa kata sandi?
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
