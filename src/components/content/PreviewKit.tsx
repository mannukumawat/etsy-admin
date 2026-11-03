import type { ElementType, ReactNode } from 'react';
import { Eye } from 'lucide-react';
import type { LanguageCode, Localized } from '@/types';
import { cn } from '@/utils/misc';
import { pickLocalized } from './contentMeta';

// Building blocks for the admin previews (homepage, content pages). These are simplified storefront-style
// renderings of the CURRENT form values — never the live storefront.

export function PreviewBanner({ children }: { children?: ReactNode }) {
  return (
    <div role="note" className="flex items-start gap-2 rounded-lg border border-dashed border-brand-300 bg-brand-50 px-3 py-2 text-[13px] text-brand-900">
      <Eye className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <p>
        <strong>Admin preview — not the live storefront.</strong> A simplified rendering of the values in this form (including unsaved edits). {children}
      </p>
    </div>
  );
}


export function FallbackMarker() {
  return <span className="ml-1.5 inline-block whitespace-nowrap rounded bg-amber-100 px-1 align-middle font-sans text-2xs font-semibold not-italic text-amber-900">(English fallback)</span>;
}

/**
 * Renders a Localized value for the preview language, keeping line breaks. Shows the English text
 * with a visible “(English fallback)” marker; empty text renders `empty` (or nothing).
 */
export function LText({ value, lang, as: Tag = 'span', className, empty }: { value: Localized | undefined; lang: LanguageCode; as?: ElementType; className?: string; empty?: ReactNode }) {
  const { text, fallback } = pickLocalized(value, lang);
  if (!text.trim()) return empty ? <>{empty}</> : null;
  return (
    <Tag className={cn('whitespace-pre-line', className)} lang={fallback ? 'en' : lang}>
      {text}
      {fallback && <FallbackMarker />}
    </Tag>
  );
}

/** Placeholder shown in the preview where required text is still empty. */
export function MissingText({ children = 'Text missing' }: { children?: ReactNode }) {
  return <span className="rounded bg-red-50 px-1 font-sans text-xs font-medium text-red-800">{children}</span>;
}
