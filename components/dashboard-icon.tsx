import type { ReactNode, SVGProps } from "react";

export type DashboardIconName =
  | "dashboard"
  | "alumni"
  | "building"
  | "schoolBuilding"
  | "users"
  | "chart"
  | "history"
  | "menu"
  | "close"
  | "search"
  | "user"
  | "plane"
  | "briefcase"
  | "clipboard"
  | "cancel"
  | "clock"
  | "calendar"
  | "eye"
  | "eyeOff";

export function DashboardIcon({
  name,
  ...props
}: SVGProps<SVGSVGElement> & { name: DashboardIconName }) {
  const paths: Record<DashboardIconName, ReactNode> = {
    dashboard: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    alumni: (
      <>
        <path d="m3 9 9-5 9 5-9 5-9-5Z" />
        <path d="M7 12v4.5c2.8 2 7.2 2 10 0V12" />
        <path d="M21 9v6" />
      </>
    ),
    building: (
      <>
        <path d="M4 21V7l8-4 8 4v14" />
        <path d="M8 9h2m4 0h2m-8 4h2m4 0h2m-8 4h2m4 0h2M2 21h20" />
      </>
    ),
    schoolBuilding: (
      <>
        <rect x="5" y="3" width="14" height="18" rx="2" />
        <path d="M3 21h18M9 21v-5h6v5" />
        <circle cx="9" cy="8" r="0.75" fill="currentColor" stroke="none" />
        <circle cx="15" cy="8" r="0.75" fill="currentColor" stroke="none" />
        <circle cx="9" cy="12" r="0.75" fill="currentColor" stroke="none" />
        <circle cx="15" cy="12" r="0.75" fill="currentColor" stroke="none" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20v-1a6 6 0 0 1 12 0v1" />
        <path d="M16 5.3a3 3 0 0 1 0 5.4M17 14a5 5 0 0 1 4 5v1" />
      </>
    ),
    chart: (
      <>
        <path d="M4 20V10m6 10V4m6 16v-7m4 7H2" />
      </>
    ),
    history: (
      <>
        <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
        <path d="M3 3v5h5M12 7v5l3 2" />
      </>
    ),
    menu: <path d="M4 7h16M4 12h16M4 17h16" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    ),
    plane: <path d="m3 11.5 18-7.5-7.5 17-2.5-7-8-2.5Zm8 2.5 4-4" />,
    briefcase: (
      <>
        <rect x="3" y="7" width="18" height="13" rx="2" />
        <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18" />
      </>
    ),
    clipboard: (
      <>
        <rect x="5" y="4" width="14" height="17" rx="2" />
        <path d="M9 4V2h6v2M9 12l2 2 4-4" />
      </>
    ),
    cancel: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m9 9 6 6m0-6-6 6" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M8 3v4m8-4v4M3 10h18" />
      </>
    ),
    eye: (
      <>
        <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6S2.5 12 2.5 12Z" />
        <circle cx="12" cy="12" r="2.5" />
      </>
    ),
    eyeOff: (
      <>
        <path d="M3 3l18 18M10.6 6.2A10.5 10.5 0 0 1 12 6c6 0 9.5 6 9.5 6a16.5 16.5 0 0 1-2.4 3.1M6.3 6.3A16.7 16.7 0 0 0 2.5 12s3.5 6 9.5 6a10.7 10.7 0 0 0 3.1-.5" />
        <path d="M10.2 10.2a2.5 2.5 0 0 0 3.6 3.6" />
      </>
    ),
  };

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
