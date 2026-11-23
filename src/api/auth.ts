import type { AdminUser } from '@/types';
import { apiClient, setAdminToken, setCsrfToken } from './client';
import type { LoginRequest, OwnerResponse } from './types';

// Auth endpoints. All three pass `skipAuthHandler` so a 401 here resolves locally — a wrong password
// must show on the login form, and logout/me must never re-trigger the global sign-out handler.

export async function login(body: LoginRequest): Promise<AdminUser> {
  const { owner, token, csrfToken } = await apiClient.post<OwnerResponse>('/api/admin/auth/login', body, { skipAuthHandler: true });
  if (token) setAdminToken(token);
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
    setAdminToken(null);
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
  setAdminToken(null);
  setCsrfToken(null);
}

/**
 * Real password reset (C5). The server always answers 200 to avoid revealing whether
 * the email belongs to an admin; `delivered` tells the UI honestly whether an email
 * actually went out (false while the server has no SMTP configured).
 */
export async function requestReset(email: string): Promise<{ delivered: boolean }> {
  return apiClient.post<{ ok: true; delivered: boolean }>('/api/admin/auth/forgot-password', { email }, { skipAuthHandler: true });
}

export async function resetPassword(token: string, password: string): Promise<{ ok: true }> {
  return apiClient.post<{ ok: true }>('/api/admin/auth/reset-password', { token, password }, { skipAuthHandler: true });
}
