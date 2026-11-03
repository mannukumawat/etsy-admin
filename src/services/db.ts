import { buildSeed, type DbState } from '@/data/seed';

// In-memory "database" for the admin preview. Business records live only here: they are rebuilt on every page
// load and by "Reset demo data". Nothing is written to browser storage, and nothing reaches the storefront.

export const db: DbState = buildSeed();

const listeners = new Set<() => void>();

export function onReset(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetDb(now: Date = new Date()): void {
  Object.assign(db, buildSeed(now));
  listeners.forEach((l) => l());
}

export const ADMIN_ACTOR = 'Store Owner (demo)';

export const nowIso = () => new Date().toISOString();
