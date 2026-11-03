import { describe, expect, it } from 'vitest';

/**
 * Regression guard for the admin navigation crash.
 *
 * `useEffect(() => window.scrollTo(0, 0), [pathname])` in AdminLayout crashed the whole admin shell on every
 * navigation: the arrow implicitly returned scrollTo's value (an object in Chromium), React treated it as the
 * effect cleanup and threw "destroy is not a function".
 *
 * TypeScript does not catch this, so this test enforces the rule that makes it impossible: effect callbacks are
 * always written with a braced body, where a cleanup can only be returned deliberately.
 *
 * Uses Vite's import.meta.glob (no Node typings needed).
 */

const sources = import.meta.glob('/src/**/*.{ts,tsx}', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>;

const EXPRESSION_BODY_EFFECT = /use(?:Layout)?Effect\(\s*\(\s*\)\s*=>\s*[^{(\s]/;

describe('effect hygiene', () => {
  it('finds source files to check', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(50);
  });

  it('never gives useEffect an expression body, which React would call as a cleanup', () => {
    const offenders: string[] = [];
    for (const [path, code] of Object.entries(sources)) {
      if (path.endsWith('.test.ts')) continue;
      code.split('\n').forEach((line, i) => {
        if (EXPRESSION_BODY_EFFECT.test(line)) offenders.push(`${path}:${i + 1}  ${line.trim()}`);
      });
    }
    expect(offenders, `Write the effect body in braces so nothing is returned by accident:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('flags the exact pattern that caused the crash', () => {
    // Guards the guard: the matcher must still catch the original line.
    expect(EXPRESSION_BODY_EFFECT.test('  useEffect(() => window.scrollTo(0, 0), [pathname]);')).toBe(true);
    expect(EXPRESSION_BODY_EFFECT.test('  useEffect(() => setOpen(false), [pathname]);')).toBe(true);
    // Correct forms must not be flagged.
    expect(EXPRESSION_BODY_EFFECT.test('  useEffect(() => {')).toBe(false);
    expect(EXPRESSION_BODY_EFFECT.test('  useEffect(() => () => clearTimeout(t), []);')).toBe(false);
  });
});
