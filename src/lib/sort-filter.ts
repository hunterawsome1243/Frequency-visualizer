import { isUsableRssi } from './proximity';
import type { DeviceFilter, ScannedDevice, SortBy } from './types';

export type Nicknames = Readonly<Record<string, string>>;

export const UNNAMED_DEVICE = 'Unnamed device';

function nicknameOf(device: ScannedDevice, nicknames?: Nicknames): string | null {
  const nickname = nicknames?.[device.id]?.trim();
  return nickname ? nickname : null;
}

function advertisedNameOf(device: ScannedDevice): string | null {
  const name = device.name?.trim();
  return name ? name : null;
}

function hasName(device: ScannedDevice, nicknames?: Nicknames): boolean {
  return nicknameOf(device, nicknames) !== null || advertisedNameOf(device) !== null;
}

/** Nickname if set, else the advertised name, else "Unnamed device". */
export function displayName(device: ScannedDevice, nicknames?: Nicknames): string {
  return nicknameOf(device, nicknames) ?? advertisedNameOf(device) ?? UNNAMED_DEVICE;
}

function compareIds(a: ScannedDevice, b: ScannedDevice): number {
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

function compareSignal(a: ScannedDevice, b: ScannedDevice): number {
  const aUsable = isUsableRssi(a.rssi);
  const bUsable = isUsableRssi(b.rssi);
  if (aUsable && bUsable) return (b.rssi as number) - (a.rssi as number);
  if (aUsable) return -1;
  if (bUsable) return 1;
  return 0;
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
  const trackersFirst = options?.trackersFirst ?? true;
  const nicknames = options?.nicknames;

  // Work out each name once rather than on every comparison.
  const names = new Map<ScannedDevice, string | null>();
  if (sortBy === 'name') {
    for (const device of devices) {
      names.set(device, hasName(device, nicknames) ? displayName(device, nicknames) : null);
    }
  }

  const compareNames = (a: ScannedDevice, b: ScannedDevice): number => {
    const aName = names.get(a) ?? null;
    const bName = names.get(b) ?? null;
    if (aName !== null && bName !== null) {
      return aName.localeCompare(bName, undefined, { sensitivity: 'base' });
    }
    if (aName !== null) return -1;
    if (bName !== null) return 1;
    return 0;
  };

  return [...devices].sort((a, b) => {
    if (trackersFirst) {
      const aTracker = a.tracker !== null ? 0 : 1;
      const bTracker = b.tracker !== null ? 0 : 1;
      if (aTracker !== bTracker) return aTracker - bTracker;
    }
    const primary = sortBy === 'name' ? compareNames(a, b) : compareSignal(a, b);
    return primary !== 0 ? primary : compareIds(a, b);
  });
}

/** "trackers": only devices with a tracker match. "named": devices with an advertised name or a nickname. */
export function filterDevices(
  devices: readonly ScannedDevice[],
  filter: DeviceFilter,
  nicknames?: Nicknames,
): ScannedDevice[] {
  switch (filter) {
    case 'trackers':
      return devices.filter((device) => device.tracker !== null);
    case 'named':
      return devices.filter((device) => hasName(device, nicknames));
    default:
      return [...devices];
  }
}
