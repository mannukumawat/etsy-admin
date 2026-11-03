import { useMemo, useRef, useState } from 'react';
import { Check, ImageOff, ImagePlus, Search, Upload, X } from 'lucide-react';
import { invalidate, useQuery } from '@/hooks/useQuery';
import { errorMessage } from '@/services/api';
import { MEDIA_RULES, mediaService } from '@/services/contentServices';
import { toast } from '@/store';
import type { MediaAsset } from '@/types';
import { prepareUploads } from '@/utils/media';
import { cn } from '@/utils/misc';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Dialog';
import { EmptyState, ErrorState, Notice, Skeleton } from '../ui/Feedback';
import { FieldError } from '../ui/Form';

/** All media, cached — used to resolve media ids to preview URLs anywhere in the app. */
export function useMediaMap() {
  const q = useQuery('media:all', () => mediaService.list());
  const map = useMemo(() => new Map((q.data ?? []).map((m) => [m.id, m])), [q.data]);
  return { map, ...q };
}

/** Hidden file input + upload handling shared by the picker and the media page. */
export function useUploader(onUploaded?: (assets: MediaAsset[]) => void) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const handle = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const { items, errors: errs } = await prepareUploads(Array.from(files));
      setErrors(errs);
      if (items.length) {
        const created = await mediaService.add(items);
        invalidate('media');
        toast(`${created.length} image${created.length === 1 ? '' : 's'} added as local previews (not uploaded).`, 'success');
        onUploaded?.(created);
      }
    } catch (e) {
      setErrors((prev) => [...prev, errorMessage(e)]);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };
  const element = (
    <input ref={input} type="file" accept={MEDIA_RULES.types.join(',')} multiple className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => void handle(e.target.files)} />
  );
  return { open: () => input.current?.click(), busy, errors, clearErrors: () => setErrors([]), element };
}

interface PickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (ids: string[]) => void;
  multiple?: boolean;
  initial?: string[];
  title?: string;
}

export function MediaPickerModal({ open, onClose, onSelect, multiple = false, initial = [], title = 'Choose image' }: PickerProps) {
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string[]>(initial);
  const { data, isLoading, error, refetch } = useQuery(`media:list:${q}`, () => mediaService.list(q), { keepPrevious: true });
  const uploader = useUploader((assets) => setSelected((s) => (multiple ? [...s, ...assets.map((a) => a.id)] : [assets[0].id])));

  const toggle = (id: string) => setSelected((s) => (multiple ? (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]) : [id]));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="xl"
      description="Uploads become local previews in this browser only — nothing is sent to a server."
      footer={
        <>
          <span className="mr-auto self-center text-xs text-ink-muted">{selected.length ? `${selected.length} selected` : 'Nothing selected'}</span>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!selected.length}
            onClick={() => {
              onSelect(selected);
              onClose();
            }}
          >
            {multiple ? `Add ${selected.length || ''} image${selected.length === 1 ? '' : 's'}` : 'Use image'}
          </Button>
        </>
      }
    >
      <div className="mb-3 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" aria-hidden />
          <label htmlFor="picker-q" className="sr-only">
            Search media
          </label>
          <input id="picker-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by file name or alt text" className="input h-9 pl-9" />
        </div>
        <Button variant="outline" size="sm" className="h-9" onClick={uploader.open} loading={uploader.busy} icon={<Upload className="h-4 w-4" aria-hidden />}>
          Upload
        </Button>
        {uploader.element}
      </div>
      <p className="mb-3 text-xs text-ink-muted">{MEDIA_RULES.label}.</p>
      {uploader.errors.map((e) => (
        <FieldError key={e} message={e} />
      ))}
      {error && !data ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : isLoading ? (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {Array.from({ length: 10 }, (_, i) => (
            <Skeleton key={i} className="aspect-square" />
          ))}
        </div>
      ) : !data?.length ? (
        <EmptyState icon={<ImageOff className="h-6 w-6" aria-hidden />} title="No images match" />
      ) : (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5" role="listbox" aria-multiselectable={multiple} aria-label="Media">
          {data.map((m) => {
            const on = selected.includes(m.id);
            return (
              <li key={m.id} role="option" aria-selected={on}>
                <button
                  type="button"
                  onClick={() => toggle(m.id)}
                  className={cn('group relative block w-full overflow-hidden rounded-lg border-2 bg-sand-100', on ? 'border-brand-600' : 'border-transparent hover:border-sand-300')}
                  title={m.fileName}
                >
                  <img src={m.url} alt={m.alt.en || m.fileName} className="aspect-square w-full object-cover" loading="lazy" />
                  {on && (
                    <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-white">
                      <Check className="h-3.5 w-3.5" aria-hidden />
                    </span>
                  )}
                  {m.source === 'upload' && <span className="absolute bottom-1 left-1 rounded bg-ink/75 px-1 text-2xs text-white">Local</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}

/** Single-image field: preview + choose / change / remove. */
export function ImageField({ label, value, onChange, hint, error, aspect = 'square' }: { label: string; value: string | null; onChange: (id: string | null) => void; hint?: string; error?: string; aspect?: 'square' | 'wide' }) {
  const [open, setOpen] = useState(false);
  const { map } = useMediaMap();
  const asset = value ? map.get(value) : undefined;
  return (
    <div>
      <p className="label">{label}</p>
      <div className="flex items-start gap-3">
        <div className={cn('flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-sand-200 bg-sand-100', aspect === 'wide' ? 'h-16 w-32' : 'h-20 w-20')}>
          {asset ? <img src={asset.url} alt={asset.alt.en} className="h-full w-full object-cover" /> : value ? <ImageOff className="h-5 w-5 text-ink-faint" aria-label="Missing image" /> : <ImagePlus className="h-5 w-5 text-ink-faint" aria-hidden />}
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
              {value ? 'Change' : 'Choose image'}
            </Button>
            {value && (
              <Button variant="ghost" size="sm" onClick={() => onChange(null)} icon={<X className="h-3.5 w-3.5" aria-hidden />}>
                Remove
              </Button>
            )}
          </div>
          {asset && <p className="max-w-[16rem] truncate text-xs text-ink-muted">{asset.fileName}</p>}
          {hint && !error && <p className="text-xs text-ink-muted">{hint}</p>}
          <FieldError message={error} />
        </div>
      </div>
      {open && <MediaPickerModal open onClose={() => setOpen(false)} initial={value ? [value] : []} onSelect={(ids) => onChange(ids[0] ?? null)} title={`Choose ${label.toLowerCase()}`} />}
    </div>
  );
}

export function LocalUploadNotice() {
  return (
    <Notice tone="demo">
      Uploaded images are <strong>local previews</strong> held in this browser tab (object URLs). They are not uploaded to a server and disappear on refresh.
    </Notice>
  );
}
