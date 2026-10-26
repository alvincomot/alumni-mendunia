"use client";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const logout = async () => {
    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    try {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) throw signOutError;
      router.replace("/auth/login");
      router.refresh();
    } catch {
      setError("Gagal keluar. Silakan coba lagi.");
    } finally {
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
        className="min-h-11 border-slate-300 bg-white text-primary shadow-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
      >
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
