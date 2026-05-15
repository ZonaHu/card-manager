// src/utils/__tests__/syncStaleness.test.ts
import { describe, it, expect } from 'vitest';
import { findStaleItems } from '../syncStaleness';

describe('findStaleItems', () => {
  it('returns items whose last_synced_at is older than the threshold', () => {
    const now = new Date('2026-05-14T12:00:00Z').getTime();
    const items = [
      { id: 1, institution_name: 'CIBC', last_synced_at: '2026-05-14T10:00:00Z' }, // 2h old → fresh
      { id: 2, institution_name: 'TD',   last_synced_at: '2026-05-12T10:00:00Z' }, // 50h → stale
      { id: 3, institution_name: 'BMO',  last_synced_at: null }                    // never synced → stale
    ];
    const stale = findStaleItems(items, 24, now);
    expect(stale.map(i => i.institution_name).sort()).toEqual(['BMO', 'TD']);
  });

  it('ignores items with needs_reauth (the reauth banner handles them)', () => {
    const now = new Date('2026-05-14T12:00:00Z').getTime();
    const items = [
      { id: 1, institution_name: 'X', last_synced_at: null, needs_reauth: 1 }
    ];
    expect(findStaleItems(items, 24, now)).toHaveLength(0);
  });
});
