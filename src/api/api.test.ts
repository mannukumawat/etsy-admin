import { describe, expect, it } from 'vitest';

/**
 * Guards the API-layer rules that TypeScript cannot enforce:
 *   1. VITE_API_BASE_URL is read in exactly one configuration module.
 *   2. No module hard-codes a backend origin.
 *   3. Every endpoint path is relative and carries the `/api` prefix exactly once.
 */

const sources = import.meta.glob('/src/**/*.{ts,tsx}', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>;
const code = Object.entries(sources).filter(([path]) => !path.endsWith('.test.ts'));

const CONFIG = '/src/api/config.ts';

describe('api layer hygiene', () => {
  it('reads VITE_API_BASE_URL in exactly one place', () => {
    const readers = code.filter(([, src]) => /import\.meta\.env\.VITE_API_BASE_URL/.test(src)).map(([path]) => path);
    expect(readers).toEqual([CONFIG]);
  });

  it('never hard-codes a backend origin outside the config module', () => {
    const offenders = code
      .filter(([path]) => path !== CONFIG)
      .flatMap(([path, src]) =>
        src
          .split('\n')
          .map((line, i) => ({ path, i: i + 1, line }))
          // Allow the storefront link and tracking placeholders; flag API-looking origins.
          .filter(({ line }) => /https?:\/\/localhost:\d+/.test(line) && !/VITE_STOREFRONT_URL|storefrontUrl|tracking\.example/.test(line)),
      )
      .map((o) => `${o.path}:${o.i}  ${o.line.trim()}`);
    expect(offenders, `Use the central client instead of a hard-coded origin:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('uses relative paths with the /api prefix exactly once', () => {
    const paths = code
      .filter(([path]) => path.startsWith('/src/api/'))
      .flatMap(([, src]) => [...src.matchAll(/apiClient\.(?:get|post|put|patch|delete)<[^>]*>\(\s*[`'"]([^`'"]+)[`'"]/g)].map((m) => m[1]));

    expect(paths.length).toBeGreaterThanOrEqual(8);
    for (const p of paths) {
      expect(p, `${p} must be relative`).toMatch(/^\//);
      expect(p, `${p} must start with /api/`).toMatch(/^\/api\//);
      expect(p.match(/\/api\//g)?.length, `${p} repeats the /api prefix`).toBe(1);
    }
  });

  it('builds media URLs from the origin, outside the /api prefix', async () => {
    const { API_BASE_URL, mediaUrl } = await import('./config');
    // /media/:id is an Express route of its own, so it must never pick up the /api prefix.
    expect(mediaUrl('m_1')).toBe(`${API_BASE_URL}/media/m_1`);
    expect(mediaUrl('m_1')).not.toContain('/api/');
    expect(mediaUrl('a b/c')).toContain('a%20b%2Fc');
  });
});
