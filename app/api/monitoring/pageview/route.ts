import { getAlumniAccess } from "@/lib/alumni/access";
import { normalizeMonitoredPath } from "@/lib/system-monitoring/paths";

const responseHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(null, { status: 400, headers: responseHeaders });
  }
  const path = normalizeMonitoredPath(
    body && typeof body === "object" && "path" in body ? body.path : null,
  );
  if (!path)
    return new Response(null, { status: 400, headers: responseHeaders });

  const access = await getAlumniAccess();
  if (!access.allowed)
    return new Response(null, {
      status: access.reason === "session" ? 401 : 403,
      headers: responseHeaders,
    });

  const result = await access.supabase.rpc("record_app_pageview", {
    p_path: path,
  });
  // Telemetry must never break the operational dashboard. Missing migrations
  // and transient database errors are surfaced on the monitoring summary.
  if (result.error)
    return new Response(null, { status: 204, headers: responseHeaders });
  return new Response(null, { status: 204, headers: responseHeaders });
}
