import { getAlumniAccess } from "@/lib/alumni/access";
import { loadMonitoring } from "@/lib/monitoring/data";
import { exportCsv, filterRows, parseFilters } from "@/lib/monitoring/model";

export async function GET(request: Request) {
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  try {
    const access = await getAlumniAccess();
    if (!access.allowed)
      return new Response("Sesi atau profil tidak diizinkan.", {
        status: access.reason === "session" ? 401 : 403,
        headers,
      });
    if (access.role !== "admin_dinas" && access.role !== "viewer_dinas")
      return new Response("Akses laporan tidak diizinkan.", {
        status: 403,
        headers,
      });
    const filters = parseFilters(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const rows = filterRows(await loadMonitoring(access), filters);
    return new Response(exportCsv(rows), {
      headers: {
        ...headers,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="laporan-alumni.csv"',
      },
    });
  } catch {
    return new Response(
      "Laporan belum dapat dibuat. Muat ulang laporan dan coba kembali.",
      { status: 503, headers },
    );
  }
}
