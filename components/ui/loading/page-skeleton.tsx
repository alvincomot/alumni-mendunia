import { LoadingRegion, Skeleton } from "./skeleton";

export function PageSkeleton({
  label,
  action = false,
  showHeader = true,
  children,
  className = "",
}: {
  label: string;
  action?: boolean;
  showHeader?: boolean;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <LoadingRegion
      label={label}
      className={`mx-auto w-full max-w-[90rem] ${className}`}
    >
      {(showHeader || action) && (
        <div className="flex flex-wrap items-start justify-end gap-4">
          {showHeader && (
            <div className="mr-auto min-w-0 flex-1">
              <Skeleton className="h-7 w-48 max-w-full" />
              <Skeleton className="mt-3 h-4 w-[32rem] max-w-full" />
            </div>
          )}
          {action && <Skeleton className="h-11 w-36 rounded-lg" />}
        </div>
      )}
      {children}
    </LoadingRegion>
  );
}

export function FilterSkeleton({
  fields = 4,
  inlineActions = false,
}: {
  fields?: number;
  inlineActions?: boolean;
}) {
  return (
    <div
      aria-hidden="true"
      className={`my-6 grid items-end gap-4 sm:grid-cols-2 ${
        inlineActions ? "xl:grid-cols-5" : "xl:grid-cols-4"
      }`}
    >
      {Array.from({ length: fields }, (_, index) => (
        <div key={index}>
          <Skeleton className="mb-2 h-3 w-24" />
          <Skeleton className="h-11 w-full bg-white ring-1 ring-slate-200" />
        </div>
      ))}
      <div className="flex gap-2">
        <Skeleton className="h-11 w-24 rounded-lg" />
        <Skeleton className="h-11 w-20 rounded-lg bg-white ring-1 ring-slate-200" />
      </div>
    </div>
  );
}
