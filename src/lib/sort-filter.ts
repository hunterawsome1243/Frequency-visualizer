import type { DeviceFilter, ScannedDevice, SortBy } from './types';

export type Nicknames = Readonly<Record<string, string>>;

/** Nickname if set, else the advertised name, else "Unnamed device". */
export function displayName(device: ScannedDevice, nicknames?: Nicknames): string {
  throw new Error('not implemented');
}

/**
 * Returns a new sorted array. "signal": strongest RSSI first, null RSSI last. "name": by displayName,
 * case-insensitive, unnamed devices last. Ties fall back to id so the order is stable.
 * With trackersFirst (default true) devices with a tracker match come before all others.
 */
export function sortDevices(
  devices: readonly ScannedDevice[],
  sortBy: SortBy,
  options?: { trackersFirst?: boolean; nicknames?: Nicknames },
): ScannedDevice[] {
  throw new Error('not implemented');
}

/** "trackers": only devices with a tracker match. "named": devices with an advertised name or a nickname. */
export function filterDevices(
  devices: readonly ScannedDevice[],
  filter: DeviceFilter,
  nicknames?: Nicknames,
): ScannedDevice[] {
  throw new Error('not implemented');
}
