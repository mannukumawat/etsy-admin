import { useState } from 'react';
import { Controller, FormProvider, useFieldArray, useForm, useFormContext, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Calculator, Plus, Receipt, Trash2 } from 'lucide-react';
import { countryName, countryOptions } from '@/components/settings/countryNames';
import { CurrencyExamples, onInvalidForm, SettingsActionBar, SettingsGate, SettingsScopeNotice, useUnsavedChangesGuard } from '@/components/settings/SettingsKit';
import { Button } from '@/components/ui/Button';
import { EmptyState, Notice } from '@/components/ui/Feedback';
import { SelectField, Switch, TextField } from '@/components/ui/Form';
import { Card, DefinitionList, PageHeader } from '@/components/ui/Page';
import { usePageMeta } from '@/hooks/misc';
import { invalidate } from '@/hooks/useQuery';
import { settingsService } from '@/services/settingsService';
import { confirmAction, toast } from '@/store';
import type { CurrencyConfig, Settings, TaxSettings } from '@/types';
import { applyServerErrors, num } from '@/utils/forms';
import { newId } from '@/utils/misc';
import { formatUsd, parseMajor } from '@/utils/money';

const rateField = z.number({ invalid_type_error: 'Enter a number.' }).min(0, '0–50%.').max(50, '0–50%.');

const schema = z
  .object({
    pricesIncludeTax: z.boolean(),
    defaultRate: rateField,
    rules: z.array(
      z.object({
        id: z.string(),
        country: z.string().min(1, 'Choose a country.'),
        region: z.string().trim().max(60, 'Keep it under 60 characters.'),
        rate: rateField,
        label: z.string().trim().min(1, 'Label is required.').max(40, 'Keep it under 40 characters.'),
      }),
    ),
  })
  .superRefine((v, ctx) => {
    const seen = new Set<string>();
    v.rules.forEach((r, i) => {
      const key = `${r.country}|${r.region.trim().toLowerCase()}`;
      if (seen.has(key)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['rules', i, 'region'], message: 'Another rule already covers this country and region.' });
      seen.add(key);
    });
  });
type Values = z.infer<typeof schema>;

const toForm = ({ updatedAt: _updatedAt, ...rest }: TaxSettings): Values => ({ ...rest, rules: rest.rules.map((r) => ({ ...r })) });

/** Region match first, then whole country, else the default rate. Mirrors how checkout would pick a rule. */
function matchRule(rules: Values['rules'], country: string, region: string) {
  const needle = region.trim().toLowerCase();
  const inCountry = rules.filter((r) => r.country === country);
  return (needle ? inCountry.find((r) => r.region.trim().toLowerCase() === needle) : undefined) ?? inCountry.find((r) => !r.region.trim()) ?? null;
}

function RuleRow({ index, onRemove }: { index: number; onRemove: () => void }) {
  const {
    register,
    control,
    formState: { errors },
  } = useFormContext<Values>();
  const err = errors.rules?.[index];
  const country = useWatch({ control, name: `rules.${index}.country` });

  return (
    <li className="grid gap-3 px-3 py-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_6rem_minmax(0,1fr)_auto] sm:items-start">
      <SelectField label="Country" hideLabel={index > 0} required error={err?.country?.message} {...register(`rules.${index}.country`)}>
        {countryOptions().map((o) => (
          <option key={o.code} value={o.code}>
            {o.name}
          </option>
        ))}
      </SelectField>
      <TextField
        label="Region"
        hideLabel={index > 0}
        maxLength={60}
        placeholder="All regions"
        aria-label={`Region for ${countryName(country ?? '')}`}
        error={err?.region?.message}
        {...register(`rules.${index}.region`)}
      />
      <TextField
        label="Rate"
        hideLabel={index > 0}
        type="number"
        inputMode="decimal"
        min={0}
        max={50}
        step={0.1}
        suffix="%"
        aria-label={`Rate for ${countryName(country ?? '')}`}
        error={err?.rate?.message}
        {...register(`rules.${index}.rate`, { setValueAs: num })}
      />
      <TextField
        label="Label"
        hideLabel={index > 0}
        maxLength={40}
        placeholder="VAT"
        aria-label={`Label for ${countryName(country ?? '')}`}
        error={err?.label?.message}
        {...register(`rules.${index}.label`)}
      />
      <div className={index > 0 ? '' : 'sm:mt-[1.6rem]'}>
        <Button variant="ghost" size="sm" onClick={onRemove} aria-label={`Remove the ${countryName(country ?? '')} rule`} icon={<Trash2 className="h-3.5 w-3.5" aria-hidden />}>
          <span className="sm:sr-only">Remove</span>
        </Button>
      </div>
    </li>
  );
}

function TaxPreview({ currencies }: { currencies: CurrencyConfig[] }) {
  const { control } = useFormContext<Values>();
  const [inclusive, defaultRate, rules] = useWatch({ control, name: ['pricesIncludeTax', 'defaultRate', 'rules'] });
  const options = countryOptions();
  const [country, setCountry] = useState(options[0]?.code ?? '');
  const [region, setRegion] = useState('');
  const [amount, setAmount] = useState('100');

  const minor = parseMajor(amount);
  const rule = matchRule(rules ?? [], country, region);
  const percent = rule ? rule.rate : (defaultRate ?? 0);
  const valid = minor !== null && minor >= 0 && Number.isFinite(percent);
  const base = valid ? minor : 0;
  // Inclusive: the price already contains the tax, so extract it. Exclusive: add it on top.
  const tax = valid ? (inclusive ? Math.round(base - base / (1 + percent / 100)) : Math.round((base * percent) / 100)) : 0;
  const total = inclusive ? base : base + tax;
  const net = total - tax;

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <Calculator className="h-4 w-4 text-ink-muted" aria-hidden />
          Preview calculator
        </span>
      }
      description="Uses the unsaved values on this page."
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <TextField label="Amount" prefix="USD" type="number" inputMode="decimal" min={0} step={0.01} value={amount} onChange={(e) => setAmount(e.target.value)} />
        <SelectField label="Country" value={country} onChange={(e) => setCountry(e.target.value)}>
          {options.map((o) => (
            <option key={o.code} value={o.code}>
              {o.name}
            </option>
          ))}
        </SelectField>
        <TextField label="Region" placeholder="Optional" value={region} onChange={(e) => setRegion(e.target.value)} />
      </div>
      <div className="mt-4" aria-live="polite">
        {!valid ? (
          <p className="rounded-lg bg-ivory-50 px-3 py-2.5 text-[13px] text-ink-muted">Enter an amount of zero or more to see the calculation.</p>
        ) : (
          <>
            <p className="mb-2 text-xs text-ink-muted">
              {rule
                ? `Matched “${rule.label || 'rule'}” for ${countryName(rule.country)}${rule.region.trim() ? ` · ${rule.region.trim()}` : ' · all regions'}.`
                : `No rule matches ${countryName(country)}${region.trim() ? ` · ${region.trim()}` : ''} — using the default rate.`}
            </p>
            <DefinitionList
              items={[
                [inclusive ? 'Price (tax included)' : 'Price (before tax)', <span className="num">{formatUsd(base)}</span>],
                [`${rule?.label || 'Tax'} at ${percent}%`, <span className="num">{formatUsd(tax)}</span>],
                ['Net of tax', <span className="num">{formatUsd(net)}</span>],
                ['Customer pays', <span className="num">{formatUsd(total)}</span>],
              ]}
            />
            <CurrencyExamples usd={total} currencies={currencies} label="Customer pays ≈" className="mt-2" />
          </>
        )}
      </div>
    </Card>
  );
}

function TaxForm({ settings }: { settings: Settings }) {
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: toForm(settings.tax) });
  const { register, control, handleSubmit, reset, setError, formState } = form;
  const { errors, isDirty, isSubmitting } = formState;
  useUnsavedChangesGuard(isDirty);
  const { fields, append, remove } = useFieldArray<Values, 'rules', 'fieldId'>({ control, name: 'rules', keyName: 'fieldId' });
  const inclusive = useWatch({ control, name: 'pricesIncludeTax' });

  const removeRule = async (index: number) => {
    const name = countryName(form.getValues(`rules.${index}.country`));
    const ok = await confirmAction({
      title: `Remove the ${name} rule?`,
      body: 'Orders to that country would then use the default rate.',
      confirmLabel: 'Remove rule',
      tone: 'danger',
    });
    if (ok) remove(index);
  };

  const onSubmit = async (v: Values) => {
    try {
      const saved = await settingsService.updateTax({
        pricesIncludeTax: v.pricesIncludeTax,
        defaultRate: v.defaultRate,
        rules: v.rules.map((r) => ({ ...r, region: r.region.trim(), label: r.label.trim() })),
      });
      reset(toForm(saved));
      invalidate('settings', 'dashboard');
      toast('Tax settings saved.', 'success');
    } catch (e) {
      applyServerErrors(e, setError);
    }
  };

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(onSubmit, onInvalidForm)} noValidate className="space-y-5">
        <Card title="How prices are taxed">
          <div className="space-y-4">
            <Controller
              control={control}
              name="pricesIncludeTax"
              render={({ field }) => (
                <Switch
                  label="Prices include tax"
                  description={
                    field.value
                      ? 'Inclusive: the catalogue price is what the customer pays, and the tax is extracted from it.'
                      : 'Exclusive: the catalogue price is before tax, and the tax is added at checkout.'
                  }
                  checked={field.value}
                  onChange={field.onChange}
                />
              )}
            />
            <Notice tone="info">
              {inclusive
                ? 'With inclusive pricing a $100 item at 20% stays $100 for the customer; $16.67 of it is tax.'
                : 'With exclusive pricing a $100 item at 20% becomes $120 at checkout; $20 of it is tax.'}
            </Notice>
            <TextField
              label="Default rate"
              type="number"
              inputMode="decimal"
              min={0}
              max={50}
              step={0.1}
              suffix="%"
              containerClassName="sm:max-w-xs"
              hint="Used when no rule below matches the shipping address."
              error={errors.defaultRate?.message}
              {...register('defaultRate', { setValueAs: num })}
            />
          </div>
        </Card>

        <Card
          title={
            <span className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-ink-muted" aria-hidden />
              Rules
            </span>
          }
          description="A region rule wins over a country rule; with neither, the default rate applies."
          bodyClassName="px-0 py-0 sm:px-0"
        >
          {fields.length === 0 ? (
            <EmptyState title="No rules yet" body="Every order would use the default rate." action={<Button variant="outline" size="sm" onClick={() => append({ id: newId('tax'), country: countryOptions()[0]?.code ?? '', region: '', rate: 0, label: 'Tax' })}>Add rule</Button>} />
          ) : (
            <div className="overflow-x-auto scrollbar-thin">
              <ul className="min-w-[36rem] divide-y divide-sand-200">
                {fields.map((field, index) => (
                  <RuleRow key={field.fieldId} index={index} onRemove={() => void removeRule(index)} />
                ))}
              </ul>
            </div>
          )}
          <div className="border-t border-sand-200 px-4 py-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => append({ id: newId('tax'), country: countryOptions()[0]?.code ?? '', region: '', rate: 0, label: 'Tax' })}
              icon={<Plus className="h-4 w-4" aria-hidden />}
            >
              Add rule
            </Button>
          </div>
        </Card>

        <TaxPreview currencies={settings.currencies.currencies} />

        <SettingsActionBar dirty={isDirty} saving={isSubmitting} onReset={() => reset()} updatedAt={settings.tax.updatedAt} />
      </form>
    </FormProvider>
  );
}

export default function TaxSettingsPage() {
  usePageMeta('Tax', [{ label: 'Settings' }]);
  return (
    <>
      <PageHeader description="Tax rates applied to orders in this admin preview, by destination country and region." />
      <Notice tone="warning" role="alert" title="Illustrative rules only" className="mb-4">
        These tax rules exist for the demo. They are <strong>not tax advice</strong> and do not make the store legally or tax compliant — confirm the real rules for every
        market with a qualified adviser.
      </Notice>
      <SettingsScopeNotice className="mb-5" />
      <SettingsGate cards={3}>{(settings) => <TaxForm key={settings.tax.updatedAt} settings={settings} />}</SettingsGate>
    </>
  );
}
