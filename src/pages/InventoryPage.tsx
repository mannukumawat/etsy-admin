import { useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { ArrowRight, History, PackageSearch, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Dialog';
import { Badge, EmptyState, ErrorState, Notice, Skeleton } from '@/components/ui/Feedback';
import { FilterBar } from '@/components/ui/FilterBar';
import { SelectField, TextareaField, TextField } from '@/components/ui/Form';
import { PageHeader, Tabs } from '@/components/ui/Page';
import { ProductStatusBadge, StockBadge } from '@/components/ui/StatusBadges';
import { usePageMeta, useSettings } from '@/hooks/misc';
import { useListParams } from '@/hooks/useListParams';
import { invalidate, useQuery } from '@/hooks/useQuery';
import { errorMessage } from '@/services/api';
import { categoryService, inventoryService } from '@/services/catalogServices';
import { settingsService } from '@/services/settingsService';
import { toast } from '@/store';
import type { AdjustmentMode, InventoryRow, StockAdjustment } from '@/types';
import { formatDateTime } from '@/utils/dates';
import { applyServerErrors, num } from '@/utils/forms';
import { ADJUSTMENT_REASONS, applyAdjustment, reasonLabel, stockState } from '@/utils/inventoryRules';
import { cn } from '@/utils/misc';

const adjustSchema = z
  .object({
    mode: z.enum(['add', 'remove', 'set']),
    quantity: z.number({ invalid_type_error: 'Enter a quantity.' }).int('Use a whole number.').min(0, 'Cannot be negative.'),
    reason: z.enum(['restock', 'correction', 'damaged', 'returned', 'other'], { errorMap: () => ({ message: 'Choose a reason.' }) }),
    note: z.string().trim().max(300, 'Keep notes under 300 characters.'),
  })
  .refine((v) => v.reason !== 'other' || v.note.length >= 3, { path: ['note'], message: 'Explain the adjustment when the reason is “Other”.' });
type AdjustValues = z.infer<typeof adjustSchema>;

const MODES: Array<{ value: AdjustmentMode; label: string }> = [
  { value: 'add', label: 'Add' },
  { value: 'remove', label: 'Remove' },
  { value: 'set', label: 'Set to' },
];

function AdjustModal({ row, onClose }: { row: InventoryRow; onClose: () => void }) {
  const { register, handleSubmit, control, setError, setValue, formState } = useForm<AdjustValues>({
    resolver: zodResolver(adjustSchema),
    defaultValues: { mode: 'add', quantity: 1, reason: 'restock', note: '' },
  });
  const mode = useWatch({ control, name: 'mode' });
  const quantity = useWatch({ control, name: 'quantity' });
  const preview = Number.isFinite(quantity) ? applyAdjustment(row.stock, mode, quantity) : { error: 'Enter a quantity.' };

  const onSubmit = async (v: AdjustValues) => {
    const result = applyAdjustment(row.stock, v.mode, v.quantity);
    if ('error' in result) {
      setError('quantity', { message: result.error });
      return;
    }
    try {
      const adj = await inventoryService.adjust({ variantId: row.variantId, ...v });
      invalidate('inventory', 'adjustments', 'products', 'product:', 'dashboard');
      toast(`${row.sku}: ${adj.before} → ${adj.after}`, 'success');
      onClose();
    } catch (e) {
      applyServerErrors(e, setError);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Adjust stock — ${row.sku}`}
      description={`${row.productName.en}${row.variantLabel ? ` · ${row.variantLabel}` : ''}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="adjust-form" loading={formState.isSubmitting} disabled={'error' in preview}>
            Save adjustment
          </Button>
        </>
      }
    >
      <form id="adjust-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <fieldset>
          <legend className="label">Change</legend>
          <div className="inline-flex rounded-lg border border-sand-300 bg-white p-0.5" role="radiogroup">
            {MODES.map((m) => (
              <label key={m.value} className={cn('cursor-pointer rounded-md px-3 py-1.5 text-[13px] font-medium has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-600', mode === m.value ? 'bg-ink text-white' : 'text-ink-soft')}>
                <input type="radio" value={m.value} className="sr-only" {...register('mode')} onChange={() => setValue('mode', m.value)} checked={mode === m.value} />
                {m.label}
              </label>
            ))}
          </div>
        </fieldset>
        <TextField id="adj-qty" type="number" min={0} step={1} inputMode="numeric" label={mode === 'set' ? 'New stock level' : 'Quantity'} required error={formState.errors.quantity?.message} {...register('quantity', { setValueAs: num })} />
        <div className="flex items-center gap-3 rounded-lg bg-ivory-200/70 px-3 py-2 text-[13px]" aria-live="polite">
          <span>
            On hand <strong className="num">{row.stock}</strong>
          </span>
          <ArrowRight className="h-4 w-4 text-ink-muted" aria-hidden />
          {'error' in preview ? (
            <span className="text-red-700">{preview.error}</span>
          ) : (
            <span>
              After <strong className="num">{preview.after}</strong>{' '}
              <span className={cn('num', preview.delta > 0 ? 'text-emerald-800' : 'text-red-700')}>
                ({preview.delta > 0 ? '+' : ''}
                {preview.delta})
              </span>
            </span>
          )}
        </div>
        <SelectField id="adj-reason" label="Reason" required error={formState.errors.reason?.message} {...register('reason')}>
          {ADJUSTMENT_REASONS.filter((r) => r.manual).map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </SelectField>
        <TextareaField id="adj-note" label="Note" rows={2} maxLength={300} hint="Required when the reason is “Other”. Shown in the adjustment history." error={formState.errors.note?.message} {...register('note')} />
      </form>
    </Modal>
  );
}

function ThresholdControl({ value }: { value: number }) {
  const [draft, setDraft] = useState(String(value));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setDraft(String(value));
  }, [value]);
  const save = async () => {
    const n = Number(draft);
    if (!Number.isInteger(n) || n < 0 || n > 1000) {
      setError('Use a whole number from 0 to 1,000.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await settingsService.setLowStockThreshold(n);
      invalidate('settings', 'inventory', 'dashboard', 'products');
      toast(`Low-stock threshold set to ${n}.`, 'success');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="flex flex-wrap items-end gap-2">
      <TextField
        id="threshold"
        type="number"
        min={0}
        max={1000}
        step={1}
        label="Low-stock threshold"
        hint="Variants at or below this quantity count as low stock."
        error={error ?? undefined}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        className="h-9 w-28"
      />
      <Button size="sm" variant="outline" className="mb-5 h-9" onClick={() => void save()} loading={saving} disabled={draft === String(value)}>
        Save threshold
      </Button>
    </div>
  );
}

function HistoryTable({ variantFilter }: { variantFilter?: string }) {
  const [q, setQ] = useState('');
  const { data, isLoading, error, refetch } = useQuery(`adjustments:${variantFilter ?? ''}:${q}`, () => inventoryService.history({ variantId: variantFilter, q, limit: 200 }), { keepPrevious: true });
  const columns: Column<StockAdjustment>[] = [
    { key: 'date', header: 'Date', cell: (a) => <span className="whitespace-nowrap text-ink-muted">{formatDateTime(a.createdAt)}</span> },
    {
      key: 'item',
      header: 'Item',
      cell: (a) => (
        <div className="min-w-[10rem]">
          <Link to={`/products/${a.productId}/edit`} className="font-medium hover:underline">
            {a.productName}
          </Link>
          <p className="text-xs text-ink-muted">
            <span className="font-mono">{a.sku}</span>
            {a.variantLabel ? ` · ${a.variantLabel}` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'change',
      header: 'Change',
      align: 'right',
      cell: (a) => (
        <span className={cn('font-semibold num', a.delta > 0 ? 'text-emerald-800' : 'text-red-700')}>
          {a.delta > 0 ? '+' : ''}
          {a.delta}
        </span>
      ),
    },
    { key: 'ba', header: 'Before → after', align: 'right', cell: (a) => <span className="whitespace-nowrap num">{a.before} → {a.after}</span> },
    { key: 'reason', header: 'Reason', cell: (a) => <Badge tone={a.reason === 'order_cancelled' ? 'info' : a.reason === 'damaged' ? 'warning' : 'neutral'}>{reasonLabel(a.reason)}</Badge> },
    { key: 'note', header: 'Note', hideBelow: 'lg', cell: (a) => <span className="text-ink-soft">{a.note || '—'}</span> },
    { key: 'actor', header: 'By', hideBelow: 'xl', cell: (a) => <span className="text-ink-muted">{a.actor}</span> },
  ];
  return (
    <div>
      <div className="border-b border-sand-200 px-4 py-3">
        <label htmlFor="history-q" className="sr-only">
          Search history by SKU or product
        </label>
        <input id="history-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by SKU or product" className="input h-9 max-w-sm" />
      </div>
      {error && !data ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : (
        <DataTable
          caption="Stock adjustment history"
          columns={columns}
          rows={data}
          getRowId={(a) => a.id}
          loading={isLoading}
          empty={<EmptyState icon={<History className="h-6 w-6" aria-hidden />} title="No adjustments recorded" />}
        />
      )}
    </div>
  );
}

export default function InventoryPage() {
  usePageMeta('Inventory', [{ label: 'Catalog' }]);
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'history' ? 'history' : 'stock';
  const list = useListParams(['stock', 'category', 'status'], { sort: 'stock', dir: 'asc', pageSize: 25 });
  const { data, isLoading, isFetching, error, refetch } = useQuery(`inventory:list:${list.key}`, () => inventoryService.list(list.query), { keepPrevious: true });
  const { data: settings, isLoading: settingsLoading } = useSettings();
  const { data: categories } = useQuery('categories', () => categoryService.list());
  const [adjusting, setAdjusting] = useState<InventoryRow | null>(null);
  const threshold = settings?.store.lowStockThreshold ?? 5;
  const catName = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c.name.en])), [categories]);

  const columns: Column<InventoryRow>[] = [
    {
      key: 'item',
      header: 'Item',
      sortKey: 'product',
      cell: (r) => (
        <div className="flex min-w-[13rem] items-center gap-3">
          <div className="h-9 w-9 shrink-0 overflow-hidden rounded-md border border-sand-200 bg-sand-100">{r.imageUrl && <img src={r.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />}</div>
          <div className="min-w-0">
            <Link to={`/products/${r.productId}/edit`} className="block truncate font-medium hover:underline">
              {r.productName.en}
            </Link>
            <p className="truncate text-xs text-ink-muted">{r.variantLabel ?? 'Single variant'}</p>
          </div>
        </div>
      ),
    },
    { key: 'sku', header: 'SKU', sortKey: 'sku', cell: (r) => <span className="font-mono text-xs">{r.sku}</span> },
    { key: 'category', header: 'Category', hideBelow: 'lg', cell: (r) => catName.get(r.categoryId) ?? '—' },
    { key: 'status', header: 'Product', hideBelow: 'md', cell: (r) => <ProductStatusBadge status={r.productStatus} /> },
    {
      key: 'stock',
      header: 'On hand',
      sortKey: 'stock',
      align: 'right',
      cell: (r) => (
        <div className="flex items-center justify-end gap-2">
          <span className="font-semibold num">{r.stock}</span>
          <StockBadge state={stockState(r.stock, threshold)} />
        </div>
      ),
    },
    { key: 'adjusted', header: 'Last adjusted', sortKey: 'adjusted', hideBelow: 'xl', cell: (r) => <span className="text-ink-muted">{r.lastAdjustedAt ? formatDateTime(r.lastAdjustedAt) : '—'}</span> },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      cell: (r) => (
        <Button size="xs" variant="outline" onClick={() => setAdjusting(r)} icon={<SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />} aria-label={`Adjust stock for ${r.sku}`}>
          Adjust
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader description="Stock is tracked per variant (SKU). Every change needs a reason and is recorded with before/after quantities. Stock can never go below zero.">
        {settingsLoading ? <Skeleton className="mt-3 h-14 w-72" /> : <div className="mt-3">{settings && <ThresholdControl value={threshold} />}</div>}
      </PageHeader>
      <Tabs
        className="mb-4"
        label="Inventory views"
        value={tab}
        onChange={(id) => setParams(id === 'history' ? { tab: 'history' } : {}, { replace: true })}
        tabs={[
          { id: 'stock', label: 'Stock levels' },
          { id: 'history', label: 'Adjustment history' },
        ]}
      />
      {tab === 'history' ? (
        <div className="card">
          <HistoryTable />
        </div>
      ) : (
        <div className="card">
          <FilterBar
            search={list.query.q ?? ''}
            onSearch={(q) => list.update({ q })}
            searchPlaceholder="Search SKU, product or variant"
            filters={[
              { key: 'stock', label: 'Stock', options: [{ value: 'low', label: `Low (≤ ${threshold})` }, { value: 'out', label: 'Out of stock' }, { value: 'in', label: 'In stock' }] },
              { key: 'category', label: 'Category', options: (categories ?? []).map((c) => ({ value: c.id, label: c.name.en })) },
              { key: 'status', label: 'Product status', options: [{ value: 'active', label: 'Active' }, { value: 'draft', label: 'Draft' }, { value: 'archived', label: 'Archived' }] },
            ]}
            values={list.query.filters}
            onFilter={(k, v) => list.update({ [k]: v })}
            activeCount={list.activeFilters}
            onClear={list.clear}
          />
          {list.query.filters?.stock === 'low' && (
            <Notice tone="info" className="m-4 mb-0">
              Showing variants with 1–{threshold} units. Out-of-stock variants have their own filter.
            </Notice>
          )}
          <DataTable
            caption="Inventory by variant"
            columns={columns}
            rows={data?.items}
            getRowId={(r) => r.variantId}
            loading={isLoading}
            refreshing={isFetching && !isLoading}
            error={error}
            onRetry={refetch}
            sort={list.query.sort}
            dir={list.query.dir}
            onSort={list.toggleSort}
            page={data?.page}
            pageCount={data?.pageCount}
            total={data?.total}
            pageSize={data?.pageSize}
            onPage={(page) => list.update({ page }, false)}
            empty={<EmptyState icon={<PackageSearch className="h-6 w-6" aria-hidden />} title="No variants match" action={list.activeFilters ? <Button size="sm" variant="outline" onClick={list.clear}>Clear filters</Button> : undefined} />}
          />
        </div>
      )}
      {adjusting && <AdjustModal row={adjusting} onClose={() => setAdjusting(null)} />}
    </>
  );
}
