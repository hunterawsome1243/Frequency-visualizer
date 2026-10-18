import { isUsableRssi } from './proximity';
import { detectTracker } from './trackers';
import type { Advertisement, RssiSample, ScannedDevice, TrackerMatch } from './types';

export type DeviceMap = Readonly<Record<string, ScannedDevice>>;

export const DEFAULT_HISTORY_LIMIT = 60;
/** Devices not heard from for this long are dropped by pruneStale. */
export const DEFAULT_STALE_MS = 30_000;

export interface UpsertOptions {
  historyLimit?: number;
  /** Tracker detector; defaults to detectTracker from ./trackers. */
  detect?: (ad: Advertisement) => TrackerMatch | null;
}

function cleanName(name: string | null | undefined): string | null {
  const trimmed = name?.trim();
  return trimmed ? trimmed : null;
}

/**
 * A fresh match wins, except that a "possible" match does not replace an earlier "likely" one:
 * trackers such as AirTags alternate between payloads that match more or less specifically.
 */
function mergeTracker(previous: TrackerMatch | null, latest: TrackerMatch | null): TrackerMatch | null {
  if (latest === null) return previous;
  if (previous !== null && previous.confidence === 'likely' && latest.confidence === 'possible') {
    return previous;
  }
  return latest;
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
  const detect = options?.detect ?? detectTracker;
  const limit = Math.max(0, Math.floor(options?.historyLimit ?? DEFAULT_HISTORY_LIMIT));
  const previous: ScannedDevice | undefined = Object.prototype.hasOwnProperty.call(devices, ad.id)
    ? devices[ad.id]
    : undefined;

  const rssi = isUsableRssi(ad.rssi) ? ad.rssi : null;
  const previousHistory: RssiSample[] = previous?.rssiHistory ?? [];
  const withSample = rssi !== null ? [...previousHistory, { t: now, rssi }] : previousHistory;
  // The previous array is reused when nothing changed; it is never mutated.
  const history = withSample.length > limit ? withSample.slice(withSample.length - limit) : withSample;

  const device: ScannedDevice = {
    id: ad.id,
    name: cleanName(ad.localName) ?? cleanName(ad.name) ?? previous?.name ?? null,
    rssi,
    firstSeen: previous?.firstSeen ?? now,
    lastSeen: now,
    rssiHistory: history,
    advertisement: ad,
    tracker: mergeTracker(previous?.tracker ?? null, detect(ad)),
  };

  return { ...devices, [ad.id]: device };
}

/** Returns a new map without devices whose lastSeen is older than now - maxAgeMs. Returns the same object if nothing was removed. */
export function pruneStale(
  devices: DeviceMap,
  now: number,
  maxAgeMs: number = DEFAULT_STALE_MS,
): DeviceMap {
  const cutoff = now - maxAgeMs;
  const ids = Object.keys(devices);
  if (ids.every((id) => devices[id].lastSeen >= cutoff)) return devices;

  const kept: Record<string, ScannedDevice> = {};
  for (const id of ids) {
    if (devices[id].lastSeen >= cutoff) kept[id] = devices[id];
  }
  return kept;
}
