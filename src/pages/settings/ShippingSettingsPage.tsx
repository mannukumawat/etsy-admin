import { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, FormProvider, useFieldArray, useForm, useFormContext, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { Globe, Info, MapPin, Pencil, Plus, Trash2, Truck, X } from 'lucide-react';
import { SearchableChecklist, type ChecklistItem } from '@/components/settings/Choices';
import { countryName, countryOptions } from '@/components/settings/countryNames';
import { CurrencyExamples, onInvalidForm, SettingsActionBar, SettingsGate, SettingsScopeNotice, useUnsavedChangesGuard } from '@/components/settings/SettingsKit';
import { Button } from '@/components/ui/Button';
import { Badge, Notice } from '@/components/ui/Feedback';
import { FieldError, SelectField, Switch, TextField } from '@/components/ui/Form';
import { ContentLangProvider, LocalizedField } from '@/components/ui/LocalizedField';
import { Card, PageHeader } from '@/components/ui/Page';
import { usePageMeta, useSettings } from '@/hooks/misc';
import { invalidate } from '@/hooks/useQuery';
import { settingsService } from '@/services/settingsService';
import { confirmAction, toast } from '@/store';
import type { CurrencyConfig, Settings, ShippingMethodRate, ShippingSettings, StoreSettings } from '@/types';
import { applyServerErrors, localized, num, numOrNull } from '@/utils/forms';
import { cn, newId, pluralize } from '@/utils/misc';
import { formatUsd, toMajor, toMinor } from '@/utils/money';

// Rates are edited in USD major units and stored as USD minor units (the base currency).

const METHODS = [
  { key: 'standard', label: 'Standard', description: 'The default option at checkout.' },
  { key: 'express', label: 'Express', description: 'Faster, usually priced higher.' },
] as const;

const dayField = z.number({ invalid_type_error: 'Enter a number.' }).int('Whole days only.').min(0, '0–90 days.').max(90, '0–90 days.');

const methodSchema = z
  .object({
    enabled: z.boolean(),
    rate: z.number({ invalid_type_error: 'Enter an amount.' }).min(0, 'Rate cannot be negative.').max(10000, 'Keep it under USD 10,000.'),
    minDays: dayField,
    maxDays: dayField,
  })
  .superRefine((m, ctx) => {
    if (Number.isFinite(m.minDays) && Number.isFinite(m.maxDays) && m.maxDays < m.minDays) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['maxDays'], message: 'Must be at least the minimum.' });
    }
  });

const zoneSchema = z
  .object({
    id: z.string(),
    name: z.string().trim().min(1, 'Zone name is required.').max(60, 'Keep it under 60 characters.'),
    countries: z.array(z.string()).min(1, 'Add at least one country.'),
    standard: methodSchema,
    express: methodSchema,
  })
  .superRefine((zone, ctx) => {
    if (!zone.standard.enabled && !zone.express.enabled) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['standard', 'enabled'], message: 'Enable at least one method in this zone.' });
    }
  });

const schema = z
  .object({
    // L-S3: 1–20 zones, matching the backend — zero zones used to pass the form
    // and a 21st zone failed server-side with a `zones` error no field could show.
    zones: z.array(zoneSchema).min(1, 'Add at least one shipping zone.').max(20, 'At most 20 shipping zones.'),
    unsupportedMessage: localized(true, 300),
    /** Free-shipping threshold in USD major units; null = no free shipping. */
    freeShippingThreshold: z.number({ invalid_type_error: 'Enter an amount.' }).min(0, 'Cannot be negative.').max(1000000, 'Keep it under USD 1,000,000.').nullable(),
  })
  .superRefine((v, ctx) => {
    const names = new Map<string, number>();
    const owner = new Map<string, number>();
    v.zones.forEach((zone, i) => {
      const key = zone.name.trim().toLowerCase();
      if (!key) return;
      if (names.has(key)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['zones', i, 'name'], message: 'Zone names must be unique.' });
      else names.set(key, i);
      zone.countries.forEach((c) => {
        if (owner.has(c)) {
          const other = v.zones[owner.get(c)!]?.name || 'another zone';
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['zones', i, 'countries'], message: `${countryName(c)} is already in “${other}”.` });
        } else owner.set(c, i);
      });
    });
  });
type Values = z.infer<typeof schema>;

const toMethodForm = (m: ShippingMethodRate) => ({ enabled: m.enabled, rate: toMajor(m.rate), minDays: m.minDays, maxDays: m.maxDays });
const fromMethodForm = (m: Values['zones'][number]['standard']): ShippingMethodRate => ({ enabled: m.enabled, rate: toMinor(m.rate), minDays: m.minDays, maxDays: m.maxDays });

const toForm = (s: ShippingSettings): Values => ({
  zones: s.zones.map((z) => ({ id: z.id, name: z.name, countries: [...z.countries], standard: toMethodForm(z.standard), express: toMethodForm(z.express) })),
  unsupportedMessage: { ...s.unsupportedMessage },
  freeShippingThreshold: s.freeShippingThreshold != null ? toMajor(s.freeShippingThreshold) : null,
});

const newZone = () => ({
  id: newId('zone'),
  name: '',
  countries: [] as string[],
  standard: { enabled: true, rate: 10, minDays: 5, maxDays: 10 },
  express: { enabled: false, rate: 25, minDays: 2, maxDays: 5 },
});

/** owner.get(countryCode) = index of the zone that currently holds it. */
const ownerMap = (zones: Values['zones']) => {
  const owner = new Map<string, number>();
  zones.forEach((z, i) => z.countries.forEach((c) => (owner.has(c) ? undefined : owner.set(c, i))));
  return owner;
};

const deliveryWindow = (handling: StoreSettings['handlingDays'], m: { minDays: number; maxDays: number }) => {
  const min = handling.min + m.minDays;
  const max = handling.max + m.maxDays;
  return min === max ? pluralize(min, 'business day') : `${min}–${max} business days`;
};

const fieldErrorMessage = (e: unknown) => (e as { message?: string } | undefined)?.message;

// ---------------------------------------------------------------------------------------------

function MethodBlock({ index, method, currencies, handling }: { index: number; method: (typeof METHODS)[number]; currencies: CurrencyConfig[]; handling: StoreSettings['handlingDays'] }) {
  const {
    register,
    control,
    formState: { errors },
  } = useFormContext<Values>();
  const value = useWatch({ control, name: `zones.${index}.${method.key}` });
  const zoneErrors = errors.zones?.[index];
  const err = method.key === 'standard' ? zoneErrors?.standard : zoneErrors?.express;
  const enabled = !!value?.enabled;

  return (
    <div className={cn('rounded-lg border p-3', enabled ? 'border-sand-300 bg-white' : 'border-sand-200 bg-ivory-50')}>
      <Controller
        control={control}
        name={`zones.${index}.${method.key}.enabled`}
        render={({ field }) => <Switch label={method.label} description={enabled ? method.description : 'Not offered in this zone.'} checked={field.value} onChange={field.onChange} />}
      />
      <FieldError message={err?.enabled?.message} />
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <TextField
          label="Charge to customer"
          hint="Shipping fee. Enter 0 for free shipping."
          prefix="USD"
          type="number"
          inputMode="decimal"
          min={0}
          step={0.01}
          error={err?.rate?.message}
          {...register(`zones.${index}.${method.key}.rate`, { setValueAs: num })}
        />
        <TextField
          label="Delivery takes, from"
          hint="Courier transit time."
          type="number"
          inputMode="numeric"
          min={0}
          max={90}
          step={1}
          suffix="days"
          error={err?.minDays?.message}
          {...register(`zones.${index}.${method.key}.minDays`, { setValueAs: num })}
        />
        <TextField
          label="Delivery takes, up to"
          hint="Slowest case."
          type="number"
          inputMode="numeric"
          min={0}
          max={90}
          step={1}
          suffix="days"
          error={err?.maxDays?.message}
          {...register(`zones.${index}.${method.key}.maxDays`, { setValueAs: num })}
        />
      </div>
      {enabled && value && <CurrencyExamples usd={toMinor(value.rate)} currencies={currencies} className="mt-2" />}
      {enabled && value && Number.isFinite(value.rate) && Number.isFinite(value.minDays) && Number.isFinite(value.maxDays) && (
        <p className="mt-3 rounded-md bg-sand-100 px-2.5 py-1.5 text-xs text-ink-soft">
          Customer sees: <strong className="text-ink">{method.label}</strong> · {value.rate === 0 ? 'Free' : formatUsd(toMinor(value.rate))} · arrives in {deliveryWindow(handling, value)}
        </p>
      )}
    </div>
  );
}

function ZoneCard({ index, zoneCount, currencies, handling, onRemove }: { index: number; zoneCount: number; currencies: CurrencyConfig[]; handling: StoreSettings['handlingDays']; onRemove: () => void }) {
  const {
    register,
    control,
    getValues,
    setValue,
    formState: { errors },
  } = useFormContext<Values>();
  const zones = useWatch({ control, name: 'zones' });
  const owner = useMemo(() => ownerMap(zones ?? []), [zones]);
  const zoneErrors = errors.zones?.[index];
  const name = zones?.[index]?.name;
  const countries = zones?.[index]?.countries ?? [];
  const [editing, setEditing] = useState(countries.length === 0);
  const countriesError = fieldErrorMessage(zoneErrors?.countries);
  const showList = editing || !!countriesError;
  const removeCountry = (code: string) =>
    setValue(`zones.${index}.countries`, (getValues(`zones.${index}.countries`) ?? []).filter((c) => c !== code), { shouldDirty: true, shouldValidate: true });
  const summarize = (m: Values['zones'][number]['standard'] | undefined, label: string) =>
    m?.enabled && Number.isFinite(m.rate) ? `${label} ${m.rate === 0 ? 'free' : formatUsd(toMinor(m.rate))}` : `${label} off`;

  const moveHere = (code: string, from: number) => {
    setValue(
      `zones.${from}.countries`,
      (getValues(`zones.${from}.countries`) ?? []).filter((c) => c !== code),
      { shouldDirty: true, shouldValidate: true },
    );
    setValue(`zones.${index}.countries`, [...(getValues(`zones.${index}.countries`) ?? []), code], { shouldDirty: true, shouldValidate: true });
  };

  const items: ChecklistItem[] = countryOptions().map(({ code, name: label }) => {
    const ownerIndex = owner.get(code);
    const elsewhere = ownerIndex !== undefined && ownerIndex !== index;
    return {
      id: code,
      label,
      keywords: code,
      meta: elsewhere ? `Already in “${zones?.[ownerIndex]?.name || `zone ${ownerIndex + 1}`}”` : code,
      disabled: elsewhere,
      trailing: elsewhere ? (
        <Button size="xs" variant="ghost" onClick={() => moveHere(code, ownerIndex)}>
          Move here
        </Button>
      ) : undefined,
    };
  });

  return (
    <Card
      title={
        <span className="flex flex-wrap items-center gap-2">
          <MapPin className="h-4 w-4 text-ink-muted" aria-hidden />
          {name || `Zone ${index + 1}`}
          <Badge tone="neutral">{pluralize(countries.length, 'country', 'countries')}</Badge>
        </span>
      }
      description={`${summarize(zones?.[index]?.standard, 'Standard')}  ·  ${summarize(zones?.[index]?.express, 'Express')}`}
      actions={
        <Button variant="dangerOutline" size="sm" onClick={onRemove} disabled={zoneCount <= 1} icon={<Trash2 className="h-3.5 w-3.5" aria-hidden />}>
          Remove
        </Button>
      }
    >
      <div className="space-y-4">
        <TextField label="Zone name" required maxLength={60} containerClassName="sm:max-w-sm" error={zoneErrors?.name?.message} {...register(`zones.${index}.name`)} />
        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[13px] font-medium text-ink">Countries in this zone</p>
              <p className="text-xs text-ink-muted">Orders going to these countries use the rates below.</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => setEditing((v) => !v)} icon={showList ? undefined : <Pencil className="h-3.5 w-3.5" aria-hidden />}>
              {showList ? 'Done' : 'Add / remove countries'}
            </Button>
          </div>
          {!showList &&
            (countries.length === 0 ? (
              <p className="rounded-lg border border-dashed border-sand-300 px-3 py-4 text-center text-[13px] text-ink-muted">No countries yet.</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5" aria-label="Countries in this zone">
                {countries.map((c) => (
                  <li key={c} className="inline-flex items-center gap-1 rounded-full bg-sand-100 py-1 pl-3 pr-1.5 text-xs font-medium text-ink-soft">
                    {countryName(c)}
                    <button type="button" onClick={() => removeCountry(c)} aria-label={`Remove ${countryName(c)}`} className="rounded-full p-0.5 text-ink-faint hover:bg-sand-200 hover:text-ink">
                      <X className="h-3 w-3" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            ))}
          {showList && (
            <Controller
              control={control}
              name={`zones.${index}.countries`}
              render={({ field, fieldState }) => (
                <SearchableChecklist
                  legend="Countries"
                  items={items}
                  value={field.value}
                  onChange={field.onChange}
                  searchPlaceholder="Search countries"
                  hint="A country belongs to one zone only. Countries held by another zone are locked — use “Move here” to take one over."
                  error={fieldState.error?.message ?? countriesError}
                  inputRef={field.ref}
                />
              )}
            />
          )}
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {METHODS.map((m) => (
            <MethodBlock key={m.key} index={index} method={m} currencies={currencies} handling={handling} />
          ))}
        </div>
      </div>
    </Card>
  );
}

function QuotePreview({ handling, currencies }: { handling: StoreSettings['handlingDays']; currencies: CurrencyConfig[] }) {
  const { control } = useFormContext<Values>();
  const watchedZones = useWatch({ control, name: 'zones' });
  const zones = watchedZones ?? [];
  const message = useWatch({ control, name: 'unsupportedMessage' });
  const options = countryOptions();
  const [code, setCode] = useState(options[0]?.code ?? '');
  const owner = useMemo(() => ownerMap(watchedZones ?? []), [watchedZones]);
  const zoneIndex = owner.get(code);
  const zone = zoneIndex !== undefined ? zones[zoneIndex] : undefined;
  const quotes = zone ? METHODS.map((m) => ({ ...m, rate: zone[m.key] })).filter((q) => q.rate?.enabled) : [];

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <Truck className="h-4 w-4 text-ink-muted" aria-hidden />
          Checkout preview
        </span>
      }
      description="Pick a country to see exactly what a customer there would be offered. Uses your unsaved values."
    >
      <SelectField label="Destination country" value={code} onChange={(e) => setCode(e.target.value)} containerClassName="sm:max-w-sm">
        {options.map((o) => (
          <option key={o.code} value={o.code}>
            {o.name}
          </option>
        ))}
      </SelectField>
      <div className="mt-4" aria-live="polite">
        {!zone ? (
          <Notice tone="warning" title="Checkout is blocked for this destination">
            <p lang="en">{message?.en?.trim() || 'Add the English message below — it is what shoppers see.'}</p>
          </Notice>
        ) : !quotes.length ? (
          <Notice tone="warning">
            “{zone.name || `Zone ${(zoneIndex ?? 0) + 1}`}” has no enabled method, so nothing could be offered. Enable Standard or Express in that zone.
          </Notice>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-ink-muted">
              Zone “{zone.name || `Zone ${(zoneIndex ?? 0) + 1}`}” · handling {handling.min}–{handling.max} business days (from your saved{' '}
              <Link to="/settings/store" className="link">
                store settings
              </Link>
              )
            </p>
            <ul className="divide-y divide-sand-200 rounded-lg border border-sand-200">
              {quotes.map((q) => (
                <li key={q.key} className="flex flex-col gap-1 px-3 py-2.5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-ink">{q.label}</p>
                    <p className="text-xs text-ink-muted">Arrives in {deliveryWindow(handling, q.rate)}</p>
                  </div>
                  <div className="shrink-0 sm:text-right">
                    <p className="text-[13px] font-semibold num">{Number.isFinite(q.rate.rate) ? formatUsd(toMinor(q.rate.rate)) : '—'}</p>
                    <CurrencyExamples usd={toMinor(q.rate.rate)} currencies={currencies} className="sm:text-right" />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}

/** M-S2: free-shipping threshold. Empty = no free shipping; otherwise orders whose
 *  goods subtotal (after discounts, before shipping/tax) reaches this USD value ship
 *  free in every zone. Checkout enforces it server-side. */
function FreeShippingSection() {
  const { register, formState: { errors } } = useFormContext<Values>();
  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <Truck className="h-4 w-4 text-ink-muted" aria-hidden />
          Free shipping threshold
        </span>
      }
      description="Offer free shipping on larger orders. Leave blank to always charge the zone rate."
    >
      <TextField
        id="free-shipping-threshold"
        type="number"
        min={0}
        step="0.01"
        inputMode="decimal"
        label="Free shipping on orders over (USD)"
        hint="Compared with the goods subtotal after discounts, before shipping and tax. The amount is converted to the shopper's currency at checkout."
        error={errors.freeShippingThreshold?.message}
        {...register('freeShippingThreshold', { setValueAs: numOrNull })}
      />
    </Card>
  );
}

function UnsupportedSection() {
  const { control } = useFormContext<Values>();
  const watchedZones = useWatch({ control, name: 'zones' });
  const covered = useMemo(() => new Set((watchedZones ?? []).flatMap((z) => z.countries)), [watchedZones]);
  const missing = countryOptions().filter((c) => !covered.has(c.code));

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-ink-muted" aria-hidden />
          Unsupported countries
        </span>
      }
      description="Countries that belong to no zone. Checkout is blocked for them and the message below is shown."
    >
      <div className="space-y-4">
        {missing.length === 0 ? (
          <p className="text-[13px] text-emerald-800">Every country in the admin’s country list belongs to a zone.</p>
        ) : (
          <div>
            <p className="mb-2 text-[13px] text-ink-soft">{pluralize(missing.length, 'country', 'countries')} not covered:</p>
            <ul className="flex flex-wrap gap-1.5">
              {missing.map((c) => (
                <li key={c.code}>
                  <Badge tone="muted">{c.name}</Badge>
                </li>
              ))}
            </ul>
          </div>
        )}
        <LocalizedField name="unsupportedMessage" label="Message shown at checkout" required multiline rows={2} maxLength={300} hint="Shown where checkout is blocked, so keep it kind and clear." />
      </div>
    </Card>
  );
}


/** Plain-language explanation of how the three parts of this page fit together. */
function HowItWorks() {
  const steps = [
    { n: 1, title: 'Make zones', body: 'Group countries together, e.g. “India” or “Europe”.' },
    { n: 2, title: 'Set rates', body: 'For each zone choose Standard / Express, the fee and delivery days.' },
    { n: 3, title: 'Customer sees it', body: 'At checkout they pick a method and see the fee and arrival date.' },
  ];
  return (
    <section className="card p-4 sm:p-5" aria-label="How shipping works">
      <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-ink">
        <Info className="h-4 w-4 text-brand-700" aria-hidden />
        How shipping works
      </div>
      <ol className="grid gap-3 sm:grid-cols-3">
        {steps.map((st) => (
          <li key={st.n} className="flex items-start gap-3 rounded-lg bg-ivory-50/70 p-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white num">{st.n}</span>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-ink">{st.title}</p>
              <p className="mt-0.5 text-xs text-ink-muted">{st.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-ink-muted">Fees are entered in USD (the base currency) and converted to the customer's currency at checkout. A country in no zone cannot check out.</p>
    </section>
  );
}

/** At-a-glance numbers: zones, countries covered and countries that are blocked. */
function Overview() {
  const { control } = useFormContext<Values>();
  const zones = useWatch({ control, name: 'zones' }) ?? [];
  const total = countryOptions().length;
  const covered = new Set(zones.flatMap((z) => z.countries)).size;
  const stats = [
    { label: 'Zones', value: zones.length, tone: 'text-ink' },
    { label: 'Countries you ship to', value: covered, tone: 'text-emerald-800' },
    { label: 'Not covered (blocked)', value: Math.max(total - covered, 0), tone: total - covered > 0 ? 'text-amber-800' : 'text-ink' },
  ];
  return (
    <dl className="grid grid-cols-3 gap-3">
      {stats.map((st) => (
        <div key={st.label} className="card px-4 py-3">
          <dt className="text-xs text-ink-muted">{st.label}</dt>
          <dd className={cn('mt-0.5 text-2xl font-semibold num', st.tone)}>{st.value}</dd>
        </div>
      ))}
    </dl>
  );
}

// ---------------------------------------------------------------------------------------------

function ShippingForm({ settings }: { settings: Settings }) {
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: toForm(settings.shipping) });
  const { control, handleSubmit, reset, setError, formState } = form;
  const { isDirty, isSubmitting } = formState;
  useUnsavedChangesGuard(isDirty);
  const { fields, append, remove } = useFieldArray<Values, 'zones', 'fieldId'>({ control, name: 'zones', keyName: 'fieldId' });
  const currencies = settings.currencies.currencies;

  const removeZone = async (index: number, name: string) => {
    const ok = await confirmAction({
      title: `Remove “${name || `Zone ${index + 1}`}”?`,
      body: 'Its countries become unsupported until you add them to another zone, and checkout is blocked for them.',
      confirmLabel: 'Remove zone',
      tone: 'danger',
    });
    if (ok) remove(index);
  };

  const onSubmit = async (v: Values) => {
    try {
      const saved = await settingsService.updateShipping({
        zones: v.zones.map((z) => ({ id: z.id, name: z.name.trim(), countries: z.countries, standard: fromMethodForm(z.standard), express: fromMethodForm(z.express) })),
        unsupportedMessage: v.unsupportedMessage,
        freeShippingThreshold: v.freeShippingThreshold != null ? toMinor(v.freeShippingThreshold) : null,
      });
      reset(toForm(saved));
      invalidate('settings', 'dashboard', 'translation');
      toast('Shipping settings saved.', 'success');
    } catch (e) {
      applyServerErrors(e, setError);
    }
  };

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(onSubmit, onInvalidForm)} noValidate className="space-y-5">
        <HowItWorks />
        <Overview />

        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0 space-y-5">
            <div>
              <h2 className="mb-1 text-sm font-semibold text-ink">Shipping zones</h2>
              <p className="mb-3 text-xs text-ink-muted">Each zone is a group of countries with its own rates. At least one zone is required, and at most 20.</p>
              {/* L-S3: a zones-level error (zero zones, or more than 20) has no field
                  of its own — show it here instead of only as a toast. */}
              {typeof formState.errors.zones?.message === 'string' && (
                <p className="mb-3 text-[13px] font-medium text-red-700" role="alert">{formState.errors.zones.message}</p>
              )}
            </div>
            {fields.map((field, index) => (
              <ZoneCard
                key={field.fieldId}
                index={index}
                zoneCount={fields.length}
                currencies={currencies}
                handling={settings.store.handlingDays}
                onRemove={() => void removeZone(index, form.getValues(`zones.${index}.name`))}
              />
            ))}

            {/* L-S3: the backend caps zones at 20 — stop at 20 instead of letting
                the 21st zone fail on save. */}
            <Button variant="outline" onClick={() => append(newZone())} disabled={fields.length >= 20} title={fields.length >= 20 ? 'At most 20 shipping zones.' : undefined} icon={<Plus className="h-4 w-4" aria-hidden />}>
              Add zone
            </Button>
            {fields.length >= 20 && <p className="text-xs text-ink-muted">You have the maximum of 20 zones. Remove one to add another.</p>}

            <FreeShippingSection />
            <UnsupportedSection />
          </div>

          <div className="min-w-0 xl:sticky xl:top-4">
            <QuotePreview handling={settings.store.handlingDays} currencies={currencies} />
          </div>
        </div>

        <SettingsActionBar dirty={isDirty} saving={isSubmitting} onReset={() => reset()} updatedAt={settings.shipping.updatedAt} />
      </form>
    </FormProvider>
  );
}

export default function ShippingSettingsPage() {
  usePageMeta('Shipping', [{ label: 'Settings' }]);
  // L-S10: the checkout preview's handling days come from the saved store settings
  // (handling days are edited on the Store page, not here), so reload settings when
  // this page opens — a cached copy could predate a save made in another tab, and
  // the preview would quote the old handling window. This runs once, on mount,
  // before any draft exists on this page, so it can never discard an edit.
  const { refetch } = useSettings();
  const refetched = useRef(false);
  useEffect(() => {
    if (refetched.current) return;
    refetched.current = true;
    refetch();
  }, [refetch]);
  return (
    <ContentLangProvider>
      <PageHeader description="Decide where you ship, what customers pay, and how long delivery takes. Customers see this at checkout." />
      <SettingsScopeNotice className="mb-5" />
      <SettingsGate cards={4}>{(settings) => <ShippingForm key={settings.shipping.updatedAt} settings={settings} />}</SettingsGate>
    </ContentLangProvider>
  );
}
