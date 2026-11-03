import { ApiError, type FieldIssue } from '@/services/api';
import { API_BASE_URL, API_MODE, API_TIMEOUT_MS, API_UPLOAD_TIMEOUT_MS } from './config';

// The single HTTP client for the admin. Built on fetch (no second HTTP library), it owns:
//   - joining the base URL with relative paths, keeping the /api prefix exactly once
//   - sending the httpOnly owner session cookie on every call
//   - JSON vs FormData bodies (FormData must set its own multipart boundary)
//   - timeouts and caller cancellation
//   - one ApiError shape, so forms can keep mapping `issues` onto fields
//   - a single session-expiry hook, with no recursive logout or redirect loop

export interface RequestOptions {
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Skip the session-expiry hook. Used by the auth endpoints themselves. */
  skipAuthHandler?: boolean;
}

interface ApiErrorBody {
  error?: { code?: string; message?: string; issues?: FieldIssue[] };
}

const CODES: Record<string, ApiError['code']> = {
  validation: 'validation',
  not_found: 'not_found',
  conflict: 'conflict',
  in_use: 'in_use',
  unauthorized: 'unauthorized',
};

// --- session expiry ------------------------------------------------------------------------------

type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler | null = null;
let handlingUnauthorized = false;

/**
 * Registered once by the app shell. Called when the server rejects a request because the session is
 * gone. Re-entrancy is guarded so a 401 raised *by the handler's own cleanup* cannot loop.
 */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  onUnauthorized = handler;
}

function handleUnauthorized() {
  if (!onUnauthorized || handlingUnauthorized) return;
  handlingUnauthorized = true;
  try {
    onUnauthorized();
  } finally {
    // Release on the next tick so one burst of parallel 401s triggers a single sign-out.
    setTimeout(() => {
      handlingUnauthorized = false;
    }, 0);
  }
}

// --- request -------------------------------------------------------------------------------------

function buildUrl(path: string, query?: RequestOptions['query']): string {
  if (/^https?:\/\//i.test(path)) throw new ApiError('network', 'Call the API with a relative path, not an absolute URL.');
  const relative = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`${API_BASE_URL}${relative}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

const CSRF_COOKIE = 'ys_csrf';
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

async function request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  if (!API_MODE) throw new ApiError('network', 'API mode is off (VITE_API_BASE_URL is not set).');

  const { body, signal, skipAuthHandler } = options;
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const timeoutMs = options.timeoutMs ?? (isForm ? API_UPLOAD_TIMEOUT_MS : API_TIMEOUT_MS);

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;
  // The backend double-submits this cookie as a header on every mutating request from a signed-in
  // owner session (see backend/src/csrf.ts) — a no-op before login has issued the csrf cookie.
  const csrfToken = MUTATING_METHODS.has(method) ? readCookie(CSRF_COOKIE) : null;

  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method,
      // The owner session is an httpOnly cookie, so credentials must be sent on every call.
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        // Deliberately NOT set for FormData: the browser must add its own multipart boundary.
        ...(body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : {}),
        ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
      },
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    if (signal?.aborted) throw new ApiError('network', 'Request cancelled.');
    if ((e as Error)?.name === 'AbortError') throw new ApiError('network', 'The API took too long to respond.');
    throw new ApiError('network', `Can’t reach the API at ${API_BASE_URL}. Is the backend running (npm run dev in backend/)?`);
  } finally {
    if (timer) clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }

  if (!response.ok) {
    const err = (parsed as ApiErrorBody | null)?.error;
    const code = CODES[err?.code ?? ''] ?? (response.status === 401 ? 'unauthorized' : 'network');
    // Only an *expired* session triggers the global handler. A failed sign-in is also 401, but it must
    // show its own error on the login form instead of bouncing the user anywhere.
    if (code === 'unauthorized' && !skipAuthHandler) handleUnauthorized();
    throw new ApiError(code, err?.message ?? `The API returned ${response.status}.`, err?.issues ?? [], err?.issues);
  }

  return parsed as T;
}

export const apiClient = {
  get: <T>(path: string, options?: RequestOptions) => request<T>('GET', path, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('POST', path, { ...options, body: body ?? {} }),
  put: <T>(path: string, body: unknown, options?: RequestOptions) => request<T>('PUT', path, { ...options, body }),
  patch: <T>(path: string, body: unknown, options?: RequestOptions) => request<T>('PATCH', path, { ...options, body }),
  delete: <T>(path: string, options?: RequestOptions) => request<T>('DELETE', path, options),
};
