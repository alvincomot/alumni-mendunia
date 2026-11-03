"use client";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { LoadingIndicator } from "@/components/ui/loading";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export function LogoutButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const busy = useRef(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const logout = async () => {
    if (busy.current) return;
    busy.current = true;
    setIsLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) throw signOutError;
      router.replace("/auth/login");
      router.refresh();
    } catch {
      setError("Gagal keluar. Silakan coba lagi.");
    } finally {
      busy.current = false;
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        type="button"
        variant="outline"
        onClick={logout}
        disabled={isLoading}
        className={
          compact
            ? "shrink-0 px-3"
            : "min-h-11 border-slate-300 bg-white text-primary shadow-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        }
      >
        {isLoading && <LoadingIndicator size="sm" />}
        {isLoading ? "Keluar..." : "Keluar"}
      </Button>
      {error && (
        <p role="alert" aria-live="polite" className="text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
