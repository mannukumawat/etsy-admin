import { createContext, useContext, useId, type ReactNode } from 'react';
import { get, useFormContext, useWatch } from 'react-hook-form';
import type { LanguageCode, Localized } from '@/types';
import { FieldError } from './Form';

// Customer-facing text is written in English only (Hindi has been removed from the store).
// Shopper-facing German/French/Italian/Spanish versions are managed on the Translations page.
// The `{ en }` object shape is kept so existing forms and API payloads don't change.

const LangContext = createContext<{ lang: LanguageCode }>({ lang: 'en' });

export function ContentLangProvider({ children }: { children: ReactNode; initial?: LanguageCode }) {
  return <LangContext.Provider value={{ lang: 'en' }}>{children}</LangContext.Provider>;
}

export const useContentLang = () => useContext(LangContext);


interface LocalizedFieldProps {
  /** Path to a { en } object in the form, e.g. "name" or "sections.0.body". */
  name: string;
  label: string;
  required?: boolean;
  multiline?: boolean;
  rows?: number;
  hint?: ReactNode;
  maxLength?: number;
  placeholder?: string;
  className?: string;
}

export function LocalizedField({ name, label, required, multiline, rows = 4, hint, maxLength, placeholder, className }: LocalizedFieldProps) {
  const { register, formState, control } = useFormContext();
  const value = (useWatch({ control, name }) as Localized | undefined) ?? { en: '' };
  const id = useId();
  const err = (get(formState.errors, `${name}.en`) as { message?: string } | undefined)?.message;
  const common = {
    id,
    'aria-invalid': err ? true : undefined,
    'aria-required': required || undefined,
    'aria-describedby': err ? `${id}-error` : undefined,
    maxLength,
    placeholder,
    ...register(`${name}.en`),
  };

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-[13px] font-medium text-ink-soft">
        {label}
        {required && (
          <span className="text-brand-700" aria-hidden>
            {' '}
            *
          </span>
        )}
      </label>
      {multiline ? <textarea rows={rows} className="input resize-y" {...common} /> : <input className="input" {...common} />}
      {maxLength && <p className="mt-0.5 text-right text-2xs text-ink-faint num">{(value.en ?? '').length}/{maxLength}</p>}
      <FieldError id={`${id}-error`} message={err} />
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}
