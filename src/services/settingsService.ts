import { COUNTRIES } from '@/data/countries';
import type { AdminUser, CurrencySettings, DashboardMetrics, DateRange, Settings, ShippingSettings, StoreSettings, TaxSettings } from '@/types';
import { isValidRange } from '@/utils/dates';
import { computeDashboard } from '@/utils/metrics';
import { isHttpUrl } from '@/utils/misc';
import { ApiError, mockRequest, validationError, type FieldIssue } from './api';
import { API_MODE, authApi, dashboardApi, settingsApi } from '@/api';
import { db, nowIso, resetDb } from './db';

// Settings affect admin previews and calculations only. The storefront reads its own bundled config until
// the backend integration phase. Future API: GET/PUT /api/admin/settings/{store,shipping,tax,currencies}.

const COUNTRY_CODES = new Set(COUNTRIES.map((c) => c.code));
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const int = (n: number, min: number, max: number) => Number.isInteger(n) && n >= min && n <= max;

function fail(issues: FieldIssue[]) {
  if (issues.length) throw validationError(issues);
}

export const settingsService = {
  get(): Promise<Settings> {
    if (API_MODE) return settingsApi.fetchSettings();
    return mockRequest(() => db.settings, [100, 250]);
  },

  updateStore(input: Omit<StoreSettings, 'updatedAt'>): Promise<StoreSettings> {
    if (API_MODE) return settingsApi.updateStoreSettings(input).then((s) => s.store);
    return mockRequest(() => {
      const issues: FieldIssue[] = [];
      if (!input.name.trim() || input.name.length > 60) issues.push({ path: 'name', message: 'Store name is required (max 60 characters).' });
      if (!EMAIL_RE.test(input.contact.email)) issues.push({ path: 'contact.email', message: 'Enter a valid email address.' });
      for (const [k, v] of Object.entries(input.social)) if (v && !isHttpUrl(v)) issues.push({ path: `social.${k}`, message: 'Use a full https:// URL or leave empty.' });
      if (!int(input.handlingDays.min, 0, 30)) issues.push({ path: 'handlingDays.min', message: '0–30 days.' });
      if (!int(input.handlingDays.max, 0, 30)) issues.push({ path: 'handlingDays.max', message: '0–30 days.' });
      else if (input.handlingDays.max < input.handlingDays.min) issues.push({ path: 'handlingDays.max', message: 'Maximum must be at least the minimum.' });
      if (!int(input.maxQtyPerLine, 1, 99)) issues.push({ path: 'maxQtyPerLine', message: 'Use a whole number from 1 to 99.' });
      if (!int(input.lowStockThreshold, 0, 1000)) issues.push({ path: 'lowStockThreshold', message: 'Use a whole number from 0 to 1,000.' });
      if (input.logoId && !db.media.some((m) => m.id === input.logoId)) issues.push({ path: 'logoId', message: 'Selected logo no longer exists.' });
      fail(issues);
      db.settings.store = { ...input, name: input.name.trim(), updatedAt: nowIso() };
      return db.settings.store;
    });
  },

  setLowStockThreshold(value: number): Promise<StoreSettings> {
    if (API_MODE) {
      return settingsApi
        .fetchSettings()
        .then(({ store }) => settingsApi.updateStoreSettings({ ...store, lowStockThreshold: value }))
        .then((s) => s.store);
    }
    return mockRequest(() => {
      if (!int(value, 0, 1000)) throw validationError([{ path: 'lowStockThreshold', message: 'Use a whole number from 0 to 1,000.' }]);
      db.settings.store = { ...db.settings.store, lowStockThreshold: value, updatedAt: nowIso() };
      return db.settings.store;
    });
  },

  updateShipping(input: Omit<ShippingSettings, 'updatedAt'>): Promise<ShippingSettings> {
    if (API_MODE) return settingsApi.updateShippingSettings(input).then((s) => s.shipping);
    return mockRequest(() => {
      const issues: FieldIssue[] = [];
      const names = new Set<string>();
      const owner = new Map<string, string>();
      input.zones.forEach((z, i) => {
        const name = z.name.trim().toLowerCase();
        if (!name) issues.push({ path: `zones.${i}.name`, message: 'Zone name is required.' });
        else if (names.has(name)) issues.push({ path: `zones.${i}.name`, message: 'Zone names must be unique.' });
        names.add(name);
        if (!z.countries.length) issues.push({ path: `zones.${i}.countries`, message: 'Add at least one country.' });
        z.countries.forEach((c) => {
          if (!COUNTRY_CODES.has(c)) issues.push({ path: `zones.${i}.countries`, message: `Unknown country ${c}.` });
          else if (owner.has(c)) issues.push({ path: `zones.${i}.countries`, message: `${c} is already in "${owner.get(c)}".` });
          owner.set(c, z.name);
        });
        if (!z.standard.enabled && !z.express.enabled) issues.push({ path: `zones.${i}.standard.enabled`, message: 'Enable at least one method.' });
        for (const m of ['standard', 'express'] as const) {
          const r = z[m];
          if (!int(r.rate, 0, 1_000_000)) issues.push({ path: `zones.${i}.${m}.rate`, message: 'Rate cannot be negative.' });
          if (!int(r.minDays, 0, 90)) issues.push({ path: `zones.${i}.${m}.minDays`, message: '0–90 days.' });
          if (!int(r.maxDays, 0, 90) || r.maxDays < r.minDays) issues.push({ path: `zones.${i}.${m}.maxDays`, message: 'Must be ≥ minimum (max 90).' });
        }
      });
      if (!input.unsupportedMessage.en.trim()) issues.push({ path: 'unsupportedMessage.en', message: 'English message is required.' });
      fail(issues);
      db.settings.shipping = { ...structuredClone(input), updatedAt: nowIso() };
      return db.settings.shipping;
    });
  },

  updateTax(input: Omit<TaxSettings, 'updatedAt'>): Promise<TaxSettings> {
    if (API_MODE) return settingsApi.updateTaxSettings(input).then((s) => s.tax);
    return mockRequest(() => {
      const issues: FieldIssue[] = [];
      const seen = new Set<string>();
      if (!(input.defaultRate >= 0 && input.defaultRate <= 50)) issues.push({ path: 'defaultRate', message: '0–50%.' });
      input.rules.forEach((r, i) => {
        if (!COUNTRY_CODES.has(r.country)) issues.push({ path: `rules.${i}.country`, message: 'Choose a country.' });
        const key = `${r.country}|${r.region.trim().toLowerCase()}`;
        if (seen.has(key)) issues.push({ path: `rules.${i}.region`, message: 'Duplicate country/region rule.' });
        seen.add(key);
        if (!(Number.isFinite(r.rate) && r.rate >= 0 && r.rate <= 50)) issues.push({ path: `rules.${i}.rate`, message: '0–50%.' });
        if (!r.label.trim()) issues.push({ path: `rules.${i}.label`, message: 'Label is required.' });
      });
      fail(issues);
      db.settings.tax = { ...structuredClone(input), updatedAt: nowIso() };
      return db.settings.tax;
    });
  },

  updateCurrencies(input: Pick<CurrencySettings, 'currencies'>): Promise<CurrencySettings> {
    if (API_MODE) return settingsApi.updateCurrencySettings(input).then((s) => s.currencies);
    return mockRequest(() => {
      const issues: FieldIssue[] = [];
      const prev = db.settings.currencies;
      input.currencies.forEach((c, i) => {
        if (c.code === 'USD') {
          if (c.rate !== 1) issues.push({ path: `currencies.${i}.rate`, message: 'USD is the base currency; its rate is always 1.' });
          if (!c.enabled) issues.push({ path: `currencies.${i}.enabled`, message: 'The base currency cannot be disabled.' });
        }
        if (!(Number.isFinite(c.rate) && c.rate > 0 && c.rate <= 100000)) issues.push({ path: `currencies.${i}.rate`, message: 'Rate must be a positive number.' });
      });
      if (input.currencies.length !== prev.currencies.length || input.currencies.some((c, i) => c.code !== prev.currencies[i].code)) {
        issues.push({ path: 'currencies', message: 'Adding or removing currencies is not supported in this preview.' });
      }
      fail(issues);
      const ratesChanged = input.currencies.some((c, i) => c.rate !== prev.currencies[i].rate);
      const now = nowIso();
      db.settings.currencies = { ...prev, currencies: structuredClone(input.currencies), ratesUpdatedAt: ratesChanged ? now : prev.ratesUpdatedAt, updatedAt: now };
      return db.settings.currencies;
    });
  },


};

export const dashboardService = {
  metrics(range: DateRange): Promise<DashboardMetrics> {
    if (API_MODE) return dashboardApi.fetchDashboard(range);
    return mockRequest(() => {
      if (!isValidRange(range)) throw validationError([{ path: 'range', message: 'Start date must be on or before the end date.' }]);
      return computeDashboard(db.orders, db.products, range, db.settings.store.lowStockThreshold, db.customers.length);
    }, [250, 550]);
  },
};

// ---------------------------------------------------------------------------------------------
// Demo admin access — SIMULATED. Not security: route guards in the browser can always be bypassed.
// ---------------------------------------------------------------------------------------------

export const DEMO_ADMIN = { email: 'owner@yourstore.example', password: 'AdminDemo2026' } as const;

export const authService = {
  login(email: string, password: string): Promise<AdminUser> {
    if (API_MODE) {
      // The server sets an httpOnly session cookie; the browser never sees the token.
      return authApi.login({ email, password });
    }
    return mockRequest(() => {
      if (email.trim().toLowerCase() !== DEMO_ADMIN.email || password !== DEMO_ADMIN.password) {
        throw new ApiError('unauthorized', 'Email or password is incorrect. Use the demo admin credentials shown on this page.');
      }
      return { id: 'admin_owner', name: 'Store Owner', email: DEMO_ADMIN.email, role: 'owner' as const };
    }, [400, 800]);
  },

  requestReset(_email: string): Promise<void> {
    return mockRequest(() => undefined, [400, 800]);
  },

  /** Restores a session from the httpOnly cookie after a refresh. Null when signed out. */
  me(): Promise<AdminUser | null> {
    if (!API_MODE) return Promise.resolve(null);
    return authApi.fetchCurrentOwner();
  },

  logout(): Promise<void> {
    if (!API_MODE) return Promise.resolve();
    return authApi.logout();
  },
};

export const demoService = {
  reset(): Promise<void> {
    return mockRequest(() => resetDb(), [300, 600]);
  },
};
