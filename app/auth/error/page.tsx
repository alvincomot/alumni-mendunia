import Link from "next/link";
import { Suspense } from "react";
import { AuthErrorFragmentScrubber } from "@/components/auth/auth-error-fragment-scrubber";
import { Button } from "@/components/ui/button";
import { LoadingIndicator } from "@/components/ui/loading";
import {
  readAuthFlowContext,
  type AuthErrorReason,
  type AuthFlowContext,
} from "@/lib/auth/auth-flow-context";

type SearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

type ErrorContent = {
  title: string;
  message: string;
  primary: { href: string; label: string };
  secondary?: { href: string; label: string };
};

const genericContent: ErrorContent = {
  title: "Tautan autentikasi tidak dapat diproses",
  message:
    "Konteks tautan tidak dapat diverifikasi. Kembali ke pilihan login untuk memulai alur yang sesuai.",
  primary: { href: "/auth/login", label: "Kembali ke pilihan login" },
};

const contextualContent: Record<AuthFlowContext, ErrorContent> = {
  school_activation: {
    title: "Aktivasi akun Sekolah tidak dapat dilanjutkan",
    message:
      "Tautan aktivasi tidak lagi dapat diproses. Masukkan NPSN sekolah untuk memeriksa status akun dan meminta tautan aktivasi baru.",
    primary: {
      href: "/auth/login?mode=school",
      label: "Kembali ke Login Sekolah",
    },
    secondary: {
      href: "/auth/login?mode=school&flow=activation",
      label: "Minta tautan aktivasi baru",
    },
  },
  school_recovery: {
    title: "Pemulihan akun Sekolah tidak dapat dilanjutkan",
    message:
      "Tautan pemulihan tidak lagi dapat diproses. Masukkan NPSN pada Login Sekolah, lalu pilih Lupa kata sandi untuk meminta tautan baru.",
    primary: {
      href: "/auth/login?mode=school&flow=recovery",
      label: "Pulihkan akun Sekolah",
    },
    secondary: {
      href: "/auth/login?mode=school",
      label: "Kembali ke Login Sekolah",
    },
  },
  dinas_invitation: {
    title: "Undangan akun Dinas tidak dapat dilanjutkan",
    message:
      "Tautan undangan tidak lagi dapat diproses. Hubungi Admin Dinas untuk memastikan status undangan sebelum mencoba kembali.",
    primary: {
      href: "/auth/login?mode=dinas",
      label: "Kembali ke Login Dinas",
    },
  },
  dinas_recovery: {
    title: "Pemulihan akun Dinas tidak dapat dilanjutkan",
    message:
      "Tautan pemulihan tidak lagi dapat diproses. Minta tautan baru menggunakan email akun Dinas Anda.",
    primary: {
      href: "/auth/forgot-password",
      label: "Pulihkan akun Dinas",
    },
    secondary: {
      href: "/auth/login?mode=dinas",
      label: "Kembali ke Login Dinas",
    },
  },
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function readReason(value: string | undefined): AuthErrorReason | null {
  return value === "invalid_or_expired" ||
    value === "session_invalid" ||
    value === "unsupported_redirect"
    ? value
    : null;
}

function ErrorShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4 py-8 sm:p-8">
      <AuthErrorFragmentScrubber />
      <div className="w-full max-w-md rounded-xl border bg-card p-6">
        {children}
      </div>
    </main>
  );
}

async function ErrorContent({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const context = readAuthFlowContext(first(params.auth_context));
  const reason = readReason(first(params.reason));
  const baseContent = context ? contextualContent[context] : genericContent;
  const content =
    context && reason === "unsupported_redirect"
      ? {
          ...baseContent,
          message:
            "Layanan autentikasi membuka format sesi yang tidak dapat diproses oleh endpoint server. Minta tautan baru untuk melanjutkan; kondisi ini tidak memastikan bahwa tautan telah kedaluwarsa.",
        }
      : baseContent;

  return (
    <ErrorShell>
      <div aria-labelledby="auth-error-title">
        <h1 id="auth-error-title" className="type-page-title text-primary">
          {content.title}
        </h1>
        <p className="my-5 leading-7 text-slate-700">{content.message}</p>
        <div className="flex flex-wrap gap-3">
          <Button asChild className="min-h-11">
            <Link href={content.primary.href}>{content.primary.label}</Link>
          </Button>
          {content.secondary && (
            <Button asChild variant="outline" className="min-h-11">
              <Link href={content.secondary.href}>
                {content.secondary.label}
              </Link>
            </Button>
          )}
        </div>
      </div>
    </ErrorShell>
  );
}

function ErrorFallback() {
  return (
    <ErrorShell>
      <div role="status" aria-busy="true" aria-live="polite">
        <LoadingIndicator className="mb-5 text-primary" />
        <h1 className="type-page-title text-primary">Memeriksa tautan</h1>
        <p className="mt-2 leading-7 text-slate-700">
          Menyiapkan informasi autentikasi yang sesuai.
        </p>
      </div>
    </ErrorShell>
  );
}

export default function Page({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<ErrorFallback />}>
      <ErrorContent searchParams={searchParams} />
    </Suspense>
  );
}
