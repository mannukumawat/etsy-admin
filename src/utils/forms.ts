import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { z } from 'zod';
import { ApiError, errorMessage } from '@/services/api';
import { toast } from '@/store';

/** Localized text field (English); optionally required. */
export const localized = (required = false, max = 5000) =>
  z.object({
    en: required ? z.string().trim().min(1, 'English text is required.').max(max, `Keep it under ${max} characters.`) : z.string().trim().max(max, `Keep it under ${max} characters.`),
  });

/**
 * Maps a service validation error onto react-hook-form fields (paths match form names). Falls back to a toast.
 * Returns true when the error was handled.
 */
export function applyServerErrors<T extends FieldValues>(e: unknown, setError: UseFormSetError<T>, fallback = 'Could not save.'): boolean {
  if (e instanceof ApiError && e.code === 'validation' && e.issues.length) {
    e.issues.forEach((i, idx) => setError(i.path as Path<T>, { type: 'server', message: i.message }, { shouldFocus: idx === 0 }));
    toast(e.message, 'error');
    return true;
  }
  toast(e instanceof Error ? errorMessage(e) : fallback, 'error');
  return false;
}

/** Number input helpers for react-hook-form `setValueAs`. Empty -> null / NaN so Zod reports it. */
export const numOrNull = (v: unknown) => (v === '' || v === null || v === undefined ? null : Number(v));
export const num = (v: unknown) => (v === '' || v === null || v === undefined ? NaN : Number(v));

/** Count Localized values (en filled, hi empty) inside an arbitrary form value tree. */
