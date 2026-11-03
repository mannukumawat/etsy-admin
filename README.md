# Your Store — admin panel (`admin/`)

Independent React admin for the single-seller "Your Store" shop. The owner manages products, categories, inventory,
orders, customers, coupons, homepage/page content, media and store settings.

> **Demo mode.** Every record lives in an in-memory mock database inside this browser tab. Changes reset on refresh
> (or via **Reset demo data** in the profile menu) and are **not** visible on the storefront. The storefront
> (`../frontend`) is a separate app with its own bundled data; the two will share data only once the backend
> (`../backend`) exists. No payment is real, no email is sent, no file is uploaded.

## Run

Requires Node.js 18+ (tested on Node 24). This project has its own `package.json`, lockfile and `node_modules`;
it imports nothing from `../frontend` or `../backend`.

```bash
cd admin
npm install
npm run dev        # http://localhost:5174 (strict port)
npm test           # unit + service tests (Vitest)
npm run build      # type-check + production build to dist/
npm run preview    # serve dist/ on http://localhost:4174
```

Environment: copy `.env.example` to `.env.local` to override.

| Variable | Used for |
|---|---|
| `VITE_STOREFRONT_URL` | Target of the **View store** link (default `http://localhost:5173`). |
| `VITE_MOCK_FAILURE_RATE` | 0–1 chance that a mock call fails, to test error/retry states. |
| `VITE_API_BASE_URL` | **Unused** while mock mode is active (reserved for the backend phase). |

**Deploy:** `npm run build` outputs a static SPA in `dist/`; configure the host to serve `index.html` for unknown
paths. Deploy it separately from the storefront (for example on an `admin.` subdomain), behind real authentication
once the backend exists.

## Demo sign-in

Open `/login` and click **Fill demo credentials**, or enter:

- Email: `owner@yourstore.example`
- Password: `AdminDemo2026`

This is simulated: no password is stored, the session lives in memory (refresh signs you out), and the route guard
is a UI convenience, **not security**. The real API must authenticate and authorise every admin request.

## Routes and modules

| Route | Module |
|---|---|
| `/login`, `/forgot-password` | Demo sign-in; reset request shows a demo confirmation only |
| `/dashboard` | Paid revenue, orders, AOV, customers, pending fulfilment, low stock, sales chart, top products, recent orders; date range presets + custom range; cards link to filtered lists |
| `/products`, `/products/new`, `/products/:id/edit` | Product list (search, filters, sort, pagination, bulk status, duplicate, archive) and editor (EN/HI content, slug, category, tags, base/sale price in USD, images + alt + ordering, options → variants with SKU/price/stock/images, weight/dimensions/specs, flags, display order, SEO, draft/activate) |
| `/categories` | Create/edit (EN/HI, slug, image, banner, order, active); deleting a used category requires reassigning its products |
| `/inventory` | Variant-level stock, low/out filters, configurable low-stock threshold, adjustments with required reason, history with before/after |
| `/orders`, `/orders/:id` | Order list with payment/fulfilment/currency/date filters; detail with snapshots, totals, rate snapshot, timeline, notes, tracking, valid fulfilment transitions, simulated cancellation/refund/mark-paid |
| `/customers`, `/customers/:id` | Read-only accounts and guest buyers, addresses, order history, spend |
| `/coupons` | Percentage/fixed coupons, dates, minimum order, max discount, usage limits, product/category eligibility, test calculator |
| `/content/homepage` | Announcement, hero, featured collections, featured/bestseller/new-arrival product lists, brand story, newsletter (EN/HI); draft, preview, simulated publish |
| `/content/pages`, `/content/pages/:key` | About, Contact, FAQ, Shipping, Returns, Privacy, Terms (EN/HI); draft/publish; legal pages always flagged as sample drafts |
| `/media` | Media grid, search, local-preview uploads (type/size validated), alt text, usage list, guarded deletion |
| `/settings/store`, `/settings/shipping`, `/settings/tax`, `/settings/currencies`, `/settings/languages` | Store details & limits; zones/methods/rates/unsupported countries; illustrative tax rules; USD base + manual rates; languages + translation completeness |

## Business rules (implemented in `src/utils`, covered by tests)

- **Money.** Catalogue prices, coupon amounts and shipping rates are USD minor units (the storefront's base
  currency). Orders keep their own currency, the charged amounts and the rate captured at checkout
  (`RateSnapshot`); later price or rate changes never alter an order.
- **Fulfilment** `unfulfilled → processing → shipped → delivered`; shipping requires carrier + tracking number;
  fulfilment only advances while payment is `paid` or `partially_refunded`. Orders can be **cancelled** only before
  shipping (optional restock + simulated refund of the remaining paid amount).
- **Payment** is tracked separately: `unpaid`, `paid`, `failed`, `partially_refunded`, `refunded`. Refunds are
  simulated, capped at the remaining paid amount. No status is ever set arbitrarily.
- **Dashboard metrics** are converted to USD per order with each order's own rate snapshot. Paid revenue = gross of
  successfully paid orders − refunds; unpaid/failed orders count as zero; a cancelled and fully refunded order adds
  nothing. Pending fulfilment and stock alerts are current state (not date-filtered). Definitions are shown on the
  dashboard.
- **Products**: unique slug, unique SKUs (within the product and catalogue-wide), no duplicate variant combinations,
  no negative prices/stock/weights, sale price below price; activation also needs an image and descriptions.
  Existing variant stock can only change through inventory adjustments (with a reason); new variants may start with
  initial stock, which is logged.
- **Coupons**: unique code, 0 < percentage ≤ 100, positive fixed amounts, end after start, sensible limits; used
  coupons cannot be deleted (deactivate instead).
- **Customers**: guest orders are grouped by email among guest orders only and are never merged into an account
  automatically, even when the email matches.

## Folder structure

```
src/
  config/      app constants and navigation
  data/        seed builder + copied storefront sources (catalogue, art, countries, EN/HI copy)
  services/    async mock API (api.ts transport, db.ts in-memory store, one service per module)
  utils/       pure business rules (money, dates, product, inventory, coupon, order, metrics, translation, forms)
  store/       zustand: session (memory), display prefs (localStorage: sidebar only), toasts, confirm dialog, page meta
  hooks/       useQuery (cache + invalidation), useListParams (URL list state), usePageMeta, useDialog…
  components/  ui kit (DataTable, FilterBar, forms, LocalizedField, dialogs, badges…), media picker, charts, feature parts
  layouts/     admin shell (sidebar, top bar, demo banner) and auth layout
  pages/       one file per route
  routes/      router + UI route guard
  types/       domain types — also the proposed API contract
```

The seed reuses the storefront's product IDs, variant IDs, SKUs, slugs, prices, stock, category IDs and EN/HI copy
(copied at restructure time). Copies, not imports: `data/catalogSource.ts`, `data/art.ts`, `data/countries.ts`,
`data/contentSource.ts`.

## Mock-data limitations

- In-memory only; refresh resets everything. Only the sidebar collapsed/expanded preference uses `localStorage`.
- Admin and storefront **do not share data**. Publishing, settings and stock changes affect this preview only.
- Uploaded images are `blob:` object URLs in the current tab; nothing is uploaded.
- Payments, refunds and "mark as paid" are simulations; no gateway, no money movement, no customer notifications.
- Seeded orders (≈70 over the last 120 days) are generated relative to today, so dates shift between days.
- Product images are generated SVG illustrations.
- No multi-user/staff roles, audit log beyond order events and stock history, or concurrency control.

## Backend requirements (proposed for `../backend`)

**Model additions vs. the current storefront models** (see `src/types/index.ts`):

- `products`: `status` (draft/active/archived), `seo_title/description` (EN/HI), `tags`, `weight` + unit,
  structured `dimensions` + unit, `specs` (EN/HI label/value), `display_order`, timestamps; images as ordered
  `product_media` rows (media id, alt EN/HI); `variants` with unique `sku`, `price`, `sale_price`, `stock`,
  `option_values`, variant images.
- `categories`: data-driven `id`/unique `slug` (replace the storefront's fixed TypeScript union), image/banner media,
  `display_order`, `is_active`.
- `stock_adjustments`: variant, before, after, delta, reason, note, actor, created_at (append-only).
- `coupons`: code (unique, case-insensitive), type, value, max_discount, min_order, starts_at/ends_at, is_active,
  usage_limit, per_customer_limit, scope + product/category join tables, redemption records.
- `orders`: separate `payment_status` and `fulfilment_status`, `refunded_total`, currency + rate snapshot, line
  snapshots (name, variant label, SKU, unit price, qty, image), shipping method snapshot, tracking (carrier, number,
  url), `order_events` (append-only) and `order_notes` (internal).
- `customers` with addresses; guest orders keep email + address on the order (no automatic account linking).
- `content_documents` (homepage, pages) with `draft` + `published` JSON, `published_at`, `updated_by`.
- `media` (storage key, URL, mime, size, dimensions, alt EN/HI) with reference checks on delete.
- `settings` (store, shipping zones/methods/rates, tax rules + inclusive flag, currencies + manual rates +
  `rates_updated_at`, languages).

**Suggested endpoints**: `/api/admin/{products,categories,inventory,orders,customers,coupons,media,content,settings,dashboard}`
mirroring the service functions in `src/services/*` (each file lists them), plus `POST /api/admin/auth/login` and
`POST /api/payments/webhook`.

**The server must independently validate** prices, sale prices, SKUs/slugs uniqueness, stock (transactional
decrement/restock, never negative), coupon eligibility and limits, shipping eligibility/rates, tax, currency
conversion, and order/payment transitions. Payment success and refunds must come from the payment gateway
(webhooks / verified API calls), never from the client. Uploads need server-side type/size/content checks.

## Future work (not in this phase)

Newsletter subscribers, contact inbox and review moderation (the storefront has no stored submission workflows yet),
returns/RMA, staff accounts and roles, audit log, real media storage/CDN, real payments, email notifications,
storefront ↔ admin integration.
