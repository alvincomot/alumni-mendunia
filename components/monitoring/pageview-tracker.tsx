"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  createPageViewDeduper,
  normalizeMonitoredPath,
} from "@/lib/system-monitoring/paths";

const shouldRecord = createPageViewDeduper();

export function PageviewTracker() {
  const pathname = usePathname();

  useEffect(() => {
    const path = normalizeMonitoredPath(pathname);
    if (!path || !shouldRecord(path, performance.now())) return;
    void fetch("/api/monitoring/pageview", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
      keepalive: true,
    }).catch(() => undefined);
  }, [pathname]);

  return null;
}
