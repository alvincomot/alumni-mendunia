"use client";

import { FormSession, useFormActivity } from "@/components/ui/form-session";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { changePassword } from "@/app/auth/update-password/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { LoadingIndicator } from "@/components/ui/loading";
import { SchoolIdentity } from "@/components/auth/school-identity";
import { PasswordInput } from "@/components/ui/password-input";
import { useToast } from "@/components/ui/toast";
import { passwordChangeSchema } from "@/lib/auth/password-change";
import { cn } from "@/lib/utils";

type PasswordErrors = Partial<
  Record<"password" | "confirmation" | "form", string>
>;

function UpdatePasswordFormContent({
  required = false,
  activation,
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div"> & {
  required?: boolean;
  activation?: { name: string; npsn: string };
}) {
  const busy = useRef(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [errors, setErrors] = useState<PasswordErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmationRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const active = useFormActivity();
  const { toast } = useToast();

  async function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    const parsed = passwordChangeSchema.safeParse({ password, confirmation });
    if (!parsed.success) {
      const nextErrors: PasswordErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (
          (field === "password" || field === "confirmation") &&
          !nextErrors[field]
        )
          nextErrors[field] = issue.message;
      }
      setErrors(nextErrors);
      if (nextErrors.password) passwordRef.current?.focus();
      else confirmationRef.current?.focus();
      return;
    }

    busy.current = true;
    setIsLoading(true);
    setErrors({});
    try {
      const result = await changePassword(parsed.data);
      if (!active.current) return;
      if (!result.success) {
        setErrors({ form: result.message });
        return;
      }
      setPassword("");
      setConfirmation("");
      toast("Kata sandi berhasil diperbarui.", {
        destination: result.redirectTo ?? "/dashboard",
      });
      router.replace(result.redirectTo ?? "/dashboard");
      router.refresh();
    } catch {
      if (!active.current) return;
      setErrors({
        form: "Kata sandi belum dapat diperbarui. Periksa koneksi lalu coba kembali.",
      });
    } finally {
      busy.current = false;
      setIsLoading(false);
    }
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-2xl font-bold leading-8 tracking-tight">
            <h1>
              {activation
                ? "Buat Kata Sandi"
                : required
                  ? "Ganti kata sandi sementara"
                  : "Atur ulang kata sandi"}
            </h1>
          </CardTitle>
          <CardDescription>
            {activation
              ? "Buat kata sandi untuk menyelesaikan aktivasi akun sekolah."
              : required
                ? "Buat kata sandi pribadi sebelum melanjutkan ke dashboard."
                : "Buat kata sandi baru. Setelah disimpan, masuk kembali menggunakan kata sandi tersebut."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {activation && (
            <SchoolIdentity
              name={activation.name}
              npsn={activation.npsn}
              className="mb-6"
            />
          )}
          <form onSubmit={handleSubmit} noValidate aria-busy={isLoading}>
            <fieldset disabled={isLoading} className="flex flex-col gap-6">
              <div className="grid gap-2">
                <Label htmlFor="password">Kata sandi baru</Label>
                <PasswordInput
                  ref={passwordRef}
                  id="password"
                  autoComplete="new-password"
                  className="min-h-11"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setErrors((current) => ({
                      ...current,
                      password: undefined,
                      form: undefined,
                    }));
                  }}
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={
                    errors.password ? "password-error" : "password-help"
                  }
                />
                {errors.password ? (
                  <p
                    id="password-error"
                    role="alert"
                    className="text-sm text-red-800"
                  >
                    {errors.password}
                  </p>
                ) : (
                  <p
                    id="password-help"
                    className="text-sm text-muted-foreground"
                  >
                    Gunakan minimal 8 karakter.
                  </p>
                )}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="confirmation">Ulangi kata sandi baru</Label>
                <PasswordInput
                  ref={confirmationRef}
                  id="confirmation"
                  autoComplete="new-password"
                  value={confirmation}
                  onChange={(event) => {
                    setConfirmation(event.target.value);
                    setErrors((current) => ({
                      ...current,
                      confirmation: undefined,
                      form: undefined,
                    }));
                  }}
                  className="min-h-11"
                  aria-invalid={Boolean(errors.confirmation)}
                  aria-describedby={
                    errors.confirmation ? "confirmation-error" : undefined
                  }
                />
                {errors.confirmation && (
                  <p
                    id="confirmation-error"
                    role="alert"
                    className="text-sm text-red-800"
                  >
                    {errors.confirmation}
                  </p>
                )}
              </div>
              {errors.form && (
                <p role="alert" className="text-sm leading-6 text-red-800">
                  {errors.form}
                </p>
              )}
              <Button type="submit" className="min-h-11 w-full">
                {isLoading && <LoadingIndicator size="sm" />}
                {isLoading
                  ? "Menyimpan..."
                  : activation
                    ? "Buat Kata Sandi"
                    : "Simpan kata sandi"}
              </Button>
            </fieldset>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export function UpdatePasswordForm(
  props: React.ComponentProps<typeof UpdatePasswordFormContent>,
) {
  return (
    <FormSession key={`${props.required}:${props.activation?.npsn ?? "dinas"}`}>
      <UpdatePasswordFormContent {...props} />
    </FormSession>
  );
}
