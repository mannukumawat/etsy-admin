import { useState } from 'react';
import { Controller, useForm, useWatch, type Control } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Coins, Lock, RefreshCw } from 'lucide-react';
import { onInvalidForm, SettingsActionBar, SettingsGate, SettingsScopeNotice, useUnsavedChangesGuard } from '@/components/settings/SettingsKit';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Feedback';
import { Switch, TextField } from '@/components/ui/Form';
import { Card, PageHeader } from '@/components/ui/Page';
import { usePageMeta } from '@/hooks/misc';
import { invalidate } from '@/hooks/useQuery';
import { settingsService } from '@/services/settingsService';
import { errorMessage } from '@/services/api';
import { toast } from '@/store';
import type { CurrencyConfig, CurrencySettings, Settings } from '@/types';
import { formatDateTime } from '@/utils/dates';
import { applyServerErrors, num } from '@/utils/forms';
import { cn, pluralize } from '@/utils/misc';
import { convertFromUsd, formatUsd, formatWithCode } from '@/utils/money';

// 1 USD = `rate` units of the currency. Each non-base currency is either typed by hand (Manual) or refreshed from a live feed (Live). The base currency is fixed to USD.

const schema = z.object({
  currencies: z.array(
    z.object({
      code: z.string(),
      name: z.string(),
      enabled: z.boolean(),
      autoRate: z.boolean().optional(),
      rate: z
        .number({ invalid_type_error: 'Enter a rate.' })
        .positive('Rate must be above zero.')
        .max(100000, 'Rate must be 100,000 or less.'),
      fractionDigits: z.number(),
      roundingIncrement: z.number(),
    }),
  ),
});
type Values = z.infer<typeof schema>;

const SAMPLE_ITEM = 2800;
const SAMPLE_CART = 10400;

const roundingNote = (c: Pick<CurrencyConfig, 'code' | 'roundingIncrement' | 'fractionDigits'>) => {
  if (c.roundingIncrement <= 1) return c.fractionDigits === 0 ? 'Whole units, no decimals' : `${pluralize(c.fractionDigits, 'decimal place')}`;
  return `Rounds to the nearest ${c.roundingIncrement / 100} ${c.code}`;
};

/** Live = refreshed automatically from an exchange-rate feed; Manual = the number typed here. */
function SourceToggle({ value, onChange, code }: { value: boolean; onChange: (v: boolean) => void; code: string }) {
  const option = (v: boolean, label: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={value === v}
      onClick={() => onChange(v)}
      className={cn('px-3 py-1.5 text-xs font-medium transition-colors', value === v ? 'bg-brand-600 text-white' : 'bg-white text-ink-soft hover:bg-sand-100')}
    >
      {label}
    </button>
  );
  return (
    <div role="radiogroup" aria-label={`Rate source for ${code}`} className="inline-flex overflow-hidden rounded-lg border border-sand-300">
      {option(true, 'Live')}
      {option(false, 'Manual')}
    </div>
  );
}

function CurrencyRow({ index, control, currency }: { index: number; control: Control<Values>; currency: CurrencyConfig }) {
  const isBase = currency.code === 'USD';
  const row = useWatch({ control, name: `currencies.${index}` });
  const enabled = !!row?.enabled;
  const rate = row?.rate;
  const auto = !isBase && !!row?.autoRate;

  return (
    <li className={cn('px-4 py-3.5', !enabled && 'bg-ivory-50')}>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,15rem)_auto] sm:items-center">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-[13px] font-semibold text-ink">
            <span className="font-mono">{currency.code}</span>
            <span className="font-normal text-ink-soft">{currency.name}</span>
            {isBase && (
              <span className="inline-flex items-center gap-1 rounded-full bg-sand-100 px-2 py-0.5 text-2xs font-medium text-ink-soft ring-1 ring-inset ring-sand-300">
                <Lock className="h-3 w-3" aria-hidden /> Base
              </span>
            )}
          </p>
          <p className="text-xs text-ink-muted">{roundingNote(currency)}</p>
        </div>

        <div className="sm:justify-self-start">
          {isBase ? (
            <span className="text-xs text-ink-muted">Fixed</span>
          ) : (
            <Controller control={control} name={`currencies.${index}.autoRate`} render={({ field }) => <SourceToggle code={currency.code} value={!!field.value} onChange={field.onChange} />} />
          )}
        </div>

        <Controller
          control={control}
          name={`currencies.${index}.rate`}
          render={({ field, fieldState }) => (
            <TextField
              label={`1 USD = … ${currency.code}`}
              hideLabel
              type="number"
              inputMode="decimal"
              min={0.0001}
              step={0.0001}
              disabled={isBase}
              readOnly={auto}
              hint={undefined}
              prefix="1 USD ="
              suffix={currency.code}
              className={cn('pl-[4.75rem] text-right', auto && 'bg-sand-100 text-ink-soft')}
              aria-label={`Rate: 1 USD in ${currency.name}`}
              error={fieldState.error?.message}
              value={Number.isFinite(field.value) ? String(field.value) : ''}
              onChange={(e) => field.onChange(num(e.target.value))}
              onBlur={field.onBlur}
              ref={field.ref}
            />
          )}
        />

        <Controller
          control={control}
          name={`currencies.${index}.enabled`}
          render={({ field }) => (
            <Switch
              label={<span className="sr-only">{`Offer ${currency.name} at checkout`}</span>}
              description={<span className="sr-only">{isBase ? 'The base currency is always offered.' : 'Shown as a currency option.'}</span>}
              checked={field.value}
              disabled={isBase}
              onChange={field.onChange}
            />
          )}
        />
      </div>
      {enabled && Number.isFinite(rate) && rate > 0 && !isBase && (
        <p className="mt-2 text-xs text-ink-muted num">
          A {formatUsd(SAMPLE_ITEM)} item shows as {formatWithCode(convertFromUsd(SAMPLE_ITEM, { rate, roundingIncrement: currency.roundingIncrement }), currency.code, currency.fractionDigits)}
        </p>
      )}
      {auto && <p className="mt-1 text-xs text-ink-muted">Updates automatically from a live exchange-rate feed. Switch to Manual to type your own rate.</p>}
      {!enabled && <p className="mt-2 text-xs text-ink-muted">Not offered at checkout.</p>}
    </li>
  );
}

function ConversionPreview({ control, base }: { control: Control<Values>; base: CurrencyConfig[] }) {
  const rows = useWatch({ control, name: 'currencies' }) ?? [];
  const usable = rows
    .map((r, i) => ({ ...base[i], ...r }))
    .filter((c) => c.enabled && Number.isFinite(c.rate) && c.rate > 0);

  return (
    <Card title="Preview" description="A sample item and cart converted with the rates in this form, including unsaved changes.">
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full min-w-[22rem] text-left text-[13px]">
          <caption className="sr-only">Sample amounts in each enabled currency</caption>
          <thead>
            <tr className="border-b border-sand-200 text-xs text-ink-muted">
              <th scope="col" className="py-2 pr-3 font-medium">
                Currency
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">
                Item {formatUsd(SAMPLE_ITEM)}
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                Cart {formatUsd(SAMPLE_CART)}
              </th>
            </tr>
          </thead>
          <tbody>
            {usable.map((c) => (
              <tr key={c.code} className="border-b border-sand-200/70 last:border-0">
                <th scope="row" className="py-2 pr-3 font-medium">
                  <span className="font-mono">{c.code}</span> <span className="font-normal text-ink-muted">{c.name}</span>
                </th>
                <td className="py-2 pr-3 text-right num">{formatWithCode(convertFromUsd(SAMPLE_ITEM, c), c.code, c.fractionDigits)}</td>
                <td className="py-2 text-right num">{formatWithCode(convertFromUsd(SAMPLE_CART, c), c.code, c.fractionDigits)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {usable.length <= 1 && <p className="mt-3 text-xs text-ink-muted">Enable another currency to compare conversions.</p>}
    </Card>
  );
}

function CurrencyForm({ settings }: { settings: Settings }) {
  const base = settings.currencies.currencies;
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { currencies: base.map((c) => ({ ...c })) } });
  const { control, handleSubmit, reset, setError, formState } = form;
  const { isDirty, isSubmitting } = formState;
  useUnsavedChangesGuard(isDirty);
  const [refreshing, setRefreshing] = useState(false);
  const anyLive = base.some((c) => c.code !== 'USD' && c.autoRate);
  // L-S6: warn when the displayed rates are over a week old — prices in INR/EUR/GBP
  // are converted from these numbers, so stale rates mean stale prices. A recent
  // live-rate check suppresses the warning: the rates were verified even if no
  // value changed (ratesUpdatedAt only moves when a rate actually changes).
  const ratesAgeDays = (Date.now() - new Date(settings.currencies.ratesUpdatedAt).getTime()) / 86_400_000;
  const lastCheckAgeDays = settings.currencies.autoSyncAt ? (Date.now() - new Date(settings.currencies.autoSyncAt).getTime()) / 86_400_000 : null;
  const ratesStale = ratesAgeDays > 7 && !(anyLive && lastCheckAgeDays !== null && lastCheckAgeDays <= 7);

  const refreshNow = async () => {
    setRefreshing(true);
    try {
      await settingsService.refreshCurrencyRates();
      invalidate('settings', 'dashboard', 'orders', 'products');
      toast('Live rates refreshed.', 'success');
    } catch (e) {
      toast(errorMessage(e), 'error');
      invalidate('settings');
    } finally {
      setRefreshing(false);
    }
  };

  const onSubmit = async (v: Values) => {
    try {
      const saved = await settingsService.updateCurrencies({ currencies: v.currencies as CurrencySettings['currencies'] });
      reset({ currencies: saved.currencies.map((c) => ({ ...c })) });
      invalidate('settings', 'dashboard', 'orders', 'products');
      toast('Currency settings saved.', 'success');
    } catch (e) {
      applyServerErrors(e, setError);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit, onInvalidForm)} noValidate className="space-y-5">
      <Card
        title={
          <span className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-ink-muted" aria-hidden />
            Base currency: USD
          </span>
        }
      >
        <p className="text-[13px] text-ink-soft">
          Every product price, coupon amount and shipping rate is stored in USD. Changing the base currency would require migrating all of them, so it is not supported
          here. The other currencies below are display conversions.
        </p>
      </Card>

      <Card
        title={
          <span className="flex items-center gap-2">
            <Coins className="h-4 w-4 text-ink-muted" aria-hidden />
            Currencies and rates
          </span>
        }
        description={`Rates last changed ${formatDateTime(settings.currencies.ratesUpdatedAt)}`}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refreshNow()}
            loading={refreshing}
            disabled={isDirty || !anyLive || refreshing}
            title={isDirty ? 'Save your changes first' : !anyLive ? 'Set at least one currency to Live and save' : undefined}
            icon={<RefreshCw className="h-3.5 w-3.5" aria-hidden />}
          >
            Refresh rates now
          </Button>
        }
        bodyClassName="px-0 py-0 sm:px-0"
      >
        <div className="space-y-2 px-4 pt-4">
          <Notice tone="info" title={anyLive ? 'Live rates are on' : 'All rates are typed by hand'}>
            {anyLive ? (
              <>
                {/* L-S1: the old copy said "about every 6 hours", which is only true on a
                    long-running server. On the hosted deployment the rates refresh once a
                    day (03:00 UTC); say both, so neither deployment is misdescribed. */}
                Currencies set to <strong>Live</strong> refresh automatically from a public exchange-rate feed — once a day at 03:00 UTC on the hosted deployment,
                or about every 6 hours on a long-running server
                {settings.currencies.autoSyncAt ? ` (last check ${formatDateTime(settings.currencies.autoSyncAt)})` : ' (no check has run yet)'}. <strong>Manual</strong> currencies never change on their
                own.
              </>
            ) : (
              <>Set a currency to <strong>Live</strong> and save to keep its rate up to date automatically. Until then every rate is the number you type.</>
            )}{' '}
            Orders already placed keep the rate captured at checkout, so a rate change never alters order history.
          </Notice>
          {ratesStale && (
            <Notice tone="warning" title="Rates may be out of date">
              These rates were last changed {formatDateTime(settings.currencies.ratesUpdatedAt)} — over a week ago. Prices shown in INR, EUR and GBP are converted
              from these numbers, so they may no longer match the market. {anyLive ? 'Use “Refresh rates now” to fetch the latest rates.' : 'Switch the currencies to Live and save, or type in current rates and save.'}
            </Notice>
          )}
          {anyLive && settings.currencies.autoSyncError && (
            <Notice tone="warning" title="Last live update had a problem">
              {settings.currencies.autoSyncError} The previous rates are still in use.
            </Notice>
          )}
        </div>
        <ul className="mt-3 divide-y divide-sand-200 border-t border-sand-200">
          {base.map((c, index) => (
            <CurrencyRow key={c.code} index={index} control={control} currency={c} />
          ))}
        </ul>
        <p className="border-t border-sand-200 px-4 py-3 text-xs text-ink-muted">
          Decimal places and rounding are fixed per currency (INR rounds to whole rupees). Adding or removing currencies is not supported.
        </p>
      </Card>

      <ConversionPreview control={control} base={base} />

      <SettingsActionBar dirty={isDirty} saving={isSubmitting} onReset={() => reset()} updatedAt={settings.currencies.updatedAt} />
    </form>
  );
}

export default function CurrencySettingsPage() {
  usePageMeta('Currencies', [{ label: 'Settings' }]);
  return (
    <>
      <PageHeader description="Which currencies shoppers can see, and how prices in USD are converted for them. Each rate is either Live (automatic) or Manual (typed by you)." />
      <SettingsScopeNotice className="mb-5" />
      <SettingsGate cards={3}>{(settings) => <CurrencyForm key={settings.currencies.updatedAt} settings={settings} />}</SettingsGate>
    </>
  );
}
