import type {
  Address,
  Category,
  Coupon,
  CurrencyConfig,
  Customer,
  HomepageContent,
  Localized,
  MediaAsset,
  Order,
  OrderEvent,
  OrderLine,
  PageDoc,
  PageKey,
  PaymentStatus,
  FulfilmentStatus,
  Product,
  ProductImage,
  ProductOption,
  ProductVariant,
  Settings,
  StockAdjustment,
  Versioned,
} from '@/types';
import { addDays } from '@/utils/dates';
import { makeRng } from '@/utils/misc';
import { roundToIncrement } from '@/utils/money';
import { variantLabel } from '@/utils/productRules';
import { compositeArt, productArt, type ArtSpec } from './art';
import { PRODUCT_SOURCES, type ProductSource, type SourceLocalized } from './catalogSource';
import { HOMEPAGE_SOURCE, PAGE_SOURCES } from './contentSource';
import { COUNTRIES, SHIPPING_ZONES, type ShippingZoneId } from './countries';

// Fictional, internally consistent demo data. Rebuilt on every page load and by "Reset demo data".
// Product ids, variant ids, SKUs, prices and stock match the storefront's sample catalogue at restructure time.

export interface DbState {
  products: Product[];
  categories: Category[];
  media: MediaAsset[];
  adjustments: StockAdjustment[];
  orders: Order[];
  customers: Customer[];
  coupons: Coupon[];
  homepage: Versioned<HomepageContent>;
  pages: PageDoc[];
  settings: Settings;
  seededAt: string;
}

const L = (s: SourceLocalized | Localized | undefined, _hi?: string): Localized => ({ en: s?.en ?? '' });
const OWNER = 'Store Owner (demo)';

// ---------------------------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------------------------

function mediaFrom(id: string, url: string, fileName: string, alt: Localized, createdAt: string, w = 800, h = 800): MediaAsset {
  return { id, url, fileName, mimeType: 'image/svg+xml', sizeBytes: Math.round(url.length * 0.75), width: w, height: h, alt, createdAt, source: 'seed' };
}

const LOGO_SVG =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 64"><rect width="240" height="64" fill="#FBF7F0"/><rect x="8" y="8" width="48" height="48" rx="11" fill="#C04A17"/><path d="M20 22h24l-2.6 20a3.5 3.5 0 0 1-3.5 3H26a3.5 3.5 0 0 1-3.5-3z" fill="#FBF7F0"/><text x="68" y="42" font-family="Georgia,serif" font-size="26" fill="#2B2724">Your Store</text></svg>',
  );

// ---------------------------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------------------------

const CATEGORY_SOURCES: Array<{ id: string; name: Localized; description: Localized; image: ArtSpec; banner: Parameters<typeof compositeArt>[2]; theme: 'warm' | 'sage' | 'soft' }> = [
  {
    id: 'ceramics',
    name: { en: 'Ceramics' },
    description: { en: 'Wheel-thrown mugs, bowls and vases for slower, more meaningful days.' },
    image: { kind: 'bowl', color: '#e9dfcc', seed: 'cat' },
    banner: [
      { spec: { kind: 'bowl', color: '#e9dfcc' }, x: 980, baseY: 360, scale: 0.75 },
      { spec: { kind: 'mug', color: '#e6d3b8' }, x: 1220, baseY: 368, scale: 0.85 },
      { spec: { kind: 'plates', color: '#e8dcc8' }, x: 1440, baseY: 372, scale: 0.6 },
    ],
    theme: 'warm',
  },
  {
    id: 'bags',
    name: { en: 'Bags' },
    description: { en: 'Woven, stitched and block-printed bags made to be carried every day.' },
    image: { kind: 'basketBag', color: '#d2ae72', accent: '#8a5530', seed: 'cat' },
    banner: [
      { spec: { kind: 'basketBag', color: '#d2ae72', accent: '#8a5530' }, x: 1020, baseY: 372, scale: 0.68 },
      { spec: { kind: 'crossbody', color: '#a86b3c' }, x: 1280, baseY: 372, scale: 0.62 },
      { spec: { kind: 'clutch', color: '#f1e9da', accent: '#2f4a7a', pattern: 'print' }, x: 1470, baseY: 372, scale: 0.55 },
    ],
    theme: 'sage',
  },
  {
    id: 'jewellery',
    name: { en: 'Jewellery' },
    description: { en: 'Small-batch brass and silver pieces, hammered and finished by hand.' },
    image: { kind: 'necklace', color: '#c9a04f', seed: 'cat' },
    banner: [
      { spec: { kind: 'candle', color: '#e7dccb', accent: '#8a5a3c' }, x: 1050, baseY: 372, scale: 0.8 },
      { spec: { kind: 'vase', color: '#ede6d8', accent: '#2f4a7a' }, x: 1300, baseY: 372, scale: 0.55 },
      { spec: { kind: 'bowl', color: '#d9c7a8' }, x: 1480, baseY: 372, scale: 0.5 },
    ],
    theme: 'soft',
  },
  {
    id: 'home-decor',
    name: { en: 'Home Decor' },
    description: { en: 'Lamps, cushions, candles and planters that make a house feel lived-in.' },
    image: { kind: 'lamp', color: '#c49a63', seed: 'cat' },
    banner: [
      { spec: { kind: 'planter', color: '#c46a43' }, x: 1000, baseY: 372, scale: 0.5 },
      { spec: { kind: 'lamp', color: '#c49a63' }, x: 1230, baseY: 372, scale: 0.72 },
      { spec: { kind: 'candle', color: '#c9cfc0', accent: '#5c6b4a' }, x: 1450, baseY: 372, scale: 0.7 },
    ],
    theme: 'warm',
  },
];

// ---------------------------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------------------------

type Physical = { l: number | null; w: number | null; h: number | null; g: number | null; specs?: Array<[string, string, string]> };

/** Structured dimensions (cm) and weight (g) derived from the storefront's free-text rows. */
const PHYSICAL: Record<string, Physical> = {
  'p-mug': { l: 12, w: 8.5, h: 9.5, g: 340, specs: [['Capacity', '', '320 ml (11 oz)']] },
  'p-bowl': { l: 15, w: 15, h: 7, g: 420, specs: [['Capacity', '', '600 ml (20 oz)']] },
  'p-vase': { l: 11, w: 11, h: 16, g: 380 },
  'p-plates': { l: 27, w: 27, h: 2.5, g: 1600 },
  'p-teapot': { l: 24, w: 15, h: 15, g: 900, specs: [['Capacity', '', '900 ml (30 oz)']] },
  'p-market-bag': { l: 40, w: 18, h: 32, g: 550 },
  'p-canvas-tote': { l: 36, w: 10, h: 38, g: 300, specs: [['Handle drop', '', '28 cm (11 in)']] },
  'p-crossbody': { l: 24, w: 7, h: 17, g: 450, specs: [['Strap length', '', '110–130 cm']] },
  'p-jute-clutch': { l: 26, w: 4, h: 14, g: 180 },
  'p-print-pouch': { l: 23, w: 2, h: 15, g: 60 },
  'p-leaf-necklace': { l: null, w: null, h: null, g: 6, specs: [['Pendant size', '', '3.5 cm']] },
  'p-hoops': { l: 3, w: 0.3, h: 3, g: 3 },
  'p-moonstone-ring': { l: null, w: null, h: null, g: 3, specs: [['Band width', '', '1.5 mm'], ['Stone size', '', '≈ 5 mm']] },
  'p-bracelet': { l: null, w: null, h: null, g: 20, specs: [['Bead size', '', '8 mm'], ['Wrist size', '', '16–18 cm']] },
  'p-jhumka': { l: null, w: null, h: null, g: 14, specs: [['Drop length', '', '5.5 cm']] },
  'p-lamp': { l: 34, w: 34, h: 45, g: 1800 },
  'p-candle': { l: 8, w: 8, h: 9, g: 420, specs: [['Burn time', '', '≈ 40 h']] },
  'p-cushion': { l: 45, w: 45, h: null, g: 200 },
  'p-macrame': { l: 40, w: 2, h: 65, g: 350, specs: [['Large size', '', '60 × 95 cm']] },
  'p-planter': { l: 14, w: 14, h: 12, g: 600, specs: [['Large size', '', '22 × 19 cm']] },
};

const SCENE_ALT = [
  { en: 'on a wooden table' },
  { en: 'close-up detail' },
  { en: 'styled shot' },
];

function combos(options: ProductSource['options'] = []): Record<string, string>[] {
  return options.reduce<Record<string, string>[]>((acc, o) => acc.flatMap((c) => o.values.map((v) => ({ ...c, [o.id]: v.id }))), [{}]);
}

function buildProduct(src: ProductSource, media: MediaAsset[], rng: () => number, now: Date): Product {
  const options: ProductOption[] = (src.options ?? []).map((o) => ({
    id: o.id,
    name: L(o.name),
    type: o.type,
    values: o.values.map((v) => ({ id: v.id, label: L(v.label), swatch: v.swatch ?? null })),
  }));
  const all = combos(src.options);
  const name = L(src.name);
  const createdAt = new Date(`${src.createdAt}T09:00:00`).toISOString();

  // One media set per distinct art spec (colour variants get their own image).
  const images: ProductImage[] = [];
  const artIds = new Map<string, string[]>();
  let n = 0;
  const addArt = (art: ArtSpec, label: string | null, scenes: Array<0 | 1 | 2>) => {
    const key = JSON.stringify(art);
    if (artIds.has(key)) return artIds.get(key)!;
    const ids = scenes.map((scene) => {
      const id = `m_${src.id.replace('p-', '')}_${++n}`;
      const alt: Localized = {
        en: `${name.en}${label ? ` in ${label}` : ''}, ${SCENE_ALT[scene].en}`,
      };
      media.push(mediaFrom(id, productArt(art, scene), `${src.slug}-${n}.svg`, alt, createdAt));
      images.push({ mediaId: id, alt });
      return id;
    });
    artIds.set(key, ids);
    return ids;
  };

  const colorOption = options.find((o) => o.type === 'swatch');
  const variants: ProductVariant[] = all.map((combo, i) => {
    const art = { ...src.art, ...(src.artFor?.(combo) ?? {}) };
    const colorLabel = colorOption ? colorOption.values.find((v) => v.id === combo[colorOption.id])?.label.en ?? null : null;
    const imageIds = addArt(art, colorLabel, i === 0 ? [0, 1, 2] : [0]);
    const pricing = src.priceFor?.(combo) ?? { price: src.price, salePrice: src.salePrice };
    const values = options.map((o) => combo[o.id]);
    return {
      id: `${src.id}--${values.join('-') || 'default'}`,
      sku: `YS-${src.id.replace('p-', '').toUpperCase()}${values.length ? `-${values.join('-').toUpperCase()}` : ''}`,
      options: combo,
      price: pricing.price,
      salePrice: pricing.salePrice ?? null,
      stock: typeof src.stock === 'number' ? src.stock : src.stock(combo),
      imageIds: colorOption ? imageIds : [],
    };
  });

  const phys = PHYSICAL[src.id] ?? { l: null, w: null, h: null, g: null };
  const hiName = name.hi;
  return {
    id: src.id,
    slug: src.slug,
    status: 'active',
    name,
    shortDescription: L(src.shortDescription),
    description: L(src.description),
    categoryId: src.categoryId,
    tags: src.tags,
    basePrice: src.price,
    baseSalePrice: src.salePrice ?? null,
    images,
    options,
    variants,
    weight: { value: phys.g, unit: 'g' },
    dimensions: { length: phys.l, width: phys.w, height: phys.h, unit: 'cm' },
    specs: (phys.specs ?? []).map(([en, hi, value], i) => ({ id: `spec_${src.id}_${i}`, label: { en, hi }, value: { en: value, hi: value } })),
    materials: L(src.materials),
    care: L(src.care),
    returnsAllowed: true,
    exchangeAllowed: true,
    returnDays: 30,
    isFeatured: !!src.isFeatured,
    isBestseller: !!src.isBestseller,
    isNew: !!src.isNew,
    displayOrder: Math.round(src.featuredRank * 10),
    seo: {
      title: { en: `${name.en} — Handmade | Your Store`.slice(0, 70), hi: rng() > 0.35 && hiName ? `${hiName} | Your Store`.slice(0, 70) : '' },
      description: { en: (src.shortDescription.en ?? '').slice(0, 160) },
    },
    createdAt,
    updatedAt: addDays(now, -Math.floor(rng() * 30)).toISOString(),
  };
}

function extraProducts(media: MediaAsset[], now: Date): Product[] {
  const created = addDays(now, -6).toISOString();
  const archivedAt = addDays(now, -50).toISOString();
  const incenseImg = 'm_incense_1';
  media.push(
    mediaFrom(incenseImg, productArt({ kind: 'bowl', color: '#b98c6a', seed: 'incense' }, 0), 'clay-incense-holder-1.svg', { en: 'Clay incense holder on a wooden table' }, archivedAt),
  );
  const base = {
    tags: [] as string[],
    options: [] as ProductOption[],
    specs: [],
    returnsAllowed: true,
    exchangeAllowed: true,
    returnDays: 30,
    isFeatured: false,
    isBestseller: false,
    isNew: false,
  };
  return [
    {
      ...base,
      id: 'p-table-runner',
      slug: 'linen-table-runner',
      status: 'draft',
      name: { en: 'Linen Table Runner' },
      shortDescription: { en: 'Stonewashed linen runner with a hand-knotted fringe.' },
      description: { en: 'A soft, stonewashed linen runner finished with a hand-knotted fringe. Draft — photography still to come.' },
      categoryId: 'home-decor',
      tags: ['linen', 'table'],
      basePrice: 3800,
      baseSalePrice: null,
      images: [],
      variants: [{ id: 'p-table-runner--default', sku: 'YS-TABLE-RUNNER', options: {}, price: 3800, salePrice: null, stock: 0, imageIds: [] }],
      weight: { value: 250, unit: 'g' },
      dimensions: { length: 180, width: 35, height: null, unit: 'cm' },
      materials: { en: '100% linen' },
      care: { en: 'Machine wash cold, line dry.' },
      displayOrder: 200,
      seo: { title: { en: '' }, description: { en: '' } },
      createdAt: created,
      updatedAt: created,
    },
    {
      ...base,
      id: 'p-incense-holder',
      slug: 'clay-incense-holder',
      status: 'archived',
      name: { en: 'Clay Incense Holder' },
      shortDescription: { en: 'A small hand-pinched holder for incense sticks.' },
      description: { en: 'Discontinued: a small hand-pinched clay dish with a single hole for incense sticks.' },
      categoryId: 'ceramics',
      tags: ['incense'],
      basePrice: 1600,
      baseSalePrice: null,
      images: [{ mediaId: incenseImg, alt: { en: 'Clay incense holder on a wooden table' } }],
      variants: [{ id: 'p-incense-holder--default', sku: 'YS-INCENSE-HOLDER', options: {}, price: 1600, salePrice: null, stock: 5, imageIds: [] }],
      weight: { value: 90, unit: 'g' },
      dimensions: { length: 9, width: 9, height: 2, unit: 'cm' },
      materials: { en: 'Unglazed terracotta' },
      care: { en: 'Wipe clean.' },
      displayOrder: 300,
      seo: { title: { en: '' }, description: { en: '' } },
      createdAt: addDays(now, -200).toISOString(),
      updatedAt: archivedAt,
    },
  ];
}

// ---------------------------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------------------------

const ZONE_NAMES: Record<ShippingZoneId, string> = {
  domestic: 'India (domestic)',
  asia: 'Asia & Middle East',
  europe: 'Europe & UK',
  north_america: 'USA & Canada',
  oceania: 'Australia & New Zealand',
};

const TAX_LABELS: Record<string, string> = {
  IN: 'GST', US: 'Sales tax', CA: 'GST/HST', GB: 'VAT', IE: 'VAT', DE: 'VAT', FR: 'VAT', ES: 'VAT', IT: 'VAT', NL: 'VAT',
  AU: 'GST', NZ: 'GST', JP: 'Consumption tax', SG: 'GST', AE: 'VAT', HK: 'No sales tax',
};

function buildSettings(now: Date): Settings {
  const iso = now.toISOString();
  const currencies: CurrencyConfig[] = [
    { code: 'USD', name: 'US dollar', enabled: true, rate: 1, fractionDigits: 2, roundingIncrement: 1 },
    { code: 'INR', name: 'Indian rupee', enabled: true, rate: 84, fractionDigits: 0, roundingIncrement: 100 },
    { code: 'EUR', name: 'Euro', enabled: true, rate: 0.92, fractionDigits: 2, roundingIncrement: 1 },
    { code: 'GBP', name: 'British pound', enabled: true, rate: 0.78, fractionDigits: 2, roundingIncrement: 1 },
  ];
  return {
    store: {
      name: 'Your Store',
      tagline: { en: 'Thoughtfully made for a kinder, brighter home.' },
      logoId: 'm_logo',
      contact: {
        email: 'hello@yourstore.example',
        phone: '+91 00000 00000',
        address: 'Studio 4, Sample Lane, Jaipur, Rajasthan, India',
        hours: { en: 'Mon–Fri, 10:00–17:00 IST' },
      },
      social: { instagram: '', pinterest: '', facebook: '', youtube: '' },
      handlingDays: { min: 1, max: 2 },
      maxQtyPerLine: 10,
      lowStockThreshold: 5,
      updatedAt: iso,
    },
    shipping: {
      zones: (Object.keys(SHIPPING_ZONES) as ShippingZoneId[]).map((z) => ({
        id: `zone_${z}`,
        name: ZONE_NAMES[z],
        countries: COUNTRIES.filter((c) => c.zone === z).map((c) => c.code),
        standard: { enabled: true, rate: SHIPPING_ZONES[z].standard.price, minDays: SHIPPING_ZONES[z].standard.minDays, maxDays: SHIPPING_ZONES[z].standard.maxDays },
        express: { enabled: true, rate: SHIPPING_ZONES[z].express.price, minDays: SHIPPING_ZONES[z].express.minDays, maxDays: SHIPPING_ZONES[z].express.maxDays },
      })),
      unsupportedMessage: {
        en: 'We don’t ship to this destination yet. Please choose another address.',
      },
      updatedAt: iso,
    },
    tax: {
      pricesIncludeTax: false,
      defaultRate: 0,
      rules: COUNTRIES.filter((c) => c.zone).map((c) => ({
        id: `tax_${c.code}`,
        country: c.code,
        region: '',
        rate: Math.round(c.demoTaxRate * 1000) / 10,
        label: `${TAX_LABELS[c.code] ?? 'Tax'} (illustrative)`,
      })),
      updatedAt: iso,
    },
    currencies: { base: 'USD', currencies, ratesUpdatedAt: '2026-10-01T00:00:00.000Z', updatedAt: iso },
  };
}

// ---------------------------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------------------------

type CustomerSeed = [id: string, name: string, email: string, phone: string, country: string, line1: string, city: string, region: string, postal: string, daysAgo: number, optIn: boolean];

const CUSTOMER_SEEDS: CustomerSeed[] = [
  ['cus_demo', 'Demo Customer', 'demo@yourstore.example', '98765 43210', 'IN', '12 Sample Street, Civil Lines', 'Jaipur', 'Rajasthan', '302006', 352, true],
  ['cus_asha', 'Asha Kapoor', 'asha.kapoor@example.com', '98200 11122', 'IN', '4 Example Road, Kothrud', 'Pune', 'Maharashtra', '411038', 300, true],
  ['cus_rohan', 'Rohan Mehta', 'rohan.mehta@example.com', '99000 22233', 'IN', '77 Sample Layout, Indiranagar', 'Bengaluru', 'Karnataka', '560038', 210, false],
  ['cus_priya', 'Priya Nair', 'priya.nair@example.org', '98190 33344', 'IN', '9 Demo Lane, Bandra West', 'Mumbai', 'Maharashtra', '400050', 160, true],
  ['cus_emily', 'Emily Carter', 'emily.carter@example.com', '512 555 0142', 'US', '210 Example Street', 'Austin', 'Texas', '78701', 240, true],
  ['cus_daniel', 'Daniel Brooks', 'daniel.brooks@example.net', '312 555 0178', 'US', '55 Sample Avenue, Apt 3', 'Chicago', 'Illinois', '60601', 120, false],
  ['cus_olivia', 'Olivia Hughes', 'olivia.hughes@example.com', '07700 900321', 'GB', '18 Example Terrace', 'Leeds', '', 'LS1 4AP', 280, true],
  ['cus_thomas', 'Thomas Green', 'thomas.green@example.org', '07700 900654', 'GB', '3 Sample Mews', 'Bristol', '', 'BS1 5TR', 95, false],
  ['cus_lena', 'Lena Weber', 'lena.weber@example.com', '030 5550 1234', 'DE', 'Beispielstraße 12', 'Berlin', '', '10115', 180, true],
  ['cus_camille', 'Camille Martin', 'camille.martin@example.net', '04 55 50 12 34', 'FR', '8 Rue de l’Exemple', 'Lyon', '', '69002', 75, false],
  ['cus_aoife', 'Aoife Byrne', 'aoife.byrne@example.com', '085 555 0199', 'IE', '21 Sample Quay', 'Dublin', 'Dublin', 'D02 X285', 140, true],
  ['cus_sophie', 'Sophie Tremblay', 'sophie.t@example.org', '416 555 0111', 'CA', '400 Example Blvd', 'Toronto', 'Ontario', 'M5V 2T6', 60, false],
  ['cus_grace', 'Grace Tan', 'grace.tan@example.com', '8555 0123', 'SG', '1 Sample Walk #05-02', '', '', '018956', 45, true],
  ['cus_ben', 'Ben Harris', 'ben.harris@example.net', '0400 555 012', 'AU', '7 Example Parade', 'Bondi', 'New South Wales', '2026', 30, false],
];

/** Guest buyers. One deliberately shares an email with an account and must NOT be merged into it. */
const GUEST_SEEDS: Array<[name: string, email: string, phone: string, country: string, line1: string, city: string, region: string, postal: string]> = [
  ['Meera Shah', 'meera.shah@example.com', '98111 44455', 'IN', '15 Sample Society, Satellite', 'Ahmedabad', 'Gujarat', '380015'],
  ['Jordan Lopez', 'jordan.lopez@example.net', '646 555 0133', 'US', '88 Example Place', 'New York', 'New York', '10001'],
  ['Hana Sato', 'hana.sato@example.org', '03 5555 0100', 'JP', '2-1 Example-cho', 'Tokyo', 'Tokyo', '100-0001'],
  ['Noah Fischer', 'noah.fischer@example.com', '040 5550 7788', 'DE', 'Musterweg 4', 'Hamburg', '', '20095'],
  ['Olivia Hughes', 'olivia.hughes@example.com', '07700 900321', 'GB', '18 Example Terrace', 'Leeds', '', 'LS1 4AP'],
  ['Sam Patel', 'sam.patel@example.org', '07700 900987', 'GB', '42 Sample Road', 'Leicester', '', 'LE1 6RP'],
];

function buildCustomers(): Customer[] {
  return CUSTOMER_SEEDS.map(([id, name, email, phone, country, line1, city, region, postal, daysAgo, optIn]) => ({
    id,
    name,
    email,
    phone,
    createdAt: addDays(new Date(), -daysAgo).toISOString(),
    marketingOptIn: optIn,
    addresses: [
      { id: `${id}_home`, label: 'Home', isDefault: true, fullName: name, phone, country, line1, city: city || undefined, region: region || undefined, postalCode: postal || undefined },
      ...(id === 'cus_demo'
        ? [{ id: 'cus_demo_friend', label: 'Friend (US)', isDefault: false, fullName: 'Alex Example', phone: '415 555 0100', country: 'US', line1: '123 Example Avenue', line2: 'Apt 4', city: 'San Francisco', region: 'California', postalCode: '94107' }]
        : []),
    ],
  }));
}

// ---------------------------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------------------------

const CURRENCY_FOR_COUNTRY: Record<string, string> = { IN: 'INR', GB: 'GBP', DE: 'EUR', FR: 'EUR', IE: 'EUR', NL: 'EUR', ES: 'EUR', IT: 'EUR' };
const CARRIERS: Record<string, string> = { IN: 'India Post (demo)', default: 'Demo Express' };

function countryZone(code: string) {
  const z = COUNTRIES.find((c) => c.code === code)?.zone;
  return z ? SHIPPING_ZONES[z] : null;
}

function buildOrders(products: Product[], customers: Customer[], settings: Settings, now: Date): Order[] {
  const rng = makeRng('orders-v2');
  const pick = <T,>(arr: T[]) => arr[Math.floor(rng() * arr.length)];
  const sellable = products.filter((p) => p.status === 'active');
  const cfg = Object.fromEntries(settings.currencies.currencies.map((c) => [c.code, c]));
  const drafts: Array<Omit<Order, 'id' | 'number'>> = [];

  const COUNT = 72;
  for (let i = 0; i < COUNT; i++) {
    // Spread over ~120 days, slightly denser recently.
    const daysAgo = Math.floor(Math.pow(rng(), 1.25) * 120);
    const created = addDays(now, -daysAgo);
    created.setHours(8 + Math.floor(rng() * 13), Math.floor(rng() * 60), 0, 0);
    if (created > now) created.setTime(now.getTime() - 60 * 60 * 1000);

    // Buyer — 72% accounts, otherwise guests. Index 4 guest shares an account email on purpose.
    let customer: Order['customer'];
    let address: Address;
    if (i % 11 === 3 || i % 17 === 9) {
      const g = GUEST_SEEDS[4];
      customer = { kind: 'guest', customerId: null, name: g[0], email: g[1], phone: g[2] };
      address = { fullName: g[0], phone: g[2], country: g[3], line1: g[4], city: g[5] || undefined, region: g[6] || undefined, postalCode: g[7] || undefined };
    } else if (rng() < 0.72) {
      const c = pick(customers);
      const a = c.addresses.find((x) => x.isDefault) ?? c.addresses[0];
      customer = { kind: 'account', customerId: c.id, name: c.name, email: c.email, phone: c.phone ?? '' };
      const { id: _id, label: _l, isDefault: _d, ...addr } = a;
      address = addr;
    } else {
      const g = pick(GUEST_SEEDS);
      customer = { kind: 'guest', customerId: null, name: g[0], email: g[1], phone: g[2] };
      address = { fullName: g[0], phone: g[2], country: g[3], line1: g[4], city: g[5] || undefined, region: g[6] || undefined, postalCode: g[7] || undefined };
    }

    const currency = CURRENCY_FOR_COUNTRY[address.country] ?? 'USD';
    const c = cfg[currency];
    // Historical rate drifts slightly from today's manual rate, to show that snapshots are preserved.
    const drift = 1 + Math.sin(daysAgo / 17) * 0.012;
    const rate = currency === 'USD' ? 1 : Math.round(c.rate * drift * (currency === 'INR' ? 100 : 10000)) / (currency === 'INR' ? 100 : 10000);
    const conv = (usd: number) => roundToIncrement(usd * rate, c.roundingIncrement);

    // Lines
    const lineCount = rng() < 0.6 ? 1 : rng() < 0.75 ? 2 : 3;
    const used = new Set<string>();
    const lines: OrderLine[] = [];
    while (lines.length < lineCount) {
      const p = pick(sellable);
      const v = pick(p.variants);
      if (used.has(v.id)) continue;
      used.add(v.id);
      const qty = rng() < 0.78 ? 1 : 2;
      const unit = conv(v.salePrice ?? v.price);
      const media = v.imageIds[0] ?? p.images[0]?.mediaId ?? null;
      lines.push({
        productId: p.id,
        variantId: v.id,
        sku: v.sku,
        name: { ...p.name },
        variantLabel: variantLabel(p.options, v),
        imageUrl: media,
        unitPrice: unit,
        quantity: qty,
        lineTotal: unit * qty,
      });
    }
    const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);

    // Coupons
    let couponCode: string | null = null;
    let discount = 0;
    const roll = rng();
    if (daysAgo < 25 && roll < 0.14) {
      couponCode = 'DIWALI15';
      discount = Math.min(roundToIncrement(subtotal * 0.15, c.roundingIncrement), conv(2000));
    } else if (roll < 0.3) {
      couponCode = 'WELCOME10';
      discount = roundToIncrement(subtotal * 0.1, c.roundingIncrement);
    }

    const zone = countryZone(address.country)!;
    const express = rng() < 0.25;
    const method = express ? zone.express : zone.standard;
    const shipping = conv(method.price);
    const taxRule = settings.tax.rules.find((r) => r.country === address.country);
    const taxRate = (taxRule?.rate ?? settings.tax.defaultRate) / 100;
    const tax = roundToIncrement((subtotal - discount) * taxRate, c.roundingIncrement);
    const total = subtotal - discount + shipping + tax;

    // Status by age
    const p = rng();
    // `as` keeps the full union types (the values are reassigned inside `set`).
    let payment = 'paid' as PaymentStatus;
    let fulfilment = 'delivered' as FulfilmentStatus;
    let refundKind = 'none' as 'none' | 'partial' | 'full';
    const set = (pay: PaymentStatus, ful: FulfilmentStatus, refund: typeof refundKind = 'none') => {
      payment = pay;
      fulfilment = ful;
      refundKind = refund;
    };
    if (daysAgo >= 15) {
      if (p < 0.04) set('failed', 'unfulfilled');
      else if (p < 0.1) set('refunded', 'cancelled', 'full');
      else if (p < 0.15) set('partially_refunded', 'delivered', 'partial');
    } else if (daysAgo >= 5) {
      if (p < 0.04) set('failed', 'unfulfilled');
      else if (p < 0.09) set('refunded', 'cancelled', 'full');
      else if (p < 0.6) set('paid', 'shipped');
    } else {
      if (p < 0.12) set('unpaid', 'unfulfilled');
      else if (p < 0.17) set('failed', 'unfulfilled');
      else if (p < 0.55) set('paid', 'unfulfilled');
      else if (p < 0.85) set('paid', 'processing');
      else set('paid', daysAgo >= 2 ? 'shipped' : 'processing');
    }

    // Events with timestamps that never run past "now".
    const at = (hoursAfter: number) => new Date(Math.min(created.getTime() + hoursAfter * 3600 * 1000, now.getTime() - 60 * 1000)).toISOString();
    const events: OrderEvent[] = [];
    const ev = (type: OrderEvent['type'], hours: number, message: string, actor: OrderEvent['actor'] = 'system') =>
      events.push({ id: `ev_${i}_${events.length}`, at: at(hours), type, message, actor });
    const paymentMethod = currency === 'INR' && rng() < 0.5 ? 'upi' : rng() < 0.15 ? 'wallet' : 'card';
    ev('created', 0, 'Order placed on the storefront.', 'customer');
    if (payment === 'failed') ev('payment', 0.05, 'Payment failed (simulated decline).');
    else if (payment === 'unpaid') ev('payment', 0.05, 'Awaiting payment confirmation (simulated UPI pending).');
    else ev('payment', 0.05, `Payment captured — ${paymentMethod.toUpperCase()} (simulated).`);

    const carrier = CARRIERS[address.country] ?? CARRIERS.default;
    const trackingNumber = `DP${String(100000 + i * 7919).slice(-6)}${address.country}`;
    let restocked = false;
    let refundedTotal = 0;
    const reached = (s: FulfilmentStatus) => ['processing', 'shipped', 'delivered'].indexOf(s);
    if (fulfilment === 'cancelled') {
      ev('cancelled', 20, 'Order cancelled at the customer’s request.', 'admin');
      ev('restock', 20.1, 'Items returned to stock.', 'admin');
      restocked = true;
      refundedTotal = total;
      ev('refund', 20.2, `Refunded ${currency} ${(total / 100).toFixed(2)} in full (simulated).`, 'admin');
    } else if (reached(fulfilment) >= 0) {
      ev('fulfilment', 18, 'Marked as processing.', 'admin');
      if (reached(fulfilment) >= 1) {
        ev('tracking', 44, `Tracking added: ${carrier} ${trackingNumber}.`, 'admin');
        ev('fulfilment', 44.1, 'Marked as shipped.', 'admin');
      }
      if (reached(fulfilment) >= 2) ev('fulfilment', 24 * (method.maxDays + 1), 'Marked as delivered.', 'admin');
    }
    if (refundKind === 'partial') {
      refundedTotal = roundToIncrement(lines[0].unitPrice * 0.5, c.roundingIncrement);
      ev('refund', 24 * (method.maxDays + 3), `Partial refund of ${currency} ${(refundedTotal / 100).toFixed(2)} — goodwill for a chipped item (simulated).`, 'admin');
    }

    const shipped = fulfilment === 'shipped' || fulfilment === 'delivered';
    drafts.push({
      createdAt: created.toISOString(),
      updatedAt: events[events.length - 1].at,
      customer,
      shippingAddress: address,
      currency,
      rateSnapshot: { base: 'USD', currency, rate, capturedAt: created.toISOString() },
      lines,
      subtotal,
      discount,
      couponCode,
      shipping,
      tax,
      taxRate,
      taxInclusive: false,
      total,
      refundedTotal,
      shippingMethod: { id: express ? 'express' : 'standard', label: express ? 'Express shipping' : 'Standard shipping', minDays: method.minDays, maxDays: method.maxDays },
      payment: { status: payment, method: paymentMethod, reference: '' },
      fulfilment: {
        status: fulfilment,
        carrier: shipped ? carrier : null,
        trackingNumber: shipped ? trackingNumber : null,
        trackingUrl: shipped ? `https://tracking.example.com/${trackingNumber}` : null,
        restocked,
      },
      events,
      notes:
        i % 13 === 5
          ? [{ id: `note_${i}`, at: at(2), author: OWNER, body: 'Customer asked for gift wrapping — add a handwritten card.' }]
          : i % 19 === 7
            ? [{ id: `note_${i}`, at: at(3), author: OWNER, body: 'Packed with extra padding; second parcel last time arrived chipped.' }]
            : [],
    });
  }

  return drafts
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((d, idx) => {
      const number = `YS-${240101 + idx}`;
      return { ...d, id: `ord_${240101 + idx}`, number, payment: { ...d.payment, reference: `DEMO-PAY-${240101 + idx}` } };
    });
}

// ---------------------------------------------------------------------------------------------
// Coupons, adjustments, content
// ---------------------------------------------------------------------------------------------

function buildCoupons(orders: Order[], now: Date): Coupon[] {
  const used = (code: string) => orders.filter((o) => o.couponCode === code && o.payment.status !== 'failed').length;
  const iso = (d: Date) => d.toISOString();
  const base = { productIds: [] as string[], categoryIds: [] as string[], createdAt: iso(addDays(now, -200)), updatedAt: iso(addDays(now, -20)) };
  return [
    { ...base, id: 'cpn_welcome10', code: 'WELCOME10', description: 'Storefront demo code — 10% off any order.', type: 'percentage', value: 10, maxDiscount: null, minOrder: null, startsAt: null, endsAt: null, isActive: true, usageLimit: null, perCustomerLimit: 1, timesUsed: used('WELCOME10'), scope: 'all' },
    { ...base, id: 'cpn_diwali15', code: 'DIWALI15', description: 'Festival offer: 15% off, capped at $20.', type: 'percentage', value: 15, maxDiscount: 2000, minOrder: 5000, startsAt: iso(addDays(now, -24)), endsAt: iso(addDays(now, 10)), isActive: true, usageLimit: 200, perCustomerLimit: 1, timesUsed: used('DIWALI15'), scope: 'all' },
    { ...base, id: 'cpn_ceramics5', code: 'CERAMICS5', description: '$5 off ceramics over $30.', type: 'fixed', value: 500, maxDiscount: null, minOrder: 3000, startsAt: null, endsAt: null, isActive: true, usageLimit: 100, perCustomerLimit: 2, timesUsed: 0, scope: 'categories', categoryIds: ['ceramics'] },
    { ...base, id: 'cpn_summer20', code: 'SUMMER20', description: 'Expired summer sale.', type: 'percentage', value: 20, maxDiscount: 3000, minOrder: null, startsAt: iso(addDays(now, -150)), endsAt: iso(addDays(now, -100)), isActive: true, usageLimit: null, perCustomerLimit: null, timesUsed: 0, scope: 'all' },
    { ...base, id: 'cpn_lamplove', code: 'LAMPLOVE', description: 'Paused: $15 off the rattan lamp.', type: 'fixed', value: 1500, maxDiscount: null, minOrder: null, startsAt: null, endsAt: null, isActive: false, usageLimit: 50, perCustomerLimit: 1, timesUsed: 0, scope: 'products', productIds: ['p-lamp'] },
  ];
}

function buildAdjustments(products: Product[], now: Date): StockAdjustment[] {
  // Chained backwards from today's stock so before/after values line up with the current level.
  const plan: Array<[variantId: string, entries: Array<[delta: number, reason: StockAdjustment['reason'], note: string, daysAgo: number]>]> = [
    ['p-mug--sand', [[12, 'restock', 'Kiln batch #41 unloaded.', 18], [-1, 'damaged', 'Hairline crack found during packing.', 6]]],
    ['p-bowl--ocean', [[-1, 'damaged', 'Glaze defect.', 12]]],
    ['p-canvas-tote--olive', [[-3, 'correction', 'Cycle count: three short.', 9]]],
    ['p-lamp--default', [[4, 'restock', 'Weaver delivery.', 21], [1, 'returned', 'Unused return, inspected OK.', 3]]],
    ['p-moonstone-ring--7', [[6, 'restock', 'New casting run.', 14]]],
    ['p-candle--vetiver', [[10, 'restock', 'Poured 10 jars.', 5]]],
    ['p-cushion--rust', [[-2, 'damaged', 'Dye bleed — removed from sale.', 26]]],
  ];
  const out: StockAdjustment[] = [];
  for (const [variantId, entries] of plan) {
    const p = products.find((x) => x.variants.some((v) => v.id === variantId));
    const v = p?.variants.find((x) => x.id === variantId);
    if (!p || !v) continue;
    let after = v.stock;
    for (const [delta, reason, note, daysAgo] of [...entries].sort((a, b) => a[3] - b[3])) {
      const before = after - delta;
      out.push({
        id: `adj_${variantId}_${daysAgo}`,
        productId: p.id,
        variantId,
        sku: v.sku,
        productName: p.name.en,
        variantLabel: variantLabel(p.options, v),
        before,
        after,
        delta,
        reason,
        note,
        createdAt: addDays(now, -daysAgo).toISOString(),
        actor: OWNER,
      });
      after = before;
    }
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function buildContent(products: Product[], now: Date): { homepage: Versioned<HomepageContent>; pages: PageDoc[] } {
  const ordered = (filter: (p: Product) => boolean) => products.filter((p) => p.status === 'active' && filter(p)).sort((a, b) => a.displayOrder - b.displayOrder).map((p) => p.id);
  const published = addDays(now, -12).toISOString();
  const home: HomepageContent = {
    announcement: { ...HOMEPAGE_SOURCE.announcement },
    hero: { ...HOMEPAGE_SOURCE.hero, imageId: 'm_hero', ctaHref: '/shop' },
    featuredCategoryIds: ['ceramics', 'bags', 'jewellery', 'home-decor'],
    featuredProductIds: ordered((p) => p.isFeatured).slice(0, 8),
    bestsellerProductIds: ordered((p) => p.isBestseller).slice(0, 4),
    newArrivalProductIds: products.filter((p) => p.status === 'active' && p.isNew).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 4).map((p) => p.id),
    story: { ...HOMEPAGE_SOURCE.story, imageId: 'm_story', ctaHref: '/about' },
    newsletter: { ...HOMEPAGE_SOURCE.newsletter },
  };
  const legal: PageKey[] = ['shipping', 'returns', 'privacy', 'terms'];
  const pages: PageDoc[] = (Object.keys(PAGE_SOURCES) as PageKey[]).map((key) => {
    const content = structuredClone(PAGE_SOURCES[key]);
    const draft = structuredClone(content);
    if (key === 'about') draft.intro = { en: `${content.intro.en} (Draft edit: add the maker’s own story here.)`, hi: content.intro.hi };
    return { key, isLegal: legal.includes(key), draft, published: content, publishedAt: published, updatedAt: key === 'about' ? addDays(now, -1).toISOString() : published, updatedBy: OWNER };
  });
  return {
    homepage: { draft: structuredClone(home), published: home, publishedAt: published, updatedAt: published, updatedBy: OWNER },
    pages,
  };
}

// ---------------------------------------------------------------------------------------------

export function buildSeed(now: Date = new Date()): DbState {
  const rng = makeRng('seed-v2');
  const media: MediaAsset[] = [];
  const longAgo = addDays(now, -365).toISOString();

  media.push(mediaFrom('m_logo', LOGO_SVG, 'your-store-logo.svg', { en: 'Your Store logo' }, longAgo, 240, 64));
  media.push(
    mediaFrom(
      'm_hero',
      compositeArt(1600, 760, [
        { spec: { kind: 'vase', color: '#ede6d8', accent: '#2f4a7a', seed: 'hero' }, x: 1000, baseY: 600, scale: 0.92 },
        { spec: { kind: 'mug', color: '#e6d3b8', seed: 'hero' }, x: 1220, baseY: 612, scale: 1.0 },
        { spec: { kind: 'bowl', color: '#e9dfcc', seed: 'hero' }, x: 1420, baseY: 618, scale: 0.72 },
      ], 'warm', 560),
      'homepage-hero.svg',
      { en: 'Speckled vase, mug and bowl on a sunlit wooden table' },
      longAgo,
      1600,
      760,
    ),
  );
  media.push(
    mediaFrom(
      'm_story',
      compositeArt(1200, 900, [
        { spec: { kind: 'planter', color: '#c46a43', seed: 'story' }, x: 330, baseY: 730, scale: 0.85 },
        { spec: { kind: 'vase', color: '#e9dfcc', accent: '#6f7d5c', seed: 'story' }, x: 640, baseY: 740, scale: 0.8 },
        { spec: { kind: 'bowl', color: '#a9b49a', seed: 'story' }, x: 920, baseY: 748, scale: 0.75 },
      ], 'sage', 680),
      'brand-story.svg',
      { en: 'Terracotta planter, vase and sage bowl in the studio' },
      longAgo,
      1200,
      900,
    ),
  );

  const categories: Category[] = CATEGORY_SOURCES.map((c, i) => {
    media.push(mediaFrom(`m_cat_${c.id}`, productArt(c.image, 0), `category-${c.id}.svg`, { en: `${c.name.en} category image` }, longAgo));
    media.push(mediaFrom(`m_banner_${c.id}`, compositeArt(1600, 420, c.banner, c.theme, 330), `banner-${c.id}.svg`, { en: `${c.name.en} banner` }, longAgo, 1600, 420));
    return {
      id: c.id,
      slug: c.id,
      name: c.name,
      description: c.description,
      imageId: `m_cat_${c.id}`,
      bannerId: `m_banner_${c.id}`,
      displayOrder: (i + 1) * 10,
      isActive: true,
      createdAt: longAgo,
      updatedAt: longAgo,
    };
  });
  categories.push({
    id: 'gift-sets',
    slug: 'gift-sets',
    name: { en: 'Gift Sets' },
    description: { en: 'Planned: curated bundles for festivals and weddings.' },
    imageId: null,
    bannerId: null,
    displayOrder: 50,
    isActive: false,
    createdAt: addDays(now, -8).toISOString(),
    updatedAt: addDays(now, -8).toISOString(),
  });

  const products = [...PRODUCT_SOURCES.map((s) => buildProduct(s, media, rng, now)), ...extraProducts(media, now)];
  const settings = buildSettings(now);
  const customers = buildCustomers();
  const orders = buildOrders(products, customers, settings, now);
  // Order lines reference media ids at build time; resolve them to URLs (snapshots must not depend on media later).
  const urlById = new Map(media.map((m) => [m.id, m.url]));
  orders.forEach((o) => o.lines.forEach((l) => (l.imageUrl = l.imageUrl ? (urlById.get(l.imageUrl) ?? null) : null)));
  const { homepage, pages } = buildContent(products, now);

  return {
    products,
    categories,
    media,
    adjustments: buildAdjustments(products, now),
    orders,
    customers,
    coupons: buildCoupons(orders, now),
    homepage,
    pages,
    settings,
    seededAt: now.toISOString(),
  };
}

