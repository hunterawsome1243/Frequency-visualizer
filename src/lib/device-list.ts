import type { Advertisement, ScannedDevice, TrackerMatch } from './types';

export type DeviceMap = Readonly<Record<string, ScannedDevice>>;

export const DEFAULT_HISTORY_LIMIT = 60;
/** Devices not heard from for this long are dropped by pruneStale. */
export const DEFAULT_STALE_MS = 30_000;

export interface UpsertOptions {
  historyLimit?: number;
  /** Tracker detector; defaults to detectTracker from ./trackers. */
  detect?: (ad: Advertisement) => TrackerMatch | null;
}

/**
 * Returns a new map with the advertisement merged in. Does not mutate `devices`.
 * Keeps firstSeen, updates lastSeen, appends to rssiHistory when rssi is a usable number,
 * keeps the previous name when the new advertisement has none, and re-runs tracker detection
 * (keeping an earlier match if the new advertisement alone does not match).
 */
export function upsertAdvertisement(
  devices: DeviceMap,
  ad: Advertisement,
  now: number,
  options?: UpsertOptions,
): DeviceMap {
  throw new Error('not implemented');
}

/** Returns a new map without devices whose lastSeen is older than now - maxAgeMs. Returns the same object if nothing was removed. */
export function pruneStale(devices: DeviceMap, now: number, maxAgeMs?: number): DeviceMap {
  throw new Error('not implemented');
}
