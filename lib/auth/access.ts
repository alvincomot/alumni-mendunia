import "server-only";
import { redirect } from "next/navigation";
import { getAlumniAccess } from "@/lib/alumni/access";
import type { ApplicationRole } from "./roles";

export async function requireAccess(roles?: readonly ApplicationRole[]) {
  const access = await getAlumniAccess();
  if (!access.allowed)
    redirect(
      access.reason === "session" ? "/auth/login" : "/auth/access-denied",
    );
  if (roles && !roles.includes(access.role)) redirect("/auth/access-denied");
  return access;
}
