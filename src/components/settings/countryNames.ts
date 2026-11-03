import { COUNTRIES, COUNTRY_BY_CODE } from '@/data/countries';

// English display names for ISO region codes (Intl.DisplayNames, falling back to the bundled names).

let displayNames: Intl.DisplayNames | null | undefined;

export function countryName(code: string): string {
  if (displayNames === undefined) {
    try {
      displayNames = new Intl.DisplayNames(['en'], { type: 'region' });
    } catch {
      displayNames = null;
    }
  }
  let name: string | undefined;
  try {
    name = displayNames?.of(code);
  } catch {
    name = undefined;
  }
  return name ?? COUNTRY_BY_CODE[code]?.name ?? code;
}

let sorted: Array<{ code: string; name: string }> | null = null;

/** Every country in the admin's country list, sorted by display name. */
export function countryOptions(): Array<{ code: string; name: string }> {
  if (!sorted) sorted = COUNTRIES.map((c) => ({ code: c.code, name: countryName(c.code) })).sort((a, b) => a.name.localeCompare(b.name));
  return sorted;
}
