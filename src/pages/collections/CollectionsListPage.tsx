import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Layers, Pencil, Plus, Trash2 } from 'lucide-react';
import { ButtonLink } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Badge, EmptyState, ErrorState, Notice, Skeleton } from '@/components/ui/Feedback';
import { Menu } from '@/components/ui/Menu';
import { PageHeader } from '@/components/ui/Page';
import { usePageMeta } from '@/hooks/misc';
import { invalidate, useQuery } from '@/hooks/useQuery';
import { collectionsApi, type AdminCollection } from '@/api';
import { toast } from '@/store';

export default function CollectionsListPage() {
  usePageMeta('Collections', [{ label: 'Content' }]);
  const { data, isLoading, error, refetch } = useQuery('collections', () => collectionsApi.fetchCollections());
  const [deleting, setDeleting] = useState<AdminCollection | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const setStatus = async (c: AdminCollection, status: 'draft' | 'published') => {
    try {
      await collectionsApi.updateCollectionStatus(c.id, status);
      invalidate('collections');
      toast(status === 'published' ? 'Collection published.' : 'Collection unpublished.', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not update the collection.', 'error');
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteError(null);
    try {
      await collectionsApi.deleteCollection(deleting.id);
      invalidate('collections');
      toast('Collection deleted.', 'success');
      setDeleting(null);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Something went wrong.');
    }
  };

  return (
    <>
      <PageHeader
        description="Curated landing pages (hero + several named product sections, e.g. Wedding Guide) and curated listing pages (one flat section, e.g. Top Gifts). Distinct from categories — a product can appear in many collections."
        actions={
          <ButtonLink to="/collections/new" icon={<Plus className="h-4 w-4" aria-hidden />}>
            Add collection
          </ButtonLink>
        }
      />
      <div className="card">
        {error && !data ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : isLoading ? (
          <div className="space-y-3 p-4">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-14" />)}</div>
        ) : !data?.length ? (
          <EmptyState icon={<Layers className="h-6 w-6" aria-hidden />} title="No collections yet" action={<ButtonLink to="/collections/new">Add collection</ButtonLink>} />
        ) : (
          <ul className="divide-y divide-sand-200">
            {data.map((c) => (
              <li key={c.id} className="flex items-center gap-4 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={`/collections/${c.id}/edit`} className="font-medium text-ink hover:underline">
                      {c.title.en}
                    </Link>
                    <Badge tone={c.status === 'published' ? 'success' : 'muted'}>{c.status === 'published' ? 'Published' : 'Draft'}</Badge>
                  </div>
                  <p className="truncate text-xs text-ink-muted">
                    /collection/{c.slug} · {c.sections.length} section{c.sections.length === 1 ? '' : 's'} · {c.circles.length} circle{c.circles.length === 1 ? '' : 's'}
                  </p>
                </div>
                <Menu
                  label={`Actions for ${c.title.en}`}
                  items={[
                    { label: 'Edit', icon: <Pencil className="h-4 w-4" aria-hidden />, onSelect: () => {}, to: `/collections/${c.id}/edit` },
                    c.status === 'published'
                      ? { label: 'Unpublish', onSelect: () => setStatus(c, 'draft') }
                      : { label: 'Publish', onSelect: () => setStatus(c, 'published') },
                    { label: 'Delete…', icon: <Trash2 className="h-4 w-4" aria-hidden />, danger: true, onSelect: () => { setDeleting(c); setDeleteError(null); } },
                  ]}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog open={deleting !== null} onClose={() => setDeleting(null)} title={`Delete "${deleting?.title.en ?? ''}"?`} confirmLabel="Delete" tone="danger" onConfirm={confirmDelete}>
        <p>This removes the collection page and any links to it keep pointing nowhere — update navigation links that reference it.</p>
        {deleteError && <Notice tone="error" className="mt-3">{deleteError}</Notice>}
      </ConfirmDialog>
    </>
  );
}
