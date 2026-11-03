import { useEffect, useState } from 'react';
import { Languages } from 'lucide-react';
import { translationsApi, type ContentLang, type TranslationRow } from '@/api';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, Notice, Skeleton } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/Page';
import { usePageMeta } from '@/hooks/misc';
import { useListParams } from '@/hooks/useListParams';
import { invalidate, useQuery } from '@/hooks/useQuery';
import { errorMessage } from '@/services/api';
import { toast } from '@/store';
import { cn } from '@/utils/misc';

const LANGS: Array<{ code: ContentLang; label: string }> = [
  { code: 'de', label: 'Deutsch' },
  { code: 'fr', label: 'Français' },
  { code: 'it', label: 'Italiano' },
  { code: 'es', label: 'Español' },
];

function Row({ row, lang }: { row: TranslationRow; lang: ContentLang }) {
  const saved = row.translations[lang];
  const [text, setText] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setText(saved);
  }, [saved]);
  const dirty = text.trim() !== saved;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await translationsApi.saveTranslation(row.source, lang, text.trim());
      invalidate('translations');
      toast(text.trim() ? 'Translation saved.' : 'Translation removed — this text now shows in English.', 'success');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const long = row.source.length > 90;
  return (
    <li className="grid gap-3 px-4 py-4 sm:px-5 lg:grid-cols-2 lg:gap-6">
      <div className="min-w-0">
        <p className="whitespace-pre-line break-words text-[13px] text-ink">{row.source}</p>
        <p className="mt-1.5 flex flex-wrap gap-1">
          {row.where.slice(0, 3).map((w) => (
            <span key={w} className="rounded bg-sand-100 px-1.5 py-0.5 text-2xs text-ink-muted">
              {w}
            </span>
          ))}
          {row.where.length > 3 && <span className="text-2xs text-ink-muted">+{row.where.length - 3} more</span>}
        </p>
      </div>
      <div className="min-w-0">
        <label className="sr-only" htmlFor={`tr-${lang}-${row.source.slice(0, 20)}`}>
          {LANGS.find((l) => l.code === lang)?.label} translation
        </label>
        <textarea
          id={`tr-${lang}-${row.source.slice(0, 20)}`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={long ? 4 : 2}
          placeholder="Not translated — shown in English"
          className={cn('input min-h-[60px] py-2 text-[13px]', !saved && 'border-amber-300 bg-amber-50/40')}
        />
        {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
        {dirty && (
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={save} loading={busy}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setText(saved)} disabled={busy}>
              Undo
            </Button>
          </div>
        )}
      </div>
    </li>
  );
}

export default function TranslationsPage() {
  usePageMeta('Translations', [{ label: 'Content' }]);
  const list = useListParams(['lang', 'status'], { pageSize: 25 });
  const f = list.query.filters ?? {};
  const lang = (LANGS.some((l) => l.code === f.lang) ? f.lang : 'de') as ContentLang;
  const status = f.status ?? 'all';
  const [search, setSearch] = useState(list.query.q ?? '');
  const { data, isLoading, error, refetch } = useQuery(
    `translations:${list.key}`,
    () => translationsApi.fetchTranslations({ q: list.query.q || undefined, lang, status, page: list.query.page, pageSize: 25 }),
    { keepPrevious: true },
  );

  return (
    <>
      <PageHeader
        description={
          <p>
            Store content is written in English. Shoppers who pick Deutsch, Français, Italiano or Español see these translations; anything not translated shows in English. If you change
            the English text of a product or page, its old translation stops applying and the new text appears here as missing.
          </p>
        }
      />
      <div className="card">
        <div className="flex flex-col gap-3 border-b border-sand-200 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div role="tablist" aria-label="Language" className="flex flex-wrap gap-1">
            {LANGS.map((l) => (
              <button
                key={l.code}
                type="button"
                role="tab"
                aria-selected={lang === l.code}
                onClick={() => list.update({ lang: l.code })}
                className={cn('rounded-lg px-3 py-1.5 text-[13px] font-medium', lang === l.code ? 'bg-ink text-white' : 'text-ink-soft hover:bg-sand-100')}
              >
                {l.label}
                {data && (
                  <span className={cn('ml-1.5 text-2xs', lang === l.code ? 'text-white/70' : 'text-ink-muted')}>
                    {data.counts[l.code]}/{data.sourceCount}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={status} onChange={(e) => list.update({ status: e.target.value })} className="input h-9 w-40 py-1 text-[13px]" aria-label="Show">
              <option value="all">All texts</option>
              <option value="missing">Missing only</option>
              <option value="translated">Translated only</option>
            </select>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                list.update({ q: search });
              }}
            >
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} onBlur={() => list.update({ q: search })} placeholder="Search text or product" className="input h-9 w-56 py-1 text-[13px]" />
            </form>
          </div>
        </div>

        {data && data.counts[lang] < data.sourceCount && status !== 'missing' && (
          <Notice tone="warning" className="m-4" title={`${data.sourceCount - data.counts[lang]} texts not translated yet`}>
            <button type="button" className="link" onClick={() => list.update({ status: 'missing' })}>
              Show missing only
            </button>
          </Notice>
        )}

        {error && !data ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : isLoading || !data ? (
          <div className="space-y-3 p-4">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
        ) : data.items.length === 0 ? (
          <EmptyState icon={<Languages className="h-6 w-6" aria-hidden />} title={status === 'missing' ? 'Everything is translated' : 'No texts match'} />
        ) : (
          <>
            <div className="hidden grid-cols-2 gap-6 border-b border-sand-200 px-5 py-2 text-2xs font-semibold uppercase tracking-wider text-ink-muted lg:grid">
              <span>English (original)</span>
              <span>{LANGS.find((l) => l.code === lang)?.label}</span>
            </div>
            <ul className="divide-y divide-sand-200">
              {data.items.map((row) => (
                <Row key={`${lang}:${row.source}`} row={row} lang={lang} />
              ))}
            </ul>
            <div className="flex items-center justify-between border-t border-sand-200 px-4 py-3 text-[13px] text-ink-muted">
              <span>
                {data.total} text{data.total === 1 ? '' : 's'}
              </span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" disabled={data.page <= 1} onClick={() => list.update({ page: data.page - 1 }, false)}>
                  Previous
                </Button>
                <span>
                  Page {data.page} of {data.pageCount}
                </span>
                <Button size="sm" variant="outline" disabled={data.page >= data.pageCount} onClick={() => list.update({ page: data.page + 1 }, false)}>
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
