import Link from "next/link";
import { Button } from "@/components/ui/button";

export function Pagination({
  path,
  params,
  page,
  total,
  size = 20,
}: {
  path: string;
  params: Record<string, string>;
  page: number;
  total: number;
  size?: number;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  const url = (p: number) =>
    `${path}?${new URLSearchParams({ ...params, page: String(p) })}`;
  return (
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm">
      <p>
        {total} data · Halaman {page} dari {pages}
      </p>
      <nav aria-label="Halaman data" className="flex gap-2">
        {page > 1 ? (
          <Button asChild variant="outline" className="min-h-11">
            <Link href={url(page - 1)}>Sebelumnya</Link>
          </Button>
        ) : (
          <Button disabled variant="outline" className="min-h-11">
            Sebelumnya
          </Button>
        )}
        {page < pages ? (
          <Button asChild variant="outline" className="min-h-11">
            <Link href={url(page + 1)}>Berikutnya</Link>
          </Button>
        ) : (
          <Button disabled variant="outline" className="min-h-11">
            Berikutnya
          </Button>
        )}
      </nav>
    </div>
  );
}
