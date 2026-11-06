"use client";

import { FormSession, useFormActivity } from "@/components/ui/form-session";

import Link from "next/link";
import {
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ComponentPropsWithoutRef,
} from "react";
import { useRouter } from "next/navigation";
import { loginWithPassword } from "@/app/auth/login/actions";
import { SchoolLoginForm } from "@/components/school-login-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { LoadingIndicator } from "@/components/ui/loading";
import { loginSchema, type LoginMode } from "@/lib/auth/login-schema";
import type { SchoolLookup } from "@/lib/auth/school-auth";
import { cn } from "@/lib/utils";

function LoginFormContent({
  className,
  initialMode = "school",
  ...props
}: ComponentPropsWithoutRef<"div"> & { initialMode?: LoginMode }) {
  const [mode, setMode] = useState<LoginMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [resolvedSchool, setResolvedSchool] = useState<SchoolLookup | null>(
    null,
  );
  const busy = useRef(false);
  const schoolTab = useRef<HTMLButtonElement>(null);
  const dinasTab = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  const active = useFormActivity();

  function changeMode(next: LoginMode, focus = false) {
    if (busy.current || pending) return;
    setMode(next);
    setEmail("");
    setPassword("");
    setError(null);
    setResolvedSchool(null);
    if (focus) (next === "school" ? schoolTab : dinasTab).current?.focus();
  }
  function modeKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    changeMode(
      event.key === "ArrowLeft" || event.key === "Home" ? "school" : "dinas",
      true,
    );
  }
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    const parsed = loginSchema.safeParse({
      mode: "dinas",
      identity: email,
      password,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await loginWithPassword(parsed.data);
      if (!active.current) return;
      if (!result.success) {
        setError(result.message ?? "Identitas atau kata sandi tidak valid.");
        return;
      }
      router.replace(result.redirectTo ?? "/dashboard");
      router.refresh();
    } catch {
      if (!active.current) return;
      setError("Identitas atau kata sandi tidak valid.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  const schoolDescription = !resolvedSchool
    ? "Masukkan NPSN untuk masuk atau mengaktifkan akun sekolah."
    : resolvedSchool.status === "UNCLAIMED"
      ? "Gunakan email resmi sekolah untuk memulai aktivasi akun."
      : resolvedSchool.status === "PENDING_ACTIVATION"
        ? "Lanjutkan aktivasi melalui tautan yang dikirim ke email sekolah."
        : resolvedSchool.status === "ACTIVE"
          ? "Masukkan kata sandi akun sekolah untuk melanjutkan."
          : "Akses akun sekolah ini sedang dinonaktifkan.";

  return (
    <div className={cn("w-full", className)} {...props}>
      <p className="type-meta hidden font-semibold tracking-[0.08em] text-primary lg:block">
        PORTAL RESMI BIDANG SMK
      </p>
      <h1 className="type-page-title font-extrabold text-slate-900 lg:mt-2">
        Masuk ke sistem
      </h1>
      <p className="mt-1.5 text-sm leading-6 text-slate-600">
        {mode === "school"
          ? schoolDescription
          : "Gunakan akun yang telah dibuat oleh Dinas."}
      </p>
      <div
        role="radiogroup"
        aria-label="Jenis akun"
        className="mt-6 flex rounded-xl bg-slate-100 p-1"
      >
        {(["school", "dinas"] as const).map((item) => (
          <button
            key={item}
            ref={item === "school" ? schoolTab : dinasTab}
            type="button"
            role="radio"
            aria-checked={mode === item}
            tabIndex={mode === item ? 0 : -1}
            disabled={pending}
            onClick={() => changeMode(item)}
            onKeyDown={modeKeyDown}
            className={cn(
              "min-h-11 flex-1 rounded-lg px-4 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:text-muted-foreground",
              mode === item
                ? "bg-white text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item === "school" ? "Sekolah" : "Dinas"}
          </button>
        ))}
      </div>
      {mode === "school" ? (
        <SchoolLoginForm
          onPendingChange={setPending}
          onSchoolChange={setResolvedSchool}
        />
      ) : (
        <form
          onSubmit={login}
          noValidate
          aria-busy={pending}
          className="mt-6 space-y-5"
        >
          <div className="space-y-2">
            <Label htmlFor="login-identity">Email</Label>
            <Input
              id="login-identity"
              type="email"
              autoComplete="email"
              value={email}
              disabled={pending}
              onChange={(event) => {
                setEmail(event.target.value);
                setError(null);
              }}
              placeholder="nama@instansi.com"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "dinas-login-error" : undefined}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Kata sandi</Label>
            <PasswordInput
              id="password"
              autoComplete="current-password"
              value={password}
              disabled={pending}
              onChange={(event) => {
                setPassword(event.target.value);
                setError(null);
              }}
              placeholder="Password"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "dinas-login-error" : undefined}
            />
          </div>
          {error && (
            <p
              id="dinas-login-error"
              role="alert"
              className="text-sm text-red-800"
            >
              {error}
            </p>
          )}
          <div className="text-right">
            <Link
              href="/auth/forgot-password"
              className="inline-flex items-center rounded text-sm text-primary underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              Lupa kata sandi?
            </Link>
          </div>
          <Button type="submit" disabled={pending} className="w-full">
            {pending && <LoadingIndicator size="sm" />}
            {pending ? "Memeriksa akun..." : "Masuk"}
          </Button>
        </form>
      )}
    </div>
  );
}

export function LoginForm(
  props: React.ComponentProps<typeof LoginFormContent>,
) {
  return (
    <FormSession>
      <LoginFormContent {...props} />
    </FormSession>
  );
}
