import { useEffect } from 'react';

/**
 * Window-scoped keyboard shortcut. Fires when the user presses
 * Cmd+key (mac) or Ctrl+key (Windows/Linux). Calls preventDefault so the
 * browser doesn't run its own bound action (e.g. Cmd+K would otherwise
 * focus the URL bar in some configurations).
 *
 * Case-insensitive on the key argument.
 */
export function useGlobalShortcut(key: string, onFire: () => void): void {
  const target = key.toLowerCase();
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key.toLowerCase() !== target) return;
      e.preventDefault();
      onFire();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [target, onFire]);
}
