// The ONE place this app reads its backend URL. Nothing else should touch import.meta.env for the API,
// and no module should hard-code a backend origin.
//
// API mode is explicit: on only when VITE_API_BASE_URL is set. When it is on there is no silent
// fallback to the in-memory demo data — pretending a save succeeded would be worse than failing.

const RAW = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ?? '';

/** Backend origin without a trailing slash, e.g. "http://localhost:4000". Empty in demo mode. */
export const API_BASE_URL = RAW.replace(/\/+$/, '');

/** Unit tests exercise the in-memory services, so API mode is always off under Vitest. */
export const API_MODE = API_BASE_URL.length > 0 && import.meta.env?.MODE !== 'test';

/** How long a request may run before it is aborted. Uploads get longer (see client.ts). */
export const API_TIMEOUT_MS = 20_000;
export const API_UPLOAD_TIMEOUT_MS = 60_000;

/**
 * Images are served by Express from `/media/:id`, which sits OUTSIDE the `/api` prefix, so it is built
 * from the origin directly. The API returns absolute URLs already; this is for id-only cases.
 */
export const mediaUrl = (id: string) => `${API_BASE_URL}/media/${encodeURIComponent(id)}`;

/** Label for the mode banner in the admin shell. */
export const apiModeLabel = () => (API_MODE ? `Live API — ${API_BASE_URL}` : 'Demo data — in-memory, resets on refresh');
