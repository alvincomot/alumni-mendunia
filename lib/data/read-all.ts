import "server-only";

// Fail rather than return misleading totals when an operational limit is reached.
export async function readAllRows<T>(
  fetchPage: (
    start: number,
    end: number,
  ) => PromiseLike<{
    data: T[] | null;
    error: unknown;
    count: number | null;
  }>,
  maximum = 50000,
): Promise<T[]> {
  const rows: T[] = [];
  let initialCount: number | null = null;
  while (true) {
    const result = await fetchPage(rows.length, rows.length + 499);
    if (result.error || result.count === null || result.count > maximum)
      throw new Error("Data scope unavailable or too large");
    if (initialCount !== null && result.count !== initialCount)
      throw new Error("Data changed during pagination; reload required");
    initialCount = result.count;
    rows.push(...(result.data ?? []));
    if (rows.length >= result.count) return rows;
    if (!result.data?.length || rows.length >= maximum)
      throw new Error("Incomplete data scope");
  }
}
