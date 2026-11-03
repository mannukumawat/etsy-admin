import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertTriangle, ImageOff, Search, Trash2, Upload, X } from 'lucide-react';
import { LocalUploadNotice, useUploader } from '@/components/media/MediaPicker';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Dialog';
import { Badge, EmptyState, ErrorState, Notice, Skeleton, Spinner } from '@/components/ui/Feedback';
import { SelectField } from '@/components/ui/Form';
import { ContentLangProvider, LocalizedField } from '@/components/ui/LocalizedField';
import { Card, PageHeader } from '@/components/ui/Page';
import { usePageMeta, useDebounced } from '@/hooks/misc';
import { invalidate, useQuery } from '@/hooks/useQuery';
import { ApiError, errorMessage } from '@/services/api';
import { MEDIA_RULES, mediaService } from '@/services/contentServices';
import { toast } from '@/store';
import type { MediaAsset, MediaUsage } from '@/types';
import { formatDateTime } from '@/utils/dates';
import { applyServerErrors, localized } from '@/utils/forms';
import { cn, formatBytes } from '@/utils/misc';

type SourceFilter = 'all' | 'seed' | 'upload';

const SOURCE_LABEL: Record<MediaAsset['source'], string> = {
  seed: 'Seeded sample art',
  upload: 'Local upload (this browser only)',
};

/** Everything the media page changes lives in the in-memory admin preview. */
const refreshAfterMediaChange = () => invalidate('media', 'products', 'product:', 'categories', 'homepage', 'settings');

const altSchema = z.object({ alt: localized(false, 200) });
type AltValues = z.infer<typeof altSchema>;

function AltTextForm({ asset }: { asset: MediaAsset }) {
  const form = useForm<AltValues>({ resolver: zodResolver(altSchema), defaultValues: { alt: asset.alt } });
  const {
    handleSubmit,
    setError,
    reset,
    formState: { isDirty, isSubmitting },
  } = form;

  const onSubmit = async (values: AltValues) => {
    try {
      const updated = await mediaService.updateAlt(asset.id, values.alt);
      reset({ alt: updated.alt });
      refreshAfterMediaChange();
      toast('Alt text saved.', 'success');
    } catch (e) {
      applyServerErrors(e, setError, 'Could not save the alt text.');
    }
  };

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-3">
        <LocalizedField
          name="alt"
          label="Alt text"
          multiline
          rows={3}
          maxLength={200}
          hint="Describes the image for screen readers and when the image cannot load. Keep it short and factual; leave it empty only for purely decorative images."
        />
        <Button type="submit" size="sm" variant="outline" loading={isSubmitting} disabled={!isDirty}>
          Save alt text
        </Button>
      </form>
    </FormProvider>
  );
}

function UsageList({ usages }: { usages: MediaUsage[] }) {
  return (
    <ul className="space-y-1.5">
      {usages.map((u, i) => (
        <li key={`${u.kind}-${i}`}>
          <Link to={u.href} className="link text-[13px]">
            {u.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function DeletePanel({ asset, usages, onCancel, onDeleted }: { asset: MediaAsset; usages: MediaUsage[]; onCancel: () => void; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocking, setBlocking] = useState<MediaUsage[]>(usages);
  const headingRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const used = blocking.length > 0;
  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await mediaService.remove(asset.id, used);
      refreshAfterMediaChange();
      toast(res.detached ? `Image deleted and removed from ${res.detached} place${res.detached === 1 ? '' : 's'} in this admin preview.` : 'Image deleted from this admin preview.', 'success');
      onDeleted();
    } catch (e) {
      // The image was attached somewhere between opening this panel and confirming: show where, then allow a forced delete.
      if (e instanceof ApiError && e.code === 'in_use') {
        setBlocking((e.details as MediaUsage[] | undefined) ?? []);
        setError('This image is now used somewhere else as well. Check the list and confirm again to remove it from those places.');
      } else {
        setError(errorMessage(e));
      }
      setBusy(false);
    }
  };

  return (
    <section className="rounded-lg border border-red-200 bg-red-50 p-3" aria-label="Confirm deletion">
      <p ref={headingRef} tabIndex={-1} className="text-sm font-semibold text-red-900 outline-none">
        Delete “{asset.fileName}”?
      </p>
      {used ? (
        <>
          <p className="mt-1 text-[13px] text-red-900">
            This image is used in {blocking.length} place{blocking.length === 1 ? '' : 's'}. Deleting it removes the image from {blocking.length === 1 ? 'it' : 'them'} as well — those places will have no
            image until you choose another one.
          </p>
          <div className="mt-2 rounded-md border border-red-200 bg-white p-2.5">
            <UsageList usages={blocking} />
          </div>
        </>
      ) : (
        <p className="mt-1 text-[13px] text-red-900">Nothing currently uses this image. This cannot be undone.</p>
      )}
      <p className="mt-2 text-xs text-red-900">
        {asset.source === 'seed'
          ? 'This is seeded sample art: deleting it only affects this admin preview and it comes back on refresh or “Reset demo data”.'
          : 'This local upload only exists in this browser tab; its preview is released immediately.'}
      </p>
      {error && (
        <Notice tone="error" role="alert" className="mt-2">
          {error}
        </Notice>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button variant="danger" size="sm" onClick={run} loading={busy} icon={<Trash2 className="h-3.5 w-3.5" aria-hidden />}>
          {used ? `Delete and remove from ${blocking.length} place${blocking.length === 1 ? '' : 's'}` : 'Delete image'}
        </Button>
      </div>
    </section>
  );
}

function MediaDetails({ asset, onClose }: { asset: MediaAsset; onClose: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const { data: usages, isLoading: usagesLoading, error: usagesError, refetch } = useQuery(`media:usages:${asset.id}`, () => mediaService.usages(asset.id));

  useEffect(() => {
    setConfirming(false);
  }, [asset.id]);

  const rows: Array<[string, ReactNode]> = [
    ['File name', <span key="f" className="break-all">{asset.fileName}</span>],
    ['Type', asset.mimeType],
    ['Size', formatBytes(asset.sizeBytes)],
    ['Dimensions', asset.width && asset.height ? `${asset.width} × ${asset.height} px` : '—'],
    ['Source', SOURCE_LABEL[asset.source]],
    ['Added', formatDateTime(asset.createdAt)],
  ];

  return (
    <div className="space-y-5">
      {confirming && <DeletePanel asset={asset} usages={usages ?? []} onCancel={() => setConfirming(false)} onDeleted={onClose} />}

      <div className="overflow-hidden rounded-lg border border-sand-200 bg-sand-100">
        <img src={asset.url} alt={asset.alt.en || asset.fileName} className="max-h-72 w-full bg-[linear-gradient(45deg,#F3ECE1_25%,transparent_25%,transparent_75%,#F3ECE1_75%),linear-gradient(45deg,#F3ECE1_25%,transparent_25%,transparent_75%,#F3ECE1_75%)] bg-[length:16px_16px] bg-[position:0_0,8px_8px] object-contain" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {asset.source === 'upload' && <Badge tone="info">Local upload</Badge>}
        {!asset.alt.en.trim() && <Badge tone="warning">Alt text missing</Badge>}
      </div>

      <dl className="divide-y divide-sand-200/70 text-[13px]">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 py-2">
            <dt className="shrink-0 text-ink-muted">{k}</dt>
            <dd className="min-w-0 text-right font-medium text-ink">{v}</dd>
          </div>
        ))}
      </dl>

      <AltTextForm key={asset.id} asset={asset} />

      <section aria-labelledby={`usedin-${asset.id}`}>
        <h3 id={`usedin-${asset.id}`} className="mb-1.5 text-[13px] font-semibold text-ink">
          Used in
        </h3>
        {usagesError && !usages ? (
          <ErrorState error={usagesError} onRetry={refetch} className="py-6" />
        ) : usagesLoading && !usages ? (
          <Skeleton className="h-10" />
        ) : !usages?.length ? (
          <p className="text-[13px] text-ink-muted">Not used anywhere right now.</p>
        ) : (
          <UsageList usages={usages} />
        )}
      </section>

      <div className="border-t border-sand-200 pt-4">
        <Button variant="dangerOutline" size="sm" icon={<Trash2 className="h-3.5 w-3.5" aria-hidden />} onClick={() => setConfirming(true)} disabled={confirming}>
          Delete image…
        </Button>
        <p className="mt-1.5 text-xs text-ink-muted">Deleting only affects this admin preview — seeded images return on refresh or “Reset demo data”.</p>
      </div>
    </div>
  );
}

export default function MediaPage() {
  usePageMeta('Media', [{ label: 'Catalog' }]);
  const [q, setQ] = useState('');
  const [source, setSource] = useState<SourceFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const debouncedQ = useDebounced(q, 300);
  const { data, isLoading, isFetching, error, refetch } = useQuery(`media:list:${debouncedQ}`, () => mediaService.list(debouncedQ), { keepPrevious: true });
  const uploader = useUploader((assets) => setSelectedId(assets[0]?.id ?? null));

  const items = useMemo(() => (data ?? []).filter((m) => source === 'all' || m.source === source), [data, source]);
  const selected = useMemo(() => (data ?? []).find((m) => m.id === selectedId) ?? null, [data, selectedId]);
  const missingAlt = items.filter((m) => !m.alt.en.trim()).length;

  // The drawer closes by itself when its image disappears (deleted, or filtered out by a new search).
  useEffect(() => {
    if (selectedId && data && !data.some((m) => m.id === selectedId)) setSelectedId(null);
  }, [data, selectedId]);

  return (
    <ContentLangProvider>
      <PageHeader
        description="Images used across products, categories, the homepage and store settings. Alt text is edited in English."
        actions={
          <>
            <Button icon={<Upload className="h-4 w-4" aria-hidden />} onClick={uploader.open} loading={uploader.busy}>
              Upload images
            </Button>
            {uploader.element}
          </>
        }
      />

      <div className="space-y-4">
        <LocalUploadNotice />

        {uploader.errors.length > 0 && (
          <Notice
            tone="error"
            role="alert"
            title={`${uploader.errors.length} file${uploader.errors.length === 1 ? '' : 's'} could not be added`}
            action={
              <Button variant="ghost" size="sm" onClick={uploader.clearErrors} icon={<X className="h-3.5 w-3.5" aria-hidden />}>
                Dismiss
              </Button>
            }
          >
            <ul className="mt-0.5 space-y-0.5">
              {uploader.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
            <p className="mt-1">Allowed: {MEDIA_RULES.label}.</p>
          </Notice>
        )}

        <Card bodyClassName="px-4 py-3 sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <label htmlFor="media-search" className="label">
                Search images
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" aria-hidden />
                <input id="media-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by file name or alt text" className="input pl-9" />
              </div>
            </div>
            <SelectField label="Source" containerClassName="sm:w-56" value={source} onChange={(e) => setSource(e.target.value as SourceFilter)}>
              <option value="all">All images</option>
              <option value="seed">Seeded sample art</option>
              <option value="upload">Local uploads</option>
            </SelectField>
          </div>
          <p className="mt-2 text-xs text-ink-muted" role="status">
            {isLoading && !data ? 'Loading images…' : `${items.length} image${items.length === 1 ? '' : 's'}`}
            {!isLoading && missingAlt > 0 && ` · ${missingAlt} missing English alt text`}
            {isFetching && data && ' · refreshing…'}
          </p>
        </Card>

        <div className="card p-4 sm:p-5">
          {error && !data ? (
            <ErrorState error={error} onRetry={refetch} />
          ) : isLoading && !data ? (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {Array.from({ length: 12 }, (_, i) => (
                <li key={i}>
                  <Skeleton className="aspect-square" />
                </li>
              ))}
            </ul>
          ) : !items.length ? (
            <EmptyState
              icon={<ImageOff className="h-6 w-6" aria-hidden />}
              title={q || source !== 'all' ? 'No images match' : 'No images yet'}
              body={q || source !== 'all' ? 'Try a different search term or source.' : `Upload an image to get started (${MEDIA_RULES.label}).`}
              action={
                q || source !== 'all' ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setQ('');
                      setSource('all');
                    }}
                  >
                    Clear filters
                  </Button>
                ) : (
                  <Button size="sm" onClick={uploader.open} icon={<Upload className="h-3.5 w-3.5" aria-hidden />}>
                    Upload images
                  </Button>
                )
              }
            />
          ) : (
            <ul className={cn('grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6', isFetching && 'opacity-60 transition-opacity')} aria-label="Images">
              {items.map((m) => {
                const noAlt = !m.alt.en.trim();
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(m.id)}
                      aria-haspopup="dialog"
                      aria-label={`${m.fileName}${m.source === 'upload' ? ', local upload' : ''}${noAlt ? ', alt text missing' : ''} — open details`}
                      className={cn(
                        'group relative block w-full overflow-hidden rounded-lg border-2 bg-sand-100 text-left transition-colors',
                        selectedId === m.id ? 'border-brand-600' : 'border-transparent hover:border-sand-300',
                      )}
                    >
                      <img src={m.url} alt="" className="aspect-square w-full object-cover" loading="lazy" />
                      {m.source === 'upload' && <span className="absolute bottom-1 left-1 rounded bg-ink/75 px-1 text-2xs font-medium text-white">Local</span>}
                      {noAlt && (
                        <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-amber-950 ring-2 ring-white" title="Alt text missing">
                          <AlertTriangle className="h-3 w-3" aria-hidden />
                        </span>
                      )}
                      <span className="block truncate bg-white px-1.5 py-1 text-2xs text-ink-muted">{m.fileName}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <Drawer
        open={!!selected}
        onClose={() => setSelectedId(null)}
        title={selected?.fileName ?? 'Image'}
        description="Alt text, usage and deletion — all inside this admin preview."
      >
        {selected ? <MediaDetails key={selected.id} asset={selected} onClose={() => setSelectedId(null)} /> : <Spinner />}
      </Drawer>
    </ContentLangProvider>
  );
}
