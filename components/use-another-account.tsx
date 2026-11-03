"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function UseAnotherAccount() {
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const router = useRouter();

  async function signOut() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError(false);
    try {
      const result = await createClient().auth.signOut({ scope: "local" });
      if (result.error) throw result.error;
      router.replace("/auth/login");
      router.refresh();
    } catch {
      setError(true);
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return (
    <div className="text-center">
      <button
        type="button"
        onClick={signOut}
        disabled={pending}
        className="min-h-11 rounded px-3 text-sm text-muted-foreground underline underline-offset-4 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-60"
      >
        {pending ? "Menutup sesi..." : "Gunakan akun lain"}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-800">
          Sesi belum dapat ditutup. Silakan coba lagi.
        </p>
      )}
    </div>
  );
}
