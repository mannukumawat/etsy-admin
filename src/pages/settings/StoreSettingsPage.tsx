import { Controller, FormProvider, useForm, useFormContext, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { ImageField, useMediaMap } from '@/components/media/MediaPicker';
import { onInvalidForm, SettingsActionBar, SettingsGate, SettingsScopeNotice, useUnsavedChangesGuard } from '@/components/settings/SettingsKit';
import { TextareaField, TextField } from '@/components/ui/Form';
import { ContentLangProvider, LocalizedField } from '@/components/ui/LocalizedField';
import { Card, PageHeader } from '@/components/ui/Page';
import { usePageMeta } from '@/hooks/misc';
import { invalidate } from '@/hooks/useQuery';
import { settingsService } from '@/services/settingsService';
import { toast } from '@/store';
import type { Settings, StoreSettings } from '@/types';
import { applyServerErrors, localized, num } from '@/utils/forms';
import { isHttpUrl } from '@/utils/misc';

const httpsUrl = z
  .string()
  .trim()
  .max(300, 'Keep it under 300 characters.')
  .refine((v) => !v || (/^https:\/\//i.test(v) && isHttpUrl(v)), 'Use a full https:// URL or leave empty.');

const wholeNumber = (min: number, max: number, message: string) =>
  z.number({ invalid_type_error: 'Enter a number.' }).int('Use a whole number.').min(min, message).max(max, message);

const schema = z.object({
  name: z.string().trim().min(1, 'Store name is required.').max(60, 'Keep it under 60 characters.'),
  tagline: localized(false, 120),
  logoId: z.string().nullable(),
  contact: z.object({
    email: z.string().trim().email('Enter a valid email address.'),
    phone: z.string().trim().max(40, 'Keep it under 40 characters.'),
    address: z.string().trim().max(240, 'Keep it under 240 characters.'),
    hours: localized(false, 120),
  }),
  social: z.object({ instagram: httpsUrl, pinterest: httpsUrl, facebook: httpsUrl, youtube: httpsUrl }),
  handlingDays: z
    .object({ min: wholeNumber(0, 30, '0–30 days.'), max: wholeNumber(0, 30, '0–30 days.') })
    .superRefine((h, ctx) => {
      if (h.max < h.min) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['max'], message: 'Maximum must be at least the minimum.' });
    }),
  maxQtyPerLine: wholeNumber(1, 99, 'Use a whole number from 1 to 99.'),
  lowStockThreshold: wholeNumber(0, 1000, 'Use a whole number from 0 to 1,000.'),
});
type Values = z.infer<typeof schema>;

const toForm = ({ updatedAt: _updatedAt, ...rest }: StoreSettings): Values => rest;

const SOCIAL: Array<{ key: keyof Values['social']; label: string; placeholder: string }> = [
  { key: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/yourstore' },
  { key: 'pinterest', label: 'Pinterest', placeholder: 'https://pinterest.com/yourstore' },
  { key: 'facebook', label: 'Facebook', placeholder: 'https://facebook.com/yourstore' },
  { key: 'youtube', label: 'YouTube', placeholder: 'https://youtube.com/@yourstore' },
];

/** Small live preview of the storefront header/contact details in the active content language. */
function StorePreview() {
  const { map } = useMediaMap();
  const { control } = useFormContext<Values>();
  const [name, tagline, logoId, hours, email] = useWatch({ control, name: ['name', 'tagline', 'logoId', 'contact.hours', 'contact.email'] });
  const logo = logoId ? map.get(logoId) : undefined;
  const pick = (l: { en: string } | undefined) => l?.en ?? '';
  return (
    <Card title="Preview">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-sand-200 bg-sand-100">
          {logo ? <img src={logo.url} alt="" className="h-full w-full object-cover" /> : <span className="font-brand text-lg text-ink-muted">{(name || '?').slice(0, 1)}</span>}
        </div>
        <div className="min-w-0">
          <p className="truncate font-brand text-xl font-semibold text-ink">{name || 'Store name'}</p>
          <p className="text-xs text-ink-muted">
            {pick(tagline) || 'No tagline'}
          </p>
        </div>
      </div>
      <dl className="mt-4 space-y-1 text-xs text-ink-soft">
        <div className="flex gap-2">
          <dt className="text-ink-muted">Email</dt>
          <dd className="min-w-0 truncate">{email || '—'}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-ink-muted">Hours</dt>
          <dd >{pick(hours) || '—'}</dd>
        </div>
      </dl>
    </Card>
  );
}

function StoreForm({ settings }: { settings: Settings }) {
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: toForm(settings.store) });
  const { register, control, handleSubmit, reset, setError, formState } = form;
  const { errors, isDirty, isSubmitting } = formState;
  useUnsavedChangesGuard(isDirty);
  const handling = useWatch({ control, name: 'handlingDays' });

  const onSubmit = async (v: Values) => {
    try {
      const saved = await settingsService.updateStore(v);
      reset(toForm(saved));
      invalidate('settings', 'dashboard', 'inventory', 'products', 'media');
      toast('Store settings saved.', 'success');
    } catch (e) {
      applyServerErrors(e, setError);
    }
  };

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(onSubmit, onInvalidForm)} noValidate>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="min-w-0 space-y-5">
            <Card title="Store identity" description="Name, tagline and contact details shown on the storefront.">
              <div className="space-y-4">
                <TextField label="Store name" required maxLength={60} error={errors.name?.message} {...register('name')} />
                <LocalizedField name="tagline" label="Tagline" maxLength={120} />
                <Controller
                  control={control}
                  name="logoId"
                  render={({ field }) => <ImageField label="Logo" value={field.value} onChange={field.onChange} error={errors.logoId?.message} hint="Square image; shown in the storefront header and emails." />}
                />
              </div>
            </Card>

            <Card title="Contact">
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label="Email" type="email" required autoComplete="off" error={errors.contact?.email?.message} {...register('contact.email')} />
                <TextField label="Phone" type="tel" autoComplete="off" error={errors.contact?.phone?.message} {...register('contact.phone')} />
                <TextareaField label="Address" rows={2} containerClassName="sm:col-span-2" error={errors.contact?.address?.message} {...register('contact.address')} />
                <LocalizedField name="contact.hours" label="Opening hours" maxLength={120} className="sm:col-span-2" />
              </div>
            </Card>

            <Card title="Social links" description="Full https:// URLs. Leave empty to hide an icon.">
              <div className="grid gap-4 sm:grid-cols-2">
                {SOCIAL.map((s) => (
                  <TextField key={s.key} label={s.label} type="url" inputMode="url" autoComplete="off" placeholder={s.placeholder} error={errors.social?.[s.key]?.message} {...register(`social.${s.key}`)} />
                ))}
              </div>
            </Card>

            <Card title="Orders & fulfilment">
              <div className="grid gap-4 sm:grid-cols-3">
                <TextField
                  label="Handling time, min"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={30}
                  step={1}
                  suffix="days"
                  error={errors.handlingDays?.min?.message}
                  {...register('handlingDays.min', { setValueAs: num })}
                />
                <TextField
                  label="Handling time, max"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={30}
                  step={1}
                  suffix="days"
                  error={errors.handlingDays?.max?.message}
                  {...register('handlingDays.max', { setValueAs: num })}
                />
                <TextField
                  label="Max quantity per cart line"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={99}
                  step={1}
                  error={errors.maxQtyPerLine?.message}
                  {...register('maxQtyPerLine', { setValueAs: num })}
                />
              </div>
              <p className="mt-3 text-xs text-ink-muted">
                Handling time is the business days before an order ships
                {Number.isFinite(handling?.min) && Number.isFinite(handling?.max) ? ` (now ${handling.min}–${handling.max})` : ''}. It is added to transit times in the{' '}
                <Link to="/settings/shipping" className="link">
                  shipping quote preview
                </Link>
                .
              </p>
            </Card>

            <Card title="Inventory alerts">
              <TextField
                label="Low-stock threshold"
                type="number"
                inputMode="numeric"
                min={0}
                max={1000}
                step={1}
                suffix="units"
                containerClassName="sm:max-w-xs"
                error={errors.lowStockThreshold?.message}
                hint="A variant with this many units or fewer counts as low stock."
                {...register('lowStockThreshold', { setValueAs: num })}
              />
              <p className="mt-3 text-xs text-ink-muted">
                Drives the low-stock badges and filters on{' '}
                <Link to="/inventory" className="link">
                  Inventory
                </Link>{' '}
                and{' '}
                <Link to="/products" className="link">
                  Products
                </Link>
                , and the low-stock count on the{' '}
                <Link to="/dashboard" className="link">
                  Dashboard
                </Link>
                .
              </p>
            </Card>
          </div>

          <div className="min-w-0 space-y-5 lg:sticky lg:top-4 lg:self-start">
            <StorePreview />
          </div>
        </div>

        <SettingsActionBar dirty={isDirty} saving={isSubmitting} onReset={() => reset()} updatedAt={settings.store.updatedAt} />
      </form>
    </FormProvider>
  );
}

export default function StoreSettingsPage() {
  usePageMeta('Store', [{ label: 'Settings' }]);
  return (
    <ContentLangProvider>
      <PageHeader description="Your shop’s name, contact details, social links and order limits." />
      <SettingsScopeNotice className="mb-5" />
      <SettingsGate>{(settings) => <StoreForm key={settings.store.updatedAt} settings={settings} />}</SettingsGate>
    </ContentLangProvider>
  );
}
