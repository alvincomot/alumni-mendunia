"use client";

import * as React from "react";
import * as ToastPrimitive from "@radix-ui/react-toast";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

type ToastVariant = "success" | "error";

type ToastOptions = {
  variant?: ToastVariant;
  duration?: number;
  destination?: string;
  action?: { label: string; href: string };
};

type ToastItem = ToastOptions & {
  variant: ToastVariant;
  duration: number;
  id: number;
  message: string;
};

type ToastContextValue = {
  toast: (message: string, options?: ToastOptions) => void;
};

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const nextId = React.useRef(0);
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const currentPath = React.useRef<string | null>(null);

  const toast = React.useCallback(
    (message: string, options: ToastOptions = {}) => {
      const id = ++nextId.current;
      setItems((current) => [
        ...current,
        {
          id,
          message,
          variant: options.variant ?? "success",
          duration: options.duration ?? 4000,
          destination: options.destination ?? currentPath.current ?? undefined,
          action: options.action,
        },
      ]);
    },
    [],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      <ToastPrimitive.Provider swipeDirection="right">
        {children}
        <React.Suspense fallback={null}>
          <ToastMessages
            items={items}
            setItems={setItems}
            currentPath={currentPath}
          />
        </React.Suspense>
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}

function ToastMessages({
  items,
  setItems,
  currentPath,
}: {
  items: ToastItem[];
  setItems: React.Dispatch<React.SetStateAction<ToastItem[]>>;
  currentPath: React.RefObject<string | null>;
}) {
  const pathname = usePathname();
  React.useEffect(() => {
    if (currentPath.current !== pathname) {
      currentPath.current = pathname;
      // Consumed feedback cannot return with a previously visited route.
      setItems((current) =>
        current.filter((item) => item.destination === pathname),
      );
    }
  }, [pathname, currentPath, setItems]);
  return (
    <>
      {items
        .filter((item) => !item.destination || item.destination === pathname)
        .map((item) => (
          <ToastPrimitive.Root
            key={item.id}
            defaultOpen
            duration={item.duration}
            type="foreground"
            onOpenChange={(open) => {
              if (!open)
                setItems((current) =>
                  current.filter((candidate) => candidate.id !== item.id),
                );
            }}
            className={cn(
              "grid min-h-14 grid-cols-[minmax(0,1fr)_2.75rem] items-center gap-3 rounded-lg border bg-white px-4 py-3 text-sm shadow-lg",
              item.variant === "success"
                ? "border-green-200 text-foreground"
                : "border-red-200 text-red-900",
            )}
          >
            <ToastPrimitive.Title className="font-medium leading-5">
              {item.message}
            </ToastPrimitive.Title>
            <ToastPrimitive.Close
              className="grid size-11 place-items-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Tutup notifikasi"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
                className="size-4"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </ToastPrimitive.Close>
            {item.action && (
              <ToastPrimitive.Action asChild altText={item.action.label}>
                <Link
                  href={item.action.href}
                  className="col-span-2 inline-flex min-h-11 items-center font-semibold text-accent underline underline-offset-4"
                >
                  {item.action.label}
                </Link>
              </ToastPrimitive.Action>
            )}
          </ToastPrimitive.Root>
        ))}
      <ToastPrimitive.Viewport className="fixed inset-x-4 bottom-4 z-[100] flex max-h-[80svh] flex-col gap-2 outline-none sm:left-auto sm:right-5 sm:w-full sm:max-w-sm" />
    </>
  );
}

export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider");
  return context;
}
