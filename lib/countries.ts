import countries from "i18n-iso-countries";
import englishLocale from "i18n-iso-countries/langs/en.json";
import indonesianLocale from "i18n-iso-countries/langs/id.json";

countries.registerLocale(englishLocale);
countries.registerLocale(indonesianLocale);

export type CountryOption = {
  code: string;
  label: string;
  searchTerms: string[];
};

const commonIndonesianAliases: Record<string, string[]> = {
  AE: ["UEA"],
  CN: ["RRT"],
  GB: ["Inggris"],
  KP: ["Korut"],
  KR: ["Korsel", "Republik Korea"],
  US: ["Amerika"],
};

const indonesianNames = new Intl.DisplayNames(["id-ID"], {
  type: "region",
  fallback: "code",
});
const englishNames = new Intl.DisplayNames(["en"], {
  type: "region",
  fallback: "code",
});
const datasetIndonesianNames = countries.getNames("id", { select: "all" });
const datasetEnglishNames = countries.getNames("en", { select: "all" });

function unique(values: (string | undefined)[]) {
  return [...new Set(values.filter((value): value is string => !!value))];
}

export function normalizeCountrySearch(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("id-ID")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export const countryOptions: CountryOption[] = Object.keys(
  countries.getAlpha2Codes(),
)
  // The package includes XK as an extension; it is not an official ISO 3166-1 code.
  .filter(
    (code) => code !== "XK" && countries.alpha2ToNumeric(code) !== undefined,
  )
  .map((code) => {
    const label = indonesianNames.of(code) ?? code;
    return {
      code,
      label,
      searchTerms: unique([
        label,
        englishNames.of(code),
        ...(datasetIndonesianNames[code] ?? []),
        ...(datasetEnglishNames[code] ?? []),
        ...(commonIndonesianAliases[code] ?? []),
        code,
        countries.alpha2ToAlpha3(code),
      ]),
    };
  })
  .sort((left, right) => left.label.localeCompare(right.label, "id-ID"));

const optionsByCode = new Map(
  countryOptions.map((option) => [option.code, option]),
);
const aliasCandidates = new Map<string, Set<string>>();

for (const option of countryOptions) {
  for (const term of option.searchTerms) {
    const normalized = normalizeCountrySearch(term);
    if (!normalized) continue;
    const candidates = aliasCandidates.get(normalized) ?? new Set<string>();
    candidates.add(option.code);
    aliasCandidates.set(normalized, candidates);
  }
}

export function getCountryOption(value: string) {
  const normalized = normalizeCountrySearch(value);
  if (!normalized) return null;
  const candidates = aliasCandidates.get(normalized);
  if (!candidates || candidates.size !== 1) return null;
  return optionsByCode.get([...candidates][0]) ?? null;
}

export function getCanonicalCountryName(value: string) {
  return getCountryOption(value)?.label ?? null;
}

export function formatCountryName(value: string) {
  return getCanonicalCountryName(value) ?? value.trim();
}

export function searchCountryOptions(query: string) {
  const normalized = normalizeCountrySearch(query);
  if (!normalized) return countryOptions;
  return countryOptions.filter((option) =>
    option.searchTerms.some((term) =>
      normalizeCountrySearch(term).includes(normalized),
    ),
  );
}

export function getCountryStorageNames(value: string) {
  const option = getCountryOption(value);
  if (!option) return [];
  return unique(
    option.searchTerms.filter(
      (term) => getCountryOption(term)?.code === option.code,
    ),
  );
}
