"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft } from "lucide-react";
import { useFormActivity } from "@/components/ui/form-session";
import { useRouter } from "next/navigation";
import { loginWithPassword } from "@/app/auth/login/actions";
import {
  lookupSchool,
  requestSchoolActivation,
  requestSchoolRecovery,
} from "@/app/auth/login/school-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { LoadingIndicator } from "@/components/ui/loading";
import { SchoolIdentity } from "@/components/auth/school-identity";
import { loginSchema } from "@/lib/auth/login-schema";
import {
  npsnSchema,
  schoolEmailSchema,
  type SchoolLookup,
  type SchoolAuthResult,
} from "@/lib/auth/school-auth";

function useServerCooldown() {
  const [remaining, setRemaining] = useState(0);
  const [until, setUntil] = useState(0);

  useEffect(() => {
    if (!until) {
      setRemaining(0);
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    function updateRemaining() {
      const next = Math.max(0, Math.ceil((until - Date.now()) / 1000));
      setRemaining(next);
      if (!next) {
        setUntil(0);
        return;
      }
      const nextBoundary = until - (next - 1) * 1000;
      timer = setTimeout(
        updateRemaining,
        Math.max(1, nextBoundary - Date.now()),
      );
    }
    updateRemaining();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [until]);

  function apply(seconds: number) {
    const next = Math.max(0, Math.ceil(seconds));
    setRemaining(next);
    setUntil(next ? Date.now() + next * 1000 : 0);
  }

  return { remaining, apply };
}

export function SchoolLoginForm({
  onPendingChange,
  onSchoolChange,
}: {
  onPendingChange?: (pending: boolean) => void;
  onSchoolChange?: (school: SchoolLookup | null) => void;
}) {
  const router = useRouter();
  const active = useFormActivity();
  const busy = useRef(false);
  const focusNpsnAfterChange = useRef(false);
  const npsnInput = useRef<HTMLInputElement>(null);
  const identityHeading = useRef<HTMLHeadingElement>(null);
  const [npsn, setNpsn] = useState("");
  const [school, setSchool] = useState<SchoolLookup | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const {
    remaining: schoolCooldown,
    apply: applySchoolCooldown,
  } = useServerCooldown();
  const {
    remaining: clientCooldown,
    apply: applyClientCooldown,
  } = useServerCooldown();
  const activationState =
    school?.status === "UNCLAIMED" || school?.status === "PENDING_ACTIVATION";
  const activationCooldown = Math.max(schoolCooldown, clientCooldown);

  useEffect(() => {
    if (school) {
      identityHeading.current?.focus();
    } else if (focusNpsnAfterChange.current) {
      focusNpsnAfterChange.current = false;
      npsnInput.current?.focus();
    }
  }, [school]);
  async function run(action: () => Promise<void>) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    onPendingChange?.(true);
    setError(null);
    setMessage(null);
    try {
      await action();
    } catch {
      setError(
        "Layanan belum dapat dihubungi. Periksa koneksi dan coba kembali.",
      );
    } finally {
      busy.current = false;
      setPending(false);
      onPendingChange?.(false);
    }
  }
  function showMailResult(result: SchoolAuthResult) {
    if (result.cooldowns) {
      applySchoolCooldown(result.cooldowns.school ?? 0);
      applyClientCooldown(result.cooldowns.client ?? 0);
    } else if (result.retryAfter !== undefined) {
      if (result.rateLimit === "application")
        applyClientCooldown(result.retryAfter);
      else applySchoolCooldown(result.retryAfter);
    }
    if (!result.success)
      setError(result.message ?? "Permintaan belum dapat diproses.");
    else setMessage(result.message ?? null);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!school) {
      const parsed = npsnSchema.safeParse(npsn);
      if (!parsed.success) {
        setError(parsed.error.issues[0].message);
        npsnInput.current?.focus();
        return;
      }
      await run(async () => {
        const result = await lookupSchool(parsed.data);
        if (!active.current) return;
        if (!result.success || !result.school) {
          setError(result.message ?? "Sekolah tidak ditemukan.");
          return;
        }
        setSchool(result.school);
        onSchoolChange?.(result.school);
        applySchoolCooldown(
          result.cooldowns?.school ?? result.school.retry_after,
        );
        applyClientCooldown(result.cooldowns?.client ?? 0);
      });
    } else if (school.status === "UNCLAIMED") {
      const parsed = schoolEmailSchema.safeParse(email);
      if (!parsed.success) {
        setError(parsed.error.issues[0].message);
        return;
      }
      await sendActivation(parsed.data);
    } else if (school.status === "ACTIVE") {
      const parsed = loginSchema.safeParse({
        mode: "school",
        identity: school.npsn,
        password,
      });
      if (!parsed.success) {
        setError(parsed.error.issues[0].message);
        return;
      }
      await run(async () => {
        const result = await loginWithPassword(parsed.data);
        if (!active.current) return;
        if (!result.success) {
          setError(result.message ?? "NPSN atau kata sandi tidak valid.");
          return;
        }
        router.replace(result.redirectTo ?? "/dashboard");
        router.refresh();
      });
    }
  }
  async function sendActivation(activationEmail?: string) {
    if (!school || activationCooldown) return;
    await run(async () => {
      const result = await requestSchoolActivation({
        npsn: school.npsn,
        ...(activationEmail ? { email: activationEmail } : {}),
      });
      if (!active.current) return;
      showMailResult(result);
      if (result.success) {
        const pendingSchool = {
          ...school,
          status: "PENDING_ACTIVATION" as const,
        };
        setSchool(pendingSchool);
        onSchoolChange?.(pendingSchool);
        setEmail("");
      }
    });
  }
  function changeNpsn() {
    if (busy.current) return;
    focusNpsnAfterChange.current = true;
    setSchool(null);
    onSchoolChange?.(null);
    setEmail("");
    setPassword("");
    setError(null);
    setMessage(null);
    applySchoolCooldown(0);
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-busy={pending}
      className="mt-6 space-y-5"
    >
      {!school ? (
        <div className="space-y-2">
          <Label htmlFor="school-npsn">NPSN</Label>
          <Input
            ref={npsnInput}
            id="school-npsn"
            autoComplete="username"
            inputMode="numeric"
            maxLength={8}
            value={npsn}
            onChange={(event) => {
              setNpsn(event.target.value.replace(/\D/g, "").slice(0, 8));
              setError(null);
            }}
            disabled={pending}
            placeholder="Masukkan 8 digit NPSN"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "school-login-error" : undefined}
          />
        </div>
      ) : (
        <div className="space-y-2">
          <Button
            type="button"
            variant="ghost"
            onClick={changeNpsn}
            disabled={pending}
            className="-ml-2 h-9 min-h-9 w-fit px-2 text-muted-foreground hover:text-primary disabled:bg-transparent"
          >
            <ArrowLeft aria-hidden="true" />
            Kembali
          </Button>
          <SchoolIdentity
            ref={identityHeading}
            name={school.name}
            npsn={school.npsn}
          />
        </div>
      )}
      {school?.status === "UNCLAIMED" && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="school-email">Email Sekolah</Label>
            <Input
              id="school-email"
              type="email"
              autoComplete="email"
              placeholder="Masukkan email resmi sekolah"
              value={email}
              disabled={pending}
              onChange={(event) => {
                setEmail(event.target.value);
                setError(null);
              }}
              aria-invalid={Boolean(error)}
              aria-describedby={
                error
                  ? "school-email-help school-login-error"
                  : "school-email-help"
              }
            />
          </div>
        </div>
      )}
      {school?.status === "PENDING_ACTIVATION" && (
        <div className="space-y-2 text-sm leading-6 text-slate-600">
          <h2 className="type-card-title text-foreground">
            Periksa email aktivasi
          </h2>
          <p>
            Aktivasi belum selesai. Buka tautan di email sekolah, lalu buat kata
            sandi untuk mengaktifkan akun.
          </p>
          <p>
            Belum menerima email atau tautan kedaluwarsa? Minta tautan baru di
            bawah. Jika permintaan aktivasi sudah kedaluwarsa, pilih Kembali dan
            cari sekolah kembali untuk memulai ulang.
          </p>
        </div>
      )}
      {school?.status === "ACTIVE" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="school-password">Kata sandi</Label>
            <Button
              type="button"
              variant="link"
              disabled={pending || schoolCooldown > 0}
              className="-my-2 min-h-11 px-0 text-primary disabled:bg-transparent"
              onClick={() =>
                run(async () =>
                  showMailResult(await requestSchoolRecovery(school.npsn)),
                )
              }
            >
              Lupa kata sandi?
            </Button>
          </div>
          <PasswordInput
            id="school-password"
            autoComplete="current-password"
            value={password}
            disabled={pending}
            onChange={(event) => {
              setPassword(event.target.value);
              setError(null);
            }}
            placeholder="Password"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "school-login-error" : undefined}
          />
        </div>
      )}
      {school?.status === "SUSPENDED" && (
        <div className="space-y-1.5" role="status">
          <h2 className="type-card-title text-foreground">
            Akses akun dinonaktifkan
          </h2>
          <p className="text-sm leading-6 text-red-800">
            Akun sekolah dinonaktifkan. Hubungi Dinas Pendidikan untuk bantuan
            akses.
          </p>
        </div>
      )}
      {error && (
        <p
          id="school-login-error"
          role="alert"
          className="text-sm leading-6 text-red-800"
        >
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-sm leading-6 text-slate-700">
          {message}
        </p>
      )}
      {schoolCooldown > 0 && school?.status !== "SUSPENDED" && (
        <p
          aria-live="polite"
          className="text-sm tabular-nums text-muted-foreground"
        >
          {activationState
            ? "Permintaan aktivasi sekolah ini"
            : "Permintaan email berikutnya"}{" "}
          tersedia dalam {schoolCooldown} detik.
        </p>
      )}
      {clientCooldown > 0 && activationState && (
        <p
          aria-live="polite"
          className="text-sm tabular-nums text-muted-foreground"
        >
          Batas permintaan dari jaringan ini tersedia kembali dalam{" "}
          {clientCooldown} detik.
        </p>
      )}
      {school?.status === "PENDING_ACTIVATION" ? (
        <Button
          type="button"
          onClick={() => sendActivation()}
          disabled={pending || activationCooldown > 0}
          className="w-full"
        >
          {pending && <LoadingIndicator size="sm" />}
          {pending ? "Memproses permintaan..." : "Kirim Ulang"}
        </Button>
      ) : (
        school?.status !== "SUSPENDED" && (
          <Button
            type="submit"
            disabled={
              pending ||
              (school?.status === "UNCLAIMED" && activationCooldown > 0)
            }
            className="w-full"
          >
            {pending && <LoadingIndicator size="sm" />}
            {pending
              ? "Memproses..."
              : !school
                ? "Lanjutkan"
                : school.status === "UNCLAIMED"
                  ? "Kirim Tautan Aktivasi"
                  : "Masuk"}
          </Button>
        )
      )}
    </form>
  );
}
