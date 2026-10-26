import { createClient } from "@/lib/supabase/server";
import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const candidate = searchParams.get("type");
  const allowedTypes: EmailOtpType[] = [
    "invite",
    "recovery",
    "email",
    "email_change",
    "signup",
  ];
  const type = allowedTypes.find((value) => value === candidate);
  const destination =
    type === "invite" || type === "recovery"
      ? "/auth/update-password"
      : "/dashboard";

  if (token_hash && type) {
    let verified = false;
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.verifyOtp({ type, token_hash });
      verified = !error;
    } catch {
      verified = false;
    }
    if (verified) {
      redirect(destination);
    } else {
      redirect("/auth/error");
    }
  }

  redirect("/auth/error");
}
