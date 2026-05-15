import { useEffect } from 'react';

/**
 * Attaches a window keydown listener that calls `onClose` when Escape is
 * pressed. `active` toggles the binding so callers don't need to wrap
 * onClose in their own conditional — pass the modal's open flag.
 *
 * Multiple components can use this in parallel; each gets its own listener
 * and unsubscribes on unmount. Order of dispatch is browser-defined, but
 * since modals stack rarely, picking the topmost is usually obvious to the
 * user (the only open one).
 */
export function useEscapeKey(active: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [active, onClose]);
}
