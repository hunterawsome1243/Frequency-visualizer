import { isUsableRssi } from './proximity';
import { detectTracker } from './trackers';
import type { Advertisement, RssiSample, ScannedDevice, TrackerMatch } from './types';

export type DeviceMap = Readonly<Record<string, ScannedDevice>>;

/** About two minutes of history at one sample per DEFAULT_MIN_SAMPLE_INTERVAL_MS. */
export const DEFAULT_HISTORY_LIMIT = 120;
/** Readings closer together than this are merged into one history sample. */
export const DEFAULT_MIN_SAMPLE_INTERVAL_MS = 1_000;
/** ScannedDevice.rssi is the mean of the history samples from this last stretch of time. */
export const RSSI_SMOOTHING_MS = 3_000;
/** Devices not heard from for this long are dropped by pruneStale. */
export const DEFAULT_STALE_MS = 30_000;

export interface UpsertOptions {
  historyLimit?: number;
  /**
   * A reading less than this long after the newest sample started is averaged into that sample
   * instead of adding a new one, so the history covers the same time span however often a device
   * advertises (default DEFAULT_MIN_SAMPLE_INTERVAL_MS).
   */
  minSampleIntervalMs?: number;
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

/** Adds a reading to the history: averaged into the newest sample if that one is recent, else appended. */
function addSample(history: RssiSample[], rssi: number, now: number, minIntervalMs: number): RssiSample[] {
  const last = history.length > 0 ? history[history.length - 1] : undefined;
  // The sample keeps its own time, so a fast advertiser still starts a new sample every minIntervalMs.
  if (last !== undefined && now >= last.t && now - last.t < minIntervalMs) {
    return [...history.slice(0, -1), { t: last.t, rssi: (last.rssi + rssi) / 2 }];
  }
  return [...history, { t: now, rssi }];
}

/** Mean of the samples from the last RSSI_SMOOTHING_MS, rounded to whole dBm; `fallback` if there are none. */
function smoothedRssi(history: readonly RssiSample[], now: number, fallback: number | null): number | null {
  let sum = 0;
  let count = 0;
  for (let i = history.length - 1; i >= 0 && history[i].t >= now - RSSI_SMOOTHING_MS; i--) {
    sum += history[i].rssi;
    count += 1;
  }
  return count > 0 ? Math.round(sum / count) : fallback;
}

/**
 * Returns a new map with the advertisement merged in. Does not mutate `devices`.
 * Keeps firstSeen, updates lastSeen, adds to rssiHistory when rssi is a usable number (at most one
 * sample per minSampleIntervalMs), smooths rssi over the last few seconds and keeps the previous
 * reading when the new advertisement has none, keeps the previous name when the new advertisement
 * has none, and re-runs tracker detection (keeping an earlier match if the new advertisement alone
 * does not match).
 */
export function upsertAdvertisement(
  devices: DeviceMap,
  ad: Advertisement,
  now: number,
  options?: UpsertOptions,
): DeviceMap {
  const detect = options?.detect ?? detectTracker;
  const limit = Math.max(0, Math.floor(options?.historyLimit ?? DEFAULT_HISTORY_LIMIT));
  const minIntervalMs = options?.minSampleIntervalMs ?? DEFAULT_MIN_SAMPLE_INTERVAL_MS;
  const previous: ScannedDevice | undefined = Object.prototype.hasOwnProperty.call(devices, ad.id)
    ? devices[ad.id]
    : undefined;

  const rssi = isUsableRssi(ad.rssi) ? ad.rssi : null;
  const previousHistory: RssiSample[] = previous?.rssiHistory ?? [];
  const withSample = rssi !== null ? addSample(previousHistory, rssi, now, minIntervalMs) : previousHistory;
  // The previous array is reused when nothing changed; it is never mutated.
  const history = withSample.length > limit ? withSample.slice(withSample.length - limit) : withSample;

  const device: ScannedDevice = {
    id: ad.id,
    name: cleanName(ad.localName) ?? cleanName(ad.name) ?? previous?.name ?? null,
    // A packet without a usable RSSI (e.g. 127 on iOS) keeps the last reading instead of blanking it.
    rssi: smoothedRssi(history, now, rssi ?? previous?.rssi ?? null),
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
