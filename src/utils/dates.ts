import type { DateRange } from '@/types';

/** Local calendar date key, YYYY-MM-DD. */
export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

export type RangePreset = '7d' | '30d' | '90d' | 'ytd' | 'custom';

export function presetRange(preset: Exclude<RangePreset, 'custom'>, now: Date = new Date()): DateRange {
  const to = toDateKey(now);
  if (preset === 'ytd') return { from: `${now.getFullYear()}-01-01`, to };
  const days = { '7d': 7, '30d': 30, '90d': 90 }[preset];
  return { from: toDateKey(addDays(now, -(days - 1))), to };
}

export function isValidRange(r: DateRange): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(r.from) && /^\d{4}-\d{2}-\d{2}$/.test(r.to) && r.from <= r.to;
}

/** Whether an ISO timestamp falls inside an inclusive local-date range. */
export function inRange(iso: string, r: DateRange): boolean {
  const key = toDateKey(new Date(iso));
  return key >= r.from && key <= r.to;
}

export function eachDay(r: DateRange): string[] {
  const out: string[] = [];
  let d = parseDateKey(r.from);
  const end = parseDateKey(r.to);
  while (d <= end && out.length < 1000) {
    out.push(toDateKey(d));
    d = addDays(d, 1);
  }
  return out;
}

const dateFmt = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const shortFmt = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short' });

export const formatDate = (iso: string | null | undefined) => (iso ? dateFmt.format(new Date(iso)) : '—');
export const formatDateTime = (iso: string | null | undefined) => (iso ? dateTimeFmt.format(new Date(iso)) : '—');
export const formatShortDate = (key: string) => shortFmt.format(parseDateKey(key));

/** "YYYY-MM-DD" (date input value) -> ISO at local start/end of day. */
export function dateInputToIso(value: string, endOfDay = false): string | null {
  if (!value) return null;
  const d = parseDateKey(value);
  if (endOfDay) d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

export function isoToDateInput(iso: string | null | undefined): string {
  return iso ? toDateKey(new Date(iso)) : '';
}
