export function isMissingPlacementStateSchema(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  const code = String(error.code);
  return code === "42703" || code === "PGRST204";
}

export function inferLegacyPlacementSecured(status: unknown): true | null {
  return status === "aktif_bekerja" || status === "selesai_kontrak"
    ? true
    : null;
}
