import { useMemo, useState } from 'react';
import { Controller, useForm, useWatch, type Control } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Calculator, CirclePause, CirclePlay, Pencil, Plus, SearchX, TicketPercent, Trash2 } from 'lucide-react';
import { ChoiceGroup, SearchableChecklist, type ChecklistItem } from '@/components/settings/Choices';
import { CurrencyExamples } from '@/components/settings/SettingsKit';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Drawer } from '@/components/ui/Dialog';
import { EmptyState, Notice } from '@/components/ui/Feedback';
import { FilterBar } from '@/components/ui/FilterBar';
import { SelectField, Switch, TextField, TextareaField } from '@/components/ui/Form';
import { Menu } from '@/components/ui/Menu';
import { PageHeader } from '@/components/ui/Page';
import { CouponStateBadge } from '@/components/ui/StatusBadges';
import { usePageMeta, useSettings } from '@/hooks/misc';
import { useListParams } from '@/hooks/useListParams';
import { invalidate, useQuery } from '@/hooks/useQuery';
import { ApiError, errorMessage } from '@/services/api';
import { categoryService } from '@/services/catalogServices';
import { productService } from '@/services/productService';
import { couponService } from '@/services/salesServices';
import { confirmAction, toast } from '@/store';
import type { CategoryWithCount, Coupon, CouponInput, CouponState, CurrencyConfig, Product } from '@/types';
import { couponState, describeCoupon, evaluateCoupon, normalizeCode, validateCoupon, type CouponCart, type CouponResult } from '@/utils/couponRules';
import { dateInputToIso, formatDate, isoToDateInput } from '@/utils/dates';
import { applyServerErrors, num, numOrNull } from '@/utils/forms';
import { pluralize } from '@/utils/misc';
import { formatUsd, parseMajor, toMajor, toMinor } from '@/utils/money';

type CouponRow = Coupon & { state: CouponState };

const STATE_OPTIONS: Array<{ value: CouponState; label: string }> = [
  { value: 'active', label: 'Active' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'expired', label: 'Expired' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'exhausted', label: 'Limit reached' },
];

const BASE_CURRENCY_NOTE = 'Amounts are in USD (base currency). At checkout the storefront converts eligible item totals to USD at its current rate before applying the coupon.';

const toInput = (c: Coupon): CouponInput => ({
  code: c.code,
  description: c.description,
  type: c.type,
  value: c.value,
  maxDiscount: c.maxDiscount,
  minOrder: c.minOrder,
  startsAt: c.startsAt,
  endsAt: c.endsAt,
  isActive: c.isActive,
  usageLimit: c.usageLimit,
  perCustomerLimit: c.perCustomerLimit,
  scope: c.scope,
  productIds: c.productIds,
  categoryIds: c.categoryIds,
});

function validity(c: Pick<Coupon, 'startsAt' | 'endsAt'>): string {
  if (!c.startsAt && !c.endsAt) return 'No end date';
  if (!c.endsAt) return `From ${formatDate(c.startsAt)}`;
  return `${c.startsAt ? formatDate(c.startsAt) : 'Now'} – ${formatDate(c.endsAt)}`;
}

function eligibility(c: Coupon, productName: Map<string, string>, categoryName: Map<string, string>): string {
  if (c.scope === 'all') return 'All products';
  const isProducts = c.scope === 'products';
  const ids = isProducts ? c.productIds : c.categoryIds;
  const names = ids.map((id) => (isProducts ? productName : categoryName).get(id));
  const noun = (n: number) => (isProducts ? pluralize(n, 'product') : pluralize(n, 'category', 'categories'));
  if (!ids.length) return `No ${isProducts ? 'products' : 'categories'} selected`;
  if (ids.length <= 2 && names.every(Boolean)) return names.join(', ');
  return noun(ids.length);
}

/** Lowest sellable unit price of a product (USD minor units). */
const unitPrice = (p: Product) => (p.variants.length ? Math.min(...p.variants.map((v) => v.salePrice ?? v.price)) : (p.baseSalePrice ?? p.basePrice));

// ---------------------------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------------------------

const numberMsg = { invalid_type_error: 'Enter a number.' };

const baseSchema = z.object({
  code: z.string().trim().min(1, 'Enter a code.'),
  description: z.string().trim().max(200, 'Keep it under 200 characters.'),
  type: z.enum(['percentage', 'fixed']),
  /** Percentage: percent. Fixed: USD major units. */
  value: z.number(numberMsg),
  /** USD major units. */
  maxDiscount: z.number(numberMsg).nullable(),
  minOrder: z.number(numberMsg).nullable(),
  /** YYYY-MM-DD or empty. */
  startsAt: z.string(),
  endsAt: z.string(),
  isActive: z.boolean(),
  usageLimit: z.number(numberMsg).nullable(),
  perCustomerLimit: z.number(numberMsg).nullable(),
  scope: z.enum(['all', 'products', 'categories']),
  productIds: z.array(z.string()),
  categoryIds: z.array(z.string()),
});
type CouponFormValues = z.infer<typeof baseSchema>;

const EMPTY: CouponFormValues = {
  code: '',
  description: '',
  type: 'percentage',
  value: 10,
  maxDiscount: null,
  minOrder: null,
  startsAt: '',
  endsAt: '',
  isActive: true,
  usageLimit: null,
  perCustomerLimit: 1,
  scope: 'all',
  productIds: [],
  categoryIds: [],
};

function fromCoupon(c: Coupon): CouponFormValues {
  return {
    code: c.code,
    description: c.description,
    type: c.type,
    value: c.type === 'fixed' ? toMajor(c.value) : c.value,
    maxDiscount: c.maxDiscount !== null ? toMajor(c.maxDiscount) : null,
    minOrder: c.minOrder !== null ? toMajor(c.minOrder) : null,
    startsAt: isoToDateInput(c.startsAt),
    endsAt: isoToDateInput(c.endsAt),
    isActive: c.isActive,
    usageLimit: c.usageLimit,
    perCustomerLimit: c.perCustomerLimit,
    scope: c.scope,
    productIds: c.productIds,
    categoryIds: c.categoryIds,
  };
}

/** Form values -> service input. Unchanged dates keep their original timestamp. */
function formToInput(v: CouponFormValues, original: Coupon | null): CouponInput {
  const fixed = v.type === 'fixed';
  return {
    code: normalizeCode(v.code),
    description: v.description.trim(),
    type: v.type,
    value: fixed ? toMinor(v.value) : v.value,
    maxDiscount: !fixed && v.maxDiscount !== null ? toMinor(v.maxDiscount) : null,
    minOrder: v.minOrder !== null ? toMinor(v.minOrder) : null,
    startsAt: original && v.startsAt === isoToDateInput(original.startsAt) ? original.startsAt : dateInputToIso(v.startsAt),
    endsAt: original && v.endsAt === isoToDateInput(original.endsAt) ? original.endsAt : dateInputToIso(v.endsAt, true),
    isActive: v.isActive,
    usageLimit: v.usageLimit,
    perCustomerLimit: v.perCustomerLimit,
    scope: v.scope,
    productIds: v.scope === 'products' ? v.productIds : [],
    categoryIds: v.scope === 'categories' ? v.categoryIds : [],
  };
}

function SectionTitle({ children }: { children: string }) {
  return <h3 className="text-[13px] font-semibold uppercase tracking-wide text-ink-muted">{children}</h3>;
}

interface FormProps {
  coupon: CouponRow | null;
  others: Coupon[];
  products: Product[] | undefined;
  categories: CategoryWithCount[] | undefined;
  currencies: CurrencyConfig[];
  onSaving: (saving: boolean) => void;
  onDone: () => void;
}

function CouponForm({ coupon, others, products, categories, currencies, onSaving, onDone }: FormProps) {
  const schema = useMemo(
    () =>
      baseSchema.superRefine((v, ctx) => {
        validateCoupon(formToInput(v, coupon), others).forEach((issue) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: issue.path.split('.'), message: issue.message }));
      }),
    [coupon, others],
  );
  const form = useForm<CouponFormValues>({ resolver: zodResolver(schema), defaultValues: coupon ? fromCoupon(coupon) : EMPTY });
  const { register, control, handleSubmit, setError, formState } = form;
  const { errors } = formState;
  const type = useWatch({ control, name: 'type' });
  const scope = useWatch({ control, name: 'scope' });
  const codeField = register('code');

  const categoryName = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c.name.en])), [categories]);

  const productItems = (selected: string[]): ChecklistItem[] =>
    (products ?? [])
      .filter((p) => p.status !== 'archived' || selected.includes(p.id))
      .map((p) => ({
        id: p.id,
        label: p.name.en,
        keywords: `${p.slug} ${p.variants.map((v) => v.sku).join(' ')}`,
        meta: [categoryName.get(p.categoryId) ?? 'No category', formatUsd(unitPrice(p)), p.status !== 'active' ? (p.status === 'draft' ? 'Draft' : 'Archived') : null].filter(Boolean).join(' · '),
      }));
  const categoryItems: ChecklistItem[] = (categories ?? []).map((c) => ({
    id: c.id,
    label: c.name.en,
    meta: `${pluralize(c.productCount, 'product')}${c.isActive ? '' : ' · inactive'}`,
  }));

  const onSubmit = async (v: CouponFormValues) => {
    onSaving(true);
    try {
      const input = formToInput(v, coupon);
      if (coupon) await couponService.update(coupon.id, input);
      else await couponService.create(input);
      invalidate('coupons', 'dashboard');
      toast(coupon ? `${input.code} saved.` : `${input.code} created.`, 'success');
      onDone();
    } catch (e) {
      applyServerErrors(e, setError);
    } finally {
      onSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <form id="coupon-form" onSubmit={handleSubmit(onSubmit, () => toast('Please fix the highlighted fields.', 'error'))} noValidate className="space-y-6">
        <Notice tone="info">{BASE_CURRENCY_NOTE}</Notice>
        {coupon && coupon.timesUsed > 0 && (
          <Notice tone="warning">
            Used {pluralize(coupon.timesUsed, 'time')}. Changes apply to future checkouts only — past orders keep the discount they received.
          </Notice>
        )}

        <section className="space-y-4">
          <SectionTitle>Code</SectionTitle>
          <TextField
            id="coupon-code"
            label="Code"
            required
            autoComplete="off"
            spellCheck={false}
            maxLength={20}
            className="font-mono uppercase"
            hint="3–20 characters: letters, numbers, “-” or “_”. Shoppers type this at checkout; it is not case-sensitive."
            error={errors.code?.message}
            data-autofocus
            {...codeField}
            onChange={(e) => {
              const el = e.target;
              const { selectionStart, selectionEnd } = el;
              el.value = el.value.toUpperCase();
              if (selectionStart !== null && selectionEnd !== null) el.setSelectionRange(selectionStart, selectionEnd);
              return codeField.onChange(e);
            }}
          />
          <TextareaField label="Description" rows={2} maxLength={200} hint="Internal note — shoppers don’t see it." error={errors.description?.message} {...register('description')} />
        </section>

        <section className="space-y-4">
          <SectionTitle>Discount</SectionTitle>
          <Controller
            control={control}
            name="type"
            render={({ field }) => (
              <ChoiceGroup
                legend="Type"
                value={field.value}
                onChange={field.onChange}
                choices={[
                  { value: 'percentage', label: 'Percentage', description: 'A % of the eligible items' },
                  { value: 'fixed', label: 'Fixed amount', description: 'A set USD amount off' },
                ]}
              />
            )}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            {type === 'percentage' ? (
              <TextField key="pct" label="Percentage off" required type="number" inputMode="decimal" min={1} max={100} step={1} suffix="%" error={errors.value?.message} {...register('value', { setValueAs: num })} />
            ) : (
              <TextField key="fixed" label="Amount off" required type="number" inputMode="decimal" min={0.01} step={0.01} prefix="USD" error={errors.value?.message} {...register('value', { setValueAs: num })} />
            )}
            {type === 'percentage' && (
              <TextField
                label="Maximum discount"
                type="number"
                inputMode="decimal"
                min={0.01}
                step={0.01}
                prefix="USD"
                hint="Optional cap. Leave empty for no cap."
                error={errors.maxDiscount?.message}
                {...register('maxDiscount', { setValueAs: numOrNull })}
              />
            )}
            <TextField
              label="Minimum order"
              type="number"
              inputMode="decimal"
              min={0}
              step={0.01}
              prefix="USD"
              hint="Optional. The cart subtotal (in USD) must reach this."
              error={errors.minOrder?.message}
              {...register('minOrder', { setValueAs: numOrNull })}
            />
          </div>
        </section>

        <section className="space-y-4">
          <SectionTitle>Schedule</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Starts" type="date" hint="Start of the day. Empty = starts now." error={errors.startsAt?.message} {...register('startsAt')} />
            <TextField label="Ends" type="date" hint="End of the day. Empty = never expires." error={errors.endsAt?.message} {...register('endsAt')} />
          </div>
          <Controller
            control={control}
            name="isActive"
            render={({ field }) => (
              <Switch label="Active" description="Inactive coupons are rejected at checkout, even inside their dates." checked={field.value} onChange={field.onChange} />
            )}
          />
        </section>

        <section className="space-y-4">
          <SectionTitle>Limits</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Total uses"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              hint={coupon ? `Empty = unlimited. Used ${coupon.timesUsed} so far.` : 'Empty = unlimited.'}
              error={errors.usageLimit?.message}
              {...register('usageLimit', { setValueAs: numOrNull })}
            />
            <TextField
              label="Uses per customer"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              hint="Empty = unlimited."
              error={errors.perCustomerLimit?.message}
              {...register('perCustomerLimit', { setValueAs: numOrNull })}
            />
          </div>
        </section>

        <section className="space-y-4">
          <SectionTitle>Eligibility</SectionTitle>
          <Controller
            control={control}
            name="scope"
            render={({ field }) => (
              <ChoiceGroup
                legend="Applies to"
                columns={3}
                value={field.value}
                onChange={field.onChange}
                choices={[
                  { value: 'all', label: 'All products' },
                  { value: 'products', label: 'Specific products' },
                  { value: 'categories', label: 'Specific categories' },
                ]}
              />
            )}
          />
          {scope === 'products' && (
            <Controller
              control={control}
              name="productIds"
              render={({ field, fieldState }) => (
                <SearchableChecklist
                  legend="Eligible products"
                  items={productItems(field.value)}
                  value={field.value}
                  onChange={field.onChange}
                  loading={!products}
                  searchPlaceholder="Search products or SKUs"
                  hint="Archived products are not listed. The discount applies only to these items in the cart."
                  error={fieldState.error?.message}
                  inputRef={field.ref}
                />
              )}
            />
          )}
          {scope === 'categories' && (
            <Controller
              control={control}
              name="categoryIds"
              render={({ field, fieldState }) => (
                <SearchableChecklist
                  legend="Eligible categories"
                  items={categoryItems}
                  value={field.value}
                  onChange={field.onChange}
                  loading={!categories}
                  searchPlaceholder="Search categories"
                  hint="The discount applies to cart items in these categories."
                  error={fieldState.error?.message}
                  inputRef={field.ref}
                />
              )}
            />
          )}
        </section>
      </form>

      <CouponTester control={control} coupon={coupon} products={products ?? []} categories={categories ?? []} currencies={currencies} />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// "Test this coupon" calculator — evaluates the form's current (unsaved) values on a synthetic cart.
// ---------------------------------------------------------------------------------------------

function CouponTester({ control, coupon, products, categories, currencies }: { control: Control<CouponFormValues>; coupon: CouponRow | null; products: Product[]; categories: CategoryWithCount[]; currencies: CurrencyConfig[] }) {
  const values = useWatch({ control });
  const sellable = useMemo(() => products.filter((p) => p.status !== 'archived'), [products]);
  const [mode, setMode] = useState<'product' | 'amount'>('product');
  const [productId, setProductId] = useState('');
  const [qty, setQty] = useState('1');
  const [amount, setAmount] = useState('50');
  const [categoryId, setCategoryId] = useState('');
  const [rest, setRest] = useState('');
  const [uses, setUses] = useState('0');
  const [email, setEmail] = useState('');
  const [lookup, setLookup] = useState<{ busy: boolean; note: string | null }>({ busy: false, note: null });

  const product = sellable.find((p) => p.id === productId) ?? sellable[0];

  let problem: string | null = null;
  let result: CouponResult | null = null;
  let cartSubtotal = 0;
  const parsed = baseSchema.safeParse(values);
  if (!parsed.success) problem = 'Complete the discount fields above to test this coupon.';
  else {
    const input = formToInput(parsed.data, coupon);
    const synthetic: Coupon = { ...input, id: coupon?.id ?? 'preview', timesUsed: coupon?.timesUsed ?? 0, createdAt: '', updatedAt: '' };
    const lines: CouponCart['lines'] = [];
    if (mode === 'product') {
      if (!product) problem = 'There are no products to test with.';
      else lines.push({ productId: product.id, categoryId: product.categoryId, lineTotalUsd: unitPrice(product) * Math.max(1, Math.floor(Number(qty)) || 1) });
    } else {
      const amt = parseMajor(amount);
      if (amt === null || amt <= 0) problem = 'Enter an item subtotal above zero.';
      else lines.push({ productId: '__custom', categoryId: categoryId || '__none', lineTotalUsd: amt });
    }
    const restMinor = parseMajor(rest);
    if (restMinor !== null && restMinor > 0) lines.push({ productId: '__rest', categoryId: '__rest', lineTotalUsd: restMinor });
    cartSubtotal = lines.reduce((s, l) => s + l.lineTotalUsd, 0);
    if (!problem) result = evaluateCoupon(synthetic, { lines, customerUses: Math.max(0, Math.floor(Number(uses)) || 0) });
  }

  const runLookup = async () => {
    const code = normalizeCode(values.code ?? '');
    if (!code || !email.trim()) {
      setLookup({ busy: false, note: 'Enter the coupon code and a customer email first.' });
      return;
    }
    setLookup({ busy: true, note: null });
    try {
      const n = await couponService.usesBy(code, email.trim());
      setUses(String(n));
      setLookup({ busy: false, note: `${email.trim()} used ${code} on ${pluralize(n, 'order')} (failed payments excluded).` });
    } catch (e) {
      setLookup({ busy: false, note: errorMessage(e) });
    }
  };

  return (
    <section aria-labelledby="coupon-tester-title" className="rounded-xl border border-sand-200 bg-white p-4">
      <div className="mb-3 flex items-start gap-2">
        <Calculator className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
        <div>
          <h3 id="coupon-tester-title" className="text-[15px] font-semibold">
            Test this coupon
          </h3>
          <p className="text-xs text-ink-muted">Uses the values above, including unsaved changes, on a sample cart priced in USD.</p>
        </div>
      </div>
      <div className="space-y-4">
        <ChoiceGroup
          legend="Sample cart"
          value={mode}
          onChange={setMode}
          choices={[
            { value: 'product', label: 'A product', description: 'Lowest variant price × quantity' },
            { value: 'amount', label: 'An item subtotal', description: 'Enter a USD amount and category' },
          ]}
        />
        {mode === 'product' ? (
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem]">
            <SelectField label="Product" value={product?.id ?? ''} onChange={(e) => setProductId(e.target.value)} disabled={!sellable.length}>
              {!sellable.length && <option value="">Loading…</option>}
              {sellable.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name.en} — {formatUsd(unitPrice(p))}
                </option>
              ))}
            </SelectField>
            <TextField label="Quantity" type="number" inputMode="numeric" min={1} step={1} value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label="Item subtotal" prefix="USD" type="number" inputMode="decimal" min={0} step={0.01} value={amount} onChange={(e) => setAmount(e.target.value)} />
            <SelectField label="Items’ category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} hint="Product-specific coupons need “A product”.">
              <option value="">No specific category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name.en}
                </option>
              ))}
            </SelectField>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="Rest of the cart"
            prefix="USD"
            type="number"
            inputMode="decimal"
            min={0}
            step={0.01}
            placeholder="0.00"
            value={rest}
            onChange={(e) => setRest(e.target.value)}
            hint="Other items: they count toward the minimum order, and toward the discount only if the coupon applies to all products."
          />
          <TextField
            label="Customer’s previous uses"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={uses}
            onChange={(e) => setUses(e.target.value)}
            hint="Compared with the per-customer limit."
          />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <TextField label="Look up previous uses by email" type="email" autoComplete="off" placeholder="customer@example.com" containerClassName="flex-1" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button variant="outline" onClick={() => void runLookup()} loading={lookup.busy}>
            Look up
          </Button>
        </div>
        {lookup.note && <p className="text-xs text-ink-muted">{lookup.note}</p>}

        <div aria-live="polite">
          {problem ? (
            <p className="rounded-lg bg-ivory-50 px-3 py-2.5 text-[13px] text-ink-muted">{problem}</p>
          ) : result?.ok ? (
            <Notice tone="success" title={`Discount ${formatUsd(result.discountUsd)}`}>
              <p className="num">
                On an eligible subtotal of {formatUsd(result.eligibleSubtotalUsd)}. Cart {formatUsd(cartSubtotal)} → {formatUsd(cartSubtotal - result.discountUsd)} before shipping and tax.
              </p>
              <CurrencyExamples usd={result.discountUsd} currencies={currencies} label="Discount in other currencies ≈" className="mt-1 text-emerald-900" />
            </Notice>
          ) : result ? (
            <Notice tone="warning" title="Coupon would be rejected">
              {result.reason}
            </Notice>
          ) : null}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------------------------

export default function CouponsPage() {
  usePageMeta('Coupons', [{ label: 'Sales' }]);
  const list = useListParams(['state']);
  const { data, isLoading, isFetching, error, refetch } = useQuery('coupons', () => couponService.list());
  const { data: products } = useQuery('products:all', () => productService.all());
  const { data: categories } = useQuery('categories', () => categoryService.list());
  const { data: settings } = useSettings();
  const currencies = settings?.currencies.currencies ?? [];
  const [editing, setEditing] = useState<CouponRow | 'new' | null>(null);
  const [saving, setSaving] = useState(false);

  const productName = useMemo(() => new Map((products ?? []).map((p) => [p.id, p.name.en])), [products]);
  const categoryName = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c.name.en])), [categories]);

  const q = (list.query.q ?? '').trim().toLowerCase();
  const stateFilter = list.query.filters?.state;
  const rows = useMemo(
    () => data?.filter((c) => (!q || `${c.code} ${c.description}`.toLowerCase().includes(q)) && (!stateFilter || c.state === stateFilter)),
    [data, q, stateFilter],
  );
  const counts = useMemo(() => {
    const m = new Map<CouponState, number>();
    (data ?? []).forEach((c) => m.set(c.state, (m.get(c.state) ?? 0) + 1));
    return m;
  }, [data]);

  const current = editing && editing !== 'new' ? editing : null;
  const others = useMemo(() => (data ?? []).filter((c) => c.id !== current?.id), [data, current]);

  const refresh = () => invalidate('coupons', 'dashboard');

  const applyActive = async (c: CouponRow, isActive: boolean) => {
    try {
      await couponService.update(c.id, { ...toInput(c), isActive });
      refresh();
      toast(isActive ? `${c.code} activated.` : `${c.code} deactivated.`, 'success');
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  const toggleActive = async (c: CouponRow) => {
    const activating = !c.isActive;
    const after = couponState({ ...c, isActive: activating });
    const note =
      after === 'expired'
        ? ` Its end date (${formatDate(c.endsAt)}) has passed, so it will show as expired until you change the dates.`
        : after === 'scheduled'
          ? ` It starts on ${formatDate(c.startsAt)}.`
          : after === 'exhausted'
            ? ' Its usage limit is already reached, so raise the limit for it to work again.'
            : '';
    const ok = await confirmAction({
      title: activating ? `Activate ${c.code}?` : `Deactivate ${c.code}?`,
      body: activating
        ? `Shoppers can use the code whenever its dates and limits allow.${note}`
        : 'Shoppers can no longer apply this code. Orders that already used it keep their discount.',
      confirmLabel: activating ? 'Activate' : 'Deactivate',
      tone: activating ? 'primary' : 'danger',
    });
    if (ok) await applyActive(c, activating);
  };

  const remove = async (c: CouponRow) => {
    const ok = await confirmAction({
      title: `Delete ${c.code}?`,
      body: 'The code stops working immediately. This can’t be undone.',
      confirmLabel: 'Delete coupon',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await couponService.remove(c.id);
      refresh();
      toast(`${c.code} deleted.`, 'success');
    } catch (e) {
      if (e instanceof ApiError && e.code === 'in_use') {
        if (c.isActive) {
          const deactivate = await confirmAction({
            title: `${c.code} can’t be deleted`,
            body: (
              <>
                <p>{e.message}</p>
                <p className="mt-2">Deactivate it now? Shoppers will no longer be able to use it.</p>
              </>
            ),
            confirmLabel: 'Deactivate instead',
          });
          if (deactivate) await applyActive(c, false);
        } else {
          toast(`${e.message} It is already inactive.`, 'info');
        }
      } else {
        toast(errorMessage(e), 'error');
      }
    }
  };

  const columns: Column<CouponRow>[] = [
    {
      key: 'code',
      header: 'Code',
      cell: (c) => (
        <div className="min-w-[11rem] max-w-[20rem]">
          <button type="button" onClick={() => setEditing(c)} className="font-mono text-[13px] font-semibold text-ink hover:underline">
            {c.code}
          </button>
          {c.description && (
            <p className="truncate text-xs text-ink-muted" title={c.description}>
              {c.description}
            </p>
          )}
          <p className="mt-0.5 text-xs text-ink-muted lg:hidden">
            {validity(c)} · {eligibility(c, productName, categoryName)}
            {c.minOrder !== null && ` · min ${formatUsd(c.minOrder)}`}
          </p>
        </div>
      ),
    },
    { key: 'discount', header: 'Discount', cell: (c) => <span className="whitespace-nowrap num">{describeCoupon(c, formatUsd)}</span> },
    { key: 'state', header: 'Status', cell: (c) => <CouponStateBadge state={c.state} /> },
    {
      key: 'usage',
      header: 'Used',
      cell: (c) => (
        <div className="whitespace-nowrap num">
          <span>
            {c.timesUsed} / {c.usageLimit ?? '∞'}
          </span>
          <p className="text-xs text-ink-muted">{c.perCustomerLimit !== null ? `${c.perCustomerLimit} per customer` : 'No per-customer limit'}</p>
        </div>
      ),
    },
    { key: 'validity', header: 'Valid', hideBelow: 'lg', cell: (c) => <span className="whitespace-nowrap text-ink-soft">{validity(c)}</span> },
    { key: 'min', header: 'Min. order', hideBelow: 'xl', align: 'right', cell: (c) => <span className="num">{c.minOrder !== null ? formatUsd(c.minOrder) : '—'}</span> },
    {
      key: 'eligibility',
      header: 'Applies to',
      hideBelow: 'lg',
      cell: (c) => (
        <div className="max-w-[14rem]">
          <p className="truncate">{eligibility(c, productName, categoryName)}</p>
          {c.minOrder !== null && <p className="text-xs text-ink-muted xl:hidden">Min. order {formatUsd(c.minOrder)}</p>}
        </div>
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      cell: (c) => (
        <Menu
          label={`Actions for ${c.code}`}
          items={[
            { label: 'Edit / test', icon: <Pencil className="h-4 w-4" aria-hidden />, onSelect: () => setEditing(c) },
            c.isActive
              ? { label: 'Deactivate…', icon: <CirclePause className="h-4 w-4" aria-hidden />, onSelect: () => void toggleActive(c) }
              : { label: 'Activate…', icon: <CirclePlay className="h-4 w-4" aria-hidden />, onSelect: () => void toggleActive(c) },
            { label: 'Delete…', icon: <Trash2 className="h-4 w-4" aria-hidden />, danger: true, onSelect: () => void remove(c) },
          ]}
        />
      ),
    },
  ];

  return (
    <>
      <PageHeader
        description={
          <>
            <p>Discount codes shoppers enter at checkout. Values, caps and minimums are in USD, the base currency.</p>
            <p className="mt-1">Codes saved here live in this admin preview only; the storefront keeps its built-in demo code until backend integration.</p>
          </>
        }
        actions={
          <Button icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => setEditing('new')}>
            New coupon
          </Button>
        }
      />
      <div className="card">
        <FilterBar
          search={list.query.q ?? ''}
          onSearch={(value) => list.update({ q: value })}
          searchPlaceholder="Search code or description"
          filters={[{ key: 'state', label: 'Status', options: STATE_OPTIONS.map((o) => ({ value: o.value, label: `${o.label} (${counts.get(o.value) ?? 0})` })) }]}
          values={list.query.filters}
          onFilter={(k, v) => list.update({ [k]: v })}
          activeCount={list.activeFilters}
          onClear={list.clear}
        />
        <DataTable
          caption="Coupons"
          columns={columns}
          rows={rows}
          getRowId={(c) => c.id}
          loading={isLoading}
          refreshing={isFetching && !isLoading}
          error={error}
          onRetry={refetch}
          empty={
            data && data.length === 0 ? (
              <EmptyState
                icon={<TicketPercent className="h-6 w-6" aria-hidden />}
                title="No coupons yet"
                body="Create a code for a sale, a festival or a thank-you to returning customers."
                action={<Button onClick={() => setEditing('new')}>New coupon</Button>}
              />
            ) : (
              <EmptyState
                icon={<SearchX className="h-6 w-6" aria-hidden />}
                title="No coupons match"
                body="Try a different search or clear the filters."
                action={
                  list.activeFilters ? (
                    <Button variant="outline" size="sm" onClick={list.clear}>
                      Clear filters
                    </Button>
                  ) : undefined
                }
              />
            )
          }
        />
      </div>

      <Drawer
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'New coupon' : `Edit ${current?.code ?? ''}`}
        description={current ? `Created ${formatDate(current.createdAt)} · used ${pluralize(current.timesUsed, 'time')}` : 'Discount code for checkout.'}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form="coupon-form" loading={saving}>
              {editing === 'new' ? 'Create coupon' : 'Save coupon'}
            </Button>
          </div>
        }
      >
        {editing !== null && (
          <CouponForm
            key={current?.id ?? 'new'}
            coupon={current}
            others={others}
            products={products}
            categories={categories}
            currencies={currencies}
            onSaving={setSaving}
            onDone={() => setEditing(null)}
          />
        )}
      </Drawer>
    </>
  );
}
