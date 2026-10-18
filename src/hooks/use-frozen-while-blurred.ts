import { useIsFocused } from 'expo-router';
import { useState } from 'react';

/**
 * Returns `value` while the screen is focused. While it is not (another tab is open, or a screen is
 * pushed on top), it keeps returning the value from when focus was lost, so a hidden screen does not
 * redraw on every scan update. Tabs stay mounted, so without this they all re-render twice a second.
 */
export function useFrozenWhileBlurred<T>(value: T): T {
  const focused = useIsFocused();
  const [frozen, setFrozen] = useState<{ value: T } | null>(null);
  // Updating state while rendering (rather than in an effect) costs no extra commit: React re-renders
  // straight away, and nothing changes while the screen stays focused.
  if (!focused && frozen === null) setFrozen({ value });
  if (focused && frozen !== null) setFrozen(null);
  return !focused && frozen !== null ? frozen.value : value;
}
