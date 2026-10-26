import { z } from "zod";
import { optionalDateSchema } from "@/lib/alumni/schema";

export const auditFilterSchema = z
  .object({
    entity: z.enum(["", "schools", "profiles", "alumni", "placements"]),
    action: z.enum(["", "INSERT", "UPDATE", "DELETE"]),
    actor: z.union([z.uuid(), z.literal("")]),
    id: z.union([z.uuid(), z.literal("")]),
    from: optionalDateSchema,
    to: optionalDateSchema,
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: "Rentang tanggal tidak sesuai.",
  });

export function wibBoundary(date: string, nextDay = false) {
  const milliseconds = new Date(`${date}T00:00:00+07:00`).getTime();
  return new Date(milliseconds + (nextDay ? 86400000 : 0)).toISOString();
}
