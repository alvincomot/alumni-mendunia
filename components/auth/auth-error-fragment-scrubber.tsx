"use client";

import { useEffect } from "react";

export function AuthErrorFragmentScrubber() {
  useEffect(() => {
    if (!window.location.hash) return;
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${window.location.search}`,
    );
  }, []);

  return null;
}
