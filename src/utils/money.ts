import type { CurrencyConfig, Minor } from '@/types';

// All catalogue prices are stored in the USD base currency as integer minor units.
// Orders keep their own currency plus the rate captured at checkout (RateSnapshot).

const DEFAULT_DIGITS: Record<string, number> = { INR: 0, JPY: 0 };

/** Decimal places a currency is normally written with. Single source of truth for formatting and validation. */
export const fractionDigitsFor = (currency: string): number => DEFAULT_DIGITS[currency] ?? 2;

export const toMinor = (major: number): Minor => Math.round(major * 100);
export const toMajor = (minor: Minor): number => minor / 100;

/** Round to a multiple of `increment` minor units (half away from zero). */
export function roundToIncrement(amount: number, increment = 1): Minor {
  const sign = amount < 0 ? -1 : 1;
  return sign * Math.round(Math.abs(amount) / increment) * increment;
}

/** Convert a USD minor amount into another currency's minor units using that currency's rate and rounding. */
export function convertFromUsd(usd: Minor, cfg: Pick<CurrencyConfig, 'rate' | 'roundingIncrement'>): Minor {
  return roundToIncrement(usd * cfg.rate, cfg.roundingIncrement);
}

/** Convert an amount in a currency back to USD minor units using a rate (1 USD = rate units). */
export function toUsd(amount: Minor, rate: number): Minor {
  return rate > 0 ? Math.round(amount / rate) : 0;
}

const cache = new Map<string, Intl.NumberFormat>();

export function formatMoney(minor: Minor, currency: string, fractionDigits?: number): string {
  const digits = fractionDigits ?? DEFAULT_DIGITS[currency] ?? 2;
  const key = `${currency}|${digits}`;
  let fmt = cache.get(key);
  if (!fmt) {
    try {
      fmt = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        currencyDisplay: 'narrowSymbol',
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });
    } catch {
      fmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
    }
    cache.set(key, fmt);
  }
  return fmt.format(minor / 100);
}

/** "USD 28.00" style — used wherever symbols could be ambiguous. */
export function formatWithCode(minor: Minor, currency: string, fractionDigits?: number): string {
  return `${currency} ${formatMoney(minor, currency, fractionDigits)}`;
}

export const formatUsd = (minor: Minor) => formatMoney(minor, 'USD');

/** Parse a user-typed major amount ("28", "28.5") into minor units; null for blank/invalid. */
export function parseMajor(value: string | number | null | undefined): Minor | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
  return Number.isFinite(n) ? toMinor(n) : null;
}
