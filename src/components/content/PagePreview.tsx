import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Dialog';
import { Notice } from '@/components/ui/Feedback';
import type { LanguageCode, PageContent, PageKey } from '@/types';
import { LEGAL_NOTICE_TEXT, PAGE_PATH } from './contentMeta';
import { LText, MissingText, PreviewBanner } from './PreviewKit';

/** Storefront-style rendering of a content page's current form values, EN/HI with English fallback markers. */
export function PagePreview({ open, onClose, pageKey, values, isLegal }: { open: boolean; onClose: () => void; pageKey: PageKey; values: PageContent; isLegal: boolean }) {
  const lang: LanguageCode = 'en';
  const isFaq = pageKey === 'faq';
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="Page preview"
      description={
        <>
          Storefront path <span className="font-mono">{PAGE_PATH[pageKey]}</span> · simplified admin rendering of the current form values.
        </>
      }
      footer={
        <Button variant="outline" onClick={onClose}>
          Close preview
        </Button>
      }
    >
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <PreviewBanner />
      </div>

      <article className="overflow-hidden rounded-xl border border-sand-200 bg-ivory px-4 py-8 shadow-card sm:px-10" lang={lang}>
        {isLegal && (
          <Notice tone="warning" title="Draft legal text" className="mb-6">
            <span lang="en">{LEGAL_NOTICE_TEXT}</span>
          </Notice>
        )}
        <LText as="h3" value={values.title} lang={lang} className="font-brand text-3xl font-semibold leading-tight text-ink sm:text-4xl" empty={<MissingText>Title missing</MissingText>} />
        <LText as="p" value={values.intro} lang={lang} className="mt-3 text-[15px] text-ink-soft" />
        {values.sections.length > 0 && (
          <div className="mt-8 space-y-6">
            {values.sections.map((s, i) => (
              <section key={s.id || i} className={isFaq ? 'rounded-lg border border-sand-200 bg-white p-4' : undefined}>
                <LText
                  as="h4"
                  value={s.heading}
                  lang={lang}
                  className={isFaq ? 'text-[15px] font-semibold text-ink' : 'font-brand text-xl font-semibold text-ink'}
                  empty={<MissingText>{isFaq ? 'Question missing' : 'Heading missing'}</MissingText>}
                />
                <LText as="p" value={s.body} lang={lang} className="mt-2 text-sm leading-relaxed text-ink-soft" empty={<MissingText>{isFaq ? 'Answer missing' : 'Text missing'}</MissingText>} />
              </section>
            ))}
          </div>
        )}
      </article>
    </Modal>
  );
}
