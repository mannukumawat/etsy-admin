import { Controller, useForm, useWatch, type Control } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Coins, Lock } from 'lucide-react';
import { onInvalidForm, SettingsActionBar, SettingsGate, SettingsScopeNotice, useUnsavedChangesGuard } from '@/components/settings/SettingsKit';
import { Notice } from '@/components/ui/Feedback';
import { Switch, TextField } from '@/components/ui/Form';
import { Card, PageHeader } from '@/components/ui/Page';
import { usePageMeta } from '@/hooks/misc';
import { invalidate } from '@/hooks/useQuery';
import { settingsService } from '@/services/settingsService';
import { toast } from '@/store';
import type { CurrencyConfig, CurrencySettings, Settings } from '@/types';
import { formatDateTime } from '@/utils/dates';
import { applyServerErrors, num } from '@/utils/forms';
import { cn, pluralize } from '@/utils/misc';
import { convertFromUsd, formatUsd, formatWithCode } from '@/utils/money';

// Rates are manual and illustrative: 1 USD = `rate` units of the currency. The base currency is fixed to USD.

const schema = z.object({
  currencies: z.array(
    z.object({
      code: z.string(),
      name: z.string(),
      enabled: z.boolean(),
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

function CurrencyRow({ index, control, currency }: { index: number; control: Control<Values>; currency: CurrencyConfig }) {
  const isBase = currency.code === 'USD';
  const row = useWatch({ control, name: `currencies.${index}` });
  const enabled = !!row?.enabled;
  const rate = row?.rate;

  return (
    <li className={cn('px-4 py-3.5', !enabled && 'bg-ivory-50')}>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,16rem)_auto] sm:items-center">
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
              prefix="1 USD ="
              suffix={currency.code}
              className="pl-[4.75rem] text-right"
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
        description={`Rates last updated ${formatDateTime(settings.currencies.ratesUpdatedAt)}`}
        bodyClassName="px-0 py-0 sm:px-0"
      >
        <div className="px-4 pt-4">
          <Notice tone="warning" title="Rates are manual, not live">
            Nothing fetches exchange rates in this demo: you type them, and they are illustrative. Orders already placed keep the rate captured at checkout, so editing a
            rate never changes order history.
          </Notice>
        </div>
        <ul className="mt-3 divide-y divide-sand-200 border-t border-sand-200">
          {base.map((c, index) => (
            <CurrencyRow key={c.code} index={index} control={control} currency={c} />
          ))}
        </ul>
        <p className="border-t border-sand-200 px-4 py-3 text-xs text-ink-muted">
          Decimal places and rounding are fixed per currency in this preview (INR rounds to whole rupees). Adding or removing currencies is not supported.
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
      <PageHeader description="Which currencies shoppers can see, and the manual rate used to convert from USD." />
      <SettingsScopeNotice className="mb-5" />
      <SettingsGate cards={3}>{(settings) => <CurrencyForm key={settings.currencies.updatedAt} settings={settings} />}</SettingsGate>
    </>
  );
}
