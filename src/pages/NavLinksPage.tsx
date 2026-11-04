import { useState } from 'react';
import { Controller, FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowDown, ArrowUp, Link2, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog, Drawer } from '@/components/ui/Dialog';
import { Badge, EmptyState, ErrorState, Notice, Skeleton } from '@/components/ui/Feedback';
import { Switch, TextField } from '@/components/ui/Form';
import { ContentLangProvider, LocalizedField } from '@/components/ui/LocalizedField';
import { Menu } from '@/components/ui/Menu';
import { PageHeader } from '@/components/ui/Page';
import { usePageMeta } from '@/hooks/misc';
import { invalidate, useQuery } from '@/hooks/useQuery';
import { navLinksApi, type AdminNavLink } from '@/api';
import { applyServerErrors } from '@/utils/forms';
import { toast } from '@/store';

const schema = z.object({
  name: z.object({ en: z.string().trim().min(1, 'English label is required.').max(40), hi: z.string().trim().max(40).default('') }),
  href: z.string().trim().min(1, 'Link is required.').max(200),
  isActive: z.boolean(),
});
type Values = z.infer<typeof schema>;

function NavLinkForm({ link, nextPosition, onDone }: { link: AdminNavLink | 'new'; nextPosition: number; onDone: () => void }) {
  const isNew = link === 'new';
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: isNew ? { name: { en: '', hi: '' }, href: '', isActive: true } : { name: link.label, href: link.href, isActive: link.isActive },
  });
  const { register, handleSubmit, setError, control, formState } = form;

  const onSubmit = async (v: Values) => {
    const input = { labelEn: v.name.en, href: v.href, isActive: v.isActive, position: isNew ? nextPosition : link.position };
    try {
      if (isNew) await navLinksApi.createNavLink(input);
      else await navLinksApi.updateNavLink(link.id, input);
      invalidate('nav-links');
      toast(isNew ? 'Navigation link created.' : 'Navigation link saved.', 'success');
      onDone();
    } catch (e) {
      applyServerErrors(e, setError);
    }
  };

  return (
    <FormProvider {...form}>
      <form id="navlink-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        <LocalizedField name="name" label="Label" required maxLength={40} />
        <TextField
          id="navlink-href"
          label="Link"
          required
          hint="A site path like /collection/wedding-guide or /category/ceramics, or a full https:// URL."
          error={formState.errors.href?.message}
          {...register('href')}
        />
        <Controller control={control} name="isActive" render={({ field }) => <Switch label="Active" description="Inactive links are hidden from the storefront." checked={field.value} onChange={field.onChange} />} />
      </form>
    </FormProvider>
  );
}

export default function NavLinksPage() {
  usePageMeta('Navigation', [{ label: 'Content' }]);
  const { data, isLoading, error, refetch } = useQuery('nav-links', () => navLinksApi.fetchNavLinks());
  const [editing, setEditing] = useState<AdminNavLink | 'new' | null>(null);
  const [deleting, setDeleting] = useState<AdminNavLink | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);

  const nextPosition = Math.max(-1, ...(data ?? []).map((n) => n.position)) + 1;

  const move = async (id: string, dir: -1 | 1) => {
    if (!data) return;
    const ids = data.map((n) => n.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setReordering(true);
    try {
      await navLinksApi.reorderNavLinks(ids);
      invalidate('nav-links');
    } finally {
      setReordering(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteError(null);
    try {
      await navLinksApi.deleteNavLink(deleting.id);
      invalidate('nav-links');
      toast('Navigation link deleted.', 'success');
      setDeleting(null);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Something went wrong.');
    }
  };

  return (
    <ContentLangProvider>
      <PageHeader
        description="The secondary row of links shown site-wide under the header (Gifts, Top Gifts, Wedding Guide, etc.). Link to a collection, a category, or any URL."
        actions={
          <Button icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => setEditing('new')}>
            Add link
          </Button>
        }
      />
      <div className="card">
        {error && !data ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : isLoading ? (
          <div className="space-y-3 p-4">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-14" />)}</div>
        ) : !data?.length ? (
          <EmptyState icon={<Link2 className="h-6 w-6" aria-hidden />} title="No navigation links yet" action={<Button onClick={() => setEditing('new')}>Add link</Button>} />
        ) : (
          <ul className="divide-y divide-sand-200">
            {data.map((n, i) => (
              <li key={n.id} className="flex items-center gap-4 px-4 py-3">
                <div className="flex shrink-0 flex-col">
                  <button type="button" disabled={i === 0 || reordering} onClick={() => move(n.id, -1)} className="text-ink-muted hover:text-ink disabled:opacity-30" aria-label={`Move ${n.label.en} up`}>
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button type="button" disabled={i === data.length - 1 || reordering} onClick={() => move(n.id, 1)} className="text-ink-muted hover:text-ink disabled:opacity-30" aria-label={`Move ${n.label.en} down`}>
                    <ArrowDown className="h-4 w-4" />
                  </button>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" className="font-medium text-ink hover:underline" onClick={() => setEditing(n)}>
                      {n.label.en}
                    </button>
                    {!n.isActive && <Badge tone="muted">Inactive</Badge>}
                  </div>
                  <p className="truncate text-xs text-ink-muted">{n.href}</p>
                </div>
                <span className="hidden text-[13px] text-ink-soft sm:block">
                  {n.productCount} product{n.productCount === 1 ? '' : 's'}
                </span>
                <Menu
                  label={`Actions for ${n.label.en}`}
                  items={[
                    { label: 'Edit', icon: <Pencil className="h-4 w-4" aria-hidden />, onSelect: () => setEditing(n) },
                    { label: 'Delete…', icon: <Trash2 className="h-4 w-4" aria-hidden />, danger: true, onSelect: () => { setDeleting(n); setDeleteError(null); } },
                  ]}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <Drawer open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' || !editing ? 'Add navigation link' : `Edit ${editing.label.en}`} footer={<Button type="submit" form="navlink-form">Save</Button>}>
        {editing !== null && <NavLinkForm link={editing} nextPosition={nextPosition} onDone={() => setEditing(null)} />}
      </Drawer>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={`Delete "${deleting?.label.en ?? ''}"?`}
        confirmLabel="Delete"
        tone="danger"
        onConfirm={confirmDelete}
      >
        <p>Remove this link from the storefront navigation?</p>
        {deleteError && <Notice tone="error" className="mt-3">{deleteError}</Notice>}
      </ConfirmDialog>
    </ContentLangProvider>
  );
}
