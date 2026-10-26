"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CountryCombobox } from "@/components/alumni/country-combobox";

export type FilterField = {
  name: string;
  label: string;
  type?: "search" | "number" | "date";
  options?: { value: string; label: string }[];
  country?: boolean;
};
export function Filters({
  path,
  values,
  fields,
}: {
  path: string;
  values: Record<string, string>;
  fields: FilterField[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const params = new URLSearchParams();
    for (const [key, value] of formData.entries()) {
      const str = String(value).trim();
      if (str) params.set(key, str);
    }
    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `${path}?${qs}` : path);
    });
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="my-6 grid items-end gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      {fields.map((field) =>
        field.country ? (
          <div
            key={field.name}
            className="block min-w-0 space-y-2 text-sm font-medium"
          >
            <span>{field.label}</span>
            <CountryCombobox
              name={field.name}
              defaultValue={values[field.name] ?? ""}
              allowClear
              ariaLabel={field.label}
            />
          </div>
        ) : (
          <label
            key={field.name}
            className="block min-w-0 space-y-2 text-sm font-medium"
          >
            <span>{field.label}</span>
            {field.options ? (
              <select
                name={field.name}
                key={values[field.name]}
                defaultValue={values[field.name] ?? ""}
                className="block min-h-11 w-full rounded-md border bg-white px-3 font-normal focus-visible:outline-accent"
              >
                <option value="">Semua</option>
                {field.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                name={field.name}
                key={values[field.name]}
                type={field.type ?? "search"}
                defaultValue={values[field.name] ?? ""}
                maxLength={150}
                className="block min-h-11 w-full rounded-md border bg-white px-3 font-normal focus-visible:outline-accent"
              />
            )}
          </label>
        ),
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={isPending} className="min-h-11">
          {isPending ? "Memuat..." : "Terapkan"}
        </Button>
        <Button asChild variant="outline" className="min-h-11">
          <Link href={path}>Reset</Link>
        </Button>
      </div>
    </form>
  );
}
