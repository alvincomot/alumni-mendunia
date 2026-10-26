import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code");
  let verified = false;
  if (code) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      verified = !error;
    } catch {
      verified = false;
    }
  }
  redirect(verified ? "/auth/update-password" : "/auth/error");
}
