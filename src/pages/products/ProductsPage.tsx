import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Archive, ArchiveRestore, Copy, Download, FileSpreadsheet, PackagePlus, Pencil, SearchX, Trash2, Upload } from 'lucide-react';
import { useMediaMap } from '@/components/media/MediaPicker';
import { Button, ButtonLink } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState, Notice } from '@/components/ui/Feedback';
import { FilterBar } from '@/components/ui/FilterBar';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Menu } from '@/components/ui/Menu';
import { PageHeader } from '@/components/ui/Page';
import { ProductStatusBadge, StockBadge } from '@/components/ui/StatusBadges';
import { usePageMeta, useSettings } from '@/hooks/misc';
import { useListParams } from '@/hooks/useListParams';
import { invalidate, useQuery } from '@/hooks/useQuery';
import { errorMessage } from '@/services/api';
import { categoryService } from '@/services/catalogServices';
import { productService } from '@/services/productService';
import { downloadImportTemplate, exportProductsExcel, importProductsExcel, type ImportResult } from '@/api/products';
import { itemGroupsApi } from '@/api';
import { API_MODE } from '@/api/config';
import { confirmAction, toast } from '@/store';
import type { Product, ProductStatus } from '@/types';
import { formatDate } from '@/utils/dates';
import { stockState } from '@/utils/inventoryRules';
import { formatUsd } from '@/utils/money';
import { priceRange, totalStock } from '@/utils/productRules';

export default function ProductsPage() {
  usePageMeta('Products', [{ label: 'Catalog' }]);
  const navigate = useNavigate();
  const list = useListParams(['status', 'category', 'stock', 'flag', 'itemGroup'], { sort: 'updated', dir: 'desc' });
  const { data, isLoading, isFetching, error, refetch } = useQuery(`products:list:${list.key}`, () => productService.list(list.query), { keepPrevious: true });
  const { data: categories } = useQuery('categories', () => categoryService.list());
  const { data: itemGroups } = useQuery('item-groups', () => itemGroupsApi.fetchItemGroups());
  const activeItemGroup = list.query.filters?.itemGroup ? itemGroups?.find((g) => g.id === list.query.filters?.itemGroup) : undefined;
  const { data: settings } = useSettings();
  const { map: media } = useMediaMap();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkFailures, setBulkFailures] = useState<Array<{ name: string; reason: string }>>([]);
  const [importing, setImporting] = useState(false);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const filtered = list.activeFilters > 0;
  const [importReport, setImportReport] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setImporting(true);
    setImportReport(null);
    try {
      const result = await importProductsExcel(file);
      setImportReport(result);
      refresh();
      toast(
        `Imported ${result.imported} new, updated ${result.updated}, skipped ${result.skipped}.`,
        result.errors.length ? 'info' : 'success',
      );
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setImporting(false);
    }
  };

  const handleDownload = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };
  const threshold = settings?.store.lowStockThreshold ?? 5;
  const catName = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c.name.en])), [categories]);

  const refresh = () => invalidate('products', 'product:', 'inventory', 'dashboard', 'categories', 'media');

  const bulk = async (status: ProductStatus) => {
    const ids = [...selected];
    const verb = status === 'active' ? 'Activate' : status === 'draft' ? 'Move to draft' : 'Archive';
    const ok = await confirmAction({
      title: `${verb} ${ids.length} product${ids.length === 1 ? '' : 's'}?`,
      body:
        status === 'active'
          ? 'Each product is checked before activation. Products missing required details stay unchanged.'
          : status === 'archived'
            ? 'Archived products are hidden from catalogue management lists by default and cannot be sold. Order history keeps its snapshots.'
            : 'Draft products are not sellable until activated again.',
      confirmLabel: verb,
      tone: status === 'archived' ? 'danger' : 'primary',
    });
    if (!ok) return;
    try {
      // L-P1: pass the names from the loaded list so failures are reported by name.
      const names = Object.fromEntries((data?.items ?? []).map((p) => [p.id, p.name.en]));
      const res = await productService.setStatus(ids, status, names);
      setBulkFailures(res.failed);
      setSelected(new Set());
      refresh();
      toast(`${res.updated.length} updated${res.failed.length ? `, ${res.failed.length} could not be changed` : ''}.`, res.failed.length ? 'info' : 'success');
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  // H7: deleting the catalogue is destructive, so it needs the word DELETE typed in —
  // one stray click can no longer wipe the store. When filters are active, only the
  // filtered set is deleted (the dialog says exactly how many). Media files and
  // inventory history are kept; order snapshots are untouched.
  const deleteAll = async () => {
    try {
      const res = await productService.deleteAll(filtered ? list.query : undefined);
      setSelected(new Set());
      setDeleteAllOpen(false);
      setDeleteConfirmText('');
      refresh();
      toast(`${res.deleted} product${res.deleted === 1 ? '' : 's'} deleted.`, 'success');
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  const duplicate = async (p: Product) => {
    const ok = await confirmAction({ title: `Duplicate “${p.name.en}”?`, body: 'Creates a draft copy with “-copy” slug and SKUs, and zero stock.', confirmLabel: 'Duplicate' });
    if (!ok) return;
    try {
      const copy = await productService.duplicate(p.id);
      refresh();
      toast('Draft copy created.', 'success');
      navigate(`/products/${copy.id}/edit`);
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  const setOne = async (p: Product, status: ProductStatus) => {
    const archiving = status === 'archived';
    const ok = await confirmAction({
      title: archiving ? `Archive “${p.name.en}”?` : `Restore “${p.name.en}” as a draft?`,
      body: archiving ? 'The product stops being sellable. You can restore it later.' : 'It returns as a draft; activate it when ready.',
      confirmLabel: archiving ? 'Archive' : 'Restore',
      tone: archiving ? 'danger' : 'primary',
    });
    if (!ok) return;
    try {
      await productService.setStatus([p.id], status, { [p.id]: p.name.en });
      refresh();
      toast(archiving ? 'Product archived.' : 'Product restored as draft.', 'success');
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  const columns: Column<Product>[] = [
    {
      key: 'name',
      header: 'Product',
      sortKey: 'name',
      cell: (p) => {
        const img = p.images[0] ? media.get(p.images[0].mediaId) : undefined;
        return (
          <div className="flex min-w-[14rem] items-center gap-3">
            <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md border border-sand-200 bg-sand-100">{img && <img src={img.url} alt="" className="h-full w-full object-cover" loading="lazy" />}</div>
            <div className="min-w-0">
              <Link to={`/products/${p.id}/edit`} className="block truncate font-medium text-ink hover:underline">
                {p.name.en}
              </Link>
              <p className="truncate text-xs text-ink-muted">/{p.slug}</p>
            </div>
          </div>
        );
      },
    },
    { key: 'sku', header: 'SKU', hideBelow: 'lg', cell: (p) => <span className="font-mono text-xs">{p.variants.length === 1 ? p.variants[0].sku : `${p.variants.length} variants`}</span> },
    { key: 'category', header: 'Category', hideBelow: 'md', cell: (p) => catName.get(p.categoryId) ?? <span className="text-ink-faint">—</span> },
    {
      key: 'price',
      header: 'Price (USD)',
      sortKey: 'price',
      align: 'right',
      cell: (p) => {
        const r = priceRange(p.variants);
        return <span className="num">{r.min === r.max ? formatUsd(r.min) : `${formatUsd(r.min)} – ${formatUsd(r.max)}`}</span>;
      },
    },
    {
      key: 'stock',
      header: 'Stock',
      sortKey: 'stock',
      align: 'right',
      cell: (p) => {
        const states = p.variants.map((v) => stockState(v.stock, threshold));
        const worst = states.includes('out') ? 'out' : states.includes('low') ? 'low' : 'in';
        return (
          <div className="flex items-center justify-end gap-2">
            <span className="num">{totalStock(p)}</span>
            {worst !== 'in' && <StockBadge state={worst} />}
          </div>
        );
      },
    },
    { key: 'status', header: 'Status', cell: (p) => <ProductStatusBadge status={p.status} /> },
    { key: 'updated', header: 'Updated', sortKey: 'updated', hideBelow: 'xl', cell: (p) => <span className="text-ink-muted">{formatDate(p.updatedAt)}</span> },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      cell: (p) => (
        <Menu
          label={`Actions for ${p.name.en}`}
          items={[
            { label: 'Edit', icon: <Pencil className="h-4 w-4" aria-hidden />, to: `/products/${p.id}/edit` },
            { label: 'Duplicate…', icon: <Copy className="h-4 w-4" aria-hidden />, onSelect: () => void duplicate(p) },
            p.status === 'archived'
              ? { label: 'Restore as draft…', icon: <ArchiveRestore className="h-4 w-4" aria-hidden />, onSelect: () => void setOne(p, 'draft') }
              : { label: 'Archive…', icon: <Archive className="h-4 w-4" aria-hidden />, danger: true, onSelect: () => void setOne(p, 'archived') },
          ]}
        />
      ),
    },
  ];

  return (
    <>
      <PageHeader
        description="Prices are stored in USD, the base currency. The storefront converts them for shoppers."
        actions={
          <div className="flex items-center gap-2">
            {/* M-P7: import/export no longer vanish in demo mode — they stay visible but
             *  disabled, with the reason in the tooltip, so the feature is discoverable. */}
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />
            <Button
              variant="ghost"
              icon={<FileSpreadsheet className="h-4 w-4" aria-hidden />}
              onClick={() => void handleDownload(downloadImportTemplate)}
              title={API_MODE ? 'Download blank Excel template with sample data and instructions' : 'Import and export need the live backend — unavailable in demo mode.'}
              disabled={!API_MODE}
            >
              Download Template
            </Button>
            <Button
              variant="ghost"
              icon={<Upload className="h-4 w-4" aria-hidden />}
              onClick={() => fileInputRef.current?.click()}
              disabled={importing || !API_MODE}
              title={!API_MODE ? 'Import needs the live backend — unavailable in demo mode.' : undefined}
            >
              {importing ? 'Importing…' : 'Import Excel'}
            </Button>
            <Button
              variant="ghost"
              icon={<Download className="h-4 w-4" aria-hidden />}
              onClick={() => void handleDownload(() => exportProductsExcel(API_MODE ? { q: list.query.q || undefined, status: list.query.filters?.status as ProductStatus | undefined, category: list.query.filters?.category, stock: list.query.filters?.stock as 'in' | 'low' | 'out' | undefined, flag: list.query.filters?.flag as 'featured' | 'bestseller' | 'new' | undefined, itemGroup: list.query.filters?.itemGroup, sort: (list.query.sort ?? 'updated') as 'name' | 'price' | 'stock' | 'updated' | 'order', dir: list.query.dir ?? 'desc' } : {}))}
              disabled={!API_MODE}
              title={!API_MODE ? 'Export needs the live backend — unavailable in demo mode.' : undefined}
            >
              Export Excel
            </Button>
            <Button
              variant="danger"
              icon={<Trash2 className="h-4 w-4" aria-hidden />}
              onClick={() => { setDeleteConfirmText(''); setDeleteAllOpen(true); }}
            >
              {filtered ? `Delete filtered (${data?.total ?? '…'})` : 'Delete All'}
            </Button>
            <ButtonLink to="/products/new" variant="primary" icon={<PackagePlus className="h-4 w-4" aria-hidden />}>
              Add product
            </ButtonLink>
          </div>
        }
      />
      {activeItemGroup && (
        <Notice tone="info" className="mb-4">
          Showing products in item group: <strong>{activeItemGroup.nameEn}</strong>
          <Button size="xs" variant="ghost" className="ml-3" onClick={() => list.update({ itemGroup: null })}>Clear filter</Button>
        </Notice>
      )}
      {importReport && (
        <Notice
          tone={importReport.errors.length ? 'warning' : 'success'}
          className="mb-4"
          title={`Import finished — ${importReport.imported} new, ${importReport.updated} updated, ${importReport.skipped} skipped`}
          action={
            <Button size="xs" variant="ghost" onClick={() => setImportReport(null)}>
              Dismiss
            </Button>
          }
        >
          <p>
            {importReport.categories} categor{importReport.categories === 1 ? 'y' : 'ies'} · {importReport.variants} variants. Prices in the file are rupees and were
            converted to USD at the configured rate. New products are saved as drafts — review and activate them when ready.
          </p>
          {importReport.errors.length > 0 && (
            <ul className="mt-2 max-h-48 list-disc overflow-y-auto pl-4">
              {importReport.errors.slice(0, 50).map((e, i) => (
                <li key={`${e.row}-${e.field}-${i}`}>
                  Row {e.row} — {e.field}: {e.message}
                </li>
              ))}
              {importReport.errors.length > 50 && <li>…and {importReport.errors.length - 50} more rows.</li>}
            </ul>
          )}
        </Notice>
      )}
      {bulkFailures.length > 0 && (
        <Notice tone="warning" className="mb-4" title="Some products were not changed" action={<Button size="xs" variant="ghost" onClick={() => setBulkFailures([])}>Dismiss</Button>}>
          <ul className="list-disc pl-4">
            {bulkFailures.map((f) => (
              <li key={f.name}>
                <strong>{f.name}</strong>: {f.reason}
              </li>
            ))}
          </ul>
        </Notice>
      )}
      <div className="card">
        <FilterBar
          search={list.query.q ?? ''}
          onSearch={(q) => list.update({ q })}
          searchPlaceholder="Search name, slug, SKU or tag"
          filters={[
            { key: 'status', label: 'Status', options: [{ value: 'active', label: 'Active' }, { value: 'draft', label: 'Draft' }, { value: 'archived', label: 'Archived' }] },
            { key: 'category', label: 'Category', options: (categories ?? []).map((c) => ({ value: c.id, label: c.name.en })) },
            { key: 'stock', label: 'Stock', options: [{ value: 'in', label: 'In stock' }, { value: 'low', label: 'Low stock' }, { value: 'out', label: 'Out of stock' }] },
            { key: 'flag', label: 'Flag', options: [{ value: 'featured', label: 'Featured' }, { value: 'bestseller', label: 'Bestseller' }, { value: 'new', label: 'New arrival' }] },
          ]}
          values={list.query.filters}
          onFilter={(k, v) => list.update({ [k]: v })}
          activeCount={list.activeFilters}
          onClear={list.clear}
        />
        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-sand-200 bg-brand-50/60 px-4 py-2 text-[13px]" role="region" aria-label="Bulk actions">
            <span className="font-medium">{selected.size} selected</span>
            <Button size="xs" variant="outline" onClick={() => void bulk('active')}>
              Activate
            </Button>
            <Button size="xs" variant="outline" onClick={() => void bulk('draft')}>
              Move to draft
            </Button>
            <Button size="xs" variant="dangerOutline" onClick={() => void bulk('archived')}>
              Archive
            </Button>
            <Button size="xs" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear selection
            </Button>
          </div>
        )}
        <DataTable
          caption="Products"
          columns={columns}
          rows={data?.items}
          getRowId={(p) => p.id}
          loading={isLoading}
          refreshing={isFetching && !isLoading}
          error={error}
          onRetry={refetch}
          sort={list.query.sort}
          dir={list.query.dir}
          onSort={list.toggleSort}
          selected={selected}
          onSelectedChange={setSelected}
          page={data?.page}
          pageCount={data?.pageCount}
          total={data?.total}
          pageSize={data?.pageSize}
          onPage={(page) => list.update({ page }, false)}
          empty={
            <EmptyState
              icon={<SearchX className="h-6 w-6" aria-hidden />}
              title="No products match"
              body="Try a different search or clear the filters."
              action={list.activeFilters ? <Button variant="outline" size="sm" onClick={list.clear}>Clear filters</Button> : undefined}
            />
          }
        />
      </div>
      <ConfirmDialog
        open={deleteAllOpen}
        onClose={() => setDeleteAllOpen(false)}
        title={filtered ? `Delete ${data?.total ?? 'the filtered'} products?` : 'Delete ALL products?'}
        confirmLabel={filtered ? 'Delete filtered products' : 'Delete All'}
        tone="danger"
        disabled={deleteConfirmText.trim() !== 'DELETE'}
        onConfirm={() => void deleteAll()}
      >
        <p>
          {filtered
            ? `This permanently deletes the ${data?.total ?? ''} products matching the current filters — variants, options, image references and specs included.`
            : 'This permanently deletes every product, variant, option, image reference and spec.'}{' '}
          Media files are kept, inventory history is kept, and order snapshots are untouched. This cannot be undone.
        </p>
        <p className="mt-2">
          Export the catalogue first if you want a backup — use the “Export Excel” button above.
        </p>
        <label className="mt-3 block text-[13px] font-medium text-ink">
          Type <span className="font-mono font-semibold">DELETE</span> to confirm
          <input
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            placeholder="DELETE"
            autoComplete="off"
            className="mt-1 block w-full rounded-lg border border-sand-300 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand-500"
          />
        </label>
      </ConfirmDialog>
    </>
  );
}
