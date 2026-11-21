# Admin panel — what's built

React + Vite admin for the store owner. Connects to the real backend when `VITE_API_BASE_URL` is set (`.env.local`).
The app refuses to boot without it — there is no fallback to in-browser mock data in the shipped app (the mock
layer under `src/data/` and in `src/services/` is dev/test only).

## Routes (sidebar groups)
**Overview**: `/dashboard` — real metrics (gross/net sales, AOV, orders by status, low/out-of-stock counts, sales-by-day, top products), computed live from orders in the selected date range.

**Catalog**: `/products`, `/products/new`, `/products/:id/edit` (options/variants/images/specs, atomic save), `/categories` (name EN/HI, slug, description, image, banner, order, active), `/inventory` (stock list + adjust with reason/note + history), `/media` (library, uploads).

**Sales**: `/orders`, `/orders/:id` (advance fulfilment, add tracking, cancel+restock, refund, mark paid, notes — state machine enforced server-side), `/orders/payment-recoveries` (paid-but-no-order recoveries), `/customers`, `/customers/:id` (read-only, derived from orders — guest buyers grouped by email, never merged into an account; wallet link), `/wallet/:customerId` (balance, transactions, top-ups; owner credit/debit), `/coupons` (percentage/fixed, scope, limits, dates), `/reviews` (moderation: search/filter by product, status, rating, date; hide/restore with a required reason and history; customer text never modified), `/returns`, `/returns/:id` (approve, pickup, receive, inspect/restock, refund), `/exchanges`, `/exchanges/:id`, `/contacts` (search, read/unread, notes), `/notifications` (inbox, send, history).

**Content**: `/content/homepage` (hero/story/announcement/newsletter, curated featured/bestseller/new-arrival product lists, draft→publish), `/content/pages/*` (7 fixed info/policy pages, same draft→publish lifecycle), `/navigation` (secondary nav row shown site-wide — label EN/HI, link, order, active/inactive), `/collections` (curated landing/listing pages — see below), `/translations` (German/French/Italian/Spanish versions of every store text, with missing-only filter and per-language counts).

**Settings**: `/settings/{store,shipping,tax,currencies}` — store details & limits; shipping zones (1–20) and methods; tax rules with US/IN state lists and case-insensitive matching; USD base with manual/live exchange rates (stale-rate warning after 7 days). Every settings save is recorded in the admin audit log.

## Collections (new)
Distinct from Category: a **Collection** is an admin-curated page (Wedding-Guide-style landing or Top-Gifts-style flat listing) that a product can appear in alongside many others, independent of its one catalog category.

- `/collections` — list, publish/unpublish, delete.
- `/collections/new`, `/collections/:id/edit` — slug (auto from title, editable), title/subtitle/description EN+HI, hero image + hex background color, up to 12 circular links (label, image, destination: category / another collection / any URL), 1–10 named product sections each with an ordered product picker (reuses the same picker as the homepage's featured-products editor).
- A collection with no circles and one section renders as a flat curated listing (Top Gifts); one with circles + several sections renders as a full landing page (Wedding Guide) — same editor and same data model, just populated differently.
- Draft until explicitly published; publishing requires at least one product selected somewhere in the collection.

## Navigation links (new)
`/navigation` — the secondary row under the storefront header (Gifts, Top Gifts, Wedding Guide, etc. in the reference). Each link: label EN/HI, href (site path or full URL), active toggle, manual reorder (up/down).

## Data flow
Every admin page talks to the backend through `src/api/*` client modules and `src/services/*`. No admin action ever silently falls back to mock data when the API is configured but unreachable — it surfaces a real error instead. The mock branches in `src/services/*` run only when `VITE_API_BASE_URL` is unset, which the shipped app never allows (it shows `ConfigurationRequired` instead of booting).

## Auth
Single owner account, httpOnly session cookie, re-verified server-side on every write (not just trusted from the cookie's claims).

## Not built
Multi-vendor/seller concept (intentionally — single-seller only), subcategory management, a UI for configuring a real payment gateway (only the env-var contract exists on the backend), low-stock push/email alerting (threshold + badges + dashboard counts only).
