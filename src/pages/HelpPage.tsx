import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { BookOpen, ChevronRight, FileText, FolderOpen, Pencil, Plus, Trash2 } from 'lucide-react';
import { helpApi, type HelpArticle, type HelpCategory } from '@/api';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Drawer } from '@/components/ui/Dialog';
import { EmptyState } from '@/components/ui/Feedback';
import { CheckboxField, SelectField, TextField, TextareaField } from '@/components/ui/Form';
import { PageHeader } from '@/components/ui/Page';
import { usePageMeta } from '@/hooks/misc';
import { invalidate, useQuery } from '@/hooks/useQuery';
import { errorMessage } from '@/services/api';
import { toast } from '@/store';

// ── Schemas ────────────────────────────────────────────────────────────────

const catSchema = z.object({
  nameEn: z.string().trim().min(1, 'Required'),
  nameHi: z.string().trim().default(''),
  slug: z.string().trim().min(1, 'Required').regex(/^[a-z0-9-]+$/, 'Lowercase, digits & hyphens only'),
  descriptionEn: z.string().trim().default(''),
  icon: z.string().trim().default('help-circle'),
  position: z.coerce.number().int().default(0),
  isActive: z.boolean().default(true),
});
type CatForm = z.infer<typeof catSchema>;

const articleSchema = z.object({
  titleEn: z.string().trim().min(1, 'Required'),
  titleHi: z.string().trim().default(''),
  slug: z.string().trim().min(1, 'Required').regex(/^[a-z0-9-]+$/, 'Lowercase, digits & hyphens only'),
  bodyEn: z.string().trim().min(1, 'Required'),
  bodyHi: z.string().trim().default(''),
  position: z.coerce.number().int().default(0),
  isActive: z.boolean().default(true),
});
type ArticleForm = z.infer<typeof articleSchema>;

const ICON_OPTIONS = [
  { value: 'help-circle', label: 'Help Circle' },
  { value: 'package', label: 'Package / Orders' },
  { value: 'truck', label: 'Truck / Shipping' },
  { value: 'credit-card', label: 'Credit Card / Payment' },
  { value: 'refresh-cw', label: 'Refresh / Returns' },
  { value: 'settings', label: 'Settings / Account' },
  { value: 'shopping-bag', label: 'Shopping Bag' },
  { value: 'star', label: 'Star / Reviews' },
];

// ── Category Form Drawer ───────────────────────────────────────────────────

function CategoryDrawer({ cat, onClose }: { cat: HelpCategory | null; onClose: () => void }) {
  const isNew = !cat;
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<CatForm>({
    resolver: zodResolver(catSchema),
    defaultValues: cat ? {
      nameEn: cat.name.en, nameHi: cat.name.hi, slug: cat.slug,
      descriptionEn: cat.description.en, icon: cat.icon,
      position: cat.position, isActive: cat.isActive,
    } : { isActive: true, icon: 'help-circle', position: 0 },
  });

  const onSubmit = async (values: CatForm) => {
    try {
      if (isNew) {
        await helpApi.createCategory({ ...values, descriptionEn: values.descriptionEn || null });
      } else {
        await helpApi.updateCategory(cat.id, { ...values, descriptionEn: values.descriptionEn || null });
      }
      invalidate('help:categories');
      toast(isNew ? 'Category created.' : 'Category updated.', 'success');
      onClose();
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title={isNew ? 'New category' : 'Edit category'}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={isSubmitting} onClick={handleSubmit(onSubmit)}>
            {isNew ? 'Create' : 'Save'}
          </Button>
        </div>
      }
    >
      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
        <TextField label="Name (English)" required error={errors.nameEn?.message} {...register('nameEn')} />
        <TextField label="Name (Hindi)" error={errors.nameHi?.message} {...register('nameHi')} />
        <TextField label="Slug" required hint="URL-friendly ID, e.g. order-issues" error={errors.slug?.message} {...register('slug')} />
        <TextareaField label="Description" rows={2} error={errors.descriptionEn?.message} {...register('descriptionEn')} />
        <SelectField label="Icon" error={errors.icon?.message} {...register('icon')}>
          {ICON_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </SelectField>
        <TextField label="Position" type="number" hint="Lower = shown first" error={errors.position?.message} {...register('position')} />
        <CheckboxField label="Active (visible on storefront)" {...register('isActive')} />
      </form>
    </Drawer>
  );
}

// ── Article Form Drawer ────────────────────────────────────────────────────

function ArticleDrawer({ catId, article, onClose }: { catId: string; article: HelpArticle | null; onClose: () => void }) {
  const isNew = !article;
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<ArticleForm>({
    resolver: zodResolver(articleSchema),
    defaultValues: article ? {
      titleEn: article.title.en, titleHi: article.title.hi, slug: article.slug,
      bodyEn: article.body.en, bodyHi: article.body.hi,
      position: article.position, isActive: article.isActive,
    } : { isActive: true, position: 0 },
  });

  const onSubmit = async (values: ArticleForm) => {
    try {
      if (isNew) await helpApi.createArticle(catId, values);
      else await helpApi.updateArticle(catId, article.id, values);
      invalidate(`help:articles:${catId}`);
      toast(isNew ? 'Article created.' : 'Article updated.', 'success');
      onClose();
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title={isNew ? 'New article' : 'Edit article'}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={isSubmitting} onClick={handleSubmit(onSubmit)}>
            {isNew ? 'Create' : 'Save'}
          </Button>
        </div>
      }
    >
      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
        <TextField label="Title (English)" required error={errors.titleEn?.message} {...register('titleEn')} />
        <TextField label="Title (Hindi)" error={errors.titleHi?.message} {...register('titleHi')} />
        <TextField label="Slug" required hint="URL-friendly ID, e.g. how-to-return" error={errors.slug?.message} {...register('slug')} />
        <TextareaField label="Body (English)" required rows={12} hint="Plain text. Paragraphs separated by blank lines." error={errors.bodyEn?.message} {...register('bodyEn')} />
        <TextareaField label="Body (Hindi)" rows={6} error={errors.bodyHi?.message} {...register('bodyHi')} />
        <TextField label="Position" type="number" hint="Lower = shown first" error={errors.position?.message} {...register('position')} />
      </form>
    </Drawer>
  );
}

// ── Articles sub-panel ─────────────────────────────────────────────────────

function ArticlesPanel({ cat, onBack }: { cat: HelpCategory; onBack: () => void }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [articleToEdit, setArticleToEdit] = useState<HelpArticle | null>(null);

  const { data, isLoading } = useQuery(`help:articles:${cat.id}`, () => helpApi.listArticles(cat.id));

  const handleDelete = async (a: HelpArticle) => {
    if (!confirm(`Delete "${a.title.en}"?`)) return;
    try {
      await helpApi.deleteArticle(cat.id, a.id);
      invalidate(`help:articles:${cat.id}`);
      toast('Article deleted.', 'success');
    } catch (e) { toast(errorMessage(e), 'error'); }
  };

  const columns: Column<HelpArticle>[] = [
    {
      key: 'title',
      header: 'Title',
      cell: (a) => (
        <div>
          <p className="font-medium text-ink">{a.title.en}</p>
          {a.title.hi && <p className="text-xs text-ink-muted">{a.title.hi}</p>}
        </div>
      ),
    },
    { key: 'slug', header: 'Slug', cell: (a) => <code className="text-xs text-ink-soft">{a.slug}</code> },
    { key: 'pos', header: 'Pos', cell: (a) => <span className="text-sm text-ink-muted">{a.position}</span> },
    {
      key: 'actions',
      header: '',
      cell: (a) => (
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => { setArticleToEdit(a); setDrawerOpen(true); }} aria-label="Edit" />
          <Button size="sm" variant="ghost" icon={<Trash2 className="h-3.5 w-3.5 text-red-600" />} onClick={() => handleDelete(a)} aria-label="Delete" />
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button type="button" onClick={onBack} className="text-sm text-brand-600 hover:underline">← All categories</button>
          <ChevronRight className="h-4 w-4 text-ink-faint" aria-hidden />
          <span className="text-sm font-medium text-ink">{cat.name.en}</span>
        </div>
        <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => { setArticleToEdit(null); setDrawerOpen(true); }}>
          New article
        </Button>
      </div>
      <DataTable
        caption={`Articles in ${cat.name.en}`}
        columns={columns}
        rows={data?.items}
        getRowId={(a) => a.id}
        loading={isLoading}
        empty={<EmptyState icon={<FileText className="h-8 w-8" />} title="No articles" body="Add the first article to this category." />}
      />
      {drawerOpen && (
        <ArticleDrawer
          catId={cat.id}
          article={articleToEdit}
          onClose={() => { setDrawerOpen(false); setArticleToEdit(null); }}
        />
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function HelpPage() {
  usePageMeta('Help Center', [{ label: 'Content' }]);
  const [catDrawerOpen, setCatDrawerOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<HelpCategory | null>(null);
  const [selectedCat, setSelectedCat] = useState<HelpCategory | null>(null);

  const { data, isLoading } = useQuery('help:categories', () => helpApi.listCategories());

  const handleDeleteCat = async (cat: HelpCategory) => {
    if (!confirm(`Delete category "${cat.name.en}" and ALL its articles?`)) return;
    try {
      await helpApi.deleteCategory(cat.id);
      invalidate('help:categories');
      toast('Category deleted.', 'success');
    } catch (e) { toast(errorMessage(e), 'error'); }
  };

  const catColumns: Column<HelpCategory>[] = [
    {
      key: 'name',
      header: 'Category',
      cell: (c) => (
        <div>
          <p className="font-medium text-ink">{c.name.en}</p>
          {c.name.hi && <p className="text-xs text-ink-muted">{c.name.hi}</p>}
        </div>
      ),
    },
    { key: 'slug', header: 'Slug', cell: (c) => <code className="text-xs text-ink-soft">{c.slug}</code> },
    { key: 'icon', header: 'Icon', cell: (c) => <span className="text-sm text-ink-soft">{c.icon}</span> },
    { key: 'pos', header: 'Pos', cell: (c) => <span className="text-sm text-ink-muted">{c.position}</span> },
    {
      key: 'active',
      header: 'Status',
      cell: (c) => (
        <span className={`text-xs font-medium ${c.isActive ? 'text-green-700' : 'text-ink-muted'}`}>
          {c.isActive ? 'Active' : 'Hidden'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      cell: (c) => (
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => setSelectedCat(c)} icon={<FolderOpen className="h-3.5 w-3.5" />}>
            Articles
          </Button>
          <Button size="sm" variant="ghost" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => { setEditingCat(c); setCatDrawerOpen(true); }} aria-label="Edit" />
          <Button size="sm" variant="ghost" icon={<Trash2 className="h-3.5 w-3.5 text-red-600" />} onClick={() => handleDeleteCat(c)} aria-label="Delete" />
        </div>
      ),
    },
  ];

  if (selectedCat) {
    return <ArticlesPanel cat={selectedCat} onBack={() => setSelectedCat(null)} />;
  }

  return (
    <>
      <PageHeader
        description="Manage Help Center categories and articles shown at /help on the storefront."
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => { setEditingCat(null); setCatDrawerOpen(true); }}>
            New category
          </Button>
        }
      />
      <DataTable
        caption="Help categories"
        columns={catColumns}
        rows={data?.items}
        getRowId={(c) => c.id}
        loading={isLoading}
        empty={<EmptyState icon={<BookOpen className="h-8 w-8" />} title="No categories" body="Create the first help category to get started." />}
      />
      {catDrawerOpen && (
        <CategoryDrawer
          cat={editingCat}
          onClose={() => { setCatDrawerOpen(false); setEditingCat(null); }}
        />
      )}
    </>
  );
}
