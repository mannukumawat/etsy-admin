import type { CurrencySettings, ShippingSettings, StoreSettings, TaxSettings } from '@/types';
import { apiClient } from './client';
import type { SettingsResponse } from './types';

// Owner-only settings endpoints. One GET combines all five sections; each PUT replaces exactly one,
// matching the five separate admin settings pages.

export function fetchSettings(signal?: AbortSignal): Promise<SettingsResponse> {
  return apiClient.get<SettingsResponse>('/api/admin/settings', { signal });
}

export function updateStoreSettings(input: Omit<StoreSettings, 'updatedAt'>): Promise<SettingsResponse> {
  return apiClient.put<SettingsResponse>('/api/admin/settings/store', input);
}

export function updateShippingSettings(input: Omit<ShippingSettings, 'updatedAt'>): Promise<SettingsResponse> {
  return apiClient.put<SettingsResponse>('/api/admin/settings/shipping', input);
}

export function updateTaxSettings(input: Omit<TaxSettings, 'updatedAt'>): Promise<SettingsResponse> {
  return apiClient.put<SettingsResponse>('/api/admin/settings/tax', input);
}

export function updateCurrencySettings(input: Pick<CurrencySettings, 'currencies'>): Promise<SettingsResponse> {
  return apiClient.put<SettingsResponse>('/api/admin/settings/currencies', input);
}

