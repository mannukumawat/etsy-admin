# Your Store — admin panel (`admin/`)

Independent React admin for the single-seller "Your Store" shop. The owner manages products, categories, inventory,
orders, customers, coupons, homepage/page content, media, returns, exchanges and store settings.

> **Live API mode.** The admin talks to the real backend (`../backend`, MySQL) through `VITE_API_BASE_URL`. The app
> refuses to boot without it (`main.tsx` renders `ConfigurationRequired`) — there is no silent fallback to demo data
> in the shipped app. The in-memory mock layer under `src/data/` and the mock branches in `src/services/` still exist
> for tests and local development only; they are unreachable in production builds.

## Run

Requires Node.js 18+ (tested on Node 24). This project has its own `package.json`, lockfile and `node_modules`;
it imports nothing from `../frontend` or `../backend`.

```bash
cd admin
npm install
npm run dev        # http://localhost:5174 (strict port)
npm test           # unit + service tests (Vitest)
npm run typecheck  # tsc --noEmit
npm run lint       # ESLint
npm run build      # vite build only (production bundle to dist/)
npm run preview    # serve dist/ on http://localhost:4174
```

Environment: copy `.env.example` to `.env.local` to override.

| Variable | Used for |
|---|---|
| `VITE_API_BASE_URL` | **Required.** Base URL of the backend, e.g. `http://localhost:4000` locally. Without it the admin does not boot. |
| `VITE_STOREFRONT_URL` | Target of the **View store** link (default `http://localhost:5173`). |
| `VITE_MOCK_FAILURE_RATE` | 0–1 chance that a *mock* (dev/test-only) service call fails, to exercise error/retry states. Has no effect on live API calls. |

**Deploy:** `npm run build` outputs a static SPA in `dist/`; configure the host to serve `index.html` for unknown
paths. Deploy it separately from the storefront (for example on an `admin.` subdomain).

## Sign-in

Open `/login` and sign in with the owner account. Authentication is a server session: an httpOnly cookie plus a
CSRF double-submit token, verified server-side on every admin request. Forgot your password? `/forgot-password`
sends a real reset link by email (the backend issues a one-hour token). There are no demo credentials in the
shipped app — demo sign-in exists only in development builds (`vite dev`, Vitest) for local testing.

## Routes

| Route | Module |
|---|---|
| `/login`, `/forgot-password`, `/reset-password` | Owner sign-in; email password reset |
| `/dashboard` | Paid revenue, orders, AOV, customers, pending fulfilment, low stock, sales chart, top products, recent orders; date range presets + custom range; cards link to filtered lists |
| `/products`, `/products/new`, `/products/:id/edit` | Product list (search, filters, sort, server pagination, bulk status, duplicate, archive) and editor (EN/HI content, slug, category, tags, base/sale price in USD, images + alt + ordering, options → variants with SKU/price/stock/images, weight/dimensions/specs, flags, display order, SEO, draft/activate) |
| `/categories` | Create/edit (EN/HI, slug, image, banner, order, active); deleting a used category requires reassigning its products |
| `/item-groups` | Item groups shown on the storefront, with product deep-links |
| `/inventory` | Variant-level stock, low/out filters, configurable low-stock threshold, adjustments with required reason, adjustment history (server-paged, filterable, CSV export, per-variant deep links, bulk adjust). Stock per variant is capped at 100,000 units. |
| `/orders`, `/orders/:id` | Order list (server pagination/filtering) and detail with snapshots, totals, rate snapshot, timeline, notes, tracking, valid fulfilment transitions, cancel (+restock/refund), real refunds, mark-paid |
| `/orders/payment-recoveries` | Paid-but-no-order recoveries (charged customers with no order row) |
| `/customers`, `/customers/:id` | Read-only accounts and guest buyers, addresses, order history, spend; wallet link on the detail page |
| `/wallet/:customerId` | Customer wallet: balance, transactions and top-ups; owner credit/debit with a reason |
| `/coupons` | Percentage/fixed coupons, dates, minimum order, max discount, usage limits, product/category eligibility, test calculator |
| `/reviews` | Review moderation: search/filter by product, status, rating, date; hide/restore with a required reason and history |
| `/contacts` | Contact inbox: search, read/unread, internal notes, delete |
| `/help-center` | Help categories and articles |
| `/returns`, `/returns/:id` | Returns list (status tabs, search, pagination) and detail workflow: approve, arrange pickup, receive, inspect/restock, refund |
| `/exchanges`, `/exchanges/:id` | Exchange requests and their fulfilment |
| `/notifications` | Owner notification inbox, mark-read, send to a customer or broadcast, history |
| `/content/homepage` | Announcement, hero, slider banners, featured collections, featured/bestseller/new-arrival product lists, brand story, newsletter; draft, preview, publish |
| `/content/pages`, `/content/pages/:key` | About, Contact, FAQ, Shipping, Returns, Privacy, Terms (EN/HI); draft/publish; legal pages always flagged as sample drafts |
| `/media` | Media library (Cloudinary-backed uploads), search, alt text, usage list, guarded deletion |
| `/navigation` | Secondary nav links shown on the storefront, with manual reorder |
| `/collections`, `/collections/new`, `/collections/:id/edit` | Curated collection pages (hero, circular links, product sections), publish/unpublish |
| `/translations` | German/French/Italian/Spanish versions of store text, with missing-only filter and per-language counts |
| `/settings/store`, `/settings/shipping`, `/settings/tax`, `/settings/currencies` | Store details & limits; shipping zones/methods/rates (1–20 zones); tax rules (region lists for US/IN states); USD base + manual/live exchange rates. Every save is written to the admin audit log. |

## Business rules (implemented in `src/utils`, covered by tests)

- **Money.** Catalogue prices, coupon amounts and shipping rates are USD minor units (the storefront's base
  currency). Orders keep their own currency, the charged amounts and the rate captured at checkout
  (`RateSnapshot`); later price or rate changes never alter an order.
- **Fulfilment** `unfulfilled → processing → shipped → delivered`; shipping requires carrier + tracking number;
  fulfilment only advances while payment is `paid` or `partially_refunded`. Orders can be **cancelled** only before
  shipping (optional restock + refund of the remaining paid amount). An order cancelled without restock can be
  restocked later from the order page ("Restock now").
- **Payment** is tracked separately: `unpaid`, `paid`, `failed`, `partially_refunded`, `refunded`. Refunds go through
  the payment provider (Razorpay) for card/UPI orders, or back to the customer wallet for wallet orders; manual
  bank/UPI refunds are recorded and verified before the order totals move. No status is ever set arbitrarily.
- **Dashboard metrics** are converted to USD per order with each order's own rate snapshot. Paid revenue = gross of
  successfully paid orders − refunds; unpaid/failed orders count as zero; a cancelled and fully refunded order adds
  nothing. Pending fulfilment and stock alerts are current state (not date-filtered). Definitions are shown on the
  dashboard. Low/out-of-stock counts exclude archived products.
- **Products**: unique slug, unique SKUs (within the product and catalogue-wide), no duplicate variant combinations,
  no negative prices/stock/weights, sale price below price; activation also needs an image and descriptions.
  Existing variant stock can only change through inventory adjustments (with a reason); new variants may start with
  initial stock, which is logged. Stock adjustments are race-safe (a stale page gets a 409 and must refresh).
- **Coupons**: unique code, 0 < percentage ≤ 100, positive fixed amounts, end after start, sensible limits; used
  coupons cannot be deleted (deactivate instead).
- **Customers**: guest orders are grouped by email among guest orders only and are never merged into an account
  automatically, even when the email matches.
- **Settings**: every settings save is recorded in the admin audit log (`admin_audit_log`) with the owner, the
  section changed and a short summary. Tax region matching is case-insensitive, and US/Indian regions are picked
  from the state list. Currency rates older than 7 days are flagged on the Currencies page.

## Folder structure

```src/
  api/         one module per backend resource (+ index.ts barrel, client, config)
  config/      app constants and navigation
  data/        seed builder + copied storefront sources (catalogue, art, countries, EN/HI copy) — dev/test only
  services/    service layer (live API in API mode, in-memory mock otherwise — mock is dev/test only)
  utils/       pure business rules (money, dates, product, inventory, coupon, order, metrics, translation, forms)
  store/       zustand: session (memory), display prefs (localStorage: sidebar only), toasts, confirm dialog, page meta
  hooks/       useQuery (cache + invalidation), useListParams (URL list state), usePageMeta, useDialog…
  components/  ui kit (DataTable, FilterBar, forms, LocalizedField, dialogs, badges…), media picker, charts, feature parts
  layouts/     admin shell (sidebar, top bar) and auth layout
  pages/       one file per route
  routes/      router + owner-only route guard
  types/       domain types — also the API contract
```

The seed reuses the storefront's product IDs, variant IDs, SKUs, slugs, prices, stock, category IDs and EN/HI copy
(copied at restructure time). Copies, not imports: `data/catalogSource.ts`, `data/art.ts`, `data/countries.ts`,
`data/contentSource.ts`.

## Mock-data limitations (dev/test only)

- In-memory only; refresh resets everything. Only the sidebar collapsed/expanded preference uses `localStorage`.
- The mock layer is unreachable in production builds (the app does not boot without `VITE_API_BASE_URL`).
- Seeded orders (≈70 over the last 120 days) are generated relative to today, so dates shift between days.
- Product images are generated SVG illustrations.
- No multi-user/staff roles. The audit log covers settings changes, destructive product actions and wallet
  adjustments; order events and stock history are the per-record audit trails.

## Backend

The backend lives in `../backend` (Express + Prisma + MySQL). It independently validates prices, sale prices,
SKUs/slugs uniqueness, stock (transactional decrement/restock, never negative), coupon eligibility and limits,
shipping eligibility/rates, tax, currency conversion, and order/payment transitions. Payment success and refunds
come from the payment gateway (webhooks / verified API calls), never from the client. Uploads need server-side
type/size/content checks.

## Future work

Newsletter subscribers management, staff accounts and roles, low-stock push/email alerting, real email
notifications for order status changes.
