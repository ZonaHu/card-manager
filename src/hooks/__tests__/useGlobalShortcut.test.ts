// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useGlobalShortcut } from '../useGlobalShortcut';

describe('useGlobalShortcut', () => {
  it('fires on Cmd+K (macOS-style metaKey)', () => {
    const onFire = vi.fn();
    renderHook(() => useGlobalShortcut('k', onFire));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it('fires on Ctrl+K (Windows/Linux)', () => {
    const onFire = vi.fn();
    renderHook(() => useGlobalShortcut('k', onFire));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    expect(onFire).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire on bare K (no modifier)', () => {
    const onFire = vi.fn();
    renderHook(() => useGlobalShortcut('k', onFire));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k' }));
    expect(onFire).not.toHaveBeenCalled();
  });

  it('preventsDefault so the browser does not steal the shortcut', () => {
    const onFire = vi.fn();
    renderHook(() => useGlobalShortcut('k', onFire));
    const event = new KeyboardEvent('keydown', { key: 'k', metaKey: true, cancelable: true });
    const preventSpy = vi.spyOn(event, 'preventDefault');
    window.dispatchEvent(event);
    expect(preventSpy).toHaveBeenCalled();
  });
});
