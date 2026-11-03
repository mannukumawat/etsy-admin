import { useEffect, useRef, useState } from 'react';
import { FormProvider, useFieldArray, useForm, useWatch, type Control } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useParams } from 'react-router-dom';
import { z } from 'zod';
import { ArrowLeft, Eye, FileQuestion, Plus, RotateCcw, Save, Send, X } from 'lucide-react';
import { LEGAL_NOTICE_TEXT, PAGE_LABEL, PAGE_PATH, PUBLISH_SIMULATION_TEXT, isPageKey } from '@/components/content/contentMeta';
import { PagePreview } from '@/components/content/PagePreview';
import { PublishStatus } from '@/components/content/PublishStatus';
import { ReorderControls, useReorderFocus } from '@/components/content/ReorderControls';
import { useUnsavedChangesGuard } from '@/components/content/useUnsavedChangesGuard';
import { Button, ButtonLink, IconButton } from '@/components/ui/Button';
import { EmptyState, ErrorState, Notice, Skeleton } from '@/components/ui/Feedback';
import { FieldError } from '@/components/ui/Form';
import { ContentLangProvider, LocalizedField } from '@/components/ui/LocalizedField';
import { ActionBar, Card, PageHeader } from '@/components/ui/Page';
import { usePageMeta } from '@/hooks/misc';
import { invalidate, useQuery } from '@/hooks/useQuery';
import { ApiError, errorMessage, type FieldIssue } from '@/services/api';
import { contentService, hasUnpublishedChanges } from '@/services/contentServices';
import { confirmAction, toast } from '@/store';
import type { PageContent, PageDoc, PageKey } from '@/types';
import { formatDateTime } from '@/utils/dates';
import { applyServerErrors, localized } from '@/utils/forms';
import { newId } from '@/utils/misc';

const MAX_SECTIONS = 30;

const schema = z.object({
  title: localized(true, 120),
  intro: localized(false, 3000),
  sections: z
    .array(z.object({ id: z.string(), heading: localized(true, 200), body: localized(true, 10000) }))
    .max(MAX_SECTIONS, `Use at most ${MAX_SECTIONS} sections.`),
});
type Values = z.infer<typeof schema>;

function SectionHeadingText({ control, index, fallback }: { control: Control<Values>; index: number; fallback: string }) {
  const heading = useWatch({ control, name: `sections.${index}.heading.en` });
  return <>{heading?.trim() || fallback}</>;
}

function PageEditor({ doc: loadedDoc }: { doc: PageDoc }) {
  const key = loadedDoc.key;
  const isFaq = key === 'faq';
  const noun = isFaq ? 'question' : 'section';
  const Noun = isFaq ? 'Question' : 'Section';

  const [doc, setDoc] = useState(loadedDoc);
  useEffect(() => {
    setDoc(loadedDoc);
  }, [loadedDoc]);

  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: loadedDoc.draft });
  const {
    control,
    handleSubmit,
    setError,
    reset,
    getValues,
    formState: { errors, isDirty },
  } = form;
  const { fields, append, remove, move } = useFieldArray({ control, name: 'sections', keyName: 'fieldKey' });

  const [busy, setBusy] = useState<null | 'save' | 'publish' | 'discard'>(null);
  const [publishIssues, setPublishIssues] = useState<FieldIssue[]>([]);
  const [preview, setPreview] = useState<PageContent | null>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const focus = useReorderFocus<HTMLOListElement>(addRef);

  useUnsavedChangesGuard(isDirty);

  const changed = hasUnpublishedChanges(doc);
  const canDiscard = !!doc.published && (changed || isDirty);
  const sectionsError = errors.sections?.root?.message ?? errors.sections?.message;
  const headingAt = (i: number) => getValues(`sections.${i}.heading.en`)?.trim() || `${Noun} ${i + 1}`;

  const applySaved = (next: PageDoc) => {
    setDoc(next);
    reset(next.draft);
    invalidate('pages', `page:${key}`, 'translation');
  };

  const persist = async (values: Values, quiet = false) => {
    try {
      applySaved(await contentService.savePageDraft(key, values));
      if (!quiet) toast('Draft saved. Publishing is a separate step.', 'success');
      return true;
    } catch (e) {
      applyServerErrors(e, setError, 'Could not save the draft.');
      return false;
    }
  };

  const onSave = handleSubmit(
    async (values) => {
      setBusy('save');
      await persist(values);
      setBusy(null);
    },
    () => toast('Please fix the highlighted fields.', 'error'),
  );

  const validateAndSave = () =>
    new Promise<boolean>((resolve) => {
      void handleSubmit(
        async (values) => resolve(await persist(values, true)),
        () => {
          toast('Fix the highlighted fields before publishing.', 'error');
          resolve(false);
        },
      )();
    });

  const publish = async () => {
    const saveFirst = isDirty;
    const ok = await confirmAction({
      title: `Publish “${doc.draft.title.en || PAGE_LABEL[key]}” (simulated)?`,
      body: (
        <div className="space-y-2">
          <p>{saveFirst ? 'Your unsaved edits are saved to the draft first; then the draft becomes the published version.' : 'The saved draft becomes the published version.'}</p>
          <p>{PUBLISH_SIMULATION_TEXT}</p>
          {doc.isLegal && <p className="font-medium text-amber-900">This is sample legal text. Publishing here does not make it reviewed or legally valid.</p>}
        </div>
      ),
      confirmLabel: 'Publish in admin preview',
    });
    if (!ok) return;
    setBusy('publish');
    setPublishIssues([]);
    try {
      if (saveFirst && !(await validateAndSave())) return;
      applySaved(await contentService.publishPage(key));
      toast('Published in the admin preview only. The storefront is not updated until backend integration.', 'success');
    } catch (e) {
      if (e instanceof ApiError && e.code === 'validation') setPublishIssues(e.issues);
      applyServerErrors(e, setError, 'Could not publish.');
    } finally {
      setBusy(null);
    }
  };

  const discard = async () => {
    const ok = await confirmAction({
      title: 'Discard draft changes?',
      body: `The draft goes back to the version published in the admin preview on ${formatDateTime(doc.publishedAt)}. Unsaved edits are lost too. This can’t be undone.`,
      confirmLabel: 'Discard changes',
      tone: 'danger',
    });
    if (!ok) return;
    setBusy('discard');
    try {
      applySaved(await contentService.discardPageDraft(key));
      setPublishIssues([]);
      toast('Draft changes discarded.', 'success');
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  const addSection = () => {
    append({ id: newId('sec'), heading: { en: '' }, body: { en: '' } }, { focusName: `sections.${fields.length}.heading.en` });
    focus.announce(`${Noun} ${fields.length + 1} added.`);
  };

  const removeSection = async (index: number) => {
    const label = headingAt(index);
    const ok = await confirmAction({
      title: `Remove ${noun} ${index + 1}?`,
      body: `“${label}” and its text will be removed from this form. The draft changes when you save.`,
      confirmLabel: `Remove ${noun}`,
      tone: 'danger',
    });
    if (!ok) return;
    const nextKey = fields[index + 1]?.fieldKey ?? fields[index - 1]?.fieldKey ?? null;
    remove(index);
    focus.afterRemove(nextKey, `${Noun} “${label}” removed.`);
  };

  const moveSection = (from: number, to: number) => {
    const label = headingAt(from);
    const rowKey = fields[from].fieldKey;
    move(from, to);
    focus.afterMove(rowKey, to < from ? 'up' : 'down', `“${label}” moved to position ${to + 1} of ${fields.length}.`);
  };

  return (
    <ContentLangProvider>
      <FormProvider {...form}>
        <PageHeader
          description={
            <div className="space-y-2">
              <p>
                Storefront path <span className="font-mono text-ink-soft">{PAGE_PATH[key]}</span>
              </p>
              <PublishStatus doc={doc} dirty={isDirty} />
            </div>
          }
          actions={
            <>
              <ButtonLink to="/content/pages" variant="ghost" icon={<ArrowLeft className="h-4 w-4" aria-hidden />}>
                All pages
              </ButtonLink>
              <Button variant="outline" icon={<Eye className="h-4 w-4" aria-hidden />} onClick={() => setPreview(getValues())}>
                Preview
              </Button>
            </>
          }
        />

        {doc.isLegal && (
          <Notice tone="warning" title="Sample policy — needs legal review" className="mb-5" role="status">
            {LEGAL_NOTICE_TEXT}
          </Notice>
        )}

        {publishIssues.length > 0 && (
          <Notice
            tone="error"
            role="alert"
            title="Publishing was blocked"
            className="mb-5"
            action={
              <IconButton size="sm" label="Dismiss publishing problems" onClick={() => setPublishIssues([])}>
                <X className="h-4 w-4" aria-hidden />
              </IconButton>
            }
          >
            <p>The draft was kept. Fix these and publish again:</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {publishIssues.map((i, idx) => (
                <li key={idx}>{i.message}</li>
              ))}
            </ul>
          </Notice>
        )}

        <form id="page-form" onSubmit={onSave} noValidate className="space-y-5">

          <Card title="Page">
            <div className="space-y-4">
              <LocalizedField name="title" label="Title" required maxLength={120} />
              <LocalizedField name="intro" label="Introduction" multiline rows={4} maxLength={3000} hint="Optional text shown under the title." />
            </div>
          </Card>

          <Card
            title={isFaq ? 'Questions' : 'Sections'}
            description={isFaq ? 'Each question and answer is shown in this order.' : 'Each section has a heading and text, shown in this order.'}
            actions={<span className="text-xs text-ink-muted num">{fields.length} / {MAX_SECTIONS}</span>}
          >
            <FieldError message={sectionsError} />
            {fields.length === 0 ? (
              <p className="rounded-lg border border-dashed border-sand-300 px-3 py-6 text-center text-[13px] text-ink-muted">No {noun}s yet.</p>
            ) : (
              <ol ref={focus.ref} className="space-y-4" aria-label={isFaq ? 'Questions' : 'Sections'}>
                {fields.map((f, i) => (
                  <li key={f.fieldKey} data-reorder-id={f.fieldKey} className="rounded-lg border border-sand-200 bg-ivory-50/60">
                    <div className="flex items-center justify-between gap-2 border-b border-sand-200 px-3 py-2">
                      <p className="min-w-0 truncate text-[13px] font-semibold text-ink">
                        <span className="text-ink-muted">
                          {Noun} {i + 1}
                          <span aria-hidden> · </span>
                        </span>
                        <SectionHeadingText control={control} index={i} fallback="Untitled" />
                      </p>
                      <ReorderControls
                        index={i}
                        count={fields.length}
                        itemLabel={`${noun} ${i + 1}`}
                        onMove={(to) => moveSection(i, to)}
                        onRemove={() => void removeSection(i)}
                        removeLabel={`Remove ${noun} ${i + 1}`}
                      />
                    </div>
                    <div className="space-y-4 p-3">
                      <LocalizedField name={`sections.${i}.heading`} label={isFaq ? 'Question' : 'Heading'} required maxLength={200} />
                      <LocalizedField name={`sections.${i}.body`} label={isFaq ? 'Answer' : 'Text'} required multiline rows={5} hint="Leave an empty line between paragraphs." />
                    </div>
                  </li>
                ))}
              </ol>
            )}
            {focus.live}
            <Button ref={addRef} variant="outline" size="sm" className="mt-4" icon={<Plus className="h-4 w-4" aria-hidden />} onClick={addSection} disabled={fields.length >= MAX_SECTIONS}>
              Add {noun}
            </Button>
          </Card>
        </form>

        <ActionBar
          status={
            isDirty
              ? 'You have unsaved edits.'
              : !doc.published
                ? 'Draft saved. Not published yet.'
                : changed
                  ? 'Draft saved. It differs from the published version (admin preview).'
                  : 'Draft matches the published version (admin preview).'
          }
        >
          {canDiscard && (
            <Button variant="ghost" icon={<RotateCcw className="h-4 w-4" aria-hidden />} onClick={discard} loading={busy === 'discard'} disabled={!!busy}>
              Discard draft changes
            </Button>
          )}
          <Button variant="outline" icon={<Eye className="h-4 w-4" aria-hidden />} onClick={() => setPreview(getValues())}>
            Preview
          </Button>
          <Button variant="outline" type="submit" form="page-form" icon={<Save className="h-4 w-4" aria-hidden />} loading={busy === 'save'} disabled={!!busy || !isDirty}>
            Save draft
          </Button>
          <Button icon={<Send className="h-4 w-4" aria-hidden />} onClick={publish} loading={busy === 'publish'} disabled={!!busy || (!isDirty && !changed && !!doc.published)}>
            Publish…
          </Button>
        </ActionBar>

        {preview && <PagePreview open pageKey={key} values={preview} isLegal={doc.isLegal} onClose={() => setPreview(null)} />}
      </FormProvider>
    </ContentLangProvider>
  );
}

function NotFound() {
  return (
    <div className="card">
      <EmptyState
        icon={<FileQuestion className="h-6 w-6" aria-hidden />}
        title="Page not found"
        body="There is no content page at this address. Pages are: About, Contact, FAQ, Shipping, Returns, Privacy and Terms."
        action={
          <ButtonLink to="/content/pages" variant="outline" icon={<ArrowLeft className="h-4 w-4" aria-hidden />}>
            Back to pages
          </ButtonLink>
        }
      />
    </div>
  );
}

export default function PageEditorPage() {
  const { key: rawKey } = useParams<{ key: string }>();
  const key: PageKey | null = isPageKey(rawKey) ? rawKey : null;
  const { data, error, refetch } = useQuery(key ? `page:${key}` : null, () => contentService.getPage(key as PageKey));
  const title = !key ? 'Page not found' : `Edit ${data?.draft.title.en || PAGE_LABEL[key]}`;
  usePageMeta(title, [{ label: 'Content' }, { label: 'Pages', to: '/content/pages' }]);

  if (!key) return <NotFound />;
  if (!data) {
    if (error instanceof ApiError && error.code === 'not_found') return <NotFound />;
    if (error)
      return (
        <div className="card">
          <ErrorState error={error} onRetry={refetch} />
        </div>
      );
    return (
      <div className="space-y-5" aria-busy="true">
        <Skeleton className="h-12 w-full max-w-xl" />
        <Skeleton className="h-40" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  // Remount the editor when switching between pages so the form starts from that page's draft.
  return <PageEditor key={key} doc={data} />;
}
