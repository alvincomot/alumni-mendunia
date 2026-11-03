"use client";

import { FormSession } from "@/components/ui/form-session";

import { cn } from "@/lib/utils";
import { requestPasswordRecovery } from "@/app/auth/forgot-password/actions";
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
import { LoadingIndicator } from "@/components/ui/loading";
import Link from "next/link";
import { useRef, useState } from "react";
import {
  recoveryAcceptedMessage,
  recoveryEmailSchema,
  recoveryUnavailableMessage,
} from "@/lib/auth/recovery";

function ForgotPasswordFormContent({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [fieldError, setFieldError] = useState(false);
  const busy = useRef(false);
  const input = useRef<HTMLInputElement>(null);

  const handleForgotPassword = async (
    e: React.SubmitEvent<HTMLFormElement>,
  ) => {
    e.preventDefault();
    if (busy.current) return;
    const parsed = recoveryEmailSchema.safeParse(email);
    if (!parsed.success) {
      setError(
        parsed.error.issues[0]?.message ?? "Masukkan alamat email yang valid.",
      );
      setFieldError(true);
      input.current?.focus();
      return;
    }
    busy.current = true;
    setIsLoading(true);
    setError(null);
    setFieldError(false);

    try {
      const result = await requestPasswordRecovery(parsed.data);
      if (!result.success) {
        setError(result.message);
        setFieldError(result.field === "email");
        return;
      }
      setSuccess(true);
    } catch {
      setError(recoveryUnavailableMessage);
    } finally {
      busy.current = false;
      setIsLoading(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      {success ? (
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-2xl font-bold leading-8 tracking-tight">
              <h1>Periksa email Anda</h1>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p
              role="status"
              className="text-sm leading-6 text-muted-foreground"
            >
              {recoveryAcceptedMessage}
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
            <CardTitle className="font-heading text-2xl font-bold leading-8 tracking-tight">
              <h1>Pulihkan kata sandi</h1>
            </CardTitle>
            <CardDescription>
              Masukkan email akun Dinas yang didaftarkan oleh Admin Dinas.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={handleForgotPassword}
              noValidate
              aria-busy={isLoading}
            >
              <div className="flex flex-col gap-6">
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    ref={input}
                    id="email"
                    type="email"
                    autoComplete="email"
                    className="min-h-11"
                    required
                    disabled={isLoading}
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError(null);
                      setFieldError(false);
                    }}
                    aria-invalid={fieldError}
                    aria-describedby={
                      error ? "forgot-password-error" : undefined
                    }
                  />
                </div>
                {error && (
                  <p
                    id="forgot-password-error"
                    role="alert"
                    className="text-sm text-red-800"
                  >
                    {error}
                  </p>
                )}
                <Button
                  type="submit"
                  className="min-h-11 w-full"
                  disabled={isLoading}
                >
                  {isLoading && <LoadingIndicator size="sm" />}
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

export function ForgotPasswordForm(
  props: React.ComponentProps<typeof ForgotPasswordFormContent>,
) {
  return (
    <FormSession>
      <ForgotPasswordFormContent {...props} />
    </FormSession>
  );
}
