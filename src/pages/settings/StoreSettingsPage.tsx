import { Controller, FormProvider, useForm, useFormContext, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { Clock, Eye, Mail, MapPin, PackageCheck, Phone, Share2, Store as StoreIcon, Truck, type LucideIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { PreviewBanner } from '@/components/content/PreviewKit';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Dialog';
import { Badge } from '@/components/ui/Feedback';
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

/** Card title with a leading icon so each section is recognisable at a glance. */
function CardTitle({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <span className="flex items-center gap-2">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      {children}
    </span>
  );
}

/** Tells the admin where on the storefront a group of fields ends up. */
function UsedIn({ places }: { places: string[] }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
      <span>Shown on:</span>
      {places.map((p) => (
        <Badge key={p} tone="muted">
          {p}
        </Badge>
      ))}
    </div>
  );
}

/** Full-width storefront mock (header, contact page block and footer) built from the current, possibly unsaved, form values. */
function StorePreviewModal({ values: v, onClose }: { values: Values; onClose: () => void }) {
  const { map } = useMediaMap();
  const logo = v.logoId ? map.get(v.logoId) : undefined;
  const socials = SOCIAL.filter((s) => v.social[s.key]?.trim());
  const hours = v.contact.hours.en;
  const ships = v.handlingDays.min === v.handlingDays.max ? `${v.handlingDays.min}` : `${v.handlingDays.min}–${v.handlingDays.max}`;
  const line = (Icon: LucideIcon, value: string, empty: string) => (
    <li className="flex items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 opacity-70" aria-hidden />
      <span className={value ? 'min-w-0 break-words' : 'italic opacity-60'}>{value || empty}</span>
    </li>
  );
  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title="Store preview"
      description="How your details appear on the storefront."
      footer={
        <Button variant="outline" onClick={onClose}>
          Close preview
        </Button>
      }
    >
      <div className="mb-4">
        <PreviewBanner>Nothing is saved until you click “Save changes”. The storefront currently shows its own built-in logo, not the one chosen here.</PreviewBanner>
      </div>

      <div className="overflow-hidden rounded-xl border border-sand-200 bg-ivory shadow-card">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-sand-200 bg-white px-4 py-3 sm:px-8">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-sand-200 bg-sand-100">
            {logo ? <img src={logo.url} alt="" className="h-full w-full object-cover" /> : <span className="font-brand text-base text-ink-muted">{(v.name || '?').slice(0, 1)}</span>}
          </div>
          <div className="min-w-0">
            <p className="truncate font-brand text-xl font-semibold leading-tight text-ink">{v.name || <span className="text-ink-faint">Store name</span>}</p>
            {v.tagline.en && <p className="truncate text-xs text-ink-muted">{v.tagline.en}</p>}
          </div>
        </div>

        {/* Contact page block */}
        <div className="px-4 py-8 sm:px-8">
          <p className="mb-3 text-2xs font-semibold uppercase tracking-wider text-ink-faint">Contact page</p>
          <div className="grid gap-4 rounded-xl border border-sand-200 bg-white p-5 sm:grid-cols-2">
            <ul className="space-y-2 text-sm text-ink-soft">
              {line(Mail, v.contact.email, 'No email')}
              {line(Phone, v.contact.phone, 'No phone')}
              {line(MapPin, v.contact.address, 'No address')}
            </ul>
            <div className="text-sm">
              <p className="font-medium text-ink">Opening hours</p>
              <p className="mt-1 text-ink-soft">{hours || <span className="italic text-ink-faint">Not set</span>}</p>
              <p className="mt-3 text-xs text-ink-muted">Orders usually ship in {ships} business days.</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-sand-100 px-4 py-8 sm:px-8">
          <p className="mb-3 text-2xs font-semibold uppercase tracking-wider text-ink-faint">Footer</p>
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <p className="font-serif text-2xl font-semibold text-ink">{v.name || 'Store name'}</p>
              {v.tagline.en && <p className="mt-2 max-w-xs text-sm text-ink-muted">{v.tagline.en}</p>}
            </div>
            <ul className="space-y-2 text-sm text-ink-soft">
              {v.contact.email && line(Mail, v.contact.email, '')}
              {v.contact.phone && line(Phone, v.contact.phone, '')}
              {v.contact.address && line(MapPin, v.contact.address, '')}
            </ul>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-sand-300 pt-4">
            {socials.length ? (
              socials.map((s) => (
                <span key={s.key} className="rounded-full border border-sand-300 bg-white px-3 py-1 text-xs font-medium text-ink-soft">
                  {s.label}
                </span>
              ))
            ) : (
              <span className="text-xs text-ink-faint">No social icons (no links added).</span>
            )}
          </div>
          <p className="mt-4 text-xs text-ink-muted">© {new Date().getFullYear()} {(v.name || 'Store name').replace(/\.+$/, '')}</p>
        </div>
      </div>
    </Modal>
  );
}

/** Live preview of how the details look on the storefront, updating as the form is edited. */
function StorePreview({ onOpen }: { onOpen: () => void }) {
  const { map } = useMediaMap();
  const { control } = useFormContext<Values>();
  const [name, tagline, logoId, contact, social, handling, lowStock] = useWatch({
    control,
    name: ['name', 'tagline', 'logoId', 'contact', 'social', 'handlingDays', 'lowStockThreshold'],
  });
  const logo = logoId ? map.get(logoId) : undefined;
  const pick = (l: { en: string } | undefined) => l?.en ?? '';
  const socials = SOCIAL.filter((s) => social?.[s.key]?.trim());
  const row = (Icon: LucideIcon, value: string | undefined, empty: string) => (
    <li className="flex items-start gap-2">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden />
      <span className={value ? 'min-w-0 break-words text-ink-soft' : 'text-ink-faint'}>{value || empty}</span>
    </li>
  );
  return (
    <Card
      title="How it looks on your store"
      description="Updates as you type. Nothing changes until you save."
      actions={
        <Button variant="outline" size="sm" icon={<Eye className="h-3.5 w-3.5" aria-hidden />} onClick={onOpen}>
          Preview
        </Button>
      }
    >
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-sand-200 bg-sand-100">
          {logo ? <img src={logo.url} alt="" className="h-full w-full object-cover" /> : <span className="font-brand text-lg text-ink-muted">{(name || '?').slice(0, 1)}</span>}
        </div>
        <div className="min-w-0">
          <p className="truncate font-brand text-xl font-semibold text-ink">{name || 'Store name'}</p>
          <p className="text-xs text-ink-muted">{pick(tagline) || 'No tagline'}</p>
        </div>
      </div>

      <ul className="mt-4 space-y-2 border-t border-sand-200 pt-4 text-xs">
        {row(Mail, contact?.email, 'No email')}
        {row(Phone, contact?.phone, 'No phone')}
        {row(MapPin, contact?.address, 'No address')}
        {row(Clock, pick(contact?.hours), 'No opening hours')}
      </ul>

      <div className="mt-4 border-t border-sand-200 pt-4">
        <p className="mb-2 text-xs font-medium text-ink-muted">Social icons shown</p>
        {socials.length ? (
          <div className="flex flex-wrap gap-1.5">
            {socials.map((s) => (
              <Badge key={s.key} tone="muted">
                {s.label}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-xs text-ink-faint">None. Add a link to show its icon.</p>
        )}
      </div>

      <div className="mt-4 space-y-1.5 border-t border-sand-200 pt-4 text-xs text-ink-soft">
        <p>
          <span className="text-ink-muted">Ships in:</span>{' '}
          {Number.isFinite(handling?.min) && Number.isFinite(handling?.max) ? (handling.min === handling.max ? `${handling.min} business days` : `${handling.min}–${handling.max} business days`) : '—'}
        </p>
        <p>
          <span className="text-ink-muted">“Low stock” at:</span> {Number.isFinite(lowStock) ? `${lowStock} units or fewer` : '—'}
        </p>
      </div>
    </Card>
  );
}

function StoreForm({ settings }: { settings: Settings }) {
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: toForm(settings.store) });
  const { register, control, handleSubmit, reset, setError, getValues, formState } = form;
  const [preview, setPreview] = useState<Values | null>(null);
  const openPreview = () => setPreview(getValues());
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
            <Card title={<CardTitle icon={StoreIcon}>Store identity</CardTitle>} description="Your shop's name and logo — what customers see first.">
              <UsedIn places={['Footer', 'Mobile menu', 'Browser tab title']} />
              <div className="space-y-4">
                <TextField label="Store name" required maxLength={60} hint="Your brand name, e.g. “Dignity Art Edge”." error={errors.name?.message} {...register('name')} />
                <LocalizedField name="tagline" label="Tagline" maxLength={120} hint="One short line about your shop, e.g. “Handmade rugs from Jaipur”." />
                <Controller
                  control={control}
                  name="logoId"
                  render={({ field }) => <ImageField label="Logo" value={field.value} onChange={field.onChange} error={errors.logoId?.message} hint="Square image (e.g. 512×512). Saved here, but the storefront currently shows its own built-in logo." />}
                />
              </div>
            </Card>

            <Card title={<CardTitle icon={Phone}>Contact details</CardTitle>} description="How customers can reach you.">
              <UsedIn places={['Footer', 'Contact page']} />
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label="Email" type="email" required autoComplete="off" hint="Shown to customers who want to contact you." error={errors.contact?.email?.message} {...register('contact.email')} />
                <TextField label="Phone" type="tel" autoComplete="off" hint="Optional. Include the country code." placeholder="+91 98765 43210" error={errors.contact?.phone?.message} {...register('contact.phone')} />
                <TextareaField label="Address" rows={2} containerClassName="sm:col-span-2" hint="Your studio or office address (optional)." error={errors.contact?.address?.message} {...register('contact.address')} />
                <LocalizedField name="contact.hours" label="Opening hours" maxLength={120} hint="e.g. “Mon–Sat, 10am–6pm IST”." className="sm:col-span-2" />
              </div>
            </Card>

            <Card title={<CardTitle icon={Share2}>Social links</CardTitle>} description="Paste the full page link (starting with https://). A link left empty hides that icon.">
              <UsedIn places={['Footer']} />
              <div className="grid gap-4 sm:grid-cols-2">
                {SOCIAL.map((s) => (
                  <TextField key={s.key} label={s.label} type="url" inputMode="url" autoComplete="off" placeholder={s.placeholder} error={errors.social?.[s.key]?.message} {...register(`social.${s.key}`)} />
                ))}
              </div>
            </Card>

            <Card title={<CardTitle icon={Truck}>Orders & shipping time</CardTitle>} description="How long you need to pack an order, and how much one customer can buy at once.">
              <div className="mb-4 flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
                <Badge tone="warning">Saved, but not used on the storefront yet</Badge>
                <span>Delivery dates there currently assume 1–2 days handling, and the cart has its own quantity limit.</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <TextField
                  label="Ships within — fastest"
                  hint="Quickest you can dispatch."
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
                  label="Ships within — slowest"
                  hint="Longest it can take."
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
                  label="Max quantity per item"
                  hint="Most units of one product in a cart."
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={99}
                  step={1}
                  error={errors.maxQtyPerLine?.message}
                  {...register('maxQtyPerLine', { setValueAs: num })}
                />
              </div>
              <p className="mt-4 rounded-lg bg-sand-100 px-3 py-2 text-xs text-ink-soft">
                {Number.isFinite(handling?.min) && Number.isFinite(handling?.max)
                  ? `Example: an order placed today is packed and shipped in ${handling.min === handling.max ? handling.min : `${handling.min}–${handling.max}`} business days. `
                  : ''}
                This is added to the courier's transit time (set in{' '}
                <Link to="/settings/shipping" className="link">
                  Shipping settings
                </Link>
                ) to give the delivery date customers see.
              </p>
            </Card>

            <Card title={<CardTitle icon={PackageCheck}>Low-stock alert</CardTitle>} description="When should a product be flagged as running low?">
              <UsedIn places={['Admin: Inventory', 'Admin: Products', 'Admin: Dashboard']} />
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
                hint="A product with this many units or fewer is marked “low stock”. Example: 5 → flagged at 5, 4, 3…"
                {...register('lowStockThreshold', { setValueAs: num })}
              />
              <p className="mt-4 text-xs text-ink-muted">
                Used for the low-stock badges and filters on{' '}
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
            <StorePreview onOpen={openPreview} />
          </div>
        </div>

        <SettingsActionBar
          dirty={isDirty}
          saving={isSubmitting}
          onReset={() => reset()}
          updatedAt={settings.store.updatedAt}
          extra={
            <Button variant="outline" icon={<Eye className="h-4 w-4" aria-hidden />} onClick={openPreview}>
              Preview
            </Button>
          }
        />
        {preview && <StorePreviewModal values={preview} onClose={() => setPreview(null)} />}
      </form>
    </FormProvider>
  );
}

export default function StoreSettingsPage() {
  usePageMeta('Store', [{ label: 'Settings' }]);
  return (
    <ContentLangProvider>
      <PageHeader description="Your shop's basic details: name, logo, contact info, social links and shipping time. Customers see these on your storefront." />
      <SettingsScopeNotice className="mb-5" />
      <SettingsGate>{(settings) => <StoreForm key={settings.store.updatedAt} settings={settings} />}</SettingsGate>
    </ContentLangProvider>
  );
}
