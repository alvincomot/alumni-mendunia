const listPath = "/dashboard/murid-aktif";
const filterKeys = [
  "q",
  "school",
  "grade",
  "training",
  "placement",
  "page",
];

export function activeStudentListPath(params: Record<string, unknown>) {
  const query = new URLSearchParams();
  for (const key of filterKeys) {
    const value = params[key];
    if (typeof value === "string" && value.trim())
      query.set(key, value.trim().slice(0, 150));
  }
  return query.size ? `${listPath}?${query}` : listPath;
}

export function activeStudentReturnPath(value: unknown) {
  if (typeof value !== "string") return listPath;
  try {
    const url = new URL(value, "https://local.invalid");
    if (
      url.origin !== "https://local.invalid" ||
      url.pathname !== listPath ||
      url.hash
    )
      return listPath;
    return activeStudentListPath(Object.fromEntries(url.searchParams));
  } catch {
    return listPath;
  }
}

export function activeStudentDetailPath(id: string, returnTo: string) {
  const path = `${listPath}/${encodeURIComponent(id)}`;
  const destination = activeStudentReturnPath(returnTo);
  return destination === listPath
    ? path
    : `${path}?${new URLSearchParams({ returnTo: destination })}`;
}
