import type { AdminUser } from '@/types';
import { apiClient, setCsrfToken } from './client';
import type { LoginRequest, OwnerResponse } from './types';

// Auth endpoints. All three pass `skipAuthHandler` so a 401 here resolves locally — a wrong password
// must show on the login form, and logout/me must never re-trigger the global sign-out handler.

export async function login(body: LoginRequest): Promise<AdminUser> {
  const { owner, csrfToken } = await apiClient.post<OwnerResponse>('/api/admin/auth/login', body, { skipAuthHandler: true });
  setCsrfToken(csrfToken);
  return owner;
}

/** Restores a session from the httpOnly cookie after a refresh. Null when signed out. */
export async function fetchCurrentOwner(signal?: AbortSignal): Promise<AdminUser | null> {
  try {
    const { owner, csrfToken } = await apiClient.get<OwnerResponse>('/api/admin/auth/me', { signal, skipAuthHandler: true });
    setCsrfToken(csrfToken);
    return owner;
  } catch {
    setCsrfToken(null);
    return null;
  }
}

export async function logout(): Promise<void> {
  try {
    await apiClient.post<{ ok: true }>('/api/admin/auth/logout', {}, { skipAuthHandler: true });
  } catch {
    // Signing out locally still matters even if the server call fails.
  }
  setCsrfToken(null);
}
