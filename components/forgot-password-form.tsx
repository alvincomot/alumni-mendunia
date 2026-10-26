"use client";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { useState } from "react";

export function ForgotPasswordForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleForgotPassword = async (
    e: React.SubmitEvent<HTMLFormElement>,
  ) => {
    e.preventDefault();
    if (isLoading) return;
    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    try {
      // The url which will be included in the email. This URL needs to be configured in your redirect URLs in the Supabase dashboard at https://supabase.com/dashboard/project/_/auth/url-configuration
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback`,
      });
      if (error) throw error;
      setSuccess(true);
    } catch {
      setError(
        "Permintaan belum dapat diproses. Tunggu beberapa saat lalu coba kembali.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      {success ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Periksa email Anda</CardTitle>
            <CardDescription>
              Permintaan pemulihan telah diproses.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Jika email terdaftar, Anda akan menerima tautan pemulihan kata
              sandi.
            </p>
            <Link
              href="/auth/login"
              className="mt-3 inline-flex min-h-11 items-center text-sm text-accent underline underline-offset-4"
            >
              Kembali ke login
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Pulihkan kata sandi</CardTitle>
            <CardDescription>
              Masukkan email akun yang didaftarkan oleh Admin Dinas.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleForgotPassword}>
              <div className="flex flex-col gap-6">
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    className="min-h-11"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                {error && (
                  <p role="alert" className="text-sm text-red-800">
                    {error}
                  </p>
                )}
                <Button
                  type="submit"
                  className="min-h-11 w-full"
                  disabled={isLoading}
                >
                  {isLoading ? "Mengirim..." : "Kirim tautan pemulihan"}
                </Button>
              </div>
              <div className="mt-4 text-center text-sm">
                Sudah dapat masuk?{" "}
                <Link
                  href="/auth/login"
                  className="inline-flex min-h-11 items-center underline underline-offset-4"
                >
                  Login
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
