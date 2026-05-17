// @vitest-environment happy-dom
// src/utils/__tests__/persistedState.versioning.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { readPersisted, writePersisted } from '../persistedState';

describe('persistedState versioning', () => {
  beforeEach(() => { window.localStorage.clear(); });

  it('reads a value back when version matches', () => {
    writePersisted('test:v', { value: 1 }, 2);
    expect(readPersisted('test:v', { value: 0 }, 2)).toEqual({ value: 1 });
  });

  it('returns fallback when stored version is lower than requested', () => {
    writePersisted('test:v', { value: 1 }, 1);
    expect(readPersisted('test:v', { value: 99 }, 2)).toEqual({ value: 99 });
  });

  it('returns fallback when stored version is higher than requested', () => {
    // Forward-compat: a newer app shape that we don't know how to parse yet
    // should also fall through to fallback rather than handing back the
    // future-format value.
    writePersisted('test:v', { value: 1 }, 5);
    expect(readPersisted('test:v', { value: 99 }, 2)).toEqual({ value: 99 });
  });

  it('omitting version on both sides preserves the unversioned path', () => {
    writePersisted('test:noversion', { a: 1 });
    expect(readPersisted('test:noversion', null)).toEqual({ a: 1 });
  });

  it('a stored UNVERSIONED payload is treated as version=0 — a request for v>=1 falls back', () => {
    // This is what gives existing users a clean slate when we bump the
    // schema: their old key (no version envelope) is discarded the first
    // time we read with a version arg.
    window.localStorage.setItem('test:upgrade', JSON.stringify({ raw: 'old' }));
    expect(readPersisted('test:upgrade', { fresh: true }, 1)).toEqual({ fresh: true });
  });
});
