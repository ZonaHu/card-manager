// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { readPersisted, writePersisted } from '../persistedState';

describe('persistedState helpers', () => {
  beforeEach(() => { window.localStorage.clear(); });

  it('returns fallback when nothing is stored', () => {
    expect(readPersisted('test:nothing', { value: 0 })).toEqual({ value: 0 });
  });

  it('round-trips an object', () => {
    writePersisted('test:obj', { a: 1, b: 'x' });
    expect(readPersisted('test:obj', null)).toEqual({ a: 1, b: 'x' });
  });

  it('returns fallback when the stored JSON is corrupted', () => {
    window.localStorage.setItem('test:corrupt', '{not json');
    expect(readPersisted('test:corrupt', { ok: true })).toEqual({ ok: true });
  });

  it('writePersisted with null removes the key', () => {
    writePersisted('test:remove', { x: 1 });
    writePersisted('test:remove', null);
    expect(window.localStorage.getItem('test:remove')).toBeNull();
  });
});
