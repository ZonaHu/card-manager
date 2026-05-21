// Mirror of server/lib/categorizationRules.js — pure rule application.
// Tested here so we can use vitest's TS pipeline. Server code uses the same
// algorithm via the .js module.

import { describe, it, expect } from 'vitest';

interface Rule { pattern: string; category: string; }

function applyRules(description: string | null | undefined, rules: Rule[] | null | undefined): string | null {
  if (!description || !rules || rules.length === 0) return null;
  const lower = description.toLowerCase();
  for (const r of rules) {
    if (!r.pattern) continue;
    if (lower.includes(String(r.pattern).toLowerCase())) {
      return r.category;
    }
  }
  return null;
}

describe('applyRules', () => {
  it('returns null when no rules match', () => {
    expect(applyRules('COFFEE SHOP', [{ pattern: 'NETFLIX', category: 'Entertainment' }])).toBeNull();
  });

  it('matches by case-insensitive substring', () => {
    expect(applyRules('netflix.com payment 12345',
      [{ pattern: 'NETFLIX', category: 'Entertainment' }])).toBe('Entertainment');
  });

  it('first matching rule wins (ordering-dependent)', () => {
    const rules: Rule[] = [
      { pattern: 'GROCERY', category: 'Food' },
      { pattern: 'GROCERY DELUXE', category: 'Shopping' }
    ];
    expect(applyRules('GROCERY DELUXE STORE', rules)).toBe('Food');
  });

  it('returns null for empty input or empty rules', () => {
    expect(applyRules('', [{ pattern: 'X', category: 'Y' }])).toBeNull();
    expect(applyRules('whatever', [])).toBeNull();
    expect(applyRules('whatever', null)).toBeNull();
  });

  it('ignores rules with empty pattern', () => {
    expect(applyRules('anything', [{ pattern: '', category: 'X' }])).toBeNull();
  });
});
