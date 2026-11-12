"use client";

import * as React from "react";

import { DashboardIcon } from "@/components/dashboard-icon";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const PasswordInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.ComponentProps<typeof Input>, "type">
>(({ className, disabled, ...props }, ref) => {
  const [visible, setVisible] = React.useState(false);

  return (
    <div className="relative rounded-lg focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
      <Input
        ref={ref}
        type={visible ? "text" : "password"}
        disabled={disabled}
        className={cn(
          "pr-12 focus-visible:ring-0 focus-visible:ring-offset-0",
          className,
        )}
        {...props}
      />
      <button
        type="button"
        disabled={disabled}
        aria-label={visible ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
        aria-pressed={visible}
        onClick={() => setVisible((current) => !current)}
        className="absolute inset-y-0 right-0 grid min-h-11 w-12 place-items-center rounded-r-lg text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:text-foreground disabled:cursor-not-allowed disabled:text-muted-foreground"
      >
        <DashboardIcon
          name={visible ? "eyeOff" : "eye"}
          className="size-5"
        />
      </button>
    </div>
  );
});
PasswordInput.displayName = "PasswordInput";
