"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";

export function FormSession({ children }: { children: ReactNode }) {
  const [session, setSession] = useState(0);
  // Activity preserves hidden routes; a new visit must not revive a submitted draft.
  useEffect(() => () => setSession((value) => value + 1), []);
  return <Fragment key={session}>{children}</Fragment>;
}

export function useFormActivity() {
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  return active;
}
