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
import { useRouter } from "next/navigation";
import { useState } from "react";

export function UpdatePasswordForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleForgotPassword = async (
    e: React.SubmitEvent<HTMLFormElement>,
  ) => {
    e.preventDefault();
    if (isLoading) return;
    if (password.length < 12 || password !== confirmation) {
      setError(
        "Gunakan minimal 12 karakter dan pastikan kedua kata sandi sama.",
      );
      return;
    }
    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError(
        "Kata sandi belum dapat diperbarui. Periksa ketentuan kata sandi atau minta tautan pemulihan baru.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Atur kata sandi</CardTitle>
          <CardDescription>
            Gunakan minimal 12 karakter. Jangan gunakan kata sandi dari layanan
            lain.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleForgotPassword}>
            <div className="flex flex-col gap-6">
              <div className="grid gap-2">
                <Label htmlFor="password">Kata sandi baru</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  className="min-h-11"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="confirmation">Ulangi kata sandi baru</Label>
                <Input
                  id="confirmation"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  required
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  className="min-h-11"
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
                {isLoading ? "Menyimpan..." : "Simpan kata sandi"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
