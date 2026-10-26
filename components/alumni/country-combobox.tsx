"use client";

import { forwardRef, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  getCountryOption,
  searchCountryOptions,
} from "@/lib/countries";
import { cn } from "@/lib/utils";

type CountryComboboxProps = {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  name?: string;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  allowClear?: boolean;
  ariaLabel?: string;
  id?: string;
  required?: boolean;
  onBlur?: () => void;
};

export const CountryCombobox = forwardRef<
  HTMLButtonElement,
  CountryComboboxProps
>(function CountryCombobox(
  {
    value,
    defaultValue = "",
    onValueChange,
    name,
    disabled = false,
    invalid = false,
    describedBy,
    allowClear = false,
    ariaLabel = "Negara tujuan",
    id,
    required = false,
    onBlur,
  },
  ref,
) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [internalValue, setInternalValue] = useState(defaultValue);
  const selectedValue = value === undefined ? internalValue : value;
  const selected = getCountryOption(selectedValue);
  const visibleOptions = searchCountryOptions(search);

  function select(nextValue: string) {
    if (value === undefined) setInternalValue(nextValue);
    onValueChange?.(nextValue);
    setSearch("");
    setOpen(false);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setSearch("");
      }}
    >
      {name && <input type="hidden" name={name} value={selected?.label ?? ""} />}
      <PopoverTrigger asChild>
        <Button
          ref={ref}
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-controls={listId}
          aria-invalid={invalid}
          aria-required={required}
          aria-describedby={describedBy}
          onBlur={onBlur}
          disabled={disabled}
          className="min-h-11 w-full min-w-0 justify-between bg-white px-3 font-normal shadow-sm"
        >
          <span
            className={cn(
              "truncate text-left",
              !selected && "text-muted-foreground",
            )}
          >
            {selected?.label ?? "Pilih negara tujuan"}
          </span>
          <svg
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground"
          >
            <path
              d="m6.5 8 3.5 3.5L13.5 8"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] min-w-[min(20rem,calc(100vw-2rem))] p-0"
      >
        <Command shouldFilter={false}>
          <CommandInput
            autoFocus
            value={search}
            onValueChange={setSearch}
            placeholder="Cari negara..."
            aria-label="Cari negara"
          />
          <CommandList id={listId}>
            <CommandEmpty>Negara tidak ditemukan</CommandEmpty>
            <CommandGroup>
              {allowClear && !search && (
                <CommandItem value="__all__" onSelect={() => select("")}>
                  <span className="w-5 shrink-0" aria-hidden="true" />
                  Semua negara
                </CommandItem>
              )}
              {visibleOptions.map((option) => (
                <CommandItem
                  key={option.code}
                  value={option.code}
                  onSelect={() => select(option.label)}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "w-5 shrink-0",
                      selected?.code !== option.code && "invisible",
                    )}
                  >
                    <svg
                      viewBox="0 0 20 20"
                      fill="none"
                      className="size-4"
                    >
                      <path
                        d="m4 10 3.5 3.5L16 5"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <span>{option.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
});
