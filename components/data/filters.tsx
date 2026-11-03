"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CountryCombobox } from "@/components/alumni/country-combobox";
import { LoadingIndicator } from "@/components/ui/loading";
import { FormSession } from "@/components/ui/form-session";

export type FilterField = {
  name: string;
  label: string;
  type?: "search" | "number" | "date";
  placeholder?: string;
  maxLength?: number;
  options?: { value: string; label: string }[];
  country?: boolean;
};
function FiltersContent({
  path,
  values,
  fields,
}: {
  path: string;
  values: Record<string, string>;
  fields: FilterField[];
}) {
  const router = useRouter();
  const [resetSession, setResetSession] = useState(0);
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
      key={`${JSON.stringify(values)}:${resetSession}`}
      ref={formRef}
      onSubmit={handleSubmit}
      aria-busy={isPending}
      className="my-6 grid items-end gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      {fields.map((field) =>
        field.country ? (
          <div key={field.name} className="type-label block min-w-0 space-y-2">
            <span>{field.label}</span>
            <CountryCombobox
              key={values[field.name] ?? ""}
              name={field.name}
              defaultValue={values[field.name] ?? ""}
              allowClear
              ariaLabel={field.label}
            />
          </div>
        ) : (
          <label
            key={field.name}
            className="type-label block min-w-0 space-y-2"
          >
            <span>{field.label}</span>
            {field.options ? (
              <select
                name={field.name}
                key={values[field.name]}
                defaultValue={values[field.name] ?? ""}
                className="form-control block font-normal"
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
                maxLength={field.maxLength ?? 150}
                placeholder={field.placeholder}
                className="form-control block font-normal"
              />
            )}
          </label>
        ),
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={isPending} className="min-h-11">
          {isPending && <LoadingIndicator size="sm" />}
          {isPending ? "Memuat..." : "Terapkan"}
        </Button>
        <Button asChild variant="outline" className="min-h-11">
          <Link
            href={path}
            onClick={() => setResetSession((value) => value + 1)}
          >
            Reset
          </Link>
        </Button>
      </div>
    </form>
  );
}

export function Filters(props: React.ComponentProps<typeof FiltersContent>) {
  return (
    <FormSession>
      <FiltersContent {...props} />
    </FormSession>
  );
}
