const listPath = "/dashboard/alumni";
const filterKeys = [
  "q",
  "school",
  "year",
  "country",
  "status",
  "sector",
  "sort",
  "page",
];

export function alumniListPath(params: Record<string, unknown>) {
  const query = new URLSearchParams();
  for (const key of filterKeys) {
    const value = params[key];
    if (typeof value === "string" && value.trim())
      query.set(key, value.trim().slice(0, 150));
  }
  return query.size ? `${listPath}?${query}` : listPath;
}

export function alumniReturnPath(value: unknown) {
  if (typeof value !== "string") return listPath;
  try {
    const url = new URL(value, "https://local.invalid");
    if (
      url.origin !== "https://local.invalid" ||
      url.pathname !== listPath ||
      url.hash
    )
      return listPath;
    return alumniListPath(Object.fromEntries(url.searchParams));
  } catch {
    return listPath;
  }
}

export function alumniFormPath(path: string, returnTo: string) {
  const destination = alumniReturnPath(returnTo);
  return destination === listPath
    ? path
    : `${path}?${new URLSearchParams({ returnTo: destination })}`;
}
