// Admin domain types.
//
// These start from the storefront models (frontend/src/types/index.ts) and add what the owner needs to manage
// the shop. They are also the proposed contract for the future Node.js/PostgreSQL API. Additions vs. storefront:
//   - Product: status (draft/active/archived), SEO, tags, weight + structured dimensions, display order,
//     media references instead of inline image URLs, timestamps.
//   - Category: data-driven id/slug (no fixed TypeScript union), image/banner media ids, order, active flag.
//   - Coupon: full model (the storefront only knows one hard-coded code).
//   - Order: separate payment and fulfilment states, refunds, tracking, events and internal notes.
//   - Content (homepage + pages) and settings (store, shipping, tax, currencies) as versioned data.

export type LanguageCode = 'en';
/** Data-driven currency code (seeded: USD, INR, EUR, GBP). */
export type CurrencyCode = string;
/** Customer-facing text, English only (Hindi was removed from the store; `hi` is never sent by the API). */
export type Localized = { en: string; hi?: string };
/** Integer amount in minor units (cents, paise...). Catalogue prices are in the USD base currency. */
export type Minor = number;
export type ISODate = string;

// ---------------------------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------------------------

export interface MediaAsset {
  id: string;
  /** data: URI for seeded art, blob: URL for local uploads (never sent to a server in this phase). */
  url: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  alt: Localized;
  createdAt: ISODate;
  source: 'seed' | 'upload';
}

export interface MediaUsage {
  kind: 'product' | 'variant' | 'category-image' | 'category-banner' | 'homepage-hero' | 'homepage-story' | 'store-logo';
  label: string;
  href: string;
}

// ---------------------------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------------------------

export interface Category {
  id: string;
  slug: string;
  name: Localized;
  description: Localized;
  imageId: string | null;
  bannerId: string | null;
  displayOrder: number;
  isActive: boolean;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface CategoryWithCount extends Category {
  productCount: number;
}

export type ProductStatus = 'draft' | 'active' | 'archived';

export interface ProductImage {
  mediaId: string;
  alt: Localized;
}

export interface OptionValue {
  id: string;
  label: Localized;
  /** CSS colour for swatch options. */
  swatch: string | null;
}

export interface ProductOption {
  id: string;
  name: Localized;
  type: 'swatch' | 'button';
  values: OptionValue[];
}

export interface ProductVariant {
  id: string;
  sku: string;
  /** optionId -> valueId. Empty for products without options. */
  options: Record<string, string>;
  /** USD base currency, minor units. */
  price: Minor;
  salePrice: Minor | null;
  stock: number;
  /** Subset of the product's image media ids shown when this variant is selected. */
  imageIds: string[];
}

export interface ProductSpec {
  id: string;
  label: Localized;
  value: Localized;
}

export type DimensionUnit = 'cm' | 'in';
export type WeightUnit = 'g' | 'kg';

export interface Product {
  id: string;
  slug: string;
  status: ProductStatus;
  name: Localized;
  shortDescription: Localized;
  description: Localized;
  categoryId: string;
  tags: string[];
  /** Default price for new variants (USD minor units). */
  basePrice: Minor;
  baseSalePrice: Minor | null;
  /** Ordered; index 0 is the primary image. */
  images: ProductImage[];
  options: ProductOption[];
  variants: ProductVariant[];
  weight: { value: number | null; unit: WeightUnit };
  dimensions: { length: number | null; width: number | null; height: number | null; unit: DimensionUnit };
  /** Extra rows such as capacity or chain length. */
  specs: ProductSpec[];
  materials: Localized;
  care: Localized;
  returnsAllowed: boolean;
  exchangeAllowed: boolean;
  returnDays: number;
  isFeatured: boolean;
  isBestseller: boolean;
  isNew: boolean;
  /** Lower numbers show first in "featured" sorting. */
  displayOrder: number;
  seo: { title: Localized; description: Localized };
  createdAt: ISODate;
  updatedAt: ISODate;
}

/** Payload for create/update: server owns id and timestamps. */
export type ProductInput = Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'status'>;

// ---------------------------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------------------------

export type AdjustmentReason = 'restock' | 'correction' | 'damaged' | 'returned' | 'order_cancelled' | 'other';
export type AdjustmentMode = 'add' | 'remove' | 'set';

export interface StockAdjustment {
  id: string;
  productId: string;
  variantId: string;
  sku: string;
  productName: string;
  variantLabel: string | null;
  before: number;
  after: number;
  delta: number;
  reason: AdjustmentReason;
  note: string;
  createdAt: ISODate;
  actor: string;
}

export interface InventoryRow {
  productId: string;
  variantId: string;
  sku: string;
  productName: Localized;
  variantLabel: string | null;
  imageUrl: string | null;
  categoryId: string;
  productStatus: ProductStatus;
  stock: number;
  lastAdjustedAt: ISODate | null;
}

// ---------------------------------------------------------------------------------------------
// Orders & customers
// ---------------------------------------------------------------------------------------------

export type FulfilmentStatus = 'unfulfilled' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
export type PaymentStatus = 'unpaid' | 'paid' | 'failed' | 'partially_refunded' | 'refunded';
export type PaymentMethod = 'card' | 'upi' | 'wallet';
export type ShippingMethodId = 'standard' | 'express';

export interface Address {
  fullName: string;
  phone: string;
  country: string;
  line1: string;
  line2?: string;
  city?: string;
  region?: string;
  postalCode?: string;
}

export interface SavedAddress extends Address {
  id: string;
  label: string;
  isDefault: boolean;
}

/** Snapshot of the purchased item at order time — never re-read from the live catalogue. */
export interface OrderLine {
  productId: string;
  variantId: string;
  sku: string;
  name: Localized;
  variantLabel: string | null;
  imageUrl: string | null;
  /** Order currency, minor units, as charged. */
  unitPrice: Minor;
  quantity: number;
  lineTotal: Minor;
}

/** Conversion captured when the order was placed: 1 USD = `rate` units of `currency`. */
export interface RateSnapshot {
  base: 'USD';
  currency: CurrencyCode;
  rate: number;
  capturedAt: ISODate;
}

export type OrderEventType = 'created' | 'payment' | 'fulfilment' | 'tracking' | 'refund' | 'cancelled' | 'restock' | 'note';

export interface OrderEvent {
  id: string;
  at: ISODate;
  type: OrderEventType;
  message: string;
  actor: 'system' | 'customer' | 'admin';
}

export interface OrderNote {
  id: string;
  at: ISODate;
  author: string;
  body: string;
}

export interface Order {
  id: string;
  number: string;
  createdAt: ISODate;
  updatedAt: ISODate;
  customer: {
    kind: 'account' | 'guest';
    /** Set only for account orders. Guest orders are never linked automatically, even if the email matches. */
    customerId: string | null;
    name: string;
    email: string;
    phone: string;
  };
  shippingAddress: Address;
  currency: CurrencyCode;
  rateSnapshot: RateSnapshot;
  lines: OrderLine[];
  subtotal: Minor;
  discount: Minor;
  couponCode: string | null;
  shipping: Minor;
  tax: Minor;
  /** 0–1 */
  taxRate: number;
  taxInclusive: boolean;
  total: Minor;
  refundedTotal: Minor;
  shippingMethod: { id: ShippingMethodId; label: string; minDays: number; maxDays: number };
  payment: { status: PaymentStatus; method: PaymentMethod; reference: string };
  fulfilment: {
    status: FulfilmentStatus;
    carrier: string | null;
    trackingNumber: string | null;
    trackingUrl: string | null;
    /** True once cancelled items were returned to stock. */
    restocked: boolean;
  };
  events: OrderEvent[];
  notes: OrderNote[];
}

// ---------------------------------------------------------------------------------------------
// Returns
// ---------------------------------------------------------------------------------------------

export interface ReturnEvent {
  id: string;
  type: string;
  actor: string;
  message: string | null;
  createdAt: ISODate;
}

export interface ReturnRefund {
  id: string;
  amount: number;
  method: string;
  status: string;
  reference: string | null;
  note: string | null;
  recordedBy: string | null;
  completedAt: ISODate | null;
  failedAt: ISODate | null;
  createdAt: ISODate;
}

export interface ReturnRequest {
  id: string;
  reference: string;
  orderId: string;
  lineId: string;
  variantId: string;
  requestedQty: number;
  approvedQty: number | null;
  receivedQty: number | null;
  acceptedQty: number | null;
  restockQty: number | null;
  reason: string;
  customerNote: string | null;
  adminNote: string | null;
  rejectionReason: string | null;
  photos: string[];
  status: string;
  shippingMethod: string | null;
  customerCarrier: string | null;
  customerTracking: string | null;
  pickupAddress: string | null;
  returnCarrier: string | null;
  returnTracking: string | null;
  refundableAmount: number;
  shippingFee: number;
  refundAmount: number | null;
  returnWindowDays: number;
  requestedAt: ISODate;
  decidedAt: ISODate | null;
  receivedAt: ISODate | null;
  inspectedAt: ISODate | null;
  refundedAt: ISODate | null;
  events: ReturnEvent[];
  refund: ReturnRefund | null;
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  createdAt: ISODate;
  marketingOptIn: boolean;
  addresses: SavedAddress[];
}

export interface CustomerSummary {
  /** Account id, or `guest:<email>` for guest buyers. */
  id: string;
  kind: 'account' | 'guest';
  name: string;
  email: string;
  phone: string | null;
  createdAt: ISODate | null;
  orderCount: number;
  paidOrderCount: number;
  /** Net paid amount converted to USD with each order's own rate snapshot. */
  spentUsd: Minor;
  lastOrderAt: ISODate | null;
}

export interface CustomerDetail {
  summary: CustomerSummary;
  account: Customer | null;
  orders: Order[];
}

// ---------------------------------------------------------------------------------------------
// Coupons
// ---------------------------------------------------------------------------------------------

export type CouponType = 'percentage' | 'fixed';
export type CouponScope = 'all' | 'products' | 'categories';
export type CouponState = 'active' | 'scheduled' | 'expired' | 'inactive' | 'exhausted';

export interface Coupon {
  id: string;
  code: string;
  description: string;
  type: CouponType;
  /** Percentage: 1–100. Fixed: USD minor units. */
  value: number;
  /** Percentage coupons only, USD minor units. */
  maxDiscount: Minor | null;
  /** USD minor units, compared with the eligible subtotal converted to USD. */
  minOrder: Minor | null;
  startsAt: ISODate | null;
  endsAt: ISODate | null;
  isActive: boolean;
  usageLimit: number | null;
  perCustomerLimit: number | null;
  timesUsed: number;
  scope: CouponScope;
  productIds: string[];
  categoryIds: string[];
  createdAt: ISODate;
  updatedAt: ISODate;
}

export type CouponInput = Omit<Coupon, 'id' | 'timesUsed' | 'createdAt' | 'updatedAt'>;

// ---------------------------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------------------------

export interface Versioned<T> {
  draft: T;
  published: T | null;
  publishedAt: ISODate | null;
  updatedAt: ISODate;
  updatedBy: string;
}

export interface HomepageContent {
  announcement: { enabled: boolean; text: Localized };
  hero: { title: Localized; subtitle: Localized; imageId: string | null; ctaLabel: Localized; ctaHref: string };
  featuredCategoryIds: string[];
  featuredProductIds: string[];
  bestsellerProductIds: string[];
  newArrivalProductIds: string[];
  story: { title: Localized; body: Localized; imageId: string | null; ctaLabel: Localized; ctaHref: string };
  newsletter: { title: Localized; body: Localized };
}

export type PageKey = 'about' | 'contact' | 'faq' | 'shipping' | 'returns' | 'privacy' | 'terms';

export interface PageSection {
  id: string;
  heading: Localized;
  body: Localized;
}

export interface PageContent {
  title: Localized;
  intro: Localized;
  sections: PageSection[];
}

export interface PageDoc extends Versioned<PageContent> {
  key: PageKey;
  /** Sample legal/policy text: always shown with a "draft — review before launch" notice. */
  isLegal: boolean;
}

// ---------------------------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------------------------

export interface StoreSettings {
  name: string;
  tagline: Localized;
  logoId: string | null;
  contact: { email: string; phone: string; address: string; hours: Localized };
  social: { instagram: string; pinterest: string; facebook: string; youtube: string };
  handlingDays: { min: number; max: number };
  maxQtyPerLine: number;
  lowStockThreshold: number;
  updatedAt: ISODate;
}

export interface ShippingMethodRate {
  enabled: boolean;
  /** USD minor units. */
  rate: Minor;
  minDays: number;
  maxDays: number;
}

export interface ShippingZone {
  id: string;
  name: string;
  countries: string[];
  standard: ShippingMethodRate;
  express: ShippingMethodRate;
}

export interface ShippingSettings {
  zones: ShippingZone[];
  /** Shown at checkout for countries outside every zone; checkout is blocked for them. */
  unsupportedMessage: Localized;
  updatedAt: ISODate;
}

export interface TaxRule {
  id: string;
  country: string;
  /** Empty = whole country. */
  region: string;
  /** Percent, e.g. 12 for 12%. */
  rate: number;
  label: string;
}

export interface TaxSettings {
  pricesIncludeTax: boolean;
  defaultRate: number;
  rules: TaxRule[];
  updatedAt: ISODate;
}

export interface CurrencyConfig {
  code: CurrencyCode;
  name: string;
  enabled: boolean;
  /** 1 USD = rate units of this currency. Manual and illustrative. */
  rate: number;
  fractionDigits: number;
  /** Converted amounts round to a multiple of this many minor units (INR: 100 = whole rupees). */
  roundingIncrement: number;
}

export interface CurrencySettings {
  base: 'USD';
  currencies: CurrencyConfig[];
  ratesUpdatedAt: ISODate;
  updatedAt: ISODate;
}

export interface Settings {
  store: StoreSettings;
  shipping: ShippingSettings;
  tax: TaxSettings;
  currencies: CurrencySettings;
}

// ---------------------------------------------------------------------------------------------
// Admin + queries
// ---------------------------------------------------------------------------------------------

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: 'owner';
}

export interface ListQuery {
  q?: string;
  page?: number;
  pageSize?: number;
  sort?: string;
  dir?: 'asc' | 'desc';
  filters?: Record<string, string | undefined>;
}

export interface ListResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface DateRange {
  /** Inclusive, YYYY-MM-DD in local time. */
  from: string;
  to: string;
}

export interface DashboardMetrics {
  range: DateRange;
  grossSalesUsd: Minor;
  refundsUsd: Minor;
  netRevenueUsd: Minor;
  totalOrders: number;
  paidOrders: number;
  cancelledOrders: number;
  failedOrders: number;
  aovUsd: Minor;
  customers: number;
  totalRegisteredCustomers: number;
  pendingFulfilment: number;
  lowStockVariants: number;
  outOfStockVariants: number;
  salesSeries: Array<{ date: string; netUsd: Minor; orders: number }>;
  topProducts: Array<{ productId: string; name: Localized; units: number; revenueUsd: Minor }>;
  recentOrders: Order[];
}

